import { sql } from './client.js';

export interface ReviewRule {
  id: number;
  owner: string;
  repo: string;
  ruleNumber: number;
  rule: string;
  createdAt: Date;
}

interface RuleRow {
  id: number;
  owner: string;
  repo: string;
  rule_number: number;
  rule: string;
  created_at: Date;
}

function toReviewRule(row: RuleRow): ReviewRule {
  return {
    id: row.id,
    owner: row.owner,
    repo: row.repo,
    ruleNumber: row.rule_number,
    rule: row.rule,
    createdAt: row.created_at,
  };
}

export async function listRules(owner: string, repo: string): Promise<ReviewRule[]> {
  const rows = await sql<RuleRow[]>`
    SELECT * FROM review_rules
    WHERE owner = ${owner} AND repo = ${repo}
    ORDER BY rule_number ASC
  `;
  return rows.map(toReviewRule);
}

export async function addRule(owner: string, repo: string, rule: string): Promise<ReviewRule> {
  // Get the next rule number for this repo
  const [{ max }] = await sql<{ max: number | null }[]>`
    SELECT MAX(rule_number) as max FROM review_rules
    WHERE owner = ${owner} AND repo = ${repo}
  `;
  const nextNumber = (max ?? 0) + 1;

  const [row] = await sql<RuleRow[]>`
    INSERT INTO review_rules (owner, repo, rule_number, rule)
    VALUES (${owner}, ${repo}, ${nextNumber}, ${rule})
    RETURNING *
  `;
  return toReviewRule(row);
}

export async function deleteRule(owner: string, repo: string, ruleId: number): Promise<void> {
  // Delete the rule
  const [deleted] = await sql<RuleRow[]>`
    DELETE FROM review_rules
    WHERE id = ${ruleId} AND owner = ${owner} AND repo = ${repo}
    RETURNING *
  `;

  if (!deleted) return;

  // Renumber remaining rules to keep them sequential
  const remaining = await sql<RuleRow[]>`
    SELECT id FROM review_rules
    WHERE owner = ${owner} AND repo = ${repo}
    ORDER BY rule_number ASC
  `;

  for (let i = 0; i < remaining.length; i++) {
    await sql`
      UPDATE review_rules SET rule_number = ${i + 1}
      WHERE id = ${remaining[i].id}
    `;
  }
}

export async function updateRule(owner: string, repo: string, ruleId: number, rule: string): Promise<ReviewRule | null> {
  const [row] = await sql<RuleRow[]>`
    UPDATE review_rules SET rule = ${rule}
    WHERE id = ${ruleId} AND owner = ${owner} AND repo = ${repo}
    RETURNING *
  `;
  return row ? toReviewRule(row) : null;
}
