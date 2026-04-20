CREATE TABLE IF NOT EXISTS review_rules (
  id SERIAL PRIMARY KEY,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  rule_number INTEGER NOT NULL,
  rule TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_rules_repo ON review_rules (owner, repo);
CREATE UNIQUE INDEX IF NOT EXISTS idx_review_rules_number ON review_rules (owner, repo, rule_number);
