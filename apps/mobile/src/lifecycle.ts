import { api } from "./api";
import type {
  InboxSummary,
  Intent,
  KeepDraft,
  KeepMode,
  Mirror,
  Save,
} from "./types";

export function fetchInbox() {
  return api<{ items: Save[]; summary: InboxSummary }>("/inbox");
}

export function markDone(saveId: string) {
  return api<{ id: string; status: string }>(`/saves/${saveId}/done`, {
    method: "POST",
  });
}

export function letGo(saveId: string) {
  return api<void>(`/saves/${saveId}/let-go`, { method: "POST" });
}

export function draftKeep(saveId: string, mode: KeepMode, timezone: string) {
  return api<KeepDraft>(`/saves/${saveId}/keep/draft`, {
    method: "POST",
    body: JSON.stringify({ mode, timezone }),
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
  },
) {
  return api<Save>(`/saves/${saveId}/keep`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function fetchJournal() {
  return api<{ items: Save[] }>("/journal");
}

export function fetchMirror() {
  return api<Mirror>("/mirror");
}

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  reddit: "Reddit",
  substack: "Substack",
  screenshot: "Screenshot",
};

/** "Instagram · Go there" — the small line above a save's title. */
export function saveMetaLine(save: Pick<Save, "platform" | "ai_intent">): string {
  const platform = PLATFORM_LABEL[save.platform] ?? save.platform;
  return save.ai_intent && save.ai_intent !== "other"
    ? `${platform} · ${INTENT_LABEL[save.ai_intent]}`
    : platform;
}

export const INTENT_LABEL: Record<Intent, string> = {
  try: "Try it",
  go: "Go there",
  buy: "Buy it",
  learn: "Learn it",
  inspo: "Inspo",
  other: "Saved",
};

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
