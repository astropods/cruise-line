import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { config } from '../config.js';

// Installation token cache
const tokenCache = new Map<number, { token: string; expiresAt: number }>();

function getAppAuth() {
  return createAppAuth({
    appId: config.github.appId,
    privateKey: config.github.privateKey.replace(/\\n/g, '\n'),
  });
}

export async function generateAppJwt(): Promise<string> {
  const auth = getAppAuth();
  const { token } = await auth({ type: 'app' });
  return token;
}

export async function getInstallationToken(installationId: number): Promise<string> {
  const cached = tokenCache.get(installationId);
  const now = Date.now();

  // Refresh if less than 10 minutes remaining
  if (cached && cached.expiresAt > now + 10 * 60 * 1000) {
    return cached.token;
  }

  const auth = getAppAuth();
  const { token, expiresAt } = await auth({
    type: 'installation',
    installationId,
  });

  tokenCache.set(installationId, {
    token,
    expiresAt: new Date(expiresAt).getTime(),
  });

  return token;
}

export function createInstallationOctokit(token: string): Octokit {
  return new Octokit({
    baseUrl: config.github.baseUrl,
    auth: token,
  });
}
