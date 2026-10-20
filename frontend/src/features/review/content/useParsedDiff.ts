import { useMemo } from 'react';
import { markEdits, parseDiff, tokenize } from 'react-diff-view';
import refractor from 'refractor';
import 'react-diff-view/style/index.css';

// Our language ids (from the sandbox) to refractor's grammar names
const REFRACTOR_LANG_MAP: Record<string, string> = {
  typescript: 'typescript', tsx: 'tsx', javascript: 'javascript', jsx: 'jsx',
  python: 'python', ruby: 'ruby', go: 'go', rust: 'rust',
  java: 'java', kotlin: 'kotlin', swift: 'swift', csharp: 'csharp',
  cpp: 'cpp', c: 'c', sql: 'sql', bash: 'bash',
  yaml: 'yaml', json: 'json', toml: 'toml', markdown: 'markdown',
  css: 'css', scss: 'scss', html: 'markup', xml: 'markup',
  graphql: 'graphql', dockerfile: 'docker',
};

/**
 * A file's patch parsed for react-diff-view, with syntax tokens when
 * refractor knows the language. Both are null/undefined when the patch is
 * missing or doesn't parse.
 */
export function useParsedDiff(patch: string | undefined, language: string | undefined) {
  const parsed = useMemo(() => {
    if (!patch) return null;
    try {
      return parseDiff(patch, { nearbySequences: 'zip' })[0] ?? null;
    } catch {
      return null;
    }
  }, [patch]);

  const tokens = useMemo(() => {
    if (!parsed?.hunks?.length) return undefined;
    const lang = REFRACTOR_LANG_MAP[language ?? ''] ?? language;
    const enhancers = [markEdits(parsed.hunks, { type: 'block' })];
    try {
      return lang && refractor.registered(lang)
        ? tokenize(parsed.hunks, { highlight: true as const, refractor, language: lang, enhancers })
        : tokenize(parsed.hunks, { enhancers });
    } catch {
      return undefined;
    }
  }, [parsed, language]);

  return { parsed, tokens };
}
