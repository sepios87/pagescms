export type StagedMedia = {
  reference: string;
  path: string;
  name: string;
  content: string;
};

const referencePattern = /pages-cms-pending-[a-f0-9]{32}(?:\.[a-z0-9]+)?/g;

export function mapMediaReferences<T>(value: T, replace: (reference: string) => string): T {
  if (typeof value === "string") return value.replace(referencePattern, replace) as T;
  if (Array.isArray(value)) return value.map((item) => mapMediaReferences(item, replace)) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, mapMediaReferences(item, replace)],
    )) as T;
  }
  return value;
}

export function mediaReferences(value: unknown): Set<string> {
  const references = new Set<string>();
  mapMediaReferences(value, (reference) => {
    references.add(reference);
    return reference;
  });
  return references;
}
