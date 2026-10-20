import { Webhooks } from '@octokit/webhooks';
import { config } from '../config.js';
import { postAnalysisComment, listPrChangedFiles } from './client.js';
import { commentStateFor } from './pr-comment.js';
import { jobManager } from '../analysis/jobs.js';
import { chatRuns } from '../chat/runs.js';
import { getLatestWalkthrough } from '../db/walkthroughs.js';
import { anyFileMatchesScope, getRepoSettings } from '../db/repo-settings.js';
import {
  deletePrScopeDecision,
  getPrScopeDecision,
  setPrScopeDecision,
} from '../db/pr-scope-decisions.js';
import { setTrackedPrState, updateTrackedPrTitle, upsertTrackedPr } from '../db/tracked-prs.js';
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
        const existing = await getLatestWalkthrough(owner, repo, prNumber);

        // Scope gate. The decision is cached per PR (cleared on close and
        // when the repo's scope paths change). A PR that was out of scope is
        // checked again on each push, since new commits can bring it in.
        const settings = await getRepoSettings(owner, repo);
        const scopePaths = settings?.scopePaths ?? [];
        if (scopePaths.length > 0 && !existing) {
          let inScope = await getPrScopeDecision(owner, repo, prNumber);
          if (inScope === null || (inScope === false && payload.action === 'synchronize')) {
            const changed = await listPrChangedFiles(installation.id, owner, repo, prNumber);
            inScope = anyFileMatchesScope(changed, scopePaths);
            await setPrScopeDecision(owner, repo, prNumber, inScope);
          }
          if (!inScope) {
            console.log(
              `Skipping ${owner}/${repo}#${prNumber}: no changed files match scope (${scopePaths.join(', ')})`,
            );
            return;
          }
        }

        // The payload is a snapshot; a redelivered or late event can describe
        // a PR that has since closed.
        const state = pr.state === 'open' ? 'open' : pr.merged ? 'merged' : 'closed';

        // Track the PR so it shows in the list before anyone opens the link.
        // Best-effort: a tracking failure shouldn't stop the comment.
        let isLatest = true;
        try {
          isLatest = await upsertTrackedPr({
            owner,
            repo,
            number: prNumber,
            title: pr.title,
            author: pr.user?.login ?? 'unknown',
            headSha: pr.head.sha,
            authorAvatarUrl: pr.user?.avatar_url ?? null,
            headRef: pr.head.ref,
            baseRef: pr.base.ref,
            additions: pr.additions,
            deletions: pr.deletions,
            changedFiles: pr.changed_files,
            state,
            mergedAt: pr.merged_at,
            closedAt: pr.closed_at,
            updatedAt: pr.updated_at,
          });
        } catch (err) {
          console.error(`Failed to track ${owner}/${repo}#${prNumber}:`, err);
        }

        if (!isLatest || state !== 'open') {
          console.log(`Ignoring out-of-date ${payload.action} for ${owner}/${repo}#${prNumber}`);
          return;
        }

        await postAnalysisComment(installation.id, owner, repo, prNumber, commentStateFor(existing, pr.head.sha));
      } catch (err) {
        console.error(`Failed to post comment on ${owner}/${repo}#${prNumber}:`, err);
      }
    },
  );

  // Keep tracked titles current
  wh.on('pull_request.edited', async ({ payload }) => {
    const { repository, pull_request: pr } = payload;
    try {
      await updateTrackedPrTitle(repository.owner.login, repository.name, pr.number, pr.title);
    } catch (err) {
      console.error(`Failed to update tracked title for ${repository.full_name}#${pr.number}:`, err);
    }
  });

  // When a PR is closed or merged, clean up the clone and chat sessions
  wh.on('pull_request.closed', async ({ payload }) => {
    const { repository, pull_request: pr } = payload;
    const owner = repository.owner.login;
    const repo = repository.name;
    const prNumber = pr.number;

    console.log(`PR closed: ${owner}/${repo}#${prNumber}, cleaning up...`);

    // Each step on its own, so one failure doesn't skip the rest
    const step = (name: string, fn: () => Promise<unknown>) =>
      fn().catch((err) => console.error(`${name} failed for ${owner}/${repo}#${prNumber}:`, err));

    await step('Tracking update', () =>
      setTrackedPrState(owner, repo, prNumber, pr.merged ? 'merged' : 'closed', {
        mergedAt: pr.merged_at,
        closedAt: pr.closed_at,
        updatedAt: pr.updated_at,
      }),
    );
    await step('Scope cleanup', () => deletePrScopeDecision(owner, repo, prNumber));

    // A review or chat still using the checkout would fail mid-run; leave
    // the clone and sessions for the next close (or reopen) to clear.
    if (jobManager.getActiveJob(owner, repo, prNumber) || chatRuns.hasActiveForPr(owner, repo, prNumber)) {
      console.log(`Keeping the checkout for ${owner}/${repo}#${prNumber}: a review or chat is still running`);
      return;
    }
    await step('Sandbox cleanup', () => sandboxCleanup(sandboxRepoPath(owner, repo, prNumber)));
    await step('Chat cleanup', () => deleteChatSessionsForPr(owner, repo, prNumber));
  });
}

/**
 * Get the current Webhooks instance. Creates/recreates it with the
 * current config secret.
 */
export function getWebhooks(): Webhooks | null {
  const secret = config.github.webhookSecret;
  if (!webhooksInstance && secret) {
    webhooksInstance = new Webhooks({ secret });
    registerHandlers(webhooksInstance);
  }
  return webhooksInstance;
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
