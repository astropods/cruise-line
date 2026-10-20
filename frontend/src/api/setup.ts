import { apiFetch, jsonBody } from './client';

/** Starts GitHub App creation; post `manifest` to `manifestUrl` to continue on GitHub */
export async function startGitHubAppSetup(options: { githubUrl: string; appUrl?: string; org?: string }) {
  const res = await fetch('/api/setup/github', {
    credentials: 'include',
    ...jsonBody('POST', options),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ manifestUrl: string; manifest: string }>;
}

/** Removes the GitHub App connection so a different one can be set up */
export function disconnectGitHubApp() {
  return apiFetch<{ ok: boolean }>('/api/setup/github', { method: 'DELETE' });
}
