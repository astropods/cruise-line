export interface FileContent {
  after?: string;
  language: string;
  /** Raw unified diff patch from `git diff`. Undefined for context-only files. */
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
  sections: Section[];
  /** Full file contents keyed by path, populated by the analyzer */
  files: Record<string, FileContent>;
}

export interface Section {
  title: string;
  /** Markdown body with embedded directives (::diff{}, ::code{}, ::file{}, ::callout{}) */
  body: string;
}

/** The shape Claude produces (without full file contents) */
export interface ClaudeWalkthroughOutput {
  pr: Walkthrough['pr'];
  summary: string;
  sections: Section[];
}

/** JSON Schema for Claude Agent SDK structured output */
export const walkthroughJsonSchema = {
  type: 'object',
  required: ['pr', 'summary', 'sections'],
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
    sections: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'body'],
        properties: {
          title: { type: 'string' },
          body: {
            type: 'string',
            description: 'Markdown with embedded directives: ::diff{file="path" lines="start-end"}, ::code{file="path" lines="start-end"}, ::file{file="path"}, ::callout{type="info|warning|breaking"}',
          },
        },
      },
    },
  },
} as const;
