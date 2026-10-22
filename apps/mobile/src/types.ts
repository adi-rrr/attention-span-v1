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

export const LIBRARY_STATUSES = "understand_done,done";
