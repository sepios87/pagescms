import { createHash } from "node:crypto";
import { createOctokitInstance } from "@/lib/utils/octokit";
import { getBranchHeadSha, setBranchHeadSha } from "@/lib/github-cache-file";
import { createHttpError } from "@/lib/api-error";

type Octokit = ReturnType<typeof createOctokitInstance>;

type CommitChangesOptions = {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  message: string;
  // Files to create or overwrite
  additions?: { path: string; content: string }[];
  // Paths of the files to delete
  deletions?: string[];
  // Set to commit as a given person (this uses the Git data API)
  committer?: { name: string; email: string };
};

// SHA that Git gives to a file with this content
const gitBlobSha = (content: string) =>
  createHash("sha1")
    .update(`blob ${Buffer.byteLength(content)}\0`)
    .update(content)
    .digest("hex");

type GitCommitOptions = {
  octokit: Octokit;
  owner: string;
  repo: string;
  branch: string;
  headSha: string;
  message: string;
  additions: { path: string; content: string }[];
  deletions: string[];
};

// Commits all the changes in a single request. GitHub sets the author itself
// (the app or the token's user), so it can't carry a custom committer.
const commitWithGraphql = async ({
  octokit, owner, repo, branch, headSha, message, additions, deletions,
}: GitCommitOptions) => {
  const result: any = await octokit.graphql(
    `mutation ($input: CreateCommitOnBranchInput!) {
      createCommitOnBranch(input: $input) { commit { oid } }
    }`,
    {
      input: {
        branch: { repositoryNameWithOwner: `${owner}/${repo}`, branchName: branch },
        message: { headline: message },
        expectedHeadOid: headSha,
        fileChanges: {
          additions: additions.map((file) => ({
            path: file.path,
            contents: Buffer.from(file.content).toString("base64"),
          })),
          deletions: deletions.map((path) => ({ path })),
        },
      },
    },
  );
  return result.createCommitOnBranch.commit.oid as string;
};

// Same thing with the Git data API, for commits that must carry a committer
const commitWithRest = async ({
  octokit, owner, repo, branch, headSha, message, additions, deletions, committer,
}: GitCommitOptions & { committer: { name: string; email: string } }) => {
  const { data: headCommit } = await octokit.rest.git.getCommit({ owner, repo, commit_sha: headSha });
  const { data: tree } = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: headCommit.tree.sha,
    tree: [
      ...additions.map((file) => ({
        path: file.path,
        mode: "100644" as const,
        type: "blob" as const,
        content: file.content,
      })),
      ...deletions.map((path) => ({
        path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: null,
      })),
    ],
  });
  const { data: commit } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: tree.sha,
    parents: [headSha],
    committer,
  });
  await octokit.rest.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: commit.sha });
  return commit.sha;
};

// Creates, updates and deletes several files in one commit on a branch and
// returns the SHA of the commit.
const commitChanges = async ({
  token, owner, repo, branch, message, additions = [], deletions = [], committer,
}: CommitChangesOptions): Promise<string> => {
  const octokit = createOctokitInstance(token);
  const headSha = await getBranchHeadSha(owner, repo, branch, token);
  const options = { octokit, owner, repo, branch, headSha, message, additions, deletions };

  let commitSha: string;
  try {
    commitSha = committer
      ? await commitWithRest({ ...options, committer })
      : await commitWithGraphql(options);
  } catch (error: any) {
    console.error(error);
    if (error.status === 409 || error.status === 422 || error.name === "GraphqlResponseError") {
      throw createHttpError(
        "The branch has changed or is protected. Please refresh the page and try again.",
        409,
      );
    }
    throw error;
  }

  setBranchHeadSha(owner, repo, branch, commitSha);
  return commitSha;
};

export { commitChanges, gitBlobSha };
