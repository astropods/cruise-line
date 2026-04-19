import { query } from '@anthropic-ai/claude-agent-sdk';
import { tmpdir } from 'os';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { config } from '../config.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt.js';
import { walkthroughJsonSchema, type Walkthrough, type ClaudeWalkthroughOutput, type FileContent } from './types.js';
import { updateWalkthroughStatus } from '../db/walkthroughs.js';
import { getInstallationToken } from '../github/app.js';
import { jobManager } from './jobs.js';
import type { PrMetadata } from '../github/types.js';

function addProgress(walkthroughId: number, type: 'status' | 'tool' | 'message', text: string) {
  jobManager.addProgress(walkthroughId, { type, text });
}

const LANGUAGE_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
  java: 'java', kt: 'kotlin', swift: 'swift', cs: 'csharp',
  cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp',
  sql: 'sql', sh: 'bash', bash: 'bash', zsh: 'bash',
  yml: 'yaml', yaml: 'yaml', json: 'json', toml: 'toml',
  md: 'markdown', css: 'css', scss: 'scss', html: 'html',
  xml: 'xml', graphql: 'graphql', proto: 'protobuf',
  dockerfile: 'dockerfile', makefile: 'makefile',
};

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const basename = filePath.split('/').pop()?.toLowerCase() ?? '';
  if (basename === 'dockerfile') return 'dockerfile';
  if (basename === 'makefile') return 'makefile';
  return LANGUAGE_MAP[ext] ?? ext;
}

async function readFileContent(repoDir: string, filePath: string): Promise<string | undefined> {
  try {
    return await readFile(join(repoDir, filePath), 'utf-8');
  } catch {
    return undefined;
  }
}

/**
 * Get the unified diff patch for a single file using git diff.
 */
