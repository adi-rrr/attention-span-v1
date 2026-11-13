import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { Save } from "../types";
import { ensureReminderPermissions } from "./notifications";

/** One notification per day ahead, so they keep coming even if the app isn't opened. */
const DAYS_AHEAD = 7;
const DIGEST_PREFIX = "daily-digest";
/** Older builds scheduled a single digest under this id. */
const LEGACY_DIGEST_ID = "daily-digest";
const CHANNEL_ID = "reminders";

/** Local `hour`:00 on the day `offset` days from today. */
function digestTime(hour: number, offset: number, now = new Date()): Date {
  const at = new Date(now);
  at.setDate(at.getDate() + offset);
  at.setHours(hour, 0, 0, 0);
  return at;
}

function endOfDay(at: Date): Date {
  const end = new Date(at);
  end.setHours(24, 0, 0, 0);
  return end;
}

/** "about 3 min": whole minutes, rounded up, never zero. */
function minutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}

/**
 * One morning notification on each day that has saves expiring, grouping
 * just those: "3 saves expire today · about 2 min to sort". Days with nothing
 * expiring get no notification. Local notifications can't count at fire
 * time, so this is rescheduled with fresh numbers every time the inbox
 * loads or a save is decided.
 */
export async function scheduleDailyDigest(
  inbox: Pick<Save, "expires_at" | "sort_seconds">[],
  digestHour: number,
): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  await Promise.all(
    scheduled
      .filter(
        (n) =>
          n.identifier === LEGACY_DIGEST_ID || n.identifier.startsWith(`${DIGEST_PREFIX}-`),
      )
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
  );

  const now = Date.now();
  const days = Array.from({ length: DAYS_AHEAD + 1 }, (_, offset) => {
    const fireAt = digestTime(digestHour, offset);
    const end = endOfDay(fireAt).getTime();
    const expiring = inbox.filter((s) => {
      if (!s.expires_at) return false;
      const t = new Date(s.expires_at).getTime();
      return t > fireAt.getTime() && t <= end;
    });
    return { offset, fireAt, expiring };
  }).filter((d) => d.fireAt.getTime() > now + 60_000 && d.expiring.length > 0);
  if (days.length === 0) return;

  const granted = await ensureReminderPermissions();
  if (!granted) return;

  for (const { offset, fireAt, expiring } of days) {
    const n = expiring.length;
    const seconds = expiring.reduce((sum, s) => sum + (s.sort_seconds ?? 20), 0);
    await Notifications.scheduleNotificationAsync({
      identifier: `${DIGEST_PREFIX}-${offset}`,
      content: {
        title: `${n} ${n === 1 ? "save expires" : "saves expire"} today`,
        body: `About ${minutes(seconds)} min to sort ${n === 1 ? "it" : "them"} before ${n === 1 ? "it fades" : "they fade"}.`,
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
}

export function isDigestNotification(data: unknown): boolean {
  return (
    !!data && typeof data === "object" && (data as { type?: unknown }).type === "digest"
  );
}
