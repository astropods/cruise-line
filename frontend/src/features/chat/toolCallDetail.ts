/**
 * What a tool call acted on, for the activity line: drops the "Read: " style
 * prefix and the sandbox clone path, leaving the path inside the repo.
 */
export function toolCallDetail(content: string | undefined): string {
  return (content ?? '')
    .replace(/^(?:Read|Grep|Glob|Bash|Edit|Write):\s*/, '')
    .replace(/^\/.*?\.cruise-data\/repos\/[^/]+\/[^/]+\/\d+\//, '')
    .replace(/^\/.*?\/repos\/[^/]+\/[^/]+\//, '');
}
