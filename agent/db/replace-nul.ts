// Postgres TEXT/JSONB can't hold U+0000, so a NUL byte in a patch or file
// fails the whole save. Swap it for the visible ␀ (U+2400); one char for one,
// so line and column positions in patches are unchanged.
export function replaceNul<T>(value: T): T {
  if (typeof value === 'string') return value.replace(/\u0000/g, '␀') as T;
  if (Array.isArray(value)) return value.map(replaceNul) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [replaceNul(k), replaceNul(v)]),
    ) as T;
  }
  return value;
}
