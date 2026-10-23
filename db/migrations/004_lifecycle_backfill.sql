-- Runs after 003 commits: new enum values can't be used in the transaction
-- that adds them. Saves still waiting for the old Understand flow join the
-- inbox and get a fresh 7-day lifespan.

UPDATE saves
SET status = 'inbox',
    expires_at = COALESCE(expires_at, now() + interval '7 days'),
    updated_at = now()
WHERE deleted_at IS NULL
  AND status IN ('created', 'preview_ready', 'understand_pending');
