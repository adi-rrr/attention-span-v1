import * as Linking from "expo-linking";
import { useShareIntent } from "expo-share-intent";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import {
  createSave,
  getDuplicateConflict,
  isDuplicateConflict,
  type CreateSaveInput,
  type Save,
} from "./createSave";
import { parseShareIntent, parseUnderstandDeepLink } from "./platform";

export type DuplicatePrompt = {
  input: CreateSaveInput;
  savedAt: string;
};

export function useShareHandoff(onOpenUnderstand: (save: Save) => void) {
  const { hasShareIntent, shareIntent, resetShareIntent, isReady } =
    useShareIntent();
  const [duplicate, setDuplicate] = useState<DuplicatePrompt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const processingRef = useRef(false);

  const openSaveById = useCallback(
    async (saveId: string) => {
      const save = await api<Save>(`/saves/${saveId}`);
      onOpenUnderstand(save);
    },
    [onOpenUnderstand],
  );

  const submitSave = useCallback(
    async (input: CreateSaveInput) => {
      setBusy(true);
      setError(null);
      try {
        const save = await createSave(input);
        onOpenUnderstand(save);
        resetShareIntent();
        setDuplicate(null);
      } catch (e) {
        if (isDuplicateConflict(e)) {
          const conflict = getDuplicateConflict(e);
          setDuplicate({
            input,
            savedAt: conflict.saved_at,
          });
        } else {
          setError(e instanceof Error ? e.message : "Could not save");
        }
      } finally {
        setBusy(false);
      }
    },
    [onOpenUnderstand, resetShareIntent],
  );

  const processSharePayload = useCallback(async () => {
    const payload = parseShareIntent({
      text: shareIntent.text,
      webUrl: shareIntent.webUrl,
      hasImage: (shareIntent.files?.length ?? 0) > 0,
    });

    if (!payload) {
      setError("Nothing to save from share.");
      resetShareIntent();
      return;
    }

    await submitSave({
      platform: payload.platform,
      source_url: payload.source_url,
      title: payload.title,
    });
  }, [resetShareIntent, shareIntent, submitSave]);

  useEffect(() => {
    if (!isReady || !hasShareIntent || processingRef.current) return;
    processingRef.current = true;
    void processSharePayload().finally(() => {
      processingRef.current = false;
    });
  }, [hasShareIntent, isReady, processSharePayload]);

  useEffect(() => {
    function handleUrl(url: string) {
      // Ignore expo-share-intent handoff URLs (handled by useShareIntent).
      if (url.includes("dataUrl=") || url.includes("ShareKey")) return;
      const saveId = parseUnderstandDeepLink(url);
      if (saveId) void openSaveById(saveId);
    }

    void Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    const sub = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, [openSaveById]);

  const cancelDuplicate = useCallback(() => {
    setDuplicate(null);
    resetShareIntent();
  }, [resetShareIntent]);

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
