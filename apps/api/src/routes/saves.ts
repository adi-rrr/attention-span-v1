import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireUserId } from "../auth.js";
import { query } from "../db.js";
import { httpError } from "../httpError.js";
import { resolvePreview } from "../services/preview.js";
import { cancelReminder } from "../services/reminders.js";
import { getLifecycleSettings, logSaveEvent } from "../services/lifecycle.js";
import { aiShortTitle, quickShortTitle } from "../services/titles.js";
import { categorizeSave } from "../services/categories.js";
import { readScreenshot } from "../services/screenshots.js";

const SAVE_LIST_FIELDS = `id, platform, status, source_url, title, short_title, user_note,
              folder_id, folder_path, content_kind, offline_policy,
              expires_at, plan_text, plan_at, takeaway,
              category, category_source, event_at, place_name, place_country,
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
    "pinterest",
    "link",
  ]),
  source_url: z.string().url().nullable().optional(),
  title: z.string().optional(),
  replace_existing: z.boolean().optional().default(false),
  /**
   * "web": the web app, which saves any link except Reddit. Phone shares
   * leave it out and stay Instagram-only.
   */
  client: z.enum(["web"]).optional(),
});

const uploadBody = z.object({
  /** The screenshot as a data: URL (PNG, JPEG or WebP), already resized. */
  image: z.string().regex(/^data:image\/(png|jpeg|webp);base64,/),
});

/** Largest decoded upload we accept (the web app resizes well below this). */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const patchSaveBody = z.object({
  user_note: z.string().nullable().optional(),
  folder_id: z.string().uuid().nullable().optional(),
  title: z.string().optional(),
  status: z.enum(["done", "archived"]).optional(),
});

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function hostIs(url: string, ...domains: string[]): boolean {
  const host = hostOf(url);
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Phone shares: Instagram only for now; other links get a clear message. */
function isInstagramUrl(url: string): boolean {
  return hostIs(url, "instagram.com", "instagr.am");
}

/** Which platform a link belongs to; anything unknown is a plain "link". */
function platformOf(url: string) {
  if (isInstagramUrl(url)) return "instagram" as const;
  if (hostIs(url, "youtube.com", "youtu.be")) return "youtube" as const;
  if (hostIs(url, "pinterest.com", "pin.it") || /(^|\.)pinterest\.[a-z.]+$/.test(hostOf(url))) {
    return "pinterest" as const;
  }
  if (hostIs(url, "substack.com")) return "substack" as const;
  if (hostIs(url, "reddit.com", "redd.it")) return "reddit" as const;
  return "link" as const;
}

/** Tracking parameters that differ per share but not per page. */
const TRACKING_PARAM = /^(utm_\w+|fbclid|gclid|igsh|igshid|si|feature|ref|ref_src)$/i;

/**
 * Any non-Instagram link without tracking parameters or #fragment. YouTube
 * links (watch, youtu.be, shorts, with or without www) become one form.
 */
function canonicalLink(url: string): string {
  try {
    const u = new URL(url);
    if (hostIs(url, "youtube.com", "youtu.be")) {
      const shorts = u.pathname.match(/^\/shorts\/([\w-]{6,})/)?.[1];
      if (shorts) return `https://www.youtube.com/shorts/${shorts}`;
      const id = hostIs(url, "youtu.be")
        ? u.pathname.slice(1).split("/")[0]
        : u.searchParams.get("v");
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) u.searchParams.delete(key);
    }
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * One link per Instagram post. Every share adds its own tracking code
 * (?igsh=…, ?psln=…), so the same post would otherwise save twice. Returns
 * the post's shortcode and a clean link, e.g. https://www.instagram.com/reel/ABC/.
 */
export function canonicalInstagram(url: string): { code: string | null; url: string } {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/(?:[^/]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    if (!m) return { code: null, url: `${u.origin}${u.pathname}` };
    const kind = m[1] === "reels" ? "reel" : m[1];
    return { code: m[2], url: `https://www.instagram.com/${kind}/${m[2]}/` };
  } catch {
    return { code: null, url };
  }
}

