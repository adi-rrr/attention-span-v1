import { useShareIntent } from "expo-share-intent";
import { useCallback, useEffect, useRef } from "react";
import { ToastAndroid } from "react-native";
import { returnToSourceApp } from "../../modules/return-to-source";
import { createSave, lifespanDaysOf } from "./createSave";
import { parseShareIntent } from "./platform";
import {
  failedMessage,
  NOTHING_TO_SAVE,
  savedMessage,
  type SaveOutcome,
} from "./saveMessages";

/**
 * Zero-tap save. A share saves straight to the inbox, shows a one-line
 * result, and hands the user back to the app they were scrolling.
 * A failed save stays open so the message can be read.
 */
export function useShareHandoff(onResult: (outcome: SaveOutcome) => void) {
  const { hasShareIntent, shareIntent, resetShareIntent, isReady } =
    useShareIntent();
  const processingRef = useRef(false);

  const report = useCallback(
    (outcome: SaveOutcome) => {
      onResult(outcome);
      // Android toasts stay on screen after we leave, over the other app.
      ToastAndroid.show(outcome.message, ToastAndroid.LONG);
      if (outcome.ok) setTimeout(returnToSourceApp, 700);
    },
    [onResult],
  );

  const processSharePayload = useCallback(async () => {
    const payload = parseShareIntent({
      text: shareIntent.text,
      webUrl: shareIntent.webUrl,
      hasImage: (shareIntent.files?.length ?? 0) > 0,
    });
    resetShareIntent();

    if (!payload) {
      report(NOTHING_TO_SAVE);
      return;
    }
    try {
      const save = await createSave({
        platform: payload.platform,
        source_url: payload.source_url,
        title: payload.title,
      });
      report(savedMessage(lifespanDaysOf(save)));
    } catch (e) {
      report(failedMessage(e));
    }
  }, [report, resetShareIntent, shareIntent]);

  useEffect(() => {
    if (!isReady || !hasShareIntent || processingRef.current) return;
    processingRef.current = true;
    void processSharePayload().finally(() => {
      processingRef.current = false;
    });
  }, [hasShareIntent, isReady, processSharePayload]);
}
