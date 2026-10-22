import type { QueryFn } from "../db.js";
import { query } from "../db.js";
import { httpError } from "../httpError.js";
import { scheduleReminderPush } from "./push.js";

export type ReminderRow = {
  id: string;
  save_id: string;
  fire_at: Date | string;
  status: string;
  delivery: string;
  created_from: string;
  timezone: string;
};

const REMINDER_FIELDS = `id, save_id, fire_at, status, delivery, created_from, timezone`;

export type UpsertReminderInput = {
  saveId: string;
  userId: string;
  fireAt: string;
  timezone?: string;
  createdFrom?: "understand_answer" | "manual";
  delivery?: "in_app" | "calendar" | "both";
};

export async function getActiveReminder(
  saveId: string,
  userId: string,
  q: QueryFn = query,
): Promise<ReminderRow | null> {
  const { rows } = await q<ReminderRow>(
    `SELECT ${REMINDER_FIELDS}
     FROM reminders
     WHERE save_id = $1 AND user_id = $2
       AND deleted_at IS NULL AND status = 'scheduled'
     ORDER BY fire_at ASC
     LIMIT 1`,
    [saveId, userId],
  );
  return rows[0] ?? null;
}

export async function upsertReminder(
  input: UpsertReminderInput,
  q: QueryFn = query,
): Promise<ReminderRow> {
  const fireAt = new Date(input.fireAt);
  if (Number.isNaN(fireAt.getTime())) {
    throw httpError(400, "Invalid reminder time");
  }
  if (fireAt.getTime() < Date.now() - 15_000) {
    throw httpError(400, "Reminder must be in the future");
  }

  const { rows: owned } = await q<{ id: string }>(
    `SELECT id FROM saves
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [input.saveId, input.userId],
  );
  if (!owned[0]) throw httpError(404, "Not found");

  await q(
    `UPDATE reminders
     SET status = 'cancelled', deleted_at = now(), updated_at = now()
     WHERE save_id = $1 AND user_id = $2
       AND deleted_at IS NULL AND status = 'scheduled'`,
    [input.saveId, input.userId],
  );

  const { rows } = await q<ReminderRow>(
    `INSERT INTO reminders (
       save_id, user_id, fire_at, timezone, created_from, delivery
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${REMINDER_FIELDS}`,
    [
      input.saveId,
      input.userId,
      fireAt.toISOString(),
      input.timezone?.trim() || "UTC",
      input.createdFrom ?? "manual",
      input.delivery ?? "in_app",
    ],
  );
  const reminder = rows[0]!;
  // Hosted web app: queue the push for fire time. Off without QStash env.
  await scheduleReminderPush(reminder).catch((err) => {
    console.error("Could not schedule reminder push", err);
  });
  return reminder;
}

export async function cancelReminder(
  saveId: string,
  userId: string,
  q: QueryFn = query,
): Promise<boolean> {
  const { rowCount } = await q(
    `UPDATE reminders
     SET status = 'cancelled', deleted_at = now(), updated_at = now()
     WHERE save_id = $1 AND user_id = $2
       AND deleted_at IS NULL AND status = 'scheduled'`,
    [saveId, userId],
  );
  return (rowCount ?? 0) > 0;
}

export async function cancelRemindersForSaves(
  saveIds: string[],
  userId: string,
  q: QueryFn = query,
) {
  if (saveIds.length === 0) return;
  await q(
    `UPDATE reminders
     SET status = 'cancelled', deleted_at = now(), updated_at = now()
     WHERE user_id = $1
       AND save_id = ANY($2::uuid[])
       AND deleted_at IS NULL`,
    [userId, saveIds],
  );
}
