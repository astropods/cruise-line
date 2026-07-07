// Mirror of normalizeScopePath in agent/db/repo-settings.ts.
// Parity pinned in agent/repo-settings.test.ts — update both together.
export function normalizeScopePathClient(raw: string): string {
  let s = raw.trim();
  if (!s) return '';
  s = s.replace(/^\.\//, '');
  s = s.replace(/^\/+/, '');
  s = s.replace(/\/{2,}/g, '/');
  s = s.replace(/\/+$/, '');
  return s;
}
