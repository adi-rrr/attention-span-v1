-- One-line display title for each save. `title` keeps the full original
-- (caption or video title) for search; `short_title` is what cards show.
-- title_source: 'quick' = rule-based shortening, 'ai' = model-written.

ALTER TABLE saves
  ADD COLUMN IF NOT EXISTS short_title  text,
  ADD COLUMN IF NOT EXISTS title_source text;
