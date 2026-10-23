import { parse, stringify } from "@/lib/serialization";
import { getFieldByPath, getSchemaByName, safeAccess, setByPath } from "@/lib/schema";
import { getConfig } from "@/lib/config-store";
import { getFileExtension, getParentPath, normalizePath, serializedTypes } from "@/lib/utils/file";
import { getToken } from "@/lib/token";
import { getCollectionCache, updateFileCache } from "@/lib/github-cache-file";
import { commitChanges, gitBlobSha } from "@/lib/github-commit";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { buildCommitTokens, resolveCommitIdentity, resolveCommitMessage } from "@/lib/commit-message";
import { requireApiUserSession } from "@/lib/session-server";

/**
 * Saves a manual order for the entries of a collection folder.
 *
 * POST /api/[owner]/[repo]/[branch]/collections/[name]/order
 *
 * The collection must define `view.reorder` (the name of a number field). The
 * body lists the entries in their new order; each one gets its 1-based position
 * written in that field. Only the entries whose position changes are modified,
 * all in a single commit.
 *
 * Requires authentication.
 */

export async function POST(
  request: Request,
  context: { params: Promise<{ owner: string, repo: string, branch: string, name: string }> }
) {
  try {
    const params = await context.params;
    const sessionResult = await requireApiUserSession();
    if ("response" in sessionResult) return sessionResult.response;
    const user = sessionResult.user;

    const { token } = await getToken(user, params.owner, params.repo, true);
    if (!token) throw new Error("Token not found");

    const config = await getConfig(params.owner, params.repo, params.branch, {
      getToken: async () => token,
    });
    if (!config) throw new Error(`Configuration not found for ${params.owner}/${params.repo}/${params.branch}.`);
    const schema = getSchemaByName(config.object, params.name);
    if (!schema || schema.type !== "collection") {
      throw createHttpError(`Collection "${params.name}" not found.`, 404);
    }

    const reorderField: string | undefined = schema.view?.reorder ?? undefined;
    if (!reorderField) {
      throw createHttpError(`Collection "${params.name}" doesn't define "view.reorder".`, 400);
    }
    const field = schema.fields ? getFieldByPath(schema.fields, reorderField) : undefined;
    if (!field || field.type !== "number") {
      throw createHttpError(`"view.reorder" must be the name of a "number" field in "${params.name}".`, 400);
    }
    if (!serializedTypes.includes(schema.format)) {
      throw createHttpError(`Collection "${params.name}" can't be reordered: its format has no fields.`, 400);
    }

    const data: any = await request.json();
    const folder = normalizePath(data.path || schema.path);
    if (!folder.startsWith(schema.path)) {
      throw createHttpError(`Invalid path "${data.path}" for collection "${params.name}".`, 400);
    }
    if (schema.subfolders === false && folder !== schema.path) {
      throw createHttpError(`Invalid path "${data.path}" for collection "${params.name}".`, 400);
    }

    if (!Array.isArray(data.entries) || data.entries.length === 0) {
      throw createHttpError(`"entries" must be a non-empty array.`, 400);
    }
    const requested: { path: string, sha: string }[] = data.entries.map((entry: any) => ({
      path: normalizePath(String(entry?.path ?? "")),
      sha: String(entry?.sha ?? ""),
    }));
    if (new Set(requested.map((entry) => entry.path)).size !== requested.length) {
      throw createHttpError(`"entries" contains duplicate paths.`, 400);
    }

    const cachedEntries = await getCollectionCache(
      params.owner,
      params.repo,
      params.branch,
      folder,
      token,
      schema.view?.node?.filename,
    );
    const cachedByPath = new Map<string, any>(
      cachedEntries
        .filter((item: any) => item.type === "file")
        .map((item: any) => [item.path, item]),
    );

    const changes: { path: string, content: string }[] = [];
    const positions = new Map<string, number>();

    requested.forEach((entry, index) => {
      if (
        getParentPath(entry.path) !== folder ||
        getFileExtension(entry.path) !== (schema.extension ?? "")
      ) {
        throw createHttpError(`Invalid path "${entry.path}" for collection "${params.name}".`, 400);
      }

      const cached = cachedByPath.get(entry.path);
      if (!cached) throw createHttpError(`Entry "${entry.path}" not found.`, 404);
      if (cached.sha !== entry.sha) {
        throw createHttpError(
          `"${entry.path}" has changed since you last loaded it. Please refresh the page and try again.`,
          409,
        );
      }

      const position = index + 1;
      positions.set(entry.path, position);

      const contentObject = parse(cached.content, { format: schema.format, delimiters: schema.delimiters });
      const currentPosition: unknown = safeAccess(contentObject, reorderField);
      if (currentPosition === position) return;

      setByPath(contentObject, reorderField, position);
      changes.push({
        path: entry.path,
        content: stringify(contentObject, { format: schema.format, delimiters: schema.delimiters }),
      });
    });

    if (changes.length === 0) {
      return Response.json({
        status: "success",
        message: "The order is already up to date.",
        data: {
          entries: requested.map((entry) => ({ path: entry.path, sha: entry.sha, position: positions.get(entry.path) })),
        },
      });
    }

    const commitIdentity = resolveCommitIdentity({
      configObject: config.object,
      identityOverride: schema.commit?.identity,
    });
    const committer = (commitIdentity === "user" && user.email)
      ? { name: user.name?.trim() || user.email, email: user.email }
      : undefined;

    const message = resolveCommitMessage({
      configObject: config.object,
      templatesOverride: schema.commit?.templates,
      action: "update",
      tokens: buildCommitTokens({
        action: "update",
        owner: params.owner,
        repo: params.repo,
        branch: params.branch,
        path: folder,
        contentName: params.name,
        user: user.email || user.name || String(user.id || ""),
        userName: committer?.name,
        userEmail: committer?.email,
      }),
    });

    const commitSha = await commitChanges({
      token,
      owner: params.owner,
      repo: params.repo,
      branch: params.branch,
      message,
      additions: changes,
      committer,
    });
    const newShas = new Map(changes.map((change) => [change.path, gitBlobSha(change.content)]));

    const timestamp = Date.now();
    // One at a time: each call also writes the folder's cache meta row, which has
    // a unique index, so concurrent calls would collide on it.
    for (const change of changes) {
      await updateFileCache("collection", params.owner, params.repo, params.branch, {
        type: "modify",
        path: change.path,
        sha: newShas.get(change.path)!,
        content: change.content,
        size: Buffer.byteLength(change.content),
        commit: { sha: commitSha, timestamp },
      });
    }
    return Response.json({
      status: "success",
      message: `Order saved (${changes.length} ${changes.length === 1 ? "entry" : "entries"} updated).`,
      data: {
        commit: commitSha,
        entries: requested.map((entry) => ({
          path: entry.path,
          sha: newShas.get(entry.path) ?? entry.sha,
          position: positions.get(entry.path),
        })),
      },
    });
  } catch (error: any) {
    console.error(error);
    return toErrorResponse(error);
  }
}
