"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";

// A copy of what is being typed in an entry, kept in this browser so it can be
// recovered if the tab is closed or crashes before the entry is saved.
type Draft = {
  savedAt: number;
  // Fingerprint of the saved entry the draft was made from
  base: string;
  values: FieldValues;
};

const maxAgeMs = 30 * 24 * 60 * 60 * 1000;
const saveDelayMs = 800;

const fingerprint = (value: unknown): string => {
  const text = JSON.stringify(value) ?? "";
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return `${text.length}:${hash}`;
};

const readDraft = (key: string): Draft | null => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
};

const removeDraft = (key: string) => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing to remove
  }
};

export function useEntryDraft({
  storageKey,
  form,
  defaultValues,
}: {
  // Set to null to turn the drafts off
  storageKey: string | null;
  form: UseFormReturn<any>;
  // The values of the saved entry
  defaultValues: FieldValues;
}) {
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);
  const pendingRef = useRef<Draft | null>(null);
  const wasDirtyRef = useRef(false);
  const isDirty = form.formState.isDirty;

  const setPending = useCallback((draft: Draft | null) => {
    pendingRef.current = draft;
    setPendingDraft(draft);
  }, []);

  // Is there a draft of this entry, made from the same saved content?
  useEffect(() => {
    if (!storageKey) return;
    const draft = readDraft(storageKey);
    const fresh =
      draft &&
      Date.now() - draft.savedAt < maxAgeMs &&
      draft.base === fingerprint(defaultValues) &&
      fingerprint(draft.values) !== fingerprint(defaultValues);
    if (fresh) setPending(draft);
    else {
      if (draft) removeDraft(storageKey);
      setPending(null);
    }
    wasDirtyRef.current = false;
  }, [storageKey, defaultValues, setPending]);

  // Keep a copy of the changes while they are typed
  useEffect(() => {
    if (!storageKey) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const subscription = form.watch(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // The draft found on arrival isn't replaced until the user chose
        if (pendingRef.current) return;
        const values = form.getValues();
        if (fingerprint(values) === fingerprint(defaultValues)) return removeDraft(storageKey);
        try {
          const draft: Draft = { savedAt: Date.now(), base: fingerprint(defaultValues), values };
          window.localStorage.setItem(storageKey, JSON.stringify(draft));
        } catch {
          // Storage full or blocked: no draft, the entry itself isn't affected
        }
      }, saveDelayMs);
    });

    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [storageKey, form, defaultValues]);

  // Saved: the changes are no longer a draft
  useEffect(() => {
    if (isDirty) wasDirtyRef.current = true;
    else if (wasDirtyRef.current && storageKey && !pendingRef.current) {
      wasDirtyRef.current = false;
      removeDraft(storageKey);
    }
  }, [isDirty, storageKey]);

  const restore = useCallback(() => {
    const draft = pendingRef.current;
    if (!draft) return;
    // Keep the saved values as the reference: the form shows up as modified
    form.reset(draft.values, { keepDefaultValues: true });
    setPending(null);
  }, [form, setPending]);

  const discard = useCallback(() => {
    if (storageKey) removeDraft(storageKey);
    setPending(null);
  }, [storageKey, setPending]);

  return { pendingDraft, restore, discard };
}
