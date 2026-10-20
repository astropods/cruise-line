import { apiFetch, jsonBody } from './client';
import type { UserRole } from './auth';

// --- Connected repos ---

export interface ConnectedRepo {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
}

export interface ConnectedInstallation {
  id: number;
  account: {
    login: string;
    type: string;
    avatarUrl: string;
    htmlUrl: string;
  };
  repositories: ConnectedRepo[];
}

export interface RepoSettings {
  owner: string;
  repo: string;
  scopePaths: string[];
  updatedAt: string | null;
}

export function fetchConnectedRepos() {
  return apiFetch<{ installations: ConnectedInstallation[] }>('/api/settings/repos');
}

export function fetchRepoSettings(owner: string, repo: string) {
  return apiFetch<{ settings: RepoSettings }>(`/api/settings/repos/${owner}/${repo}`);
}

export function updateRepoScopePaths(owner: string, repo: string, scopePaths: string[]) {
  return apiFetch<{ settings: RepoSettings }>(
    `/api/settings/repos/${owner}/${repo}/scope`,
    jsonBody('PATCH', { scopePaths }),
  );
}

// --- Users ---

export interface KnownUser {
  userId: number;
  login: string;
  avatarUrl: string;
  firstSeenAt: string;
  lastSeenAt: string;
  loginCount: number;
  role: UserRole;
}

export function fetchKnownUsers() {
  return apiFetch<{ users: KnownUser[] }>('/api/settings/users');
}

export function setUserRole(userId: number, role: UserRole) {
  return apiFetch<{ ok: boolean; user: KnownUser }>(
    `/api/settings/users/${userId}/role`,
    jsonBody('PATCH', { role }),
  );
}

// --- Models ---

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type ModelUse = 'review' | 'chat';

export interface ModelSetting {
  /** null = the deploy default */
  model: string | null;
  /** null = the deploy default; 'auto' = send none and let the model decide */
  effort: EffortLevel | 'auto' | null;
}

export interface AvailableModel {
  id: string;
  displayName: string;
  createdAt: string;
  /** [] when the model takes no effort setting, null when unknown */
  effortLevels: EffortLevel[] | null;
}

export interface ModelSettingsResponse {
  settings: Record<ModelUse, ModelSetting>;
  defaults: { model: string; effort: EffortLevel };
  /** null when the Anthropic API couldn't be reached */
  models: AvailableModel[] | null;
  modelsError: string | null;
}

export function fetchModelSettings() {
  return apiFetch<ModelSettingsResponse>('/api/settings/models');
}

export function updateModelSetting(use: ModelUse, setting: ModelSetting) {
  return apiFetch<{ settings: Record<ModelUse, ModelSetting> }>(
    `/api/settings/models/${use}`,
    jsonBody('PUT', setting),
  );
}
