import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { Save } from "../types";
import { ensureReminderPermissions } from "./notifications";

const DIGEST_ID = "daily-digest";
const CHANNEL_ID = "reminders";
const DAY = 24 * 60 * 60 * 1000;

/** Next local time at `hour`:00 that is still in the future. */
function nextDigestTime(hour: number, now = new Date()): Date {
  const at = new Date(now);
  at.setHours(hour, 0, 0, 0);
  if (at.getTime() <= now.getTime() + 60_000) at.setDate(at.getDate() + 1);
  return at;
}

/**
 * One notification a day, at the digest hour, about what's about to fade.
 * Local notifications can't count at fire time, so this is rescheduled with
 * fresh numbers every time the inbox loads or a save is decided.
 */
export async function scheduleDailyDigest(
  inbox: Pick<Save, "expires_at">[],
  digestHour: number,
): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(DIGEST_ID).catch(() => {});
  if (inbox.length === 0) return;

  const fireAt = nextDigestTime(digestHour);
  const fading = inbox.filter(
    (s) =>
      s.expires_at &&
      new Date(s.expires_at).getTime() > fireAt.getTime() &&
      new Date(s.expires_at).getTime() <= fireAt.getTime() + DAY,
  ).length;

  const title =
    fading > 0
      ? `${fading} ${fading === 1 ? "save fades" : "saves fade"} tomorrow`
      : `${inbox.length} ${inbox.length === 1 ? "save is" : "saves are"} waiting`;
  const body =
    fading > 0
      ? "2 minutes to decide what's worth keeping?"
      : "A quick sort keeps your inbox light.";

  const granted = await ensureReminderPermissions();
  if (!granted) return;
  await Notifications.scheduleNotificationAsync({
    identifier: DIGEST_ID,
    content: {
      title,
      body,
      data: { type: "digest" },
      ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
      ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
    },
  });
}

export function isDigestNotification(data: unknown): boolean {
  return (
    !!data && typeof data === "object" && (data as { type?: unknown }).type === "digest"
  );
}
