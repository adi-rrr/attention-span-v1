import type { QueryFn } from "../db.js";
import { query } from "../db.js";
import { httpError } from "../httpError.js";
import { getLifecycleSettings } from "./lifecycle.js";
import { openAiChatJson, parseLooseJson } from "./llm.js";

/**
 * What kind of thing a save is. The key drives expiry and the sorting-time
 * estimate; what the user sees is their own label for it (category_labels),
 * falling back to the default label here.
 */
export const CATEGORIES = [
  { key: "place", label: "Place", hint: "places to visit, food spots, hotels" },
  { key: "recipe", label: "Recipe", hint: "food recipes, dishes to cook" },
  { key: "watch", label: "Watch", hint: "films, shows, movie scenes, videos to watch" },
  { key: "read", label: "Read", hint: "articles, books to read" },
  { key: "learn", label: "Learn", hint: "concepts, frameworks, ideas, philosophy, book summaries" },
  { key: "tool", label: "Tool", hint: "software and apps to use" },
  { key: "buy", label: "Buy", hint: "products, things to buy" },
  { key: "routine", label: "Routine", hint: "workouts, routines, systems, habits, traditions" },
  { key: "quote", label: "Quote", hint: "quotes, motivation" },
  { key: "meme", label: "Meme", hint: "memes, jokes, pure entertainment" },
  {
    key: "event",
    label: "Event",
    hint: "something the user could attend or join on a date the caption states: sales, gigs, launches, workshops. News about future plans is not an event",
  },
  { key: "other", label: "Other", hint: "doesn't fit anything above" },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]["key"];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key) as [CategoryKey, ...CategoryKey[]];

export function isCategory(value: unknown): value is CategoryKey {
  return typeof value === "string" && (CATEGORY_KEYS as string[]).includes(value);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When a save in the inbox fades. Places never fade: they come back when the
 * user arrives in that country. Events fade the day after they happen.
 * Everything else gets the user's lifespan (7 days by default).
 */
export function expiryFor(input: {
  category: CategoryKey | null;
  eventAt: Date | null;
  createdAt: Date;
  lifespanDays: number;
}): Date | null {
  if (input.category === "place") return null;
  if (input.category === "event" && input.eventAt) {
    const after = new Date(input.eventAt.getTime() + DAY_MS);
    if (after.getTime() > Date.now()) return after;
  }
  return new Date(input.createdAt.getTime() + input.lifespanDays * DAY_MS);
}

// ---------------------------------------------------------------------------
// AI suggestion

const CATEGORIZE_SYSTEM = `You sort a post someone saved from social media into one category.
You get its platform, its caption or title, and the current time.
Categories (key: what belongs there):
${CATEGORIES.map((c) => `- ${c.key}: ${c.hint}`).join("\n")}
Return JSON: {"category": string, "confidence": number, "event_date_quote": string|null, "event_at": string|null, "place_name": string|null, "place_country": string|null}
- category: one key from the list.
- confidence: 0 to 1, how sure you are. Captions that are mostly hashtags or vague are low.
- event_date_quote: only for "event": the exact words from the caption that give its date ("this Saturday 15 Nov"). Null if the caption gives no date.
- event_at: only when event_date_quote is set: the ISO 8601 date/time it happens, using the current time to pick the year. Otherwise null. Never use the current time as a stand-in.
- place_name and place_country: when the post is about a specific real place or city (any category), its name ("Marina Beach, Chennai") and ISO 3166-1 alpha-2 country code ("IN"). Otherwise null. Never guess a place the caption doesn't name.
Return ONLY JSON.`;

type Suggestion = {
  category: CategoryKey;
  eventAt: Date | null;
  placeName: string | null;
  placeCountry: string | null;
};

const LOW_CONFIDENCE = 0.5;

async function suggestCategory(platform: string, caption: string): Promise<Suggestion> {
  const content = await openAiChatJson(
    CATEGORIZE_SYSTEM,
    JSON.stringify({
      now: new Date().toISOString(),
      platform,
      caption: caption.slice(0, 1500),
    }),
    { label: "categorize", temperature: 0.1, timeoutMs: 12000 },
  );
  const parsed = parseLooseJson<{
    category?: string;
    confidence?: number;
    event_date_quote?: string | null;
    event_at?: string | null;
    place_name?: string | null;
    place_country?: string | null;
  }>(content);

  // Unsure guesses become "other", so the card asks the user to pick.
  const sure = (parsed?.confidence ?? 0) >= LOW_CONFIDENCE;
  const category = sure && isCategory(parsed?.category) ? parsed!.category : "other";
  // A date only counts when the caption actually says it.
  const eventAt =
    category === "event" && parsed?.event_date_quote?.trim() && parsed.event_at
      ? new Date(parsed.event_at)
      : null;
  const country = parsed?.place_country?.trim().toUpperCase();
  return {
    category,
    eventAt: eventAt && !Number.isNaN(eventAt.getTime()) ? eventAt : null,
    placeName: parsed?.place_name?.trim().slice(0, 120) || null,
    placeCountry: country && /^[A-Z]{2}$/.test(country) ? country : null,
  };
}

/**
 * Give an inbox save its AI category (plus event date and place), and set
 * its expiry to match. Never overrides a category the user picked. Never throws.
 */
export async function categorizeSave(userId: string, saveId: string): Promise<void> {
  try {
    const { rows } = await query<{ platform: string; title: string; created_at: Date }>(
      `SELECT platform::text AS platform, title, created_at FROM saves
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
         AND status = 'inbox' AND category IS NULL`,
      [saveId, userId],
    );
    const save = rows[0];
    if (!save) return;

    // No caption to go on: "other", and the user picks while sorting.
    const suggestion: Suggestion = save.title.trim()
      ? await suggestCategory(save.platform, save.title)
      : { category: "other", eventAt: null, placeName: null, placeCountry: null };

    const { lifespanDays } = await getLifecycleSettings(userId);
    const expiresAt = expiryFor({
      category: suggestion.category,
      eventAt: suggestion.eventAt,
      createdAt: save.created_at,
      lifespanDays,
    });
    await query(
      `UPDATE saves SET
         category = $3, category_source = 'ai', event_at = $4,
         place_name = $5, place_country = $6, expires_at = $7, updated_at = now()
       WHERE id = $1 AND user_id = $2 AND category IS NULL AND status = 'inbox'`,
      [
        saveId,
        userId,
        suggestion.category,
        suggestion.eventAt,
        suggestion.placeName,
        suggestion.placeCountry,
        expiresAt,
      ],
    );
  } catch (err) {
    console.error("[categorize] failed", err);
  }
}

/** Categorize a few uncategorized inbox saves within a time budget. */
export async function fillCategories(
  userId: string,
  opts: { limit?: number; budgetMs?: number } = {},
): Promise<void> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM saves
     WHERE user_id = $1 AND deleted_at IS NULL AND status = 'inbox' AND category IS NULL
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, opts.limit ?? 6],
  );
  if (rows.length === 0) return;
  await Promise.race([
    Promise.all(rows.map((r) => categorizeSave(userId, r.id))),
    new Promise((resolve) => setTimeout(resolve, opts.budgetMs ?? 6000)),
  ]);
}

