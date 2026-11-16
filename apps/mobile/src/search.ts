import { api } from "./api";

export type SearchResult = {
  save_id: string;
  title: string;
  platform: string;
  folder_path: string;
  match_snippet: string;
  match_field: "understand" | "note" | "folder" | "title";
  has_reminder: boolean;
  content_kind: string | null;
};

/** Finds saves by the words you'd remember them by. */
export async function searchSaves(term: string): Promise<SearchResult[]> {
  const res = await api<{ items: SearchResult[] }>(`/search?q=${encodeURIComponent(term)}`);
  return res.items;
}