export const savesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/saves", async (req) => {
    const userId = requireUserId(req);
    const q = req.query as {
      status?: string;
      folder_id?: string;
      uncategorized?: string;
      platform?: string;
      inbox?: string;
      /** A category key. "other" also takes saves that never got one. */
      category?: string;
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
    if (q.category === "other") {
      clauses.push(`(category IS NULL OR category = 'other')`);
    } else if (q.category) {
      params.push(q.category);
      clauses.push(`category = $${params.length}`);
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

    if (body.source_url && body.client === "web") {
      // The web app saves any link except Reddit, filed under its own platform.
      body.platform = platformOf(body.source_url);
      if (body.platform === "reddit") {
        return reply.code(422).send({
          error: "Reddit links can't be saved.",
          code: "NOT_SUPPORTED",
        });
      }
    } else if (body.source_url && !isInstagramUrl(body.source_url)) {
      return reply.code(422).send({
        error: "Only Instagram posts can be saved for now.",
        code: "NOT_INSTAGRAM",
      });
    }

    if (body.source_url) {
      const canonical = isInstagramUrl(body.source_url)
        ? canonicalInstagram(body.source_url)
        : { code: null, url: canonicalLink(body.source_url) };
      body.source_url = canonical.url;
      // Match by the post's shortcode so older saves, stored with their
      // tracking codes, still count as the same post.
      const { rows: existing } = await query(
        `SELECT id, created_at, status, expires_at FROM saves
         WHERE user_id = $1 AND deleted_at IS NULL
           AND (source_url = $2
                OR ($3::text IS NOT NULL
                    AND source_url ~ ('instagram\\.com/(?:[^/]+/)?(?:p|reel|reels|tv)/'
                                      || $3::text || '(?:[/?#]|$)')))
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId, canonical.url, canonical.code],
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
         id, user_id, platform, source_url, title, status, expires_at,
         short_title, title_source
       ) VALUES ($1, $2, $3, $4, $5, 'inbox', now() + make_interval(days => $6),
                 $7, $8)
       RETURNING id, platform, status, source_url, title, short_title,
                 user_note, folder_id, folder_path, content_kind, offline_policy,
                 expires_at, created_at, updated_at`,
      [
        id,
        userId,
        body.platform,
        body.source_url ?? null,
        title,
        lifespanDays,
        title ? quickShortTitle(title) : null,
        title ? "quick" : null,
      ],
    );
    await logSaveEvent(userId, "saved", body.platform);
    // A model-written one-liner replaces the quick title when it's ready;
    // GET /inbox fills in any that didn't finish here.
    if (title) void aiShortTitle(userId, id);
    // AI category, event date and place; this also sets the category's expiry.
    void categorizeSave(userId, id);

    return reply.code(201).send(rows[0]);
  });

  /** The uploaded screenshot behind a save, for the web app's View post. */
  app.get("/saves/:id/image", async (req, reply) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const { rows } = await query<{ mime: string; data: Buffer }>(
      `SELECT i.mime, i.data FROM save_images i
       JOIN saves s ON s.id = i.save_id AND s.deleted_at IS NULL
       WHERE i.save_id = $1 AND i.user_id = $2`,
      [id, userId],
    );
    if (!rows[0]) throw httpError(404, "No image for this save");
    return reply
      .type(rows[0].mime)
      .header("Cache-Control", "private, max-age=86400")
      .send(rows[0].data);
  });

  /**
   * Web app: save an uploaded screenshot. The AI reads it (text, a one-line
   * title, what it shows); that text becomes the save's title, so search,
   * categories and expiry work exactly as for a shared link.
   */
  app.post("/saves/upload", { bodyLimit: 6 * 1024 * 1024 }, async (req, reply) => {
    const userId = requireUserId(req);
    const { image } = uploadBody.parse(req.body);
    const mime = image.slice(5, image.indexOf(";"));
    const data = Buffer.from(image.slice(image.indexOf(",") + 1), "base64");
    if (data.length === 0 || data.length > MAX_IMAGE_BYTES) {
      throw httpError(413, "That image is too large. Try a smaller screenshot.");
    }

    const read = await readScreenshot(image);
    const fallback = `Screenshot · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
    const title = [read.summary, read.text].filter(Boolean).join("\n").slice(0, 2000) || fallback;
    const shortTitle = read.title || fallback;

    const { lifespanDays } = await getLifecycleSettings(userId);
    const { rows } = await query(
      `INSERT INTO saves (
         user_id, platform, source_url, title, status, expires_at,
         short_title, title_source
       ) VALUES ($1, 'screenshot', NULL, $2, 'inbox', now() + make_interval(days => $3),
                 $4, $5)
       RETURNING id, platform, status, source_url, title, short_title,
                 user_note, folder_id, folder_path, content_kind, offline_policy,
                 expires_at, created_at, updated_at`,
      [userId, title, lifespanDays, shortTitle, read.title ? "ai" : "quick"],
    );
    const save = rows[0] as { id: string };
    await query(
      `INSERT INTO save_images (save_id, user_id, mime, data, extracted_text)
       VALUES ($1, $2, $3, $4, $5)`,
      [save.id, userId, mime, data, read.text],
    );
    await logSaveEvent(userId, "saved", "screenshot");
    // Waited for here (the user is already waiting on the AI read), so the
    // reply carries the real expiry: places don't fade, events go after the day.
    await categorizeSave(userId, save.id);
    const { rows: after } = await query<{ expires_at: string | null; category: string | null }>(
      `SELECT expires_at, category FROM saves WHERE id = $1`,
      [save.id],
    );

    return reply.code(201).send({ ...save, ...after[0] });
  });

  app.get("/saves/:id", async (req) => {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };

    const { rows } = await query(
      `SELECT s.id, s.platform, s.status, s.source_url, s.title, s.short_title, s.user_note,
              s.folder_id, s.folder_path, s.content_kind, s.offline_policy,
              s.expires_at, s.plan_text, s.plan_at, s.takeaway,
              s.created_at, s.updated_at,
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
              expires_at, plan_text, plan_at, takeaway,
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
