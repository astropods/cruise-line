-- Users that have logged in via OAuth. Populated on each successful OAuth
-- callback. Used to render the user list on the settings page and to validate
-- ownership transfer targets (you can only transfer to someone who has
-- actually logged in at least once).
CREATE TABLE IF NOT EXISTS users (
  user_id        INTEGER PRIMARY KEY,            -- GitHub user ID
  login          TEXT NOT NULL,
  avatar_url     TEXT NOT NULL DEFAULT '',
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  login_count    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users (last_seen_at DESC);
