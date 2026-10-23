import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireUserId } from "../auth.js";
import { query } from "../db.js";
import { httpError } from "../httpError.js";
import { resolvePreview } from "../services/preview.js";
import { cancelReminder } from "../services/reminders.js";
import { getLifecycleSettings, logSaveEvent } from "../services/lifecycle.js";

const SAVE_LIST_FIELDS = `id, platform, status, source_url, title, user_note,
              folder_id, folder_path, content_kind, offline_policy,
              expires_at, ai_intent, ai_reason, plan_text, plan_at, takeaway,
              LEFT(regexp_replace(understand_text, E'[\\n\\r]+', ' ', 'g'), 140)
                AS understand_snippet,
              EXISTS (
                SELECT 1 FROM reminders r
                WHERE r.save_id = saves.id
                  AND r.deleted_at IS NULL
                  AND r.status = 'scheduled'
              ) AS has_reminder,
              (
                SELECT r.fire_at FROM reminders r
                WHERE r.save_id = saves.id
                  AND r.deleted_at IS NULL
                  AND r.status = 'scheduled'
                ORDER BY r.fire_at ASC
                LIMIT 1
              ) AS reminder_fire_at,
              created_at, updated_at`;

const createSaveBody = z.object({
  id: z.string().uuid().optional(),
  platform: z.enum([
    "instagram",
    "reddit",
    "substack",
    "youtube",
    "screenshot",
  ]),
  source_url: z.string().url().nullable().optional(),
  title: z.string().optional(),
  replace_existing: z.boolean().optional().default(false),
});

const patchSaveBody = z.object({
  user_note: z.string().nullable().optional(),
  folder_id: z.string().uuid().nullable().optional(),
  title: z.string().optional(),
  status: z.enum(["understand_done", "done", "archived"]).optional(),
});

