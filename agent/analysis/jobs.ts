import { config } from '../config.js';
import { analyzePr } from './analyzer.js';
import type { PrMetadata } from '../github/types.js';

type JobState = 'queued' | 'running' | 'complete' | 'failed';

export interface ProgressEntry {
  timestamp: number;
  type: 'status' | 'tool' | 'message';
  text: string;
}

interface Job {
  walkthroughId: number;
  state: JobState;
  pr: PrMetadata;
  startedAt?: Date;
  progress: ProgressEntry[];
}

const MAX_PROGRESS_ENTRIES = 50;

class JobManager {
  private jobs = new Map<string, Job>();
  private running = 0;
  private queue: Array<() => Promise<void>> = [];

  private jobKey(owner: string, repo: string, prNumber: number, headSha: string): string {
    return `${owner}/${repo}#${prNumber}@${headSha}`;
  }

  /** Find a running/queued job for this PR at any SHA */
  getActiveJob(owner: string, repo: string, prNumber: number): Job | undefined {
    for (const [key, job] of this.jobs) {
      if (key.startsWith(`${owner}/${repo}#${prNumber}@`)) {
        return job;
      }
    }
    return undefined;
  }

  getJob(owner: string, repo: string, prNumber: number, headSha: string): Job | undefined {
    return this.jobs.get(this.jobKey(owner, repo, prNumber, headSha));
  }

  addProgress(walkthroughId: number, entry: Omit<ProgressEntry, 'timestamp'>): void {
    for (const job of this.jobs.values()) {
      if (job.walkthroughId === walkthroughId) {
        job.progress.push({ ...entry, timestamp: Date.now() });
        if (job.progress.length > MAX_PROGRESS_ENTRIES) {
          job.progress.shift();
        }
        break;
      }
    }
  }

  enqueue(walkthroughId: number, pr: PrMetadata): void {
    const key = this.jobKey(pr.owner, pr.repo, pr.number, pr.headSha);

    if (this.jobs.has(key)) return;

    const job: Job = { walkthroughId, state: 'queued', pr, progress: [] };
    this.jobs.set(key, job);

    const execute = async () => {
      job.state = 'running';
      job.startedAt = new Date();
      this.running++;

      try {
        await analyzePr(walkthroughId, pr);
        job.state = 'complete';
      } catch {
        job.state = 'failed';
      } finally {
        this.running--;
        this.jobs.delete(key);
        this.processQueue();
      }
    };

    if (this.running < config.claude.maxConcurrentJobs) {
      execute();
    } else {
      this.queue.push(execute);
    }
  }

  private processQueue(): void {
    while (this.running < config.claude.maxConcurrentJobs && this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    }
  }
}

export const jobManager = new JobManager();
