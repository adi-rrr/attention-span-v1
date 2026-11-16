import { API_URL, api } from "../api";
import {
  backgroundSharingAvailable,
  clearShareKey,
  getShareKey,
  setShareKey,
} from "../../modules/share-receiver";

/**
 * After sign-in, give the phone's invisible share receiver its own key, so
 * shares save in the background without opening the app. Android only.
 */
export async function ensureShareKey(): Promise<void> {
  if (!backgroundSharingAvailable) return;
  const existing = getShareKey();
  if (existing) {
    // The API address can change (a new build, or the dev Mac's IP), so
    // refresh it every launch or background shares go to a dead address.
    setShareKey(existing, API_URL);
    return;
  }
  const { key } = await api<{ key: string }>("/share-keys", { method: "POST" });
  setShareKey(key, API_URL);
}

/** On sign-out: revoke the key on the server (best effort) and forget it here. */
export async function releaseShareKey(): Promise<void> {
  const key = getShareKey();
  clearShareKey();
  if (!key) return;
  await api("/share-keys/revoke", {
    method: "POST",
    body: JSON.stringify({ key }),
  }).catch(() => {
    /* Offline or already signed out: the key is gone from this phone anyway. */
  });
}

/** The session ended on its own: drop the key so the next account gets its own. */
export function forgetShareKey(): void {
  clearShareKey();
}
