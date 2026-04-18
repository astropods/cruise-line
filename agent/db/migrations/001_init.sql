CREATE TABLE IF NOT EXISTS walkthroughs (
  id          SERIAL PRIMARY KEY,
  owner       TEXT NOT NULL,
  repo        TEXT NOT NULL,
  pr_number   INTEGER NOT NULL,
  head_sha    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  error       TEXT,
  data        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(owner, repo, pr_number, head_sha)
);

CREATE INDEX idx_walkthroughs_lookup ON walkthroughs (owner, repo, pr_number);
