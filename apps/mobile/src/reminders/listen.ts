import * as Notifications from "expo-notifications";
import {
  saveIdFromNotificationData,
  setupNotificationHandler,
} from "./notifications";
import { isDigestNotification } from "./digest";

export function initReminderNotifications() {
  setupNotificationHandler();
}

/**
 * Calls `open` with the save id when the user taps a reminder notification,
 * and `openDigest` when they tap the daily "fading soon" digest.
 */
export function listenForReminderTaps(
  open: (saveId: string) => void,
  openDigest: () => void = () => {},
) {
  function handle(data: unknown): boolean {
    if (isDigestNotification(data)) {
      openDigest();
      return true;
    }
    const saveId = saveIdFromNotificationData(data);
    if (saveId) open(saveId);
    return Boolean(saveId);
  }

  const sub = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      handle(response.notification.request.content.data);
    },
  );

  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (handle(response?.notification.request.content.data)) {
      Notifications.clearLastNotificationResponse();
    }
  });

  return () => sub.remove();
}
