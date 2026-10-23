// Branch name as a URL path segment.
//
// Web servers such as Apache and LiteSpeed answer 404 to a path containing an
// encoded slash (%2F), so the slash of a branch like "feature/x" is sent
// double-encoded (%252F). proxy.ts turns it back into %2F before routing.
export const encodeBranch = (branch: string): string =>
  encodeURIComponent(branch).replace(/%2F/gi, "%252F");
