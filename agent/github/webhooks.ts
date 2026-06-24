import { Webhooks } from '@octokit/webhooks';
import { config } from '../config.js';
import { postAnalysisComment, type CommentState } from './client.js';
import { getLatestWalkthrough } from '../db/walkthroughs.js';
import { sandboxCleanup, sandboxRepoPath } from '../sandbox-client.js';
import { deleteChatSessionsForPr } from '../db/chat-sessions.js';

let webhooksInstance: Webhooks | null = null;

function registerHandlers(wh: Webhooks) {
  // When a PR is opened or updated, post/update the analysis link comment
  wh.on(
    ['pull_request.opened', 'pull_request.reopened', 'pull_request.synchronize'],
    async ({ payload }) => {
      const { repository, pull_request: pr, installation } = payload;
      const owner = repository.owner.login;
      const repo = repository.name;
      const prNumber = pr.number;

      if (!installation) {
        console.warn(
          `[webhook] PR event ${owner}/${repo}#${prNumber} action=${payload.action} skipped: missing installation ID`,
        );
        return;
      }

      console.log(
        `[webhook] PR event ${owner}/${repo}#${prNumber} action=${payload.action} head=${pr.head.sha.slice(0, 7)} installation=${installation.id}`,
      );

      try {
        // Check if an analysis already exists — post the right state
        const existing = await getLatestWalkthrough(owner, repo, prNumber);
        const currentHeadSha = pr.head.sha;
        let state: CommentState = { status: 'ready' };

        if (existing) {
          if (existing.status === 'complete' && existing.data) {
            const findings = existing.data.findings ?? [];
            const summary = {
              verdict: existing.data.verdict,
              verdictRationale: existing.data.verdictRationale,
              findingCounts: {
                critical: findings.filter((f: any) => f.severity === 'critical').length,
                high: findings.filter((f: any) => f.severity === 'high').length,
                medium: findings.filter((f: any) => f.severity === 'medium').length,
                low: findings.filter((f: any) => f.severity === 'low').length,
                info: findings.filter((f: any) => f.severity === 'info').length,
              },
            };
            // Mark as stale if the analysis was run against a different SHA
            const isStale = existing.head_sha !== currentHeadSha;
            state = isStale
              ? { status: 'stale', summary }
              : { status: 'complete', summary };
          } else if (existing.status === 'running' || existing.status === 'pending') {
            state = { status: 'running' };
          } else if (existing.status === 'failed') {
            state = { status: 'failed' };
          }
        }

        await postAnalysisComment(installation.id, owner, repo, prNumber, state);
        console.log(
          `[webhook] comment posted ${owner}/${repo}#${prNumber} state=${state.status}`,
        );
      } catch (err) {
        // Surface the GitHub API status code when available so permission
        // errors (e.g. 403 "Resource not accessible by integration") are
        // visible in logs without grepping the stack trace.
        const status = (err as { status?: number })?.status;
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[webhook] comment failed ${owner}/${repo}#${prNumber}${status ? ` status=${status}` : ''}: ${message}`,
          err,
        );
      }
    },
  );

  // When a PR is closed or merged, clean up the clone and chat sessions
  wh.on('pull_request.closed', async ({ payload }) => {
    const { repository, pull_request: pr } = payload;
    const owner = repository.owner.login;
    const repo = repository.name;
    const prNumber = pr.number;

    console.log(`[webhook] PR closed ${owner}/${repo}#${prNumber}, cleaning up`);

    try {
      await sandboxCleanup(sandboxRepoPath(owner, repo, prNumber));
      await deleteChatSessionsForPr(owner, repo, prNumber);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[webhook] cleanup failed ${owner}/${repo}#${prNumber}: ${message}`, err);
    }
  });
}

/**
 * Get the current Webhooks instance. Creates/recreates it with the
 * current config secret.
 */
export function getWebhooks(): Webhooks {
  const secret = config.github.webhookSecret;
  if (!webhooksInstance && secret) {
    webhooksInstance = new Webhooks({ secret });
    registerHandlers(webhooksInstance);
  }
  return webhooksInstance!;
}

/**
 * Recreate the Webhooks instance with a new secret.
 * Called after the setup flow configures the GitHub App.
 */
export function refreshWebhooks(): void {
  const secret = config.github.webhookSecret;
  if (!secret) {
    console.warn('[webhook] refreshWebhooks: no webhook secret in config — deliveries will fail verification');
    return;
  }
  webhooksInstance = new Webhooks({ secret });
  registerHandlers(webhooksInstance);
  console.log('[webhook] handlers registered for pull_request.opened/reopened/synchronize/closed');
}
