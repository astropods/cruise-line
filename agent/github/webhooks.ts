import { Webhooks } from '@octokit/webhooks';
import { config } from '../config.js';
import { postWalkthroughComment } from './client.js';

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
