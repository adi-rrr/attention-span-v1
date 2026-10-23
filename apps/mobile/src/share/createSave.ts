import { api } from "../api";
import type { SavePlatform } from "./platform";
import type { Save } from "../types";

export type { Save };

export type CreateSaveInput = {
  platform: SavePlatform;
  source_url?: string | null;
  title?: string;
};

const SAVE_TIMEOUT_MS = 15000;

/** Zero-tap save. Aborts after 15 s so the share never hangs. */
export async function createSave(input: CreateSaveInput): Promise<Save> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SAVE_TIMEOUT_MS);
  try {
    return await api<Save>("/saves", {
      method: "POST",
      body: JSON.stringify(input),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export function lifespanDaysOf(save: Save): number | null {
  if (!save.expires_at || !save.created_at) return null;
  const ms =
    new Date(save.expires_at).getTime() - new Date(save.created_at).getTime();
  return Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)));
}
