import { apiFetch, jsonBody } from './client';

const base = (owner: string, repo: string, pr: number) => `/api/chat/${owner}/${repo}/${pr}`;

export interface ChatSessionResponse {
  /** Stored messages, in the agent session's own shape */
  messages: unknown[];
  /** A reply still being written, to rejoin after a reload */
  activeRun: { id: string; prompt: string } | null;
}

export function fetchChatSession(owner: string, repo: string, pr: number) {
  return apiFetch<ChatSessionResponse>(`${base(owner, repo, pr)}/session`);
}

/** Starts a reply; follow its events at chatRunEventsUrl */
export function sendChatMessage(owner: string, repo: string, pr: number, message: string) {
  return apiFetch<{ runId: string }>(`${base(owner, repo, pr)}/message`, jsonBody('POST', { message }));
}

export function resetChatSession(owner: string, repo: string, pr: number) {
  return apiFetch<{ ok: boolean }>(`${base(owner, repo, pr)}/session`, { method: 'DELETE' });
}

/** The SSE stream for a reply; EventSource resumes it with Last-Event-ID */
export function chatRunEventsUrl(owner: string, repo: string, pr: number, runId: string): string {
  return `${base(owner, repo, pr)}/runs/${runId}/events?after=0`;
}
