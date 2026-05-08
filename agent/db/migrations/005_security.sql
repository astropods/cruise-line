-- Session revocation table: stores JTI claims of revoked JWTs
CREATE TABLE IF NOT EXISTS revoked_sessions (
  jti         TEXT PRIMARY KEY,
  revoked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revoked_sessions_expires ON revoked_sessions (expires_at);
