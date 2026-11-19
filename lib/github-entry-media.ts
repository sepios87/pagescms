import { z } from "zod";
import { createHttpError } from "@/lib/api-error";
import { getSchemaByName } from "@/lib/schema";
import { mediaReferences } from "@/lib/staged-media";
import { getFileExtension, getFileName, getParentPath, joinPathSegments, normalizePath } from "@/lib/utils/file";
import { createOctokitInstance } from "@/lib/utils/octokit";

const mediaSchema = z.array(z.object({
  reference: z.string(),
  name: z.string().min(1),
  path: z.string().min(1),
  content: z.string().refine((value) =>
    value.length % 4 === 0 && !/[^A-Za-z0-9+/=]/.test(value) && !/=.*[^=]|={3}/.test(value),
  ),
}));

export function entryMediaSnapshot(token: string, owner: string, repo: string, ref: string) {
  const octokit = createOctokitInstance(token);
  const reserved = new Set<string>();

  const getFile = async (path: string) => {
    try {
      const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref });
      return data;
    } catch (error) {
      if ((error as { status?: number }).status === 404) return null;
      throw error;
    }
  };

  const reserve = async (path: string, allowRename: boolean) => {
    if (allowRename) {
      const basename = getFileName(path);
      const dot = basename.lastIndexOf(".");
      const stem = dot > 0 ? basename.slice(0, dot) : basename;
      const extension = dot > 0 ? basename.slice(dot) : "";
      let number = 1;
      let candidate = path;
      while (reserved.has(candidate) || await getFile(candidate)) {
        candidate = joinPathSegments([getParentPath(path), `${stem}-${number++}${extension}`]);
      }
      path = candidate;
    } else if (reserved.has(path) || await getFile(path)) {
      throw createHttpError(`File "${path}" already exists.`, 409);
    }
    reserved.add(path);
    return path;
  };

  return { getFile, reserve, reserved };
}

export async function prepareEntryMedia(
  payload: unknown,
  entryContent: unknown,
  configObject: Record<string, any>,
  snapshot: ReturnType<typeof entryMediaSnapshot>,
) {
  const parsed = mediaSchema.safeParse(payload ?? []);
  const references = mediaReferences(entryContent);
  if (!parsed.success || parsed.data.length !== references.size) {
    throw createHttpError("Some staged files are missing or invalid. Add them again before saving.", 400);
  }

  const additions = [];
  const filenames = new Map<string, string>();
  for (const file of parsed.data) {
    const schema = getSchemaByName(configObject, file.name, "media");
    const root = normalizePath(schema?.input ?? "");
    const path = normalizePath(file.path);
    const extension = getFileExtension(path);
    if (
      !references.delete(file.reference) ||
      !schema || !path || path !== file.path || path.split("/").some((part) => part === ".." || /^\.git$/i.test(part)) ||
      (root && !path.startsWith(`${root}/`)) ||
      getFileName(path) === ".gitkeep" ||
      (schema.extensions?.length && !schema.extensions.includes(extension))
    ) {
      throw createHttpError("Invalid staged media file.", 400);
    }
    const target = await snapshot.reserve(path, true);
    filenames.set(file.reference, getFileName(target));
    additions.push({ path: target, content: Buffer.from(file.content, "base64") });
  }
  return { additions, filenames };
}
