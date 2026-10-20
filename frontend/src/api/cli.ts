import { apiFetch, jsonBody } from './client';

export interface CliTokenRecord {
  id: string;
  tokenPrefix: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string;
}

export function fetchCliTokens() {
  return apiFetch<{ tokens: CliTokenRecord[] }>('/api/cli/tokens');
}

export function revokeCliTokenApi(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/cli/tokens/${id}`, { method: 'DELETE' });
}

// --- CLI sign-in consent (/cli/authorize) ---

/** The OAuth params the CLI opened the consent page with */
export interface CliAuthorizeParams {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
}

export interface CliAuthorizeInfo {
  user: { userId: number; login: string; avatarUrl: string };
  redirectUri: string;
  clientId: string;
}

/** Validates the CLI's params; signed-out viewers are sent through GitHub sign-in and back */
export function fetchCliAuthorizeInfo(params: CliAuthorizeParams) {
  return apiFetch<CliAuthorizeInfo>(`/api/cli/authorize/params?${new URLSearchParams({ ...params })}`);
}

/** Approves the CLI's sign-in; follow `redirectUrl` to hand the code back to it */
export function approveCliAuthorization(params: CliAuthorizeParams) {
  return apiFetch<{ redirectUrl: string }>('/api/cli/authorize/approve', jsonBody('POST', {
    responseType: params.response_type,
    clientId: params.client_id,
    redirectUri: params.redirect_uri,
    state: params.state,
    codeChallenge: params.code_challenge,
    codeChallengeMethod: params.code_challenge_method,
  }));
}