export const savesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/saves", async (req) => {
    const userId = requireUserId(req);
    const q = req.query as {
      status?: string;
      folder_id?: string;
      uncategorized?: string;
      platform?: string;
      inbox?: string;
    };

    const clauses = [`user_id = $1`, `deleted_at IS NULL`];
    const params: unknown[] = [userId];

    if (q.inbox === "true") {
      clauses.push(`status = 'inbox'`);
    } else if (q.status) {
      const statuses = q.status.split(",").map((s) => s.trim());
      params.push(statuses);
      clauses.push(`status = ANY($${params.length}::save_status[])`);
    }

    if (q.uncategorized === "true") {
      clauses.push(`folder_id IS NULL`);
    } else if (q.folder_id) {
      params.push(q.folder_id);
      clauses.push(`folder_id = $${params.length}`);
    }
    if (q.platform) {
      params.push(q.platform);
      clauses.push(`platform = $${params.length}`);
    }

    const { rows } = await query(
      `SELECT ${SAVE_LIST_FIELDS}
       FROM saves
       WHERE ${clauses.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT 100`,
      params,
    );

    return { items: rows };
  });

  app.post("/saves", async (req, reply) => {
    const userId = requireUserId(req);
    const body = createSaveBody.parse(req.body);

    if (body.source_url) {
      const { rows: existing } = await query(
        `SELECT id, created_at, status, expires_at FROM saves
         WHERE user_id = $1 AND source_url = $2 AND deleted_at IS NULL
         LIMIT 1`,
        [userId, body.source_url],
      );

      if (existing[0] && !body.replace_existing) {
        return reply.code(409).send({
          existing_save_id: existing[0].id,
          saved_at: existing[0].created_at,
          status: existing[0].status,
          expires_at: existing[0].expires_at,
          message: `Already saved. Replace it?`,
        });
      }

      if (existing[0] && body.replace_existing) {
        await query(
          `UPDATE saves SET deleted_at = now(), status = 'deleted', updated_at = now()
           WHERE id = $1`,
          [existing[0].id],
        );
      }
    }

    const id = body.id ?? crypto.randomUUID();

    // Preview metadata only (no body scrape / AI extract)
    const preview = await resolvePreview(
      body.platform,
      body.source_url ?? null,
    );
    const title =
      (body.title && body.title.trim()) ||
      preview.title ||
      "";

    // Zero-tap save: straight into the inbox with a countdown.
    const { lifespanDays } = await getLifecycleSettings(userId);
    const { rows } = await query(
      `INSERT INTO saves (
         id, user_id, platform, source_url, title, status, expires_at
       ) VALUES ($1, $2, $3, $4, $5, 'inbox', now() + make_interval(days => $6))
       RETURNING id, platform, status, source_url, title,
                 user_note, folder_id, folder_path, content_kind, offline_policy,
                 expires_at, created_at, updated_at`,
      [
        id,
        userId,
        body.platform,
        body.source_url ?? null,
        title,
        lifespanDays,
      ],
    );
    await logSaveEvent(userId, "saved", body.platform);

    return reply.code(201).send(rows[0]);
  });

  app.get("/saves/:id", async (req) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };

    const { rows } = await query(
      `SELECT s.id, s.platform, s.status, s.source_url, s.title, s.user_note,
              s.folder_id, s.folder_path, s.content_kind, s.offline_policy,
              s.expires_at, s.ai_intent, s.ai_reason, s.plan_text, s.plan_at, s.takeaway,
              s.created_at, s.updated_at,
              COALESCE(us.qa_pairs, '[]'::jsonb) AS qa_pairs,
              CASE WHEN r.id IS NULL THEN NULL ELSE json_build_object(
                'id', r.id,
                'save_id', r.save_id,
                'fire_at', r.fire_at,
                'status', r.status,
                'delivery', r.delivery,
                'created_from', r.created_from,
                'timezone', r.timezone
              ) END AS reminder
       FROM saves s
       LEFT JOIN understand_sessions us ON us.save_id = s.id
       LEFT JOIN LATERAL (
         SELECT id, save_id, fire_at, status, delivery, created_from, timezone
         FROM reminders
         WHERE save_id = s.id AND deleted_at IS NULL AND status = 'scheduled'
         ORDER BY fire_at ASC
         LIMIT 1
       ) r ON true
       WHERE s.id = $1 AND s.user_id = $2 AND s.deleted_at IS NULL`,
      [id, userId],
    );
    if (!rows[0]) throw httpError(404, "Not found");
    return rows[0];
  });

  app.patch("/saves/:id", async (req) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const body = patchSaveBody.parse(req.body);

    const hasFolder = body.folder_id !== undefined;
    const hasNote = body.user_note !== undefined;

    let folderPath: string | null = null;
    if (hasFolder && body.folder_id) {
      const { rows: folders } = await query<{ path: string }>(
        `SELECT path FROM folders
         WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [body.folder_id, userId],
      );
      if (!folders[0]) throw httpError(400, "Folder not found");
      folderPath = folders[0].path;
    } else if (hasFolder) {
      folderPath = "";
    }

    const { rows } = await query(
      `UPDATE saves SET
         user_note = CASE WHEN $3::boolean THEN $4 ELSE user_note END,
         folder_id = CASE WHEN $5::boolean THEN $6 ELSE folder_id END,
         folder_path = CASE WHEN $5::boolean THEN $7 ELSE folder_path END,
         title = COALESCE($8, title),
         status = COALESCE($9::save_status, status),
         updated_at = now()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING id, platform, status, source_url, title, user_note,
                 folder_id, folder_path, content_kind, offline_policy,
              expires_at, ai_intent, ai_reason, plan_text, plan_at, takeaway,
                 created_at, updated_at`,
      [
        id,
        userId,
        hasNote,
        hasNote ? body.user_note : null,
        hasFolder,
        hasFolder ? body.folder_id : null,
        folderPath,
        body.title ?? null,
        body.status ?? null,
      ],
    );
    if (!rows[0]) throw httpError(404, "Not found");
    return rows[0];
  });

  app.delete("/saves/:id", async (req, reply) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };

    await cancelReminder(id, userId);
    await query(
      `UPDATE saves SET deleted_at = now(), status = 'deleted', updated_at = now()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, userId],
    );
    return reply.code(204).send();
  });
};
