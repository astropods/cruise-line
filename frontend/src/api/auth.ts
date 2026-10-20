import { apiFetch } from './client';

export type UserRole = 'user' | 'owner';

export interface UserInfo {
  userId: number;
  login: string;
  avatarUrl: string;
  role: UserRole;
  isOwner: boolean;
}

export interface SetupStatus {
  configured: boolean;
  appSlug: string | null;
  appUrl: string;
  githubUrl: string;
  installUrl: string | null;
  hasOwner: boolean;
}

export interface OwnerInfo {
  userId: number;
  login: string;
  avatarUrl: string;
}

export function fetchUser() {
  return apiFetch<UserInfo>('/api/auth/me');
}

/** The signed-in user, or null when signed out. Unlike fetchUser, never redirects. */
export async function fetchCurrentUser(): Promise<UserInfo | null> {
  const res = await fetch('/api/auth/me', { credentials: 'include' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<UserInfo>;
}

/** Public endpoint: no OAuth redirect on failure, unlike apiFetch */
export async function fetchSetupStatus(): Promise<SetupStatus> {
  const res = await fetch('/api/setup/status', { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<SetupStatus>;
}

export function claimOwnership() {
  return apiFetch<{ ok: boolean; owner: OwnerInfo }>('/api/setup/claim', {
    method: 'POST',
  });
}

export async function logout() {
  await apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}
