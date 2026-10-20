/** A non-2xx response. `status` lets callers tell client errors from outages. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
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

/** Fetch JSON from the API. A 401 sends the browser through GitHub OAuth. */
export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    ...options,
  });

  if (res.status === 401) {
    // Redirect to OAuth via the public app URL (needed for GitHub callback to work)
    const appUrl = await getAppUrl();
    const returnTo = encodeURIComponent(window.location.pathname);
    window.location.href = `${appUrl}/api/auth/github?return_to=${returnTo}`;
    throw new ApiError('Not authenticated', 401);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError((body as { error?: string }).error ?? `HTTP ${res.status}`, res.status);
  }

  return res.json() as Promise<T>;
}

/** RequestInit for a JSON body */
export function jsonBody(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
