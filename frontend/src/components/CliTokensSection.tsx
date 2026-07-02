import { useEffect, useState } from 'react';
import {
  fetchCliTokens,
  revokeCliTokenApi,
  type CliTokenRecord,
} from '../api';

/**
 * User's active CLI tokens with revoke buttons. Rendered on the home page
 * for any signed-in user — replaces the previous embedded-in-settings home.
 */
export function CliTokensSection() {
  const [tokens, setTokens] = useState<CliTokenRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { tokens } = await fetchCliTokens();
        if (!cancelled) setTokens(tokens);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load tokens');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function revoke(id: string) {
    if (!confirm('Revoke this CLI token? Any device using it will lose access immediately.')) return;
    setRevokingId(id);
    setError(null);
    try {
      await revokeCliTokenApi(id);
      setTokens((prev) => (prev ? prev.filter((t) => t.id !== id) : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke');
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="p-6 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Your CLI tokens
        </h2>
        {tokens && (
          <span className="text-xs text-[var(--text-secondary)]">
            {tokens.length} active
          </span>
        )}
      </div>

      <p className="text-xs text-[var(--text-secondary)] mb-4">
        Bearer tokens issued to the Cruise Line CLI on your local machines. Each{' '}
        <code className="text-[var(--text-primary)]">cruise-line login</code>{' '}
        mints a new one; they read walkthroughs and analysis status but cannot
        post to GitHub. Tokens expire 90 days after issue.
      </p>

      {error && (
        <div className="mb-3 p-3 rounded-lg bg-red-900/20 border border-red-700/50 text-red-400 text-sm">
          {error}
        </div>
      )}

      {!tokens && !error && (
        <div className="text-sm text-[var(--text-secondary)]">Loading…</div>
      )}

      {tokens && tokens.length === 0 && (
        <div className="text-sm text-[var(--text-secondary)]">
          No active tokens. Run{' '}
          <code className="text-[var(--text-primary)]">cruise-line login</code>{' '}
          on your machine to issue one.
        </div>
      )}

      {tokens && tokens.length > 0 && (
        <ul className="divide-y divide-[var(--border)]">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[var(--text-primary)] font-mono">
                  {t.tokenPrefix}…
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  Created {formatRelative(t.createdAt)}
                  {t.lastUsedAt
                    ? ` · Last used ${formatRelative(t.lastUsedAt)}`
                    : ' · Never used'}
                  {` · Expires ${new Date(t.expiresAt).toLocaleDateString()}`}
                </div>
              </div>
              <button
                onClick={() => revoke(t.id)}
                disabled={revokingId !== null}
                className="text-xs px-3 py-1.5 rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:text-red-400 hover:border-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {revokingId === t.id ? 'Revoking…' : 'Revoke'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}
