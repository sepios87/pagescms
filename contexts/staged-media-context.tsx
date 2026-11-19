"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getFileExtension, getFileName, getParentPath, joinPathSegments } from "@/lib/utils/file";
import { mediaReferences, type StagedMedia } from "@/lib/staged-media";

type LocalMedia = StagedMedia & { preview: string };
type StoredMedia = { media: Omit<StagedMedia, "content">; file: File; savedAt: number };

let database: Promise<IDBDatabase> | undefined;

function draftMediaStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("pagescms-entry-media", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("media");
    request.onsuccess = () => {
      const db = request.result;
      resolve(db);
      const maxAge = 30 * 24 * 60 * 60 * 1000;
      const cursorRequest = db.transaction("media", "readwrite").objectStore("media").openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        if (Date.now() - cursor.value.savedAt > maxAge) cursor.delete();
        cursor.continue();
      };
    };
    request.onerror = () => reject(request.error);
  });
  return database.then((db) => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction("media", mode);
    const request = action(transaction.objectStore("media"));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error);
  }));
}

export function useStagedMediaStore(draftKey: string | null) {
  const files = useRef(new Map<string, LocalMedia>());
  const preparing = useRef(0);
  const [media, setMedia] = useState<ReadonlyMap<string, LocalMedia>>(new Map());

  useEffect(() => {
    const activeFiles = files.current;
    return () => {
      for (const file of activeFiles.values()) URL.revokeObjectURL(file.preview);
    };
  }, []);

  const get = useCallback((path: string) => files.current.get(getFileName(path)), []);
  const fetchPreview = useCallback((url: string) =>
    Array.from(files.current.values()).find((file) => file.preview === url), []);

  const stage = useCallback(async (name: string, path: string, file: File) => {
    preparing.current++;
    try {
      const extension = getFileExtension(path);
      const id = crypto.randomUUID().replaceAll("-", "");
      const reference = `pages-cms-pending-${id}${extension ? `.${extension}` : ""}`;
      const content = await readMediaContent(file);
      const media = { reference, path, name };
      if (draftKey) {
        const key = `${draftKey}/${reference}`;
        try {
          const stored: StoredMedia = { media, file, savedAt: Date.now() };
          await draftMediaStore("readwrite", (store) => store.put(stored, key));
        } catch {
          // The current form can still be saved if browser storage is unavailable.
        }
      }
      files.current.set(reference, { ...media, content, preview: URL.createObjectURL(file) });
      setMedia(new Map(files.current));
      return joinPathSegments([getParentPath(path), reference]);
    } finally {
      preparing.current--;
    }
  }, [draftKey]);

  const restore = useCallback(async (values: unknown) => {
    if (!draftKey) return;
    for (const reference of mediaReferences(values)) {
      if (files.current.has(reference)) continue;
      const key = `${draftKey}/${reference}`;
      const stored: StoredMedia | undefined = await draftMediaStore("readonly", (store) => store.get(key));
      if (!stored) continue;
      const content = await readMediaContent(stored.file);
      files.current.set(reference, { ...stored.media, content, preview: URL.createObjectURL(stored.file) });
    }
    setMedia(new Map(files.current));
  }, [draftKey]);

  const collect = useCallback((values: unknown): StagedMedia[] => {
    return Array.from(mediaReferences(values), (reference) => {
      const file = files.current.get(reference);
      if (!file) throw new Error("A photo or file is missing from this draft. Add it again before saving.");
      const { path, name, content } = file;
      return { reference, path, name, content };
    });
  }, []);

  const discard = useCallback((values?: unknown) => {
    const references = values === undefined ? [...files.current.keys()] : mediaReferences(values);
    for (const reference of references) {
      const file = files.current.get(reference);
      if (file) URL.revokeObjectURL(file.preview);
      files.current.delete(reference);
      if (draftKey) {
        void draftMediaStore("readwrite", (store) => store.delete(`${draftKey}/${reference}`)).catch(() => {});
      }
    }
    setMedia(new Map(files.current));
  }, [draftKey]);

  return useMemo(() => ({ media, get, fetchPreview, stage, collect, restore, discard, preparing }),
    [media, get, fetchPreview, stage, collect, restore, discard]);
}

export const StagedMediaContext = createContext<ReturnType<typeof useStagedMediaStore> | null>(null);
export const useStagedMedia = () => useContext(StagedMediaContext);

export function readMediaContent(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(",") + 1));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
