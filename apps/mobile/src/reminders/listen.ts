import * as Notifications from "expo-notifications";
import {
  saveIdFromNotificationData,
  setupNotificationHandler,
} from "./notifications";

export function initReminderNotifications() {
  setupNotificationHandler();
}

/** Calls `open` with the save id when the user taps a reminder notification. */
export function listenForReminderTaps(open: (saveId: string) => void) {
  const sub = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const saveId = saveIdFromNotificationData(
        response.notification.request.content.data,
      );
      if (saveId) open(saveId);
    },
  );

  void Notifications.getLastNotificationResponseAsync().then((response) => {
    const saveId = saveIdFromNotificationData(
      response?.notification.request.content.data,
    );
    if (saveId) {
      Notifications.clearLastNotificationResponse();
      open(saveId);
    }
  });

  return () => sub.remove();
}
