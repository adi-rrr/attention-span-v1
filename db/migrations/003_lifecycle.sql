-- Save lifecycle: zero-tap saves land in the inbox with an expiry. Each one is
-- either acted on (done), kept as a plan or a distilled takeaway, let go, or
-- hard-deleted when it expires. Mirror stats come from save_events, which
-- records only the kind and platform, never the content.

ALTER TYPE save_status ADD VALUE IF NOT EXISTS 'inbox';
ALTER TYPE save_status ADD VALUE IF NOT EXISTS 'planned';
ALTER TYPE save_status ADD VALUE IF NOT EXISTS 'distilled';

ALTER TABLE saves
  ADD COLUMN IF NOT EXISTS expires_at  timestamptz,
  ADD COLUMN IF NOT EXISTS ai_intent   text,  -- try | go | buy | learn | inspo | other
  ADD COLUMN IF NOT EXISTS ai_reason   text,  -- AI's one-line guess at why it was saved
  ADD COLUMN IF NOT EXISTS plan_text   text,
  ADD COLUMN IF NOT EXISTS plan_at     timestamptz,
  ADD COLUMN IF NOT EXISTS takeaway    text,
  ADD COLUMN IF NOT EXISTS decided_at  timestamptz;

CREATE INDEX IF NOT EXISTS saves_user_expires_idx ON saves (user_id, expires_at)
  WHERE deleted_at IS NULL AND expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS save_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL
              CHECK (kind IN ('saved', 'done', 'planned', 'distilled', 'let_go', 'faded')),
  platform    platform_type,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS save_events_user_time_idx
  ON save_events (user_id, created_at DESC);

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS save_lifespan_days int NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS shelf_limit        int NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS digest_hour        int NOT NULL DEFAULT 19;  -- local hour 0–23
