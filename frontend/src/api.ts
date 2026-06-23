export interface WalkthroughResponse {
  walkthrough: {
    id: number;
    status: 'pending' | 'running' | 'complete' | 'failed';
    headSha: string;
    error: string | null;
    data: Walkthrough | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  currentHeadSha: string | null;
  githubUrl: string;
}

export interface FileContent {
  after?: string;
  language: string;
  /** Raw unified diff patch from git diff */
  patch?: string;
}

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type FindingCategory = 'correctness' | 'security' | 'maintainability' | 'performance' | 'style';
export type Verdict = 'approve' | 'request_changes' | 'needs_discussion';

export interface CommentAnchor {
  /** Path of a file that is part of the PR diff */
  file: string;
  /** 1-indexed start line in the new (head) version of the file */
  lineStart: number;
  /** 1-indexed end line in the new (head) version of the file */
  lineEnd: number;
}

export interface Finding {
  title: string;
  severity: Severity;
  category: FindingCategory;
  body: string;
  files: string[];
  /** A prompt the developer can paste into Claude Code to fix this issue. Required for non-info findings. */
  fixPrompt?: string;
  /** Where to anchor the "Post as comment" action. Required for non-info findings. */
  commentAnchor?: CommentAnchor;
}

export interface ArchitectureDiagram {
  title: string;
  kind: 'flowchart' | 'sequence';
  description: string;
  mermaid: string;
}

export interface ArchitectureAnalysis {
  overview: string;
  steps: string[];
  diagrams: ArchitectureDiagram[];
}

export interface Walkthrough {
  pr: {
    repo: string;
    number: number;
    title: string;
    author: string;
    baseSha: string;
    headSha: string;
  };
  summary: string;
  verdict: Verdict;
  verdictRationale: string;
  files: Record<string, FileContent>;
  findings: Finding[];
  architecture?: ArchitectureAnalysis;
}

/** @deprecated Use Finding instead */
export interface Section {
  title: string;
  body: string;
}

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

export interface ProgressEntry {
  timestamp: number;
  type: 'status' | 'tool' | 'message';
  text: string;
}

export interface StatusResponse {
  walkthroughId?: number;
  status: string;
  headSha?: string;
  error?: string;
  progress?: ProgressEntry[];
}

let cachedAppUrl: string | null = null;

async function getAppUrl(): Promise<string> {
  if (cachedAppUrl) return cachedAppUrl;
  try {
    const res = await fetch('/api/setup/status');
    const data = await res.json() as { appUrl?: string };
    cachedAppUrl = data.appUrl ?? '';
  } catch {
    cachedAppUrl = '';
  }
  return cachedAppUrl;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    ...options,
  });

  if (res.status === 401) {
    // Redirect to OAuth via the public app URL (needed for GitHub callback to work)
    const appUrl = await getAppUrl();
    const returnTo = encodeURIComponent(window.location.pathname);
    window.location.href = `${appUrl}/api/auth/github?return_to=${returnTo}`;
    throw new Error('Not authenticated');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export function fetchWalkthrough(owner: string, repo: string, pr: number) {
  return apiFetch<WalkthroughResponse>(`/api/walkthroughs/${owner}/${repo}/${pr}`);
}

export function fetchFileContent(owner: string, repo: string, pr: number, path: string) {
  return apiFetch<FileContent>(`/api/files/${owner}/${repo}/${pr}/content?path=${encodeURIComponent(path)}`);
}

export function generateWalkthrough(owner: string, repo: string, pr: number, force = false) {
  const query = force ? '?force=true' : '';
  return apiFetch<{ walkthroughId: number; status: string }>(
    `/api/walkthroughs/${owner}/${repo}/${pr}/generate${query}`,
    { method: 'POST' },
  );
}

export function fetchStatus(owner: string, repo: string, pr: number) {
  return apiFetch<StatusResponse>(`/api/walkthroughs/${owner}/${repo}/${pr}/status`);
}

export function fetchUser() {
  return apiFetch<UserInfo>('/api/auth/me');
}

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

// --- Settings: connected repos, users, ownership transfer ---

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

export interface KnownUser {
  userId: number;
  login: string;
  avatarUrl: string;
  firstSeenAt: string;
  lastSeenAt: string;
  loginCount: number;
  role: UserRole;
}

export function fetchConnectedRepos() {
  return apiFetch<{ installations: ConnectedInstallation[] }>('/api/settings/repos');
}

export function fetchKnownUsers() {
  return apiFetch<{ users: KnownUser[] }>('/api/settings/users');
}

export function setUserRole(userId: number, role: UserRole) {
  return apiFetch<{ ok: boolean; user: KnownUser }>(
    `/api/settings/users/${userId}/role`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    },
  );
}

export async function logout() {
  await apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
}

// --- Review Rules ---

export interface ReviewRule {
  id: number;
  ruleNumber: number;
  rule: string;
  createdAt: string;
}

export function fetchRules(owner: string, repo: string) {
  return apiFetch<{ rules: ReviewRule[] }>(`/api/rules/${owner}/${repo}`);
}

export function addRuleApi(owner: string, repo: string, rule: string) {
  return apiFetch<{ rule: ReviewRule }>(`/api/rules/${owner}/${repo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rule }),
  });
}

export function deleteRuleApi(owner: string, repo: string, ruleId: number) {
  return apiFetch<{ ok: boolean }>(`/api/rules/${owner}/${repo}/${ruleId}`, {
    method: 'DELETE',
  });
}

export function updateRuleApi(owner: string, repo: string, ruleId: number, rule: string) {
  return apiFetch<{ rule: ReviewRule }>(`/api/rules/${owner}/${repo}/${ruleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rule }),
  });
}

// --- PR Comments ---

export interface PRComment {
  id: number;
  body: string;
  path: string;
  line: number;
  side: 'LEFT' | 'RIGHT';
  user: { login: string; avatarUrl: string };
  createdAt: string;
  inReplyToId: number | null;
  htmlUrl: string;
}

export function fetchComments(owner: string, repo: string, pr: number) {
  return apiFetch<{ comments: PRComment[] }>(`/api/comments/${owner}/${repo}/${pr}`);
}

export function postComment(
  owner: string,
  repo: string,
  pr: number,
  comment: { body: string; path: string; line: number; side: 'LEFT' | 'RIGHT'; commitId: string },
) {
  return apiFetch<{ comment: PRComment }>(`/api/comments/${owner}/${repo}/${pr}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(comment),
  });
}

export function replyToComment(
  owner: string,
  repo: string,
  pr: number,
  commentId: number,
  body: string,
) {
  return apiFetch<{ comment: PRComment }>(`/api/comments/${owner}/${repo}/${pr}/${commentId}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
}
