import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireUserId } from "../auth.js";
import { query } from "../db.js";
import {
  INBOX_FIELDS,
  draftPlan,
  inboxSummary,
  keepSave,
  letGo,
  markDone,
  mirror,
  safeTimezone,
  sweepExpiredSaves,
} from "../services/lifecycle.js";
import { fillShortTitles } from "../services/titles.js";
import { fillCategories } from "../services/categories.js";
import { sortSecondsByCategory, withSortSeconds } from "../services/estimates.js";

const draftBody = z.object({
  timezone: z.string().optional(),
});

const decisionBody = z.object({
  decision_ms: z.number().int().positive().optional(),
});

const keepBody = z.object({
  mode: z.enum(["plan", "distill"]),
  plan_text: z.string().max(200).optional(),
  plan_at: z.string().datetime({ offset: true }).optional(),
  takeaway: z.string().max(400).optional(),
  folder_id: z.string().uuid().nullable().optional(),
  timezone: z.string().optional(),
  keep_link: z.boolean().optional(),
  decision_ms: z.number().int().positive().optional(),
});

export const lifecycleRoutes: FastifyPluginAsync = async (app) => {
  /** Inbox: soonest-to-fade first. */
  app.get("/inbox", async (req) => {
    const userId = requireUserId(req);
    await sweepExpiredSaves(userId, { force: true });
    await Promise.all([fillShortTitles(userId), fillCategories(userId)]);
    const [{ rows }, seconds] = await Promise.all([
      query<{ category: string | null }>(
        `SELECT ${INBOX_FIELDS}
         FROM saves
         WHERE user_id = $1 AND status = 'inbox' AND deleted_at IS NULL
         ORDER BY expires_at ASC NULLS LAST, created_at DESC
         LIMIT 200`,
        [userId],
      ),
      sortSecondsByCategory(userId),
    ]);
    return {
      items: withSortSeconds(rows, seconds),
      summary: await inboxSummary(userId),
    };
  });

  /**
   * Place saves in one country, still waiting for a decision. The app
   * asks when the phone's time zone says the user has arrived somewhere new.
   */
  app.get("/places", async (req) => {
    const userId = requireUserId(req);
    const { country } = z
      .object({ country: z.string().regex(/^[A-Za-z]{2}$/) })
      .parse(req.query);
    const [{ rows }, seconds] = await Promise.all([
      query<{ category: string | null }>(
        `SELECT ${INBOX_FIELDS}
         FROM saves
         WHERE user_id = $1 AND status = 'inbox' AND deleted_at IS NULL
           AND category = 'place' AND place_country = $2
         ORDER BY created_at DESC
         LIMIT 50`,
        [userId, country.toUpperCase()],
      ),
      sortSecondsByCategory(userId),
    ]);
    return { items: withSortSeconds(rows, seconds) };
  });

  app.get("/inbox/summary", async (req) => {
    const userId = requireUserId(req);
    await sweepExpiredSaves(userId, { force: true });
    return inboxSummary(userId);
  });

  app.post("/saves/:id/done", async (req) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const { decision_ms } = decisionBody.parse(req.body ?? {});
    return markDone(userId, id, decision_ms);
  });

  app.post("/saves/:id/let-go", async (req, reply) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const { decision_ms } = decisionBody.parse(req.body ?? {});
    await letGo(userId, id, decision_ms);
    return reply.code(204).send();
  });

  /** AI starting point for "Plan it". "Distill it" has no draft by design. */
  app.post("/saves/:id/plan/draft", async (req) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const body = draftBody.parse(req.body ?? {});
    return draftPlan(userId, id, body.timezone ?? "UTC");
  });

  app.post("/saves/:id/keep", async (req) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const body = keepBody.parse(req.body);
    return keepSave(userId, id, body);
  });

  /** Journal: everything kept as a distilled takeaway, newest first. */
  app.get("/journal", async (req) => {
    const userId = requireUserId(req);
    const { rows } = await query(
      `SELECT id, platform, source_url, title, short_title, takeaway, folder_path,
              decided_at
       FROM saves
       WHERE user_id = $1 AND status = 'distilled' AND deleted_at IS NULL
       ORDER BY decided_at DESC NULLS LAST
       LIMIT 200`,
      [userId],
    );
    return { items: rows };
  });

  /** What's behind a Mirror count: saves decided this month as done or planned. */
  app.get("/outcomes", async (req) => {
    const userId = requireUserId(req);
    const { kind, tz, day } = z
      .object({
        kind: z.enum(["done", "planned", "distilled"]),
        tz: z.string().optional(),
        // One calendar day (a tapped Mirror day) instead of the whole month.
        day: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .parse(req.query);
    const zone = safeTimezone(tz);
    const when = day
      ? `(decided_at AT TIME ZONE $3)::date = $4::date`
      : `decided_at >= (date_trunc('month', now() AT TIME ZONE $3) AT TIME ZONE $3)`;
    const { rows } = await query(
      `SELECT id, platform, source_url, title, short_title, plan_text, plan_at,
              takeaway, folder_path, decided_at
       FROM saves
       WHERE user_id = $1 AND deleted_at IS NULL AND status = $2::save_status
         AND ${when}
       ORDER BY ${kind === "planned" ? "plan_at ASC NULLS LAST" : "decided_at DESC"}
       LIMIT 200`,
      day ? [userId, kind, zone, day] : [userId, kind, zone],
    );
    return { items: rows };
  });

  app.get("/mirror", async (req) => {
    const userId = requireUserId(req);
    const { tz } = req.query as { tz?: string };
    await sweepExpiredSaves(userId, { force: true });
    return mirror(userId, tz);
  });
};
