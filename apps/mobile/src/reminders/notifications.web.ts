import { api } from "../api";

/**
 * Web reminders are Web Push: this device subscribes once, and the server
 * sends the push at the reminder's fire time (scheduled through Upstash
 * QStash). Nothing is scheduled in the browser itself.
 */

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function setupNotificationHandler() {
  // Nothing to configure on web; the service worker shows pushes.
}

export async function ensureReminderPermissions(): Promise<boolean> {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return false;
  }

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted") return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const { public_key } = await api<{ public_key: string }>(
        "/push/public-key",
      );
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(public_key),
      });
    }
    await api("/push/subscribe", {
      method: "POST",
      body: JSON.stringify(subscription.toJSON()),
    });
    return true;
  } catch {
    return false;
  }
}

export async function scheduleLocalReminder(_input: {
  saveId: string;
  title: string;
  body?: string | null;
  fireAt: Date;
}): Promise<boolean> {
  // The server schedules the push when the reminder is saved; this device
  // only needs to be subscribed.
  return ensureReminderPermissions();
}

export async function cancelLocalReminder(_saveId: string) {
  // The server skips pushes for cancelled reminders.
}

export function saveIdFromNotificationData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const saveId = (data as { saveId?: unknown }).saveId;
  return typeof saveId === "string" && saveId.length > 0 ? saveId : null;
}
