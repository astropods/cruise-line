import { Webhooks } from '@octokit/webhooks';
import { config } from '../config.js';
import { postAnalysisComment, listPrChangedFiles, type CommentState } from './client.js';
import { getLatestWalkthrough } from '../db/walkthroughs.js';
import { anyFileMatchesScope, getRepoSettings } from '../db/repo-settings.js';
import { sandboxCleanup, sandboxRepoPath } from '../sandbox-client.js';
import { deleteChatSessionsForPr } from '../db/chat-sessions.js';

let webhooksInstance: Webhooks | null = null;

function registerHandlers(wh: Webhooks) {
  // When a PR is opened or updated, post/update the analysis link comment
  wh.on(
    ['pull_request.opened', 'pull_request.reopened', 'pull_request.synchronize'],
    async ({ payload }) => {
      const { repository, pull_request: pr, installation } = payload;
      if (!installation) {
        console.warn('Webhook missing installation ID, skipping');
        return;
      }

      const owner = repository.owner.login;
      const repo = repository.name;
      const prNumber = pr.number;

      console.log(`PR event: ${owner}/${repo}#${prNumber} (${payload.action})`);

      try {
        // Check if an analysis already exists — post the right state
        const existing = await getLatestWalkthrough(owner, repo, prNumber);

        // One-shot: scope is checked only for PRs without a walkthrough yet.
        // Changing scope later won't retroactively silence in-flight PRs.
        const settings = await getRepoSettings(owner, repo);
        const scopePaths = settings?.scopePaths ?? [];
        if (scopePaths.length > 0 && !existing) {
          const changed = await listPrChangedFiles(installation.id, owner, repo, prNumber);
          if (!anyFileMatchesScope(changed, scopePaths)) {
            console.log(
              `Skipping ${owner}/${repo}#${prNumber}: no changed files match scope (${scopePaths.join(', ')})`,
            );
            return;
          }
        }

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
      } catch (err) {
        console.error(`Failed to post comment on ${owner}/${repo}#${prNumber}:`, err);
      }
    },
  );

  // When a PR is closed or merged, clean up the clone and chat sessions
  wh.on('pull_request.closed', async ({ payload }) => {
    const { repository, pull_request: pr } = payload;
    const owner = repository.owner.login;
    const repo = repository.name;
    const prNumber = pr.number;

    console.log(`PR closed: ${owner}/${repo}#${prNumber}, cleaning up...`);

    try {
      await sandboxCleanup(sandboxRepoPath(owner, repo, prNumber));
      await deleteChatSessionsForPr(owner, repo, prNumber);
    } catch (err) {
      console.error(`Cleanup failed for ${owner}/${repo}#${prNumber}:`, err);
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
  if (!secret) return;
  webhooksInstance = new Webhooks({ secret });
  registerHandlers(webhooksInstance);
}
