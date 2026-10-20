/** Strip a ```mermaid fence the model sometimes wraps around diagram source */
export function normalizeMermaidSource(source: string) {
  return source
    .replace(/^```(?:mermaid)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}
