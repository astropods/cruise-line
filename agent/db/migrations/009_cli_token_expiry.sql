-- Add expiration to CLI tokens. Prior migration issued tokens with no upper
-- bound; a leaked token that survived rotation would grant indefinite access.
-- New tokens get expires_at = created_at + 90 days at issue time. Existing
-- rows keep NULL, which resolveCliToken treats as "no expiry" so pre-release
-- tokens don't invalidate on migration.
ALTER TABLE cli_tokens
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cli_tokens_expires ON cli_tokens (expires_at)
  WHERE expires_at IS NOT NULL;
