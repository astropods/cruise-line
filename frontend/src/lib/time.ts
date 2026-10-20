/** "42s", "3m 05s"-style elapsed time for a run in progress */
export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Compact age for list rows: "now", "12m", "3h", "4d", then a date
 * ("Sep 30", or "Sep 30, 2025" in another year).
 */
export function formatAgo(iso: string, now: number = Date.now()): string {
  const then = new Date(iso);
  const seconds = Math.max(0, Math.floor((now - then.getTime()) / 1000));
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const date = `${MONTHS[then.getMonth()]} ${then.getDate()}`;
  return then.getFullYear() === new Date(now).getFullYear() ? date : `${date}, ${then.getFullYear()}`;
}

/** Age as a phrase for sentences: "just now", "12m ago", "yesterday", "on Sep 30" */
export function formatAgoPhrase(iso: string, now: number = Date.now()): string {
  const short = formatAgo(iso, now);
  if (short === 'now') return 'just now';
  if (short === '1d') return 'yesterday';
  if (/^\d+[mhd]$/.test(short)) return `${short} ago`;
  return `on ${short}`;
}
