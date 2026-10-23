import { useEffect, useRef } from "react";
import { createSave, lifespanDaysOf } from "./createSave";
import { parseShareIntent } from "./platform";
import {
  failedMessage,
  NOTHING_TO_SAVE,
  savedMessage,
  type SaveOutcome,
} from "./saveMessages";

/**
 * Web version of the zero-tap save. The installed PWA is a Web Share Target:
 * Android opens it as `/?title=…&text=…&url=…` (see public/manifest.json).
 * The result shows as an in-app toast; the browser can't return to the
 * previous app on its own.
 */
export function useShareHandoff(onResult: (outcome: SaveOutcome) => void) {
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get("url");
    const sharedText = params.get("text");
    const sharedTitle = params.get("title");
    if (!sharedUrl && !sharedText) return;

    // Clear the query so a reload doesn't share the same thing twice.
    window.history.replaceState(null, "", window.location.pathname);

    const payload = parseShareIntent({
      text: [sharedTitle, sharedText].filter(Boolean).join(" ") || null,
      webUrl: sharedUrl,
      hasImage: false,
    });
    if (!payload) {
      onResult(NOTHING_TO_SAVE);
      return;
    }
    void createSave({
      platform: payload.platform,
      source_url: payload.source_url,
      title: payload.title,
    })
      .then((save) => onResult(savedMessage(lifespanDaysOf(save))))
      .catch((e) => onResult(failedMessage(e)));
  }, [onResult]);
}
