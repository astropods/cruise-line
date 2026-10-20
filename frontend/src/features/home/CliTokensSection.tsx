import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchCliTokens, queryKeys, revokeCliTokenApi, type CliTokenRecord } from '../../api';
import { formatAgoPhrase } from '../../lib/time';

/**
 * User's active CLI tokens with revoke buttons. Rendered on the home page
 * for any signed-in user — replaces the previous embedded-in-settings home.
 */
export function CliTokensSection() {
  const queryClient = useQueryClient();
  const tokensQuery = useQuery({
    queryKey: queryKeys.cliTokens,
    queryFn: () => fetchCliTokens().then((r) => r.tokens),
  });
  const tokens = tokensQuery.data ?? null;
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const error = revokeError ?? (tokensQuery.isError ? tokensQuery.error.message : null);

  async function revoke(id: string) {
    if (!confirm('Revoke this CLI token? Any device using it will lose access immediately.')) return;
    setRevokingId(id);
    setRevokeError(null);
    try {
      await revokeCliTokenApi(id);
      queryClient.setQueryData<CliTokenRecord[]>(queryKeys.cliTokens, (prev) => prev?.filter((t) => t.id !== id));
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : 'Failed to revoke');
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="p-6 rounded-lg bg-surface border border-line">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-semibold text-fg">
          Your CLI tokens
        </h2>
        {tokens && (
          <span className="text-xs text-fg-muted">
            {tokens.length} active
          </span>
        )}
      </div>

      <p className="text-xs text-fg-muted mb-4">
        Bearer tokens issued to the Cruise Line CLI on your local machines. Each{' '}
        <code className="text-fg">cruise-line login</code>{' '}
        mints a new one; they read reviews and review status but cannot
        post to GitHub. Tokens expire 90 days after issue.
      </p>

      {error && (
        <div role="alert" className="mb-3 p-3 rounded-lg bg-danger/10 border border-danger/40 text-danger-fg text-sm">
          {error}
        </div>
      )}

      {!tokens && !error && (
        <div className="text-sm text-fg-muted">Loading…</div>
      )}

      {tokens && tokens.length === 0 && (
        <div className="text-sm text-fg-muted">
          No active tokens. Run{' '}
          <code className="text-fg">cruise-line login</code>{' '}
          on your machine to issue one.
        </div>
      )}

      {tokens && tokens.length > 0 && (
        <ul className="divide-y divide-line">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-fg font-mono">
                  {t.tokenPrefix}…
                </div>
                <div className="text-xs text-fg-muted">
                  Created {formatAgoPhrase(t.createdAt)}
                  {t.lastUsedAt
                    ? ` · Last used ${formatAgoPhrase(t.lastUsedAt)}`
                    : ' · Never used'}
                  {` · Expires ${new Date(t.expiresAt).toLocaleDateString()}`}
                </div>
              </div>
              <button
                onClick={() => revoke(t.id)}
                disabled={revokingId !== null}
                className="text-xs px-3 py-1.5 rounded-md border border-line text-fg-muted hover:text-danger-fg hover:border-danger/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
