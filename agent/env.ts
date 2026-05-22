import type { SessionPayload } from './github/oauth.js';

export type AppEnv = {
  Variables: {
    session: SessionPayload;
  };
};
