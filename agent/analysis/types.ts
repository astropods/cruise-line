export interface FileContent {
  after?: string;
  language: string;
  /** Raw unified diff patch from `git diff`. Undefined for context-only files. */
  patch?: string;
}

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type FindingCategory = 'correctness' | 'security' | 'maintainability' | 'performance' | 'style';
export type Verdict = 'approve' | 'request_changes' | 'needs_discussion';

export interface Finding {
  title: string;
  severity: Severity;
  category: FindingCategory;
  /** Markdown body with embedded directives (::diff{}, ::code{}, ::file{}, ::callout{}, ::suggestion{}) */
  body: string;
  /** Primary files involved in this finding */
  files: string[];
  /** A prompt the developer can paste into Claude Code to fix this issue. Omitted for info findings. */
  fixPrompt?: string;
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
  findings: Finding[];
  /** Full file contents keyed by path, populated by the analyzer */
  files: Record<string, FileContent>;
}

/** The shape Claude produces (without full file contents) */
export interface ClaudeAnalysisOutput {
  pr: Walkthrough['pr'];
  summary: string;
  verdict: Verdict;
  verdictRationale: string;
  findings: Finding[];
}

/** JSON Schema for Claude Agent SDK structured output */
export const analysisJsonSchema = {
  type: 'object',
  required: ['pr', 'summary', 'verdict', 'verdictRationale', 'findings'],
  properties: {
    pr: {
      type: 'object',
      required: ['repo', 'number', 'title', 'author', 'baseSha', 'headSha'],
      properties: {
        repo: { type: 'string' },
        number: { type: 'integer' },
        title: { type: 'string' },
        author: { type: 'string' },
        baseSha: { type: 'string' },
        headSha: { type: 'string' },
      },
    },
    summary: {
      type: 'string',
      description: '1-2 paragraph overview of what the PR does and overall assessment',
    },
    verdict: {
      type: 'string',
      enum: ['approve', 'request_changes', 'needs_discussion'],
      description: 'Overall recommendation: approve if no significant issues, request_changes if there are problems that should be fixed before merge, needs_discussion if there are trade-offs worth talking through',
    },
    verdictRationale: {
      type: 'string',
      description: 'Brief explanation of the verdict — what drove the recommendation',
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'severity', 'category', 'body', 'files'],
        properties: {
          title: {
            type: 'string',
            description: 'Concise title for the finding (e.g. "SQL injection via unsanitized input")',
          },
          severity: {
            type: 'string',
            enum: ['critical', 'high', 'medium', 'low', 'info'],
            description: 'critical = must fix before merge, high = strongly recommend fixing, medium = worth addressing, low = minor improvement, info = observation or positive note',
          },
          category: {
            type: 'string',
            enum: ['correctness', 'security', 'maintainability', 'performance', 'style'],
          },
          body: {
            type: 'string',
            description: 'Markdown with embedded directives: ::diff{file="path" lines="start-end"}, ::code{file="path" lines="start-end"}, ::file{file="path"}, ::callout{type="info|warning|security|perf"}, ::suggestion{file="path" lines="start-end"}',
          },
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'File paths primarily involved in this finding',
          },
          fixPrompt: {
            type: 'string',
            description: 'A self-contained prompt the developer can paste into Claude Code to fix this issue. Include file paths, line numbers, what to change, and any constraints. Omit for info-severity findings.',
          },
        },
      },
    },
  },
} as const;

// Keep backward compat aliases for the old names used in analyzer.ts
export type ClaudeWalkthroughOutput = ClaudeAnalysisOutput;
export const walkthroughJsonSchema = analysisJsonSchema;
