import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import {
  createSave,
  getDuplicateConflict,
  isDuplicateConflict,
  type CreateSaveInput,
  type Save,
} from "./createSave";
import { parseShareIntent } from "./platform";

export type DuplicatePrompt = {
  input: CreateSaveInput;
  savedAt: string;
};

/**
 * Web version of the share handoff. The installed PWA is a Web Share Target:
 * Android opens it as `/?title=…&text=…&url=…` (see public/manifest.json).
 * `/?understand=<saveId>` reopens an existing save's Understand flow.
 */
export function useShareHandoff(onOpenUnderstand: (save: Save) => void) {
  const [duplicate, setDuplicate] = useState<DuplicatePrompt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handledRef = useRef(false);

  const submitSave = useCallback(
    async (input: CreateSaveInput) => {
      setBusy(true);
      setError(null);
      try {
        const save = await createSave(input);
        onOpenUnderstand(save);
        setDuplicate(null);
      } catch (e) {
        if (isDuplicateConflict(e)) {
          setDuplicate({ input, savedAt: getDuplicateConflict(e).saved_at });
        } else {
          setError(e instanceof Error ? e.message : "Could not save");
        }
      } finally {
        setBusy(false);
      }
    },
    [onOpenUnderstand],
  );

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get("url");
    const sharedText = params.get("text");
    const sharedTitle = params.get("title");
    const understandId = params.get("understand");
    if (!sharedUrl && !sharedText && !understandId) return;

    // Clear the query so a reload doesn't share the same thing twice.
    window.history.replaceState(null, "", window.location.pathname);

    if (understandId) {
      void api<Save>(`/saves/${understandId}`)
        .then(onOpenUnderstand)
        .catch((e) => setError(e instanceof Error ? e.message : "Not found"));
      return;
    }

    const payload = parseShareIntent({
      text: [sharedTitle, sharedText].filter(Boolean).join(" ") || null,
      webUrl: sharedUrl,
      hasImage: false,
    });
    if (!payload) {
      setError("Nothing to save from share.");
      return;
    }
    void submitSave({
      platform: payload.platform,
      source_url: payload.source_url,
      title: payload.title,
    });
  }, [onOpenUnderstand, submitSave]);

  const cancelDuplicate = useCallback(() => setDuplicate(null), []);

  const replaceDuplicate = useCallback(async () => {
    if (!duplicate) return;
    await submitSave({ ...duplicate.input, replace_existing: true });
  }, [duplicate, submitSave]);

  return {
    duplicate,
    busy,
    error,
    cancelDuplicate,
    replaceDuplicate,
    clearError: () => setError(null),
  };
}
