import { api, ApiError } from "../api";
import type { SavePlatform } from "./platform";
import type { Save } from "../types";

export type { Save };

export type DuplicateConflict = {
  existing_save_id: string;
  saved_at: string;
  message: string;
};

export type CreateSaveInput = {
  platform: SavePlatform;
  source_url?: string | null;
  title?: string;
  replace_existing?: boolean;
};

export async function createSave(input: CreateSaveInput): Promise<Save> {
  return api<Save>("/saves", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function isDuplicateConflict(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 409;
}

export function getDuplicateConflict(err: ApiError): DuplicateConflict {
  return err.body as DuplicateConflict;
}
