import type { FastifyPluginAsync } from "fastify";
import { requireUserId } from "../auth.js";
import { query } from "../db.js";

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get("/me", async (req) => {
    const userId = requireUserId(req);

    const { rows: users } = await query(
      `SELECT id, email, display_name, timezone FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    if (!users[0]) {
      const err = new Error("User not found") as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }

    const { rows: settings } = await query(
      `SELECT max_skips, skip_window_days, max_folder_depth,
              default_reminder_hour, notifications_enabled
       FROM user_settings WHERE user_id = $1`,
      [userId],
    );
    const s = settings[0] ?? {
      max_skips: 2,
      skip_window_days: 7,
      max_folder_depth: 5,
      default_reminder_hour: 9,
      notifications_enabled: true,
    };

    const { rows: skips } = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM skip_events
       WHERE user_id = $1 AND skipped_at > now() - ($2 || ' days')::interval`,
      [userId, String(s.skip_window_days)],
    );
    const used = Number(skips[0]?.count ?? 0);

    return {
      ...users[0],
      timezone: users[0].timezone,
      max_skips: s.max_skips,
      skip_window_days: s.skip_window_days,
      max_folder_depth: s.max_folder_depth,
      default_reminder_hour: s.default_reminder_hour,
      notifications_enabled: s.notifications_enabled,
      skips_remaining: Math.max(0, s.max_skips - used),
    };
  });
};
