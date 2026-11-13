-- Categories, event dates and places for saves.
--
-- `category` is a fixed key (place, recipe, watch, ...) that drives expiry
-- and the sorting-time estimate. The AI suggests it; the user confirms or
-- changes it while sorting (category_source = 'user'). Users can rename a
-- category for themselves; the label lives in category_labels, so renaming
-- never changes the rules.

ALTER TABLE saves
  ADD COLUMN IF NOT EXISTS category        text,
  ADD COLUMN IF NOT EXISTS category_source text,  -- 'ai' | 'user'
  ADD COLUMN IF NOT EXISTS event_at        timestamptz,  -- event posts: when it happens
  ADD COLUMN IF NOT EXISTS place_name      text,  -- place posts: "Shibuya, Tokyo"
  ADD COLUMN IF NOT EXISTS place_country   text;  -- ISO 3166-1 alpha-2, e.g. 'JP'

CREATE INDEX IF NOT EXISTS saves_user_country_idx ON saves (user_id, place_country)
  WHERE deleted_at IS NULL AND place_country IS NOT NULL;

CREATE TABLE IF NOT EXISTS category_labels (
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category    text NOT NULL,
  label       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category)
);

-- How long each sorting decision took, for the "about N min" estimate.
-- Kept apart from saves because let-go deletes the save itself.
CREATE TABLE IF NOT EXISTS decision_times (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category    text NOT NULL,
  ms          int NOT NULL CHECK (ms > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS decision_times_user_cat_idx
  ON decision_times (user_id, category, created_at DESC);
CREATE INDEX IF NOT EXISTS decision_times_cat_idx
  ON decision_times (category, created_at DESC);

-- The daily nudge now says what expires *today*, so it goes out in the morning.
ALTER TABLE user_settings ALTER COLUMN digest_hour SET DEFAULT 9;
UPDATE user_settings SET digest_hour = 9 WHERE digest_hour = 19;
