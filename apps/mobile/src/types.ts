export type Folder = {
  id: string;
  name: string;
  path: string;
  depth: number;
  parent_id: string | null;
  sort_order?: number;
  save_count?: number;
};

export type Save = {
  id: string;
  title: string;
  /** One-line display title (AI-written, or a quick rule-based shortening). */
  short_title?: string | null;
  platform: string;
  status: string;
  source_url: string | null;
  user_note?: string | null;
  folder_id?: string | null;
  folder_path?: string;
  content_kind?: string | null;
  understand_snippet?: string | null;
  has_reminder?: boolean;
  reminder_fire_at?: string | null;
  expires_at?: string | null;
  ai_intent?: Intent | null;
  /** Fixed key that drives expiry; the user sees their own label for it. */
  category?: CategoryKey | null;
  /** 'ai' = suggested, 'user' = picked or confirmed while sorting. */
  category_source?: "ai" | "user" | null;
  event_at?: string | null;
  place_name?: string | null;
  place_country?: string | null;
  ai_reason?: string | null;
  plan_text?: string | null;
  plan_at?: string | null;
  takeaway?: string | null;
  decided_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type QaPair = {
  question: string;
  answer: string;
};

export type Reminder = {
  id: string;
  save_id: string;
  fire_at: string;
  status: string;
  delivery: string;
  created_from?: string;
  timezone?: string;
};

export type SaveDetail = Save & {
  qa_pairs: QaPair[];
  reminder?: Reminder | null;
};

export type Intent = "try" | "go" | "buy" | "learn" | "inspo" | "other";

export type CategoryKey =
  | "place"
  | "recipe"
  | "watch"
  | "read"
  | "learn"
  | "tool"
  | "buy"
  | "routine"
  | "quote"
  | "meme"
  | "event"
  | "other";

export type Category = { key: CategoryKey; label: string; default_label: string };

export type InboxSummary = {
  total: number;
  fading_24h: number;
  lifespan_days: number;
  digest_hour: number;
};

export type MirrorDay = { day: string; acted: boolean; faded: boolean };

export type Mirror = {
  timezone: string;
  /** "YYYY-MM-DD" in the user's timezone. */
  month_start: string;
  today: string;
  saved: number;
  acted: number;
  done: number;
  planned: number;
  distilled: number;
  let_go: number;
  faded: number;
  days: MirrorDay[];
  shelf_used: number;
  shelf_limit: number;
  inbox: InboxSummary;
};

export type KeepMode = "plan" | "distill";

export type KeepDraft = {
  mode: KeepMode;
  question: string;
  draft: string;
  suggested_at: string | null;
};

/** Kept and finished saves; the inbox has its own screen. */
export const LIBRARY_STATUSES = "planned,distilled,understand_done,done";
