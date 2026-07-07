CREATE TABLE IF NOT EXISTS repo_settings (
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  scope_paths TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner, repo)
);
