import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireUserId } from "../auth.js";
import { query } from "../db.js";
import {
  INBOX_FIELDS,
  draftKeep,
  inboxSummary,
  keepSave,
  letGo,
  markDone,
  mirror,
  sweepExpiredSaves,
  triageMissing,
} from "../services/lifecycle.js";

const draftBody = z.object({
  mode: z.enum(["plan", "distill"]),
  timezone: z.string().optional(),
});

const keepBody = z.object({
  mode: z.enum(["plan", "distill"]),
  plan_text: z.string().max(200).optional(),
  plan_at: z.string().datetime({ offset: true }).optional(),
  takeaway: z.string().max(400).optional(),
  folder_id: z.string().uuid().nullable().optional(),
  timezone: z.string().optional(),
});

export const lifecycleRoutes: FastifyPluginAsync = async (app) => {
  /** Inbox: soonest-to-fade first, with the AI's guess filled in where possible. */
  app.get("/inbox", async (req) => {
    const userId = requireUserId(req);
    await sweepExpiredSaves(userId, { force: true });
    await triageMissing(userId);
    const { rows } = await query(
      `SELECT ${INBOX_FIELDS}
       FROM saves
       WHERE user_id = $1 AND status = 'inbox' AND deleted_at IS NULL
       ORDER BY expires_at ASC NULLS LAST, created_at DESC
       LIMIT 200`,
      [userId],
    );
    return { items: rows, summary: await inboxSummary(userId) };
  });

  app.get("/inbox/summary", async (req) => {
    const userId = requireUserId(req);
    await sweepExpiredSaves(userId, { force: true });
    return inboxSummary(userId);
  });

  app.post("/saves/:id/done", async (req) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    return markDone(userId, id);
  });

  app.post("/saves/:id/let-go", async (req, reply) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    await letGo(userId, id);
    return reply.code(204).send();
  });

  app.post("/saves/:id/keep/draft", async (req) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const body = draftBody.parse(req.body ?? {});
    return draftKeep(userId, id, body.mode, body.timezone ?? "UTC");
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
      `SELECT id, platform, source_url, title, takeaway, folder_path, decided_at
       FROM saves
       WHERE user_id = $1 AND status = 'distilled' AND deleted_at IS NULL
       ORDER BY decided_at DESC NULLS LAST
       LIMIT 200`,
      [userId],
    );
    return { items: rows };
  });

  app.get("/mirror", async (req) => {
    const userId = requireUserId(req);
    await sweepExpiredSaves(userId, { force: true });
    return mirror(userId);
  });
};
