export function initReminderNotifications() {
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline or unsupported: the app still works without pushes */
    });
  }
}

/**
 * A tapped push opens `/?save=<id>` (cold start) or posts `open-save` to an
 * already-open window (see public/sw.js).
 */
export function listenForReminderTaps(
  open: (saveId: string) => void,
  _openDigest: () => void = () => {},
) {
  const params = new URLSearchParams(window.location.search);
  const saveId = params.get("save");
  if (saveId) {
    window.history.replaceState(null, "", window.location.pathname);
    open(saveId);
  }

  if (!("serviceWorker" in navigator)) return () => {};
  const onMessage = (event: MessageEvent) => {
    const data = event.data as { type?: string; saveId?: string } | null;
    if (data?.type === "open-save" && data.saveId) open(data.saveId);
  };
  navigator.serviceWorker.addEventListener("message", onMessage);
  return () => navigator.serviceWorker.removeEventListener("message", onMessage);
}
