import type { SessionPayload } from './github/oauth.js';

export type AuthKind = 'cookie' | 'cli';

export type AppEnv = {
  Variables: {
    session: SessionPayload;
    authKind: AuthKind;
  };
};
