import { api } from "../api";
import {
  cancelLocalReminder,
  scheduleLocalReminder,
} from "./notifications";
import { deviceTimezone, type Reminder } from "./format";

export async function upsertSaveReminder(input: {
  saveId: string;
  title: string;
  body?: string | null;
  fireAt: Date;
  createdFrom?: "understand_answer" | "manual";
}): Promise<{ reminder: Reminder; notified: boolean }> {
  const reminder = await api<Reminder>(`/saves/${input.saveId}/reminder`, {
    method: "POST",
    body: JSON.stringify({
      fire_at: input.fireAt.toISOString(),
      timezone: deviceTimezone(),
      delivery: "in_app",
      created_from: input.createdFrom ?? "manual",
    }),
  });
  const notified = await scheduleLocalReminder({
    saveId: input.saveId,
    title: input.title,
    body: input.body,
    fireAt: input.fireAt,
  });
  return { reminder, notified };
}

export async function cancelSaveReminder(saveId: string) {
  await api(`/saves/${saveId}/reminder`, { method: "DELETE" });
  await cancelLocalReminder(saveId);
}
