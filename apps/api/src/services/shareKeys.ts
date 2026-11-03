import { createHash, randomBytes } from "node:crypto";
import { query } from "../db.js";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** A new device share key. The plain key is returned once and never stored. */
export async function createShareKey(userId: string): Promise<string> {
  const key = `ask_${randomBytes(32).toString("base64url")}`;
  await query(`INSERT INTO share_keys (user_id, key_hash) VALUES ($1, $2)`, [
    userId,
    hashKey(key),
  ]);
  return key;
}

/** The user a live share key belongs to, or null if it's unknown or revoked. */
export async function userIdForShareKey(key: string): Promise<string | null> {
  const { rows } = await query<{ user_id: string }>(
    `UPDATE share_keys SET last_used_at = now()
     WHERE key_hash = $1 AND revoked_at IS NULL
     RETURNING user_id`,
    [hashKey(key)],
  );
  return rows[0]?.user_id ?? null;
}

export async function revokeShareKey(userId: string, key: string): Promise<void> {
  await query(
    `UPDATE share_keys SET revoked_at = now()
     WHERE key_hash = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [hashKey(key), userId],
  );
}
