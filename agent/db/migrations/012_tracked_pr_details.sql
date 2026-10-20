-- PR details shown in the inbox and PR bar. All nullable: rows tracked
-- before this migration are filled in by the startup backfill or the next
-- webhook. A NULL head_ref marks a row the backfill hasn't reached.
ALTER TABLE tracked_prs
  ADD COLUMN IF NOT EXISTS author_avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS head_ref TEXT,
  ADD COLUMN IF NOT EXISTS base_ref TEXT,
  ADD COLUMN IF NOT EXISTS additions INTEGER,
  ADD COLUMN IF NOT EXISTS deletions INTEGER,
  ADD COLUMN IF NOT EXISTS changed_files INTEGER,
  ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
