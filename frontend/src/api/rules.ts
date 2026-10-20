import { apiFetch, jsonBody } from './client';

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
  return apiFetch<{ rule: ReviewRule }>(`/api/rules/${owner}/${repo}`, jsonBody('POST', { rule }));
}

export function deleteRuleApi(owner: string, repo: string, ruleId: number) {
  return apiFetch<{ ok: boolean }>(`/api/rules/${owner}/${repo}/${ruleId}`, { method: 'DELETE' });
}

export function updateRuleApi(owner: string, repo: string, ruleId: number, rule: string) {
  return apiFetch<{ rule: ReviewRule }>(
    `/api/rules/${owner}/${repo}/${ruleId}`,
    jsonBody('PATCH', { rule }),
  );
}
