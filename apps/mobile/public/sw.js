// Attention Span service worker: shows reminder pushes and opens the save on tap.
// It deliberately does not cache pages, so every launch gets the latest deploy.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Chrome only offers "Install app" when a fetch handler exists; pass everything through.
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Attention Span";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "You wanted to come back to this.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.saveId ? `reminder-${data.saveId}` : undefined,
      data: { saveId: data.saveId || null },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const saveId = event.notification.data && event.notification.data.saveId;
  const target = saveId ? `/?save=${encodeURIComponent(saveId)}` : "/";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if (saveId) open.postMessage({ type: "open-save", saveId });
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
