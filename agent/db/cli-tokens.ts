import { sql } from './client.js';

// ---------------------------------------------------------------------------
// Format + crypto helpers
// ---------------------------------------------------------------------------

const TOKEN_PREFIX = 'cl_live_';
const TOKEN_ENTROPY_BYTES = 32;
const CODE_ENTROPY_BYTES = 32;

function randomBase64Url(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  // base64url: base64 with URL-safe alphabet and no padding.
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// Authorization codes (single-use, short-lived)
// ---------------------------------------------------------------------------

export interface CreateAuthCodeInput {
  userId: number;
  codeChallenge: string;
  redirectUri: string;
  ttlSeconds: number;
}

/** Mint a new authorization code and store its hash. Returns the plaintext. */
export async function createAuthCode(input: CreateAuthCodeInput): Promise<string> {
  const code = randomBase64Url(CODE_ENTROPY_BYTES);
  const hash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000);

  await sql`
    INSERT INTO cli_auth_codes (code_hash, user_id, code_challenge, redirect_uri, expires_at)
    VALUES (${hash}, ${input.userId}, ${input.codeChallenge}, ${input.redirectUri}, ${expiresAt})
  `;

  return code;
}

export interface ConsumedAuthCode {
  userId: number;
  codeChallenge: string;
  redirectUri: string;
}

/**
 * Look up an authorization code by its plaintext, verify it hasn't been used
 * or expired, and mark it used. Single UPDATE with a guard so concurrent
 * exchange attempts resolve to exactly one success.
 *
 * Returns null if the code is unknown, already used, or expired.
 */
export async function consumeAuthCode(code: string): Promise<ConsumedAuthCode | null> {
  const hash = await sha256Hex(code);

  const [row] = await sql<{
    user_id: number;
    code_challenge: string;
    redirect_uri: string;
  }[]>`
    UPDATE cli_auth_codes
    SET used_at = NOW()
    WHERE code_hash = ${hash}
      AND used_at IS NULL
      AND expires_at > NOW()
    RETURNING user_id, code_challenge, redirect_uri
  `;

  if (!row) return null;
  return {
    userId: row.user_id,
    codeChallenge: row.code_challenge,
    redirectUri: row.redirect_uri,
  };
}

/** Best-effort cleanup for old codes. Safe to run periodically. */
export async function cleanupExpiredAuthCodes(): Promise<void> {
  await sql`DELETE FROM cli_auth_codes WHERE expires_at < NOW() - INTERVAL '1 hour'`;
}

// ---------------------------------------------------------------------------
// CLI tokens (long-lived bearer tokens)
// ---------------------------------------------------------------------------

export interface IssuedCliToken {
  id: string;
  token: string;
  prefix: string;
}

export interface CliTokenRecord {
  id: string;
  tokenPrefix: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface CliTokenRow {
  id: string;
  token_prefix: string;
  label: string | null;
  created_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
}

function rowToRecord(row: CliTokenRow): CliTokenRecord {
  return {
    id: row.id,
    tokenPrefix: row.token_prefix,
    label: row.label,
    createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
    revokedAt: row.revoked_at?.toISOString() ?? null,
  };
}

/**
 * Issue a new CLI token for a user. Returns the plaintext token exactly once;
 * only the hash is stored server-side.
 */
export async function issueCliToken(input: {
  userId: number;
  label?: string;
}): Promise<IssuedCliToken> {
  const id = crypto.randomUUID();
  const random = randomBase64Url(TOKEN_ENTROPY_BYTES);
  const token = `${TOKEN_PREFIX}${random}`;
  const hash = await sha256Hex(token);
  const prefix = token.slice(0, 12);

  await sql`
    INSERT INTO cli_tokens (id, token_hash, token_prefix, user_id, label)
    VALUES (${id}, ${hash}, ${prefix}, ${input.userId}, ${input.label ?? null})
  `;

  return { id, token, prefix };
}

export interface ResolvedCliToken {
  id: string;
  userId: number;
}

/**
 * Look up a token by its plaintext value. Returns null if the token is
 * unknown or revoked. Does not touch last_used_at; call touchCliTokenUsed
 * asynchronously after a successful auth so the DB write never adds latency.
 */
export async function resolveCliToken(token: string): Promise<ResolvedCliToken | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;

  const hash = await sha256Hex(token);
  const [row] = await sql<{ id: string; user_id: number }[]>`
    SELECT id, user_id
    FROM cli_tokens
    WHERE token_hash = ${hash} AND revoked_at IS NULL
  `;
  return row ? { id: row.id, userId: row.user_id } : null;
}

export async function touchCliTokenUsed(id: string): Promise<void> {
  await sql`UPDATE cli_tokens SET last_used_at = NOW() WHERE id = ${id}`;
}

export async function listCliTokensForUser(userId: number): Promise<CliTokenRecord[]> {
  const rows = await sql<CliTokenRow[]>`
    SELECT id, token_prefix, label, created_at, last_used_at, revoked_at
    FROM cli_tokens
    WHERE user_id = ${userId} AND revoked_at IS NULL
    ORDER BY created_at DESC
  `;
  return rows.map(rowToRecord);
}

/** Revoke a token owned by the given user. Returns true if a row was updated. */
export async function revokeCliToken(id: string, userId: number): Promise<boolean> {
  const [row] = await sql<{ id: string }[]>`
    UPDATE cli_tokens
    SET revoked_at = NOW()
    WHERE id = ${id} AND user_id = ${userId} AND revoked_at IS NULL
    RETURNING id
  `;
  return !!row;
}

/** Revoke the token identified by its id, regardless of owner. Used by /api/cli/token/revoke. */
export async function revokeCliTokenById(id: string): Promise<void> {
  await sql`
    UPDATE cli_tokens SET revoked_at = NOW()
    WHERE id = ${id} AND revoked_at IS NULL
  `;
}
