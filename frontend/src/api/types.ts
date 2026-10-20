// Review content shapes. These mirror agent/analysis/types.ts until the two
// share a module (docs/architecture/frontend.md, phase 6).

export interface FileContent {
  after?: string;
  language: string;
  /** Raw unified diff patch from git diff */
  patch?: string;
}

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type FindingCategory = 'correctness' | 'security' | 'maintainability' | 'performance' | 'style';
export type Verdict = 'approve' | 'request_changes' | 'needs_discussion';

export interface CommentAnchor {
  /** Path of a file that is part of the PR diff */
  file: string;
  /** 1-indexed start line in the new (head) version of the file */
  lineStart: number;
  /** 1-indexed end line in the new (head) version of the file */
  lineEnd: number;
}

export interface Finding {
  title: string;
  severity: Severity;
  category: FindingCategory;
  body: string;
  files: string[];
  /** A prompt the developer can paste into Claude Code to fix this issue. Required for non-info findings. */
  fixPrompt?: string;
  /** Where to anchor the "Post as comment" action. Required for non-info findings. */
  commentAnchor?: CommentAnchor;
}

export interface ArchitectureDiagram {
  title: string;
  kind: 'flowchart' | 'sequence';
  description: string;
  mermaid: string;
}

export interface ArchitectureAnalysis {
  overview: string;
  steps: string[];
  diagrams: ArchitectureDiagram[];
}

export interface Walkthrough {
  pr: {
    repo: string;
    number: number;
    title: string;
    author: string;
    baseSha: string;
    headSha: string;
  };
  summary: string;
  verdict: Verdict;
  verdictRationale: string;
  files: Record<string, FileContent>;
  findings: Finding[];
  architecture?: ArchitectureAnalysis;
}
