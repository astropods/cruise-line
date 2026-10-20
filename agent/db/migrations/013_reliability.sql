-- GitHub's updated_at for the PR as of the last write, so a redelivered or
-- late webhook can't overwrite newer state (e.g. reopen a merged PR).
ALTER TABLE tracked_prs ADD COLUMN IF NOT EXISTS pr_updated_at TIMESTAMPTZ;

-- When the backfill last tried a row it couldn't fill (deleted repo, app
-- uninstalled), so dead rows go to the back of the queue.
ALTER TABLE tracked_prs ADD COLUMN IF NOT EXISTS details_checked_at TIMESTAMPTZ;

-- The inbox needs a few numbers per review, not the whole review (which
-- holds file contents). Written alongside data from now on.
ALTER TABLE walkthroughs ADD COLUMN IF NOT EXISTS summary JSONB;

UPDATE walkthroughs w
SET summary = jsonb_build_object(
  'verdict', w.data->>'verdict',
  'title', w.data->'pr'->>'title',
  'author', w.data->'pr'->>'author',
  'severityCounts', COALESCE((
    SELECT jsonb_object_agg(sev, n) FROM (
      SELECT f->>'severity' AS sev, COUNT(*) AS n
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(w.data->'findings') = 'array' THEN w.data->'findings' ELSE '[]'::jsonb END
      ) f
      GROUP BY 1
    ) s
  ), '{}'::jsonb)
)
WHERE w.data IS NOT NULL AND w.summary IS NULL;

-- Latest-review lookups sort by created_at within a PR
CREATE INDEX IF NOT EXISTS idx_walkthroughs_latest ON walkthroughs (owner, repo, pr_number, created_at DESC);

-- One chat session per user per PR. Keep the most recently used one where
-- concurrent first messages created two.
DELETE FROM chat_sessions c
USING chat_sessions newer
WHERE c.owner = newer.owner AND c.repo = newer.repo AND c.pr_number = newer.pr_number
  AND c.user_id = newer.user_id
  AND (c.last_message_at, c.id) < (newer.last_message_at, newer.id);

DROP INDEX IF EXISTS idx_chat_sessions_user;
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions (owner, repo, pr_number, user_id);
