import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const CHANNEL_ID = "reminders";

function identifierFor(saveId: string) {
  return `reminder-${saveId}`;
}

export function setupNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function ensureReminderPermissions(): Promise<boolean> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Reminders",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== "granted") {
    const asked = await Notifications.requestPermissionsAsync();
    status = asked.status;
  }
  return status === "granted";
}

export async function scheduleLocalReminder(input: {
  saveId: string;
  title: string;
  body?: string | null;
  fireAt: Date;
}): Promise<boolean> {
  const granted = await ensureReminderPermissions();
  if (!granted) return false;

  await Notifications.cancelScheduledNotificationAsync(
    identifierFor(input.saveId),
  );

  await Notifications.scheduleNotificationAsync({
    identifier: identifierFor(input.saveId),
    content: {
      title: input.title || "Attention Span",
      body: input.body?.trim() || "You wanted to come back to this.",
      data: { saveId: input.saveId },
      sound: true,
      ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: input.fireAt,
      ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
    },
  });
  return true;
}

export async function cancelLocalReminder(saveId: string) {
  await Notifications.cancelScheduledNotificationAsync(identifierFor(saveId));
}

export function saveIdFromNotificationData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const saveId = (data as { saveId?: unknown }).saveId;
  return typeof saveId === "string" && saveId.length > 0 ? saveId : null;
}
