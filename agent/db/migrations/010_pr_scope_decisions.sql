CREATE TABLE IF NOT EXISTS pr_scope_decisions (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  in_scope BOOLEAN NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner, repo, pr_number)
);
