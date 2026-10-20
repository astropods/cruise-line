/**
 * Where to send someone after sign-in. Only paths on this site: anything
 * else (another origin, a protocol-relative "//host", a backslash trick
 * browsers treat as "//") falls back to "/", so a crafted link can't use
 * Cruise Line's sign-in to bounce people to another site.
 */
export function safeReturnTo(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/')) return '/';
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  // Control characters and whitespace can smuggle a second leading slash
  if (/[\u0000-\u001f\u007f\s]/.test(raw)) return '/';
  return raw;
}
