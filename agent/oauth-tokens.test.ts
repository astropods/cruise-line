/**
 * Every token is signed with the session secret, so each kind must only be
 * accepted where it belongs: an OAuth `state` from /api/auth/github must not
 * work as a session cookie.
 */
import { beforeAll, describe, expect, it } from 'bun:test';
import { SignJWT } from 'jose';
import { config } from './config.js';
import { createSessionToken, signStateToken, verifySessionToken, verifyStateToken } from './github/tokens.js';

const SECRET = 'test-session-secret-for-oauth-tokens';

beforeAll(() => {
  config.session.secret = SECRET;
});

const session = { githubToken: 'gho_x', userId: 42, login: 'octo', avatarUrl: '' } as const;

describe('session and state tokens', () => {
  it('accepts a session token as a session', async () => {
    const token = await createSessionToken(session as any);
    expect((await verifySessionToken(token))?.userId).toBe(42);
  });

  it('rejects an OAuth state as a session', async () => {
    const state = await signStateToken('oauth-state', { returnTo: '/' });
    expect(await verifySessionToken(state)).toBeNull();
  });

  it('rejects a session as a state', async () => {
    const token = await createSessionToken(session as any);
    expect(await verifyStateToken('oauth-state', token)).toBeNull();
  });

  it('rejects a state meant for another flow', async () => {
    const state = await signStateToken('manifest-state');
    expect(await verifyStateToken('oauth-state', state)).toBeNull();
    expect(await verifyStateToken('manifest-state', state)).not.toBeNull();
  });

  it('still accepts sessions issued before audiences, but only with a user id', async () => {
    const key = new TextEncoder().encode(SECRET);
    const legacy = await new SignJWT({ ...session, jti: 'j' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(key);
    expect((await verifySessionToken(legacy))?.userId).toBe(42);

    const legacyState = await new SignJWT({ returnTo: '/' }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(key);
    expect(await verifySessionToken(legacyState)).toBeNull();
  });
});