/** The user picked (or confirmed) a category: it sticks, and expiry follows it. */
export async function setCategory(
  userId: string,
  saveId: string,
  category: CategoryKey,
  q: QueryFn = query,
) {
  const { rows } = await q<{ status: string; event_at: Date | null; created_at: Date }>(
    `SELECT status::text AS status, event_at, created_at FROM saves
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [saveId, userId],
  );
  const save = rows[0];
  if (!save) throw httpError(404, "This save is gone — it may have expired.");

  // Only inbox saves are fading; kept ones just change their label.
  const { lifespanDays } = await getLifecycleSettings(userId, q);
  const expiresAt =
    save.status === "inbox"
      ? expiryFor({ category, eventAt: save.event_at, createdAt: save.created_at, lifespanDays })
      : null;
  const { rows: updated } = await q(
    `UPDATE saves SET
       category = $3, category_source = 'user',
       expires_at = CASE WHEN status = 'inbox' THEN $4::timestamptz ELSE expires_at END,
       updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING id, category, category_source, expires_at`,
    [saveId, userId, category, expiresAt],
  );
  return updated[0];
}

// ---------------------------------------------------------------------------
// User labels

export async function listCategories(userId: string) {
  const { rows } = await query<{ category: string; label: string }>(
    `SELECT category, label FROM category_labels WHERE user_id = $1`,
    [userId],
  );
  const custom = new Map(rows.map((r) => [r.category, r.label]));
  return CATEGORIES.map((c) => ({
    key: c.key,
    label: custom.get(c.key) ?? c.label,
    default_label: c.label,
  }));
}

/** Rename a category for this user. An empty label resets it to the default. */
export async function renameCategory(userId: string, key: CategoryKey, label: string) {
  const clean = label.trim().slice(0, 30);
  if (!clean) {
    await query(`DELETE FROM category_labels WHERE user_id = $1 AND category = $2`, [
      userId,
      key,
    ]);
  } else {
    await query(
      `INSERT INTO category_labels (user_id, category, label) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, category) DO UPDATE SET label = $3, updated_at = now()`,
      [userId, key, clean],
    );
  }
  return listCategories(userId);
}
