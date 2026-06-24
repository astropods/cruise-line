-- Switch from a single-owner model (app_config.owner.*) to a role per user.
-- Multiple users can hold the 'owner' role.
ALTER TABLE users
  ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'owner'));

-- Carry the existing single owner over: ensure the user named by
-- app_config.owner.user_id exists in users with role='owner'. Auto-seeded
-- owners may never have completed an OAuth login, so we may need to insert
-- the row from scratch using whatever login/avatar were captured at seed time.
DO $$
DECLARE
  legacy_user_id INTEGER;
  legacy_login   TEXT;
  legacy_avatar  TEXT;
BEGIN
  SELECT value::INTEGER INTO legacy_user_id FROM app_config WHERE key = 'owner.user_id';

  IF legacy_user_id IS NOT NULL THEN
    SELECT value INTO legacy_login FROM app_config WHERE key = 'owner.login';
    SELECT value INTO legacy_avatar FROM app_config WHERE key = 'owner.avatar_url';

    INSERT INTO users (user_id, login, avatar_url, role)
    VALUES (
      legacy_user_id,
      COALESCE(legacy_login, ''),
      COALESCE(legacy_avatar, ''),
      'owner'
    )
    ON CONFLICT (user_id) DO UPDATE SET role = 'owner';
  END IF;
END $$;

-- Drop the legacy single-owner keys. users.role is the only source of truth.
DELETE FROM app_config WHERE key LIKE 'owner.%';
