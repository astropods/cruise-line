import { sql } from './client.js';

export async function getPrScopeDecision(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<boolean | null> {
  const [row] = await sql<{ in_scope: boolean }[]>`
    SELECT in_scope FROM pr_scope_decisions
    WHERE owner = ${owner} AND repo = ${repo} AND pr_number = ${prNumber}
  `;
  return row?.in_scope ?? null;
}

export async function setPrScopeDecision(
  owner: string,
  repo: string,
  prNumber: number,
  inScope: boolean,
): Promise<void> {
  await sql`
    INSERT INTO pr_scope_decisions (owner, repo, pr_number, in_scope, decided_at)
    VALUES (${owner}, ${repo}, ${prNumber}, ${inScope}, NOW())
    ON CONFLICT (owner, repo, pr_number)
    DO UPDATE SET in_scope = ${inScope}, decided_at = NOW()
  `;
}

export async function deletePrScopeDecision(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<void> {
  await sql`
    DELETE FROM pr_scope_decisions
    WHERE owner = ${owner} AND repo = ${repo} AND pr_number = ${prNumber}
  `;
}
