import { listPrsNeedingDetails, markDetailsChecked, upsertTrackedPr } from '../db/tracked-prs.js';
import { getInstallationForRepo, getPrMetadata } from './client.js';

/** Enough for any realistic install in one pass; the rest go next startup. */
const BATCH = 500;

/**
 * Fills in PR details (avatar, branches, stats, merge state) for PRs tracked
 * before migration 012 and PRs reviewed before tracking existed. One GitHub
 * call per PR, one at a time; a PR that can't be fetched is logged and
 * waits a day before it's tried again. Rows it fills no longer match, so
 * later startups do nothing.
 */
export async function backfillTrackedPrs(): Promise<void> {
  const rows = await listPrsNeedingDetails(BATCH);
  if (rows.length === 0) return;
  console.log(`Backfilling details for ${rows.length} PR(s)`);

  const installations = new Map<string, number | null>();
  let filled = 0;

  for (const { owner, repo, pr_number } of rows) {
    const key = `${owner}/${repo}`;
    if (!installations.has(key)) {
      installations.set(key, await getInstallationForRepo(owner, repo).catch(() => null));
    }
    const installationId = installations.get(key);
    if (!installationId) {
      await markDetailsChecked(owner, repo, pr_number).catch(() => {});
      continue;
    }

    try {
      await upsertTrackedPr(await getPrMetadata(installationId, owner, repo, pr_number));
      filled++;
    } catch (err) {
      console.warn(`Backfill skipped ${key}#${pr_number}:`, err instanceof Error ? err.message : err);
      await markDetailsChecked(owner, repo, pr_number).catch(() => {});
    }
  }

  console.log(`Backfill filled ${filled} of ${rows.length} PR(s)`);
}
