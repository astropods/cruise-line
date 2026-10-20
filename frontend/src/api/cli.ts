import { apiFetch } from './client';

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
