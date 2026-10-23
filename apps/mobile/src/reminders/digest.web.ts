import type { Save } from "../types";

/** The web app has no scheduled local notifications; the digest is native-only for now. */
export async function scheduleDailyDigest(
  _inbox: Pick<Save, "expires_at">[],
  _digestHour: number,
): Promise<void> {}

export function isDigestNotification(_data: unknown): boolean {
  return false;
}
