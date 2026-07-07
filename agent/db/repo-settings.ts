import { sql } from './client.js';

export interface RepoSettings {
  owner: string;
  repo: string;
  scopePaths: string[];
  updatedAt: Date;
}

interface RepoSettingsRow {
  owner: string;
  repo: string;
  scope_paths: string[];
  updated_at: Date;
}

function toRepoSettings(row: RepoSettingsRow): RepoSettings {
  return {
    owner: row.owner,
    repo: row.repo,
    scopePaths: row.scope_paths,
    updatedAt: row.updated_at,
  };
}

/**
 * Normalize a raw scope-path entry:
 *   - trim whitespace
 *   - strip a leading "./" or "/"
 *   - collapse repeated slashes
 *   - strip any trailing "/" so a single stored form works for both
 *     directory-prefix and exact-file scopes
 *
 * Directory-vs-file semantics are handled at match time by
 * `anyFileMatchesScope`: an entry matches a file if the file equals the
 * entry OR the file starts with `entry + '/'`. That way `Makefile`
 * matches the top-level `Makefile` (but not `Makefile.old`), and
 * `agent` matches `agent/foo.ts` (but not `agent-other/foo.ts`).
 * Empty strings are returned as "" and filtered out by the caller.
 */
export function normalizeScopePath(raw: string): string {
  let s = raw.trim();
  if (!s) return '';
  s = s.replace(/^\.\//, '');
  s = s.replace(/^\/+/, '');
  s = s.replace(/\/{2,}/g, '/');
  s = s.replace(/\/+$/, '');
  return s;
}

export function normalizeScopePaths(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of raw) {
    const n = normalizeScopePath(p);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export async function getRepoSettings(
  owner: string,
  repo: string,
): Promise<RepoSettings | null> {
  const [row] = await sql<RepoSettingsRow[]>`
    SELECT owner, repo, scope_paths, updated_at
    FROM repo_settings
    WHERE owner = ${owner} AND repo = ${repo}
  `;
  return row ? toRepoSettings(row) : null;
}

export async function setRepoScopePaths(
  owner: string,
  repo: string,
  scopePaths: string[],
): Promise<RepoSettings> {
  const normalized = normalizeScopePaths(scopePaths);
  const [row] = await sql<RepoSettingsRow[]>`
    INSERT INTO repo_settings (owner, repo, scope_paths, updated_at)
    VALUES (${owner}, ${repo}, ${normalized}, NOW())
    ON CONFLICT (owner, repo)
    DO UPDATE SET scope_paths = ${normalized}, updated_at = NOW()
    RETURNING owner, repo, scope_paths, updated_at
  `;
  return toRepoSettings(row);
}

/**
 * Returns true if the repo has no scope configured (analyze everything) or if
 * at least one changed file matches a configured scope entry. A file matches
 * when it equals the scope entry exactly (single-file scope) OR starts with
 * `entry + '/'` (directory-prefix scope). This avoids false positives from
 * plain `startsWith`, so `agent` doesn't match `agent-other/foo.ts`.
 */
export function anyFileMatchesScope(
  files: readonly string[],
  scopePaths: readonly string[],
): boolean {
  if (scopePaths.length === 0) return true;
  return files.some((f) =>
    scopePaths.some((p) => f === p || f.startsWith(p + '/')),
  );
}
