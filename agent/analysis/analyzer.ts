import { config } from '../config.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt.js';
import { walkthroughJsonSchema, type Walkthrough, type ClaudeWalkthroughOutput } from './types.js';
import { updateWalkthroughStatus } from '../db/walkthroughs.js';
import { listRules } from '../db/rules.js';
import { postAnalysisComment } from '../github/client.js';
import { getInstallationToken } from '../github/app.js';
import { jobManager } from './jobs.js';
import {
  sandboxEnsureClone,
  sandboxQuery,
  sandboxCollectFiles,
  sandboxRepoPath,
  type SSEEvent,
} from '../sandbox-client.js';
import type { PrMetadata } from '../github/types.js';

function addProgress(walkthroughId: number, type: 'status' | 'tool' | 'message', text: string) {
  jobManager.addProgress(walkthroughId, { type, text });
}

/**
 * Extract all file paths referenced by directives in finding bodies,
 * plus files listed in finding metadata.
 */
function extractFileReferences(output: ClaudeWalkthroughOutput): Set<string> {
  const files = new Set<string>();
  const regex = /::(?:diff|code|file|suggestion)\{[^}]*file="([^"]+)"[^}]*\}/g;
  for (const finding of output.findings) {
    // Files from directives in body
    let match;
    while ((match = regex.exec(finding.body)) !== null) {
      files.add(match[1]);
    }
    // Files listed in finding metadata
    for (const f of finding.files) {
      files.add(f);
    }
  }
  return files;
}

export async function analyzePr(
  walkthroughId: number,
  prMetadata: PrMetadata,
): Promise<void> {
  try {
    addProgress(walkthroughId, 'status', 'Preparing repository...');

    // Clone/update the repo in the sandbox's persistent volume
    const token = await getInstallationToken(prMetadata.installationId);
    const host = new URL(config.github.htmlUrl).host;
    const cloneUrl = `https://x-access-token:${token}@${host}/${prMetadata.owner}/${prMetadata.repo}.git`;
    const repoPath = sandboxRepoPath(prMetadata.owner, prMetadata.repo, prMetadata.number);

    const cloneResult = await sandboxEnsureClone({
      cloneUrl,
      repoPath,
      headSha: prMetadata.headSha,
      headRef: prMetadata.headRef,
      prNumber: prMetadata.number,
      baseRef: prMetadata.baseRef,
    });

    const diffOutput = cloneResult.diff;
    const diffLines = diffOutput.split('\n').length;

    if (!diffOutput.trim()) {
      console.warn(`Empty diff for ${prMetadata.owner}/${prMetadata.repo}#${prMetadata.number} — base: ${prMetadata.baseRef}`);
      addProgress(walkthroughId, 'status', 'No diff found — the agent will use tools to examine changes.');
    } else {
      addProgress(walkthroughId, 'status', `Diff ready (${diffLines} lines).`);
    }

    addProgress(walkthroughId, 'status', 'Agent is reviewing the code...');
    await updateWalkthroughStatus(walkthroughId, 'running');

    // Update PR comment to show analysis is running
    try {
      await postAnalysisComment(
        prMetadata.installationId, prMetadata.owner, prMetadata.repo, prMetadata.number,
        { status: 'running' },
      );
    } catch {
      // Best-effort
    }

    // Fetch repo review rules
    const repoRules = await listRules(prMetadata.owner, prMetadata.repo);
    const rules = repoRules.map((r) => ({ ruleNumber: r.ruleNumber, rule: r.rule }));

    // Build the prompt (agent has DB access for rules, PR metadata)
    const userPrompt = buildUserPrompt(prMetadata, diffOutput, prMetadata.body, rules.length > 0 ? rules : undefined);

    // Run Claude Agent SDK query in the sandbox
    let claudeOutput: ClaudeWalkthroughOutput | undefined;

    for await (const event of sandboxQuery({
      prompt: userPrompt,
      systemPrompt: SYSTEM_PROMPT,
      repoPath: cloneResult.repoDir,
      model: config.claude.model,
      maxTurns: 30,
      outputFormat: {
        type: 'json_schema',
        schema: walkthroughJsonSchema,
      },
    })) {
      // Relay progress events to the job manager
      switch (event.type) {
        case 'text':
          if (event.content.trim()) {
            addProgress(walkthroughId, 'message', event.content.trim().slice(0, 200));
          }
          break;
        case 'tool_call': {
          const detail = event.detail
            ? `${event.name}: ${event.detail}`
            : event.name;
          addProgress(walkthroughId, 'tool', detail);
          break;
        }
        case 'done':
          if (event.structuredOutput) {
            claudeOutput = event.structuredOutput as ClaudeWalkthroughOutput;
          }
          break;
        case 'error':
          throw new Error(event.message);
      }
    }

    if (!claudeOutput) {
      throw new Error('Claude did not return a structured analysis');
    }

    // Fix escaped newlines from structured output
    claudeOutput.summary = claudeOutput.summary.replace(/\\n/g, '\n');
    claudeOutput.verdictRationale = claudeOutput.verdictRationale.replace(/\\n/g, '\n');
    for (const finding of claudeOutput.findings) {
      finding.body = finding.body.replace(/\\n/g, '\n');
      if (finding.fixPrompt) {
        finding.fixPrompt = finding.fixPrompt.replace(/\\n/g, '\n');
      }
    }

    addProgress(walkthroughId, 'status', 'Reading file contents...');

    // Collect file contents from the sandbox
    const filePaths = Array.from(extractFileReferences(claudeOutput));
    const { files } = await sandboxCollectFiles(
      cloneResult.repoDir,
      prMetadata.baseRef,
      filePaths,
    );

    // Assemble the full walkthrough with file contents
    const walkthrough: Walkthrough = {
      ...claudeOutput,
      files,
    };

    addProgress(walkthroughId, 'status', 'Analysis complete. Saving...');
    await updateWalkthroughStatus(walkthroughId, 'complete', walkthrough);
    console.log(
      `Analysis complete for ${prMetadata.owner}/${prMetadata.repo}#${prMetadata.number}`,
    );

    // Update the PR comment with analysis results
    try {
      const findingCounts = {
        critical: claudeOutput.findings.filter((f) => f.severity === 'critical').length,
        high: claudeOutput.findings.filter((f) => f.severity === 'high').length,
        medium: claudeOutput.findings.filter((f) => f.severity === 'medium').length,
        low: claudeOutput.findings.filter((f) => f.severity === 'low').length,
        info: claudeOutput.findings.filter((f) => f.severity === 'info').length,
      };
      await postAnalysisComment(
        prMetadata.installationId,
        prMetadata.owner,
        prMetadata.repo,
        prMetadata.number,
        { status: 'complete', summary: { verdict: claudeOutput.verdict, verdictRationale: claudeOutput.verdictRationale, findingCounts } },
      );
    } catch (err) {
      console.error('Failed to update PR comment with analysis results:', err);
    }
  } catch (error) {
    console.error(
      `Analysis failed for ${prMetadata.owner}/${prMetadata.repo}#${prMetadata.number}:`,
      error,
    );
    await updateWalkthroughStatus(
      walkthroughId,
      'failed',
      undefined,
      error instanceof Error ? error.message : String(error),
    );

    // Update the PR comment to show failure
    try {
      await postAnalysisComment(
        prMetadata.installationId,
        prMetadata.owner,
        prMetadata.repo,
        prMetadata.number,
        { status: 'failed' },
      );
    } catch {
      // Best-effort
    }
  }
}
