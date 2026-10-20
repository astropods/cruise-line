import { config } from './config.js';
import { getInstallationToken } from './github/app.js';
import { sandboxEnsureClone, sandboxRepoPath, type EnsureCloneResult } from './sandbox-client.js';

export interface PrCheckoutTarget {
  installationId: number;
  owner: string;
  repo: string;
  number: number;
  headSha: string;
  headRef: string;
  baseRef?: string;
}

/** Clone or update the PR's checkout in the sandbox, shared by reviews and chat */
export async function ensurePrCheckout(pr: PrCheckoutTarget): Promise<EnsureCloneResult> {
  const host = new URL(config.github.htmlUrl).host;
  return sandboxEnsureClone({
    cloneUrl: `https://${host}/${pr.owner}/${pr.repo}.git`,
    token: await getInstallationToken(pr.installationId),
    repoPath: sandboxRepoPath(pr.owner, pr.repo, pr.number),
    headSha: pr.headSha,
    headRef: pr.headRef,
    prNumber: pr.number,
    baseRef: pr.baseRef,
  });
}