async function getFilePatch(repoDir: string, baseRef: string, filePath: string): Promise<string | undefined> {
  // Try different ref formats
  for (const ref of [baseRef, `origin/${baseRef}`, 'FETCH_HEAD']) {
    try {
      const proc = Bun.spawn(
        ['git', 'diff', `${ref}...HEAD`, '--', filePath],
        { cwd: repoDir, stdout: 'pipe', stderr: 'pipe' },
      );
      const exitCode = await proc.exited;
      if (exitCode === 0) {
        const output = await new Response(proc.stdout).text();
        if (output.trim()) return output;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

/**
 * Collect file contents and unified diff patches for all referenced files.
 */
async function collectFiles(
  repoDir: string,
  baseRef: string,
  output: ClaudeWalkthroughOutput,
): Promise<Record<string, FileContent>> {
  const files: Record<string, FileContent> = {};
  const filePaths = new Set<string>();

  for (const chapter of output.chapters) {
    for (const step of chapter.steps) {
      for (const ref of step.refs) {
        filePaths.add(ref.file);
      }
    }
  }

  await Promise.all(
    Array.from(filePaths).map(async (filePath) => {
      const [after, patch] = await Promise.all([
        readFileContent(repoDir, filePath),
        getFilePatch(repoDir, baseRef, filePath),
      ]);

      files[filePath] = {
        after: after ?? undefined,
        language: detectLanguage(filePath),
        patch: patch ?? undefined,
      };
    }),
  );

  return files;
}

export async function analyzePr(
  walkthroughId: number,
  prMetadata: PrMetadata,
): Promise<void> {
  let tmpDir: string | undefined;

  try {
    tmpDir = await mkdtemp(join(tmpdir(), 'cruise-'));
    addProgress(walkthroughId, 'status', 'Cloning repository...');

    const token = await getInstallationToken(prMetadata.installationId);
    const host = new URL(config.github.htmlUrl).host;
    const cloneUrl = `https://x-access-token:${token}@${host}/${prMetadata.owner}/${prMetadata.repo}.git`;

    const cloneProc = Bun.spawn(
      ['git', 'clone', '--depth=50', '--single-branch', '--branch', prMetadata.headRef, cloneUrl, '.'],
      { cwd: tmpDir, stdout: 'pipe', stderr: 'pipe' },
    );
    const cloneExit = await cloneProc.exited;
    if (cloneExit !== 0) {
      const stderr = await new Response(cloneProc.stderr).text();
      throw new Error(`git clone failed (exit ${cloneExit}): ${stderr}`);
    }

    addProgress(walkthroughId, 'status', 'Fetching base branch for diff...');

    const fetchProc = Bun.spawn(
      ['git', 'fetch', 'origin', prMetadata.baseRef, '--depth=50'],
      { cwd: tmpDir, stdout: 'pipe', stderr: 'pipe' },
    );
    await fetchProc.exited;

    const diffProc = Bun.spawn(
      ['git', 'diff', `origin/${prMetadata.baseRef}...HEAD`],
      { cwd: tmpDir, stdout: 'pipe', stderr: 'pipe' },
    );
    const diffOutput = await new Response(diffProc.stdout).text();

    addProgress(walkthroughId, 'status', `Diff ready (${diffOutput.split('\n').length} lines). Starting analysis...`);
    await updateWalkthroughStatus(walkthroughId, 'running');

    // Invoke Claude Agent SDK
    const userPrompt = buildUserPrompt(prMetadata, diffOutput);
    let claudeOutput: ClaudeWalkthroughOutput | undefined;

    for await (const message of query({
      prompt: userPrompt,
      options: {
        cwd: tmpDir,
        systemPrompt: SYSTEM_PROMPT,
        model: config.claude.model,
        allowedTools: ['Read', 'Glob', 'Grep', 'Bash'],
        permissionMode: 'bypassPermissions',
        outputFormat: {
          type: 'json_schema',
          schema: walkthroughJsonSchema,
        },
        maxTurns: 30,
      },
    })) {
      // Capture progress
      if (message.type === 'assistant' && message.content) {
        const blocks = Array.isArray(message.content) ? message.content : [message.content];
        for (const block of blocks) {
          if (typeof block === 'string') {
            const trimmed = block.trim();
            if (trimmed) addProgress(walkthroughId, 'message', trimmed.slice(0, 200));
          } else if (block && typeof block === 'object') {
            if ('type' in block && block.type === 'text' && 'text' in block) {
              const trimmed = (block.text as string).trim();
              if (trimmed) addProgress(walkthroughId, 'message', trimmed.slice(0, 200));
            } else if ('type' in block && block.type === 'tool_use') {
              const toolBlock = block as { name?: string; input?: Record<string, unknown> };
              const toolName = toolBlock.name ?? 'unknown';
              const input = toolBlock.input ?? {};
              let detail = '';
              if ('file_path' in input) detail = String(input.file_path);
              else if ('path' in input) detail = String(input.path);
              else if ('pattern' in input) detail = String(input.pattern);
              else if ('command' in input) detail = String(input.command).slice(0, 80);
              addProgress(walkthroughId, 'tool', detail ? `${toolName}: ${detail}` : toolName);
            }
          }
        }
      }

      if (message.type === 'result' && message.subtype === 'success') {
        claudeOutput = (message as any).structured_output as ClaudeWalkthroughOutput;
      }
    }

    if (!claudeOutput) {
      throw new Error('Claude did not return a structured walkthrough');
    }

    addProgress(walkthroughId, 'status', 'Reading file contents...');

    // Read actual file contents for all referenced files
    const files = await collectFiles(tmpDir, prMetadata.baseRef, claudeOutput);

    // Assemble the full walkthrough with file contents
    const walkthrough: Walkthrough = {
      ...claudeOutput,
      files,
    };

    addProgress(walkthroughId, 'status', 'Walkthrough complete. Saving...');
    await updateWalkthroughStatus(walkthroughId, 'complete', walkthrough);
    console.log(
      `Walkthrough complete for ${prMetadata.owner}/${prMetadata.repo}#${prMetadata.number}`,
    );
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
  } finally {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
