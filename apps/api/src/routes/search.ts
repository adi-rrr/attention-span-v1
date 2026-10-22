import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireUserId } from "../auth.js";
import { query } from "../db.js";

const querySchema = z.object({
  q: z.string().min(1).max(200),
});

type SearchRow = {
  id: string;
  title: string;
  platform: string;
  folder_path: string;
  understand_text: string;
  user_note: string | null;
  content_kind: string | null;
  offline_policy: string;
  rank: number;
  has_reminder: boolean;
  has_map_pin: boolean;
};

function pickMatchField(
  q: string,
  row: SearchRow,
): { match_field: "understand" | "note" | "folder" | "title"; match_snippet: string } {
  const terms = q
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);

  const hits = (text: string | null | undefined) => {
    if (!text) return false;
    const lower = text.toLowerCase();
    return terms.some((t) => lower.includes(t));
  };

  const snippet = (text: string, max = 120) => {
    const t = text.replace(/\s+/g, " ").trim();
    if (t.length <= max) return t;
    // Prefer a window around the first matching term
    const lower = t.toLowerCase();
    let idx = -1;
    for (const term of terms) {
      const i = lower.indexOf(term);
      if (i >= 0 && (idx < 0 || i < idx)) idx = i;
    }
    if (idx < 0) return t.slice(0, max) + "…";
    const start = Math.max(0, idx - 30);
    const end = Math.min(t.length, start + max);
    return (start > 0 ? "…" : "") + t.slice(start, end) + (end < t.length ? "…" : "");
  };

  if (hits(row.understand_text)) {
    return {
      match_field: "understand",
      match_snippet: snippet(row.understand_text),
    };
  }
  if (hits(row.user_note)) {
    return {
      match_field: "note",
      match_snippet: snippet(row.user_note ?? ""),
    };
  }
  if (hits(row.folder_path)) {
    return {
      match_field: "folder",
      match_snippet: row.folder_path,
    };
  }
  return {
    match_field: "title",
    match_snippet: snippet(row.title || "Untitled"),
  };
}

export const searchRoutes: FastifyPluginAsync = async (app) => {
  app.get("/search", async (req) => {
    const userId = requireUserId(req);
    const { q } = querySchema.parse(req.query);

    // Weighted FTS: A=understand, B=note, C=folder, D=title+url (from trigger)
    // Prefer understand_done / done; include understand_pending at reduced visibility
    const { rows } = await query<SearchRow>(
      `SELECT
         s.id,
         s.title,
         s.platform::text AS platform,
         s.folder_path,
         s.understand_text,
         s.user_note,
         s.content_kind::text AS content_kind,
         s.offline_policy::text AS offline_policy,
         ts_rank_cd(s.search_document, plainto_tsquery('english', $2), 32) AS rank,
         EXISTS (
           SELECT 1 FROM reminders r
           WHERE r.save_id = s.id AND r.deleted_at IS NULL AND r.status = 'scheduled'
         ) AS has_reminder,
         EXISTS (
           SELECT 1 FROM map_pins m
           WHERE m.save_id = s.id AND m.deleted_at IS NULL
         ) AS has_map_pin
       FROM saves s
       WHERE s.user_id = $1
         AND s.deleted_at IS NULL
         AND s.status IN ('understand_done', 'done', 'understand_pending')
         AND s.search_document @@ plainto_tsquery('english', $2)
       ORDER BY
         CASE WHEN s.status = 'understand_pending' THEN 0 ELSE 1 END DESC,
         rank DESC,
         s.updated_at DESC
       LIMIT 40`,
      [userId, q],
    );

    const items = rows.map((row) => {
      const { match_field, match_snippet } = pickMatchField(q, row);
      return {
        save_id: row.id,
        title: row.title || "Untitled",
        platform: row.platform,
        folder_path: row.folder_path || "",
        match_snippet,
        match_field,
        has_reminder: row.has_reminder,
        has_map_pin: row.has_map_pin,
        content_kind: row.content_kind,
        offline_available: row.offline_policy === "full" ? "full" : "light",
        rank: Number(row.rank),
      };
    });

    return { items, q };
  });
};
