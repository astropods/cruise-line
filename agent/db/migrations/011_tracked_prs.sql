-- PRs Cruise Line has seen via webhook (or reviewed), whether or not a
-- walkthrough was ever generated. Feeds the PR list.
CREATE TABLE IF NOT EXISTS tracked_prs (
  owner      TEXT NOT NULL,
  repo       TEXT NOT NULL,
  pr_number  INTEGER NOT NULL,
  title      TEXT NOT NULL,
  author     TEXT NOT NULL,
  head_sha   TEXT NOT NULL,
  state      TEXT NOT NULL DEFAULT 'open', -- open | closed | merged
  opened_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner, repo, pr_number)
);
