// Value as a URL path segment.
//
// Web servers such as Apache and LiteSpeed answer 404 to a path containing an
// encoded slash (%2F), so the slash is sent double-encoded (%252F). proxy.ts
// turns it back into %2F before routing.
export const encodeSegment = (value: string): string =>
  encodeURIComponent(value).replace(/%2F/gi, "%252F");
