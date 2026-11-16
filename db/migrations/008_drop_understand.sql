-- Remove the retired "Understand" Q&A flow and the never-built map/sync features.
-- Nothing in the API or app reads or writes these any more.
-- NOTE: destructive. Existing Q&A answers and skip history are deleted for good.

DROP TABLE IF EXISTS skip_events;
DROP TABLE IF EXISTS understand_sessions;
DROP TABLE IF EXISTS map_pins;
DROP TABLE IF EXISTS sync_revisions;

DROP TYPE IF EXISTS understand_status;
DROP TYPE IF EXISTS map_pin_source;

-- user_settings skip limits belonged to the Q&A skip rule.
ALTER TABLE user_settings
  DROP COLUMN IF EXISTS max_skips,
  DROP COLUMN IF EXISTS skip_window_days;
