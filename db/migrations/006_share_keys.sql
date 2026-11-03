-- Device share keys: the phone's invisible share receiver saves in the
-- background (even hours later, after coming back online) without touching
-- the sign-in session. A key can only create saves. Only its SHA-256 hash is
-- stored; the app revokes it on sign-out.

CREATE TABLE IF NOT EXISTS share_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash      text UNIQUE NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

CREATE INDEX IF NOT EXISTS share_keys_user_idx ON share_keys (user_id)
  WHERE revoked_at IS NULL;
