import { Hono } from 'hono';
import { requireAuth, requireRepoAccess } from '../middleware/session.js';
import { AppError } from '../middleware/error.js';
import { listRules, addRule, deleteRule, updateRule } from '../db/rules.js';
import type { AppEnv } from '../env.js';

export const ruleRoutes = new Hono<AppEnv>();

ruleRoutes.use('/:owner/:repo/*', requireAuth, requireRepoAccess);
ruleRoutes.use('/:owner/:repo', requireAuth, requireRepoAccess);

/**
 * GET /api/rules/:owner/:repo
 * List all review rules for a repo.
 */
ruleRoutes.get('/:owner/:repo', async (c) => {
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');

  const rules = await listRules(owner, repo);
  return c.json({ rules });
});

/**
 * POST /api/rules/:owner/:repo
 * Add a new review rule.
 */
ruleRoutes.post('/:owner/:repo', async (c) => {
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  const { rule } = await c.req.json<{ rule: string }>();

  if (!rule?.trim()) throw new AppError(400, 'Rule text is required');

  const created = await addRule(owner, repo, rule.trim());
  return c.json({ rule: created }, 201);
});

/**
 * PATCH /api/rules/:owner/:repo/:id
 * Update a review rule's text.
 */
ruleRoutes.patch('/:owner/:repo/:id', async (c) => {
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  const id = Number(c.req.param('id'));
  const { rule } = await c.req.json<{ rule: string }>();

  if (isNaN(id)) throw new AppError(400, 'Invalid rule ID');
  if (!rule?.trim()) throw new AppError(400, 'Rule text is required');

  const updated = await updateRule(owner, repo, id, rule.trim());
  if (!updated) throw new AppError(404, 'Rule not found');

  return c.json({ rule: updated });
});

/**
 * DELETE /api/rules/:owner/:repo/:id
 * Delete a review rule (renumbers remaining rules).
 */
ruleRoutes.delete('/:owner/:repo/:id', async (c) => {
  const owner = c.req.param('owner');
  const repo = c.req.param('repo');
  const id = Number(c.req.param('id'));

  if (isNaN(id)) throw new AppError(400, 'Invalid rule ID');

  await deleteRule(owner, repo, id);
  return c.json({ ok: true });
});
