CREATE TABLE IF NOT EXISTS chat_archives (
  id              SERIAL PRIMARY KEY,
  owner           TEXT NOT NULL,
  repo            TEXT NOT NULL,
  pr_number       INTEGER NOT NULL,
  user_id         INTEGER NOT NULL,
  user_login      TEXT NOT NULL,
  messages        JSONB NOT NULL DEFAULT '[]',
  session_created_at TIMESTAMPTZ NOT NULL,
  archived_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_archives_pr ON chat_archives (owner, repo, pr_number);
CREATE INDEX idx_chat_archives_user ON chat_archives (owner, repo, pr_number, user_id);
