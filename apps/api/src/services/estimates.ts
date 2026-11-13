import { query } from "../db.js";
import { CATEGORY_KEYS, type CategoryKey } from "./categories.js";

/**
 * How long sorting one save takes, by category. Day one uses these rough
 * defaults; once there's real data, the median of recent decisions wins
 * (the median, so one decision left open while the phone sat on a table
 * doesn't drag every estimate up).
 */
const DEFAULT_SECONDS: Record<CategoryKey, number> = {
  meme: 5,
  quote: 10,
  watch: 15,
  event: 15,
  buy: 15,
  tool: 20,
  place: 20,
  other: 20,
  recipe: 25,
  read: 30,
  learn: 30,
  routine: 30,
};

/** The user's own median needs this many recent decisions in a category. */
const MIN_OWN_SAMPLES = 3;
const OWN_WINDOW = 20;
/** Everyone's median, used before the user has enough of their own. */
const MIN_ALL_SAMPLES = 5;
const ALL_WINDOW = 200;

type MedianRow = { category: string; median_ms: number; n: number };

/** Seconds to sort one save, for every category. */
export async function sortSecondsByCategory(
  userId: string,
): Promise<Record<CategoryKey, number>> {
  const [own, all] = await Promise.all([
    query<MedianRow>(
      `SELECT category, percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) AS median_ms,
              count(*)::int AS n
       FROM (
         SELECT category, ms,
                row_number() OVER (PARTITION BY category ORDER BY created_at DESC) AS rn
         FROM decision_times WHERE user_id = $1
       ) recent
       WHERE rn <= $2
       GROUP BY category`,
      [userId, OWN_WINDOW],
    ),
    query<MedianRow>(
      `SELECT category, percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) AS median_ms,
              count(*)::int AS n
       FROM (
         SELECT category, ms,
                row_number() OVER (PARTITION BY category ORDER BY created_at DESC) AS rn
         FROM decision_times
       ) recent
       WHERE rn <= $1
       GROUP BY category`,
      [ALL_WINDOW],
    ),
  ]);

  const ownBy = new Map(own.rows.map((r) => [r.category, r]));
  const allBy = new Map(all.rows.map((r) => [r.category, r]));
  const result = {} as Record<CategoryKey, number>;
  for (const key of CATEGORY_KEYS) {
    const mine = ownBy.get(key);
    const everyone = allBy.get(key);
    const ms =
      mine && mine.n >= MIN_OWN_SAMPLES
        ? mine.median_ms
        : everyone && everyone.n >= MIN_ALL_SAMPLES
          ? everyone.median_ms
          : DEFAULT_SECONDS[key] * 1000;
    result[key] = Math.max(1, Math.round(ms / 1000));
  }
  return result;
}

/** Attach `sort_seconds` to each save, from its category's estimate. */
export function withSortSeconds<T extends { category?: string | null }>(
  saves: T[],
  seconds: Record<CategoryKey, number>,
): (T & { sort_seconds: number })[] {
  return saves.map((s) => ({
    ...s,
    sort_seconds: seconds[(s.category as CategoryKey) ?? "other"] ?? seconds.other,
  }));
}

/** "about 3 min": whole minutes, rounded up, never zero. */
export function minutesFor(totalSeconds: number): number {
  return Math.max(1, Math.ceil(totalSeconds / 60));
}
