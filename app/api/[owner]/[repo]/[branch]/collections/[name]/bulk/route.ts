import { getSchemaByName } from "@/lib/schema";
import { getConfig } from "@/lib/config-store";
import { isContentOperationAllowed } from "@/lib/operations";
import { getFileExtension, getFileName, getParentPath, joinPathSegments, normalizePath } from "@/lib/utils/file";
import { getToken } from "@/lib/token";
import { getCollectionCache, updateFileCache } from "@/lib/github-cache-file";
import { commitChanges, gitBlobSha } from "@/lib/github-commit";
import { createHttpError, toErrorResponse } from "@/lib/api-error";
import { buildCommitTokens, resolveCommitIdentity, resolveCommitMessage } from "@/lib/commit-message";
import { requireApiUserSession } from "@/lib/session-server";

/**
 * Deletes or duplicates several entries of a collection folder at once, in a
 * single commit.
 *
 * POST /api/[owner]/[repo]/[branch]/collections/[name]/bulk
 *
 * Body: { action: "delete" | "duplicate", path?: folder, entries: [{ path, sha }] }
 * Each copy is created next to its original ("a.md" -> "a-copy.md", then
 * "a-copy-2.md"...), with the same content.
 *
 * Requires authentication.
 */

const maxEntries = 200;

// "a.md" -> "a-copy.md", or "a-copy-2.md" if that name is taken
const copyName = (fileName: string, taken: Set<string>) => {
  const dotIndex = fileName.lastIndexOf(".");
  const stem = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : "";

  let candidate = `${stem}-copy${extension}`;
  for (let n = 2; taken.has(candidate); n++) candidate = `${stem}-copy-${n}${extension}`;
  taken.add(candidate);
  return candidate;
};

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
    if (schema.view?.layout === "tree") {
      throw createHttpError(`Bulk actions aren't available for the tree layout.`, 400);
    }

    const data: any = await request.json();
    const action: "delete" | "duplicate" = data.action;
    if (action !== "delete" && action !== "duplicate") {
      throw createHttpError(`"action" must be "delete" or "duplicate".`, 400);
    }
    if (!isContentOperationAllowed(action === "delete" ? "delete" : "create", { schema })) {
      throw createHttpError(
        `${action === "delete" ? "Deleting" : "Creating"} entries isn't allowed for "${params.name}".`,
        403,
      );
    }

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
    if (data.entries.length > maxEntries) {
      throw createHttpError(`At most ${maxEntries} entries at a time.`, 400);
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
    const takenNames = new Set<string>(cachedEntries.map((item: any) => item.name));

    const copies: { from: string, path: string, content: string }[] = [];

    for (const entry of requested) {
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

      if (action === "duplicate") {
        copies.push({
          from: entry.path,
          path: joinPathSegments([folder, copyName(getFileName(entry.path), takenNames)]),
          content: cached.content ?? "",
        });
      }
    }

    const commitIdentity = resolveCommitIdentity({
      configObject: config.object,
      identityOverride: schema.commit?.identity,
    });
    const committer = (commitIdentity === "user" && user.email)
      ? { name: user.name?.trim() || user.email, email: user.email }
      : undefined;

    const commitAction = action === "delete" ? "delete" : "create";
    const count = requested.length;
    const message = resolveCommitMessage({
      configObject: config.object,
      templatesOverride: schema.commit?.templates,
      action: commitAction,
      tokens: buildCommitTokens({
        action: commitAction,
        owner: params.owner,
        repo: params.repo,
        branch: params.branch,
        // The templates show it as a path: say how many entries and where
        path: `${count} ${count === 1 ? "entry" : "entries"} in ${folder}`,
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
      additions: copies.map((copy) => ({ path: copy.path, content: copy.content })),
      deletions: action === "delete" ? requested.map((entry) => entry.path) : [],
      committer,
    });

    const timestamp = Date.now();
    // One at a time: each call also writes the folder's cache meta row, which has
    // a unique index, so concurrent calls would collide on it.
    if (action === "delete") {
      for (const entry of requested) {
        await updateFileCache("collection", params.owner, params.repo, params.branch, {
          type: "delete",
          path: entry.path,
          commit: { sha: commitSha, timestamp },
        });
      }
    } else {
      for (const copy of copies) {
        await updateFileCache("collection", params.owner, params.repo, params.branch, {
          type: "add",
          path: copy.path,
          sha: gitBlobSha(copy.content),
          content: copy.content,
          size: Buffer.byteLength(copy.content),
          commit: { sha: commitSha, timestamp },
        });
      }
    }

    return Response.json({
      status: "success",
      message: action === "delete"
        ? `${count} ${count === 1 ? "entry" : "entries"} deleted.`
        : `${count} ${count === 1 ? "entry" : "entries"} duplicated.`,
      data: {
        commit: commitSha,
        deleted: action === "delete" ? requested.map((entry) => entry.path) : [],
        created: copies.map((copy) => ({ from: copy.from, path: copy.path })),
      },
    });
  } catch (error: any) {
    console.error(error);
    return toErrorResponse(error);
  }
}
