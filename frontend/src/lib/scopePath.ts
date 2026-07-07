/**
 * Client-side mirror of `normalizeScopePath` from agent/db/repo-settings.ts.
 *
 * MUST stay behaviorally identical to the server-side function — a pinned
 * test in `agent/repo-settings.test.ts` runs both against a shared table
 * of inputs, so any drift fails CI. Update both together.
 *
 * The mirror exists because the dirty-check for the scope editor needs to
 * compare the user's typed rows against the server's normalized stored
 * form. Without it, entries like `./agent` would read as dirty forever.
 */
export function normalizeScopePathClient(raw: string): string {
  let s = raw.trim();
  if (!s) return '';
  s = s.replace(/^\.\//, '');
  s = s.replace(/^\/+/, '');
  s = s.replace(/\/{2,}/g, '/');
  s = s.replace(/\/+$/, '');
  return s;
}
