/**
 * Normalize a file path by stripping common prefixes and cleaning up.
 */
export function normalizePath(path: string): string {
  let p = path;
  // Strip leading ./ or /
  p = p.replace(/^\.\//, '');
  p = p.replace(/^\//, '');
  // Collapse repeated slashes
  p = p.replace(/\/+/g, '/');
  // Strip trailing slashes
  p = p.replace(/\/$/, '');
  return p;
}

/**
 * Resolve a file path against a set of known file paths.
 * Tries exact match first, then normalized match, then suffix match.
 * Returns the matching key from the known paths, or the normalized input if no match.
 */
export function resolveFilePath(input: string, knownPaths: string[]): string {
  // Exact match
  if (knownPaths.includes(input)) return input;

  const normalized = normalizePath(input);

  // Normalized exact match
  const normalizedMatch = knownPaths.find((k) => normalizePath(k) === normalized);
  if (normalizedMatch) return normalizedMatch;

  // Input ends with a known path (agent used a longer prefix)
  const suffixMatch = knownPaths.find((k) => normalized.endsWith('/' + normalizePath(k)) || normalized === normalizePath(k));
  if (suffixMatch) return suffixMatch;

  // Known path ends with the input (input is a relative sub-path)
  const reverseSuffixMatch = knownPaths.find((k) => normalizePath(k).endsWith('/' + normalized));
  if (reverseSuffixMatch) return reverseSuffixMatch;

  // Basename match as last resort (only if unique)
  const inputBasename = normalized.split('/').pop() ?? '';
  if (inputBasename) {
    const basenameMatches = knownPaths.filter((k) => {
      const kb = normalizePath(k).split('/').pop() ?? '';
      return kb === inputBasename;
    });
    if (basenameMatches.length === 1) return basenameMatches[0];
  }

  return normalized;
}
