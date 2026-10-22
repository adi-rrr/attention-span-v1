import { query } from "../db.js";

export type QaPair = {
  question: string;
  answer: string;
  asked_at: string;
  answered_at: string | null;
};

export async function getSkipsRemaining(userId: string): Promise<number> {
  const { rows: settings } = await query<{
    max_skips: number;
    skip_window_days: number;
  }>(
    `SELECT max_skips, skip_window_days FROM user_settings WHERE user_id = $1`,
    [userId],
  );
  const maxSkips = settings[0]?.max_skips ?? 2;
  const windowDays = settings[0]?.skip_window_days ?? 7;

  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM skip_events
     WHERE user_id = $1
       AND skipped_at > now() - ($2::text || ' days')::interval`,
    [userId, String(windowDays)],
  );
  const used = Number(rows[0]?.count ?? 0);
  return Math.max(0, maxSkips - used);
}
