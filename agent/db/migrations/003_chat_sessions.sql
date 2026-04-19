CREATE TABLE IF NOT EXISTS chat_sessions (
  id              SERIAL PRIMARY KEY,
  session_id      TEXT NOT NULL UNIQUE,
  owner           TEXT NOT NULL,
  repo            TEXT NOT NULL,
  pr_number       INTEGER NOT NULL,
  user_id         INTEGER NOT NULL,
  user_login      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_sessions_pr ON chat_sessions (owner, repo, pr_number);
CREATE INDEX idx_chat_sessions_user ON chat_sessions (owner, repo, pr_number, user_id);
