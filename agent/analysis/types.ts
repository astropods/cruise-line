export interface FileContent {
  after?: string;    // content at head ref (undefined for deleted files)
  language: string;
  /** Raw unified diff patch from `git diff` for this file. Undefined for context-only files. */
  patch?: string;
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
  highlights: string[];
  /** Full file contents keyed by path, populated by the analyzer (not Claude) */
  files: Record<string, FileContent>;
  chapters: Chapter[];
}

export interface Chapter {
  title: string;
  intent: string;
  steps: Step[];
}

export interface CodeReference {
  file: string;
  language: string;
  changeType: 'added' | 'modified' | 'deleted' | 'context';
  focusStart: number;
  focusEnd: number;
}

export interface Step {
  title: string;
  explanation: string;
  /** Array of code regions to show for this step. Usually one, but can be multiple. */
  refs: CodeReference[];
}

/** The shape Claude produces (without full file contents — we add those after) */
export interface ClaudeWalkthroughOutput {
  pr: Walkthrough['pr'];
  summary: string;
  highlights: string[];
  chapters: Chapter[];
}

const codeReferenceSchema = {
  type: 'object',
  required: ['file', 'language', 'changeType', 'focusStart', 'focusEnd'],
  properties: {
    file: { type: 'string' },
    language: { type: 'string' },
    changeType: {
      type: 'string',
      enum: ['added', 'modified', 'deleted', 'context'],
    },
    focusStart: { type: 'integer', description: '1-indexed start line of the focus region' },
    focusEnd: { type: 'integer', description: '1-indexed end line of the focus region' },
  },
} as const;

/** JSON Schema for Claude Agent SDK structured output */
export const walkthroughJsonSchema = {
  type: 'object',
  required: ['pr', 'summary', 'highlights', 'chapters'],
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
    summary: { type: 'string' },
    highlights: { type: 'array', items: { type: 'string' } },
    chapters: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'intent', 'steps'],
        properties: {
          title: { type: 'string' },
          intent: { type: 'string' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              required: ['title', 'explanation', 'refs'],
              properties: {
                title: { type: 'string' },
                explanation: { type: 'string' },
                refs: {
                  type: 'array',
                  items: codeReferenceSchema,
                  description: 'Code regions to show. Usually one, but use multiple to show related code across files together.',
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
