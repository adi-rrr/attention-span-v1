import { query } from "../db.js";
import { openAiChatJson, parseLooseJson } from "./llm.js";

const MAX_QUICK = 60;

/**
 * Rule-based one-liner, available instantly: drops "X on Instagram:",
 * quotes, hashtags, mentions and "(Official Video)"-style tags, keeps the
 * first sentence and cuts at a word boundary.
 */
export function quickShortTitle(title: string): string {
  let t = title.trim();
  t = t.replace(/^.{1,80}? on (Instagram|TikTok|Facebook|Threads|X):\s*/i, "");
  t = t.replace(/[\s|–-]*\b(YouTube|Reddit)\s*$/i, "");
  t = t.replace(/[([](official|lyric|lyrics|music|audio|video|hd|4k|m\/v)[^)\]]*[)\]]/gi, "");
  t = t.replace(/[#@][\p{L}\p{N}_.]+/gu, "");
  t = t.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "");
  t = t.replace(/^["“'‘\s]+|["”'’\s]+$/g, "");
  t = t.replace(/\s+/g, " ").trim();
  const firstSentence = t.split(/(?<=[.!?])\s|\n/)[0]?.trim() ?? t;
  if (firstSentence.length >= 12) t = firstSentence;
  if (t.length > MAX_QUICK) {
    const cut = t.slice(0, MAX_QUICK);
    t = `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 30)).trim()}…`;
  }
  return t || title.slice(0, MAX_QUICK);
}

const SHORT_TITLE_SYSTEM = `You write a short title for something a person saved from social media.
You get its platform and its original title or caption.
Return JSON: {"title": string}
- At most 8 words, sentence case, one line.
- Say what the post is about (e.g. "Quick miso ramen at home", "Library reading-hours promo").
- No hashtags, emoji, quotes, or account names unless the account is the point.
- Use only what the caption says. If it's too vague, return a tidy shortened version of it.
Return ONLY JSON.`;

/** Replace the quick title with a model-written one. Never throws. */
export async function aiShortTitle(userId: string, saveId: string): Promise<void> {
  try {
    const { rows } = await query<{ platform: string; title: string }>(
      `SELECT platform::text AS platform, title FROM saves
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL AND title <> ''`,
      [saveId, userId],
    );
    const save = rows[0];
    if (!save) return;
    const content = await openAiChatJson(
      SHORT_TITLE_SYSTEM,
      JSON.stringify({ platform: save.platform, original: save.title.slice(0, 1200) }),
      { label: "shortTitle", temperature: 0.3, timeoutMs: 10000 },
    );
    const title = parseLooseJson<{ title?: string }>(content)?.title?.trim();
    if (!title) return;
    await query(
      `UPDATE saves SET short_title = $3, title_source = 'ai'
       WHERE id = $1 AND user_id = $2`,
      [saveId, userId, title.replace(/^["“]|["”]$/g, "").slice(0, 80)],
    );
  } catch (err) {
    console.error("[shortTitle] failed", err);
  }
}

/**
 * Give saves without an AI title one: a quick title right away, then the AI
 * version for a few at a time within a time budget.
 */
export async function fillShortTitles(
  userId: string,
  opts: { limit?: number; budgetMs?: number } = {},
): Promise<void> {
  const { rows } = await query<{ id: string; title: string; short_title: string | null }>(
    `SELECT id, title, short_title FROM saves
     WHERE user_id = $1 AND deleted_at IS NULL AND title <> ''
       AND title_source IS DISTINCT FROM 'ai'
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, opts.limit ?? 6],
  );
  if (rows.length === 0) return;
  for (const r of rows) {
    if (!r.short_title) {
      await query(
        `UPDATE saves SET short_title = $2, title_source = 'quick' WHERE id = $1`,
        [r.id, quickShortTitle(r.title)],
      );
    }
  }
  await Promise.race([
    Promise.all(rows.map((r) => aiShortTitle(userId, r.id))),
    new Promise((resolve) => setTimeout(resolve, opts.budgetMs ?? 6000)),
  ]);
}
