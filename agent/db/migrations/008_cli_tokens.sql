-- Short-lived authorization codes issued during the CLI OAuth flow.
-- Consumed exactly once by POST /api/cli/token in exchange for a bearer token.
-- code_hash is SHA-256 of the code; the plaintext is only returned to the browser
-- during the redirect and never stored server-side.
CREATE TABLE IF NOT EXISTS cli_auth_codes (
  code_hash       TEXT PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  code_challenge  TEXT NOT NULL,
  redirect_uri    TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cli_auth_codes_expires ON cli_auth_codes (expires_at);

-- Long-lived bearer tokens issued to CLIs. token_hash is SHA-256 of the token;
-- the plaintext is returned exactly once at issue time.
CREATE TABLE IF NOT EXISTS cli_tokens (
  id            TEXT PRIMARY KEY,
  token_hash    TEXT NOT NULL UNIQUE,
  token_prefix  TEXT NOT NULL,
  user_id       INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  label         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cli_tokens_user ON cli_tokens (user_id, created_at DESC);
