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
  files: Record<string, FileContent>;
  sections: Section[];
}

export interface Section {
  title: string;
  body: string;
}

export interface UserInfo {
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
