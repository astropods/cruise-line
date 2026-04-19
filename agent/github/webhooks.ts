import { Webhooks } from '@octokit/webhooks';
import { config } from '../config.js';
import { postWalkthroughComment } from './client.js';
import { cleanupClone } from '../repo/manager.js';
import { deleteChatSessionsForPr } from '../db/chat-sessions.js';

let webhooksInstance: Webhooks | null = null;

function registerHandlers(wh: Webhooks) {
  // When a PR is opened or updated, post/update the walkthrough link comment
  wh.on(
    ['pull_request.opened', 'pull_request.synchronize'],
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
        await postWalkthroughComment(installation.id, owner, repo, prNumber);
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
      await cleanupClone(owner, repo, prNumber);
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
