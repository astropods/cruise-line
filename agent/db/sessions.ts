import { sql } from './client.js';

// ---------------------------------------------------------------------------
// Session revocation
// ---------------------------------------------------------------------------

/** Revoke a session by its JTI claim. The expiresAt should match the JWT exp. */
export async function revokeSession(jti: string, expiresAt: Date): Promise<void> {
  await sql`
    INSERT INTO revoked_sessions (jti, expires_at)
    VALUES (${jti}, ${expiresAt})
    ON CONFLICT (jti) DO NOTHING
  `;
}

/** Check whether a session JTI has been revoked. */
export async function isSessionRevoked(jti: string): Promise<boolean> {
  const [row] = await sql<{ jti: string }[]>`
    SELECT jti FROM revoked_sessions WHERE jti = ${jti}
  `;
  return !!row;
}

/** Remove expired revocation records (JWT has already expired, revocation is moot). */
export async function cleanupExpiredRevocations(): Promise<void> {
  await sql`DELETE FROM revoked_sessions WHERE expires_at < NOW()`;
}
