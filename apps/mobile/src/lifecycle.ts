import { api } from "./api";
import type {
  Category,
  CategoryKey,
  InboxSummary,
  KeepDraft,
  KeepMode,
  Mirror,
  Save,
} from "./types";

export function fetchInbox() {
  return api<{ items: Save[]; summary: InboxSummary }>("/inbox");
}

/** `decisionMs`: how long the user took to decide, for the sorting estimate. */
export function markDone(saveId: string, decisionMs?: number) {
  return api<{ id: string; status: string }>(`/saves/${saveId}/done`, {
    method: "POST",
    body: JSON.stringify({ decision_ms: decisionMs }),
  });
}

export function letGo(saveId: string, decisionMs?: number) {
  return api<void>(`/saves/${saveId}/let-go`, {
    method: "POST",
    body: JSON.stringify({ decision_ms: decisionMs }),
  });
}

/** AI starting point for "Plan it". Takeaways are always the user's own words. */
export function draftPlan(saveId: string, timezone: string) {
  return api<KeepDraft>(`/saves/${saveId}/plan/draft`, {
    method: "POST",
    body: JSON.stringify({ timezone }),
  });
}

export function keepSave(
  saveId: string,
  input: {
    mode: KeepMode;
    plan_text?: string;
    plan_at?: string;
    takeaway?: string;
    folder_id?: string | null;
    timezone?: string;
    keep_link?: boolean;
    decision_ms?: number;
  },
) {
  return api<Save>(`/saves/${saveId}/keep`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function setCategory(saveId: string, category: CategoryKey) {
  return api<Pick<Save, "id" | "category" | "category_source" | "expires_at">>(
    `/saves/${saveId}/category`,
    { method: "PATCH", body: JSON.stringify({ category }) },
  );
}

export function fetchCategories() {
  return api<{ items: Category[] }>("/categories");
}

/** Saves per category for the given statuses; saves with none count as "other". */
export function fetchCategoryCounts(statuses: string) {
  return api<{ counts: Partial<Record<CategoryKey, number>> }>(
    `/categories/counts?status=${statuses}`,
  );
}

/** An empty label resets the category to its default name. */
export function renameCategory(key: CategoryKey, label: string) {
  return api<{ items: Category[] }>(`/categories/${key}`, {
    method: "PUT",
    body: JSON.stringify({ label }),
  });
}

export function fetchJournal() {
  return api<{ items: Save[] }>("/journal");
}

export function fetchMirror(timezone: string) {
  return api<Mirror>(`/mirror?tz=${encodeURIComponent(timezone)}`);
}

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  reddit: "Reddit",
  substack: "Substack",
  screenshot: "Screenshot",
};

/** "Instagram" — the small line above a save's title. */
export function platformLabel(platform: string): string {
  return PLATFORM_LABEL[platform] ?? platform;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * How much life a save has left. `fraction` runs 1 → 0 over its lifespan and
 * drives how faded the card looks.
 */
export function fadeInfo(
  expiresAt: string | null | undefined,
  lifespanDays = 7,
  now = Date.now(),
): { label: string; fraction: number; urgent: boolean } {
  if (!expiresAt) return { label: "", fraction: 1, urgent: false };
  const left = new Date(expiresAt).getTime() - now;
  const fraction = Math.max(0, Math.min(1, left / (lifespanDays * DAY)));
  if (left <= 0) return { label: "Fading now", fraction: 0, urgent: true };
  if (left < HOUR) return { label: "Fades within the hour", fraction, urgent: true };
  if (left < DAY) {
    const h = Math.round(left / HOUR);
    return { label: `Fades in ${h} h`, fraction, urgent: true };
  }
  const d = Math.round(left / DAY);
  return {
    label: d === 1 ? "Fades tomorrow" : `Fades in ${d} days`,
    fraction,
    urgent: d <= 1,
  };
}

/** Card opacity: never fully invisible, so it can still be read and rescued. */
export function fadeOpacity(fraction: number) {
  return 0.45 + 0.55 * fraction;
}

export type OutcomeKind = "done" | "planned" | "distilled";

/**
 * The saves behind a Mirror count: decided this month with that outcome, or
 * on one day ("YYYY-MM-DD") when a calendar day was tapped.
 */
export function fetchOutcomes(kind: OutcomeKind, timezone: string, day?: string) {
  const dayParam = day ? `&day=${day}` : "";
  return api<{ items: Save[] }>(
    `/outcomes?kind=${kind}&tz=${encodeURIComponent(timezone)}${dayParam}`,
  );
}
