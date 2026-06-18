import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import {
  fetchSetupStatus,
  fetchUser,
  claimOwnership,
  fetchConnectedRepos,
  fetchKnownUsers,
  transferOwnership,
  type SetupStatus,
  type UserInfo,
  type ConnectedInstallation,
  type KnownUser,
} from '../api';

export function SettingsPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [githubUrl, setGithubUrl] = useState('https://github.com');
  const [isGhe, setIsGhe] = useState(false);
  const [appUrl, setAppUrl] = useState('');
  const [org, setOrg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  const success = searchParams.get('success') === 'true';
  const installUrlParam = searchParams.get('install_url');
  const installed = searchParams.get('installed') === 'true'
    || searchParams.get('setup_action') === 'install';
  const error = searchParams.get('error');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const s = await fetchSetupStatus();
        if (cancelled) return;
        setStatus(s);
        if (s.githubUrl !== 'https://github.com') {
          setGithubUrl(s.githubUrl);
          setIsGhe(true);
        }
        // Only fetch the user when the App is configured — OAuth isn't usable
        // before that. fetchUser auto-redirects to OAuth on 401.
        if (s.configured) {
          const u = await fetchUser();
          if (cancelled) return;
          setUser(u);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleConnect() {
    setSubmitting(true);
    try {
      const res = await fetch('/api/setup/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          githubUrl: isGhe ? githubUrl : 'https://github.com',
          appUrl: appUrl || undefined,
          org: org || undefined,
        }),
      });
      const data = (await res.json()) as { manifestUrl: string; manifest: string };

      const form = formRef.current!;
      form.action = data.manifestUrl;
      const input = form.querySelector('input[name="manifest"]') as HTMLInputElement;
      input.value = data.manifest;
      form.submit();
    } catch {
      setSubmitting(false);
    }
  }

  async function handleClaim() {
    setClaiming(true);
    setClaimError(null);
    try {
      await claimOwnership();
      // Reload so all state (user.isOwner, status.ownerClaimed) refreshes.
      window.location.reload();
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : 'Failed to claim ownership');
      setClaiming(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--bg-primary)]">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ---- Locked: configured, authed, but not the owner ----
  if (status?.configured && user && !user.isOwner && status.ownerClaimed) {
    return <LockedScreen />;
  }

  // ---- Claim ownership: configured, authed, no owner yet ----
  if (status?.configured && user && !user.isOwner && !status.ownerClaimed) {
    return (
      <ClaimScreen
        login={user.login}
        avatarUrl={user.avatarUrl}
        onClaim={handleClaim}
        claiming={claiming}
        error={claimError}
      />
    );
  }

  // ---- Main UI: unconfigured (first-time setup) OR configured owner ----
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-8">
      <div className="max-w-lg w-full">
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">Cruise Line</h1>
        <p className="text-[var(--text-secondary)] mb-8">
          {status?.configured
            ? 'Manage your GitHub integration.'
            : 'Set up your GitHub integration to start generating PR walkthroughs.'}
        </p>

        {user?.isOwner && (
          <div className="mb-6 flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
            <img
              src={user.avatarUrl}
              alt=""
              className="w-8 h-8 rounded-full"
            />
            <div className="text-sm text-[var(--text-secondary)]">
              Signed in as <span className="text-[var(--text-primary)] font-medium">@{user.login}</span>
              {' — '}
              <span className="text-[var(--accent)]">owner of this install</span>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-700/50 text-red-400 text-sm">
            Setup failed: {error.replace(/_/g, ' ')}. Please try again.
          </div>
        )}

        {/* Step 1: Connect GitHub */}
        <div className="mb-6 p-6 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
          <div className="flex items-center gap-3 mb-4">
            <StepBadge step={1} done={status?.configured || success} />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Connect to GitHub
            </h2>
          </div>

          {status?.configured || success ? (
            <div>
              <div className="text-sm text-green-400 mb-3">
                Connected{status?.appSlug ? ` as "${status.appSlug}"` : ''}.
              </div>
              <button
                onClick={async () => {
                  if (!confirm('Disconnect the current GitHub App? You will need to create a new one.')) return;
                  await fetch('/api/setup/github', { method: 'DELETE', credentials: 'include' });
                  window.location.href = '/settings';
                }}
                className="text-xs text-[var(--text-secondary)] hover:text-red-400 transition-colors"
              >
                Disconnect and reconnect to a different GitHub
              </button>
            </div>
          ) : (
            <>
              {isLocalhost && (
                <div className="mb-4">
                  <label className="block text-sm text-[var(--text-secondary)] mb-1.5">
                    Public URL
                  </label>
                  <input
                    type="url"
                    value={appUrl}
                    onChange={(e) => setAppUrl(e.target.value)}
                    placeholder="https://your-tunnel-url.ngrok.io"
                    className="w-full px-3 py-2 rounded-md bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] text-sm placeholder-[var(--text-secondary)]"
                  />
                  <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                    You're running locally — GitHub needs a public URL for webhooks.
                    Use a tunnel (e.g. <code className="text-[var(--accent)]">ngrok http 3200</code>) and paste the URL here.
                  </p>
                </div>
              )}

              <div className="mb-4">
                <label className="block text-sm text-[var(--text-secondary)] mb-1.5">
                  Organization <span className="text-[var(--text-secondary)]/50">(optional)</span>
                </label>
                <input
                  type="text"
                  value={org}
                  onChange={(e) => setOrg(e.target.value)}
                  placeholder="my-org"
                  className="w-full px-3 py-2 rounded-md bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] text-sm placeholder-[var(--text-secondary)]"
                />
                <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                  Enter the exact GitHub organization name (e.g. <code className="text-[var(--accent)]">my-company</code>) to create the app under that org. Leave blank for your personal account.
                </p>
              </div>

              <label className="flex items-center gap-2 mb-4 text-sm text-[var(--text-secondary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={isGhe}
                  onChange={(e) => setIsGhe(e.target.checked)}
                  className="rounded"
                />
                I'm using GitHub Enterprise
              </label>

              {isGhe && (
                <input
                  type="url"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.example.com"
                  className="w-full mb-4 px-3 py-2 rounded-md bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] text-sm placeholder-[var(--text-secondary)]"
                />
              )}

              <button
                onClick={handleConnect}
                disabled={submitting}
                className="px-5 py-2.5 text-sm font-medium rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Redirecting to GitHub...' : 'Connect to GitHub'}
              </button>

              <p className="mt-3 text-xs text-[var(--text-secondary)]">
                This will create a GitHub App on your account with read access to code and write access to pull request comments.
                You'll become the owner of this Cruise Line install.
              </p>

              <form ref={formRef} method="POST" style={{ display: 'none' }}>
                <input type="hidden" name="manifest" value="" />
              </form>
            </>
          )}
        </div>

        {/* Step 2: Install on repos */}
        <div className="mb-6 p-6 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
          <div className="flex items-center gap-3 mb-4">
            <StepBadge step={2} done={installed} />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Install on repositories
            </h2>
          </div>

          {installed ? (
            <div className="text-sm text-green-400">
              App installed on your repositories.
            </div>
          ) : installUrlParam || status?.configured ? (
            <>
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                Choose which repositories Cruise Line can access.
              </p>
              <a
                href={installUrlParam ?? status?.installUrl ?? `${status?.githubUrl ?? 'https://github.com'}/apps/${status?.appSlug ?? 'cruise-line'}/installations/new`}
                className="inline-block px-5 py-2.5 text-sm font-medium rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
              >
                Install on repos
              </a>
            </>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">
              Complete step 1 first.
            </p>
          )}
        </div>

        {/* Step 3: Done */}
        <div className="p-6 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
          <div className="flex items-center gap-3 mb-4">
            <StepBadge step={3} done={installed} />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Ready
            </h2>
          </div>

          {installed ? (
            <div className="text-sm text-[var(--text-secondary)]">
              Open a pull request on any connected repository. Cruise Line will post a comment
              with a link to generate a guided walkthrough.
            </div>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">
              Complete the steps above to get started.
            </p>
          )}
        </div>

        {user?.isOwner && status?.configured && (
          <>
            <RepositoriesSection installUrl={status.installUrl} />
            <UsersSection currentUserId={user.userId} />
          </>
        )}
      </div>
    </div>
  );
}

function LockedScreen() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        <div className="mb-4 text-5xl">🔒</div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-3">
          You are not authorized to view this page
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Settings are restricted to the owner of this Cruise Line install.
        </p>
      </div>
    </div>
  );
}

function ClaimScreen({
  login,
  avatarUrl,
  onClaim,
  claiming,
  error,
}: {
  login: string;
  avatarUrl: string;
  onClaim: () => void;
  claiming: boolean;
  error: string | null;
}) {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-8">
      <div className="max-w-md w-full">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
          Claim ownership
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          This Cruise Line install has no owner yet. The first person to claim ownership
          will be the only user who can manage settings going forward.
        </p>

        <div className="mb-6 flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
          <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full" />
          <div className="text-sm text-[var(--text-secondary)]">
            Signed in as <span className="text-[var(--text-primary)] font-medium">@{login}</span>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/20 border border-red-700/50 text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={onClaim}
          disabled={claiming}
          className="w-full px-5 py-2.5 text-sm font-medium rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
        >
          {claiming ? 'Claiming...' : `Claim ownership as @${login}`}
        </button>
      </div>
    </div>
  );
}

function RepositoriesSection({ installUrl }: { installUrl: string | null }) {
  const [installations, setInstallations] = useState<ConnectedInstallation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchConnectedRepos()
      .then((data) => setInstallations(data.installations))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load repositories'));
  }, []);

  const totalRepos = installations?.reduce((sum, inst) => sum + inst.repositories.length, 0) ?? 0;

  return (
    <div className="mt-6 p-6 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Connected repositories
        </h2>
        {installations && (
          <span className="text-xs text-[var(--text-secondary)]">
            {totalRepos} repo{totalRepos === 1 ? '' : 's'} across {installations.length} install{installations.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-900/20 border border-red-700/50 text-red-400 text-sm">
          {error}
        </div>
      )}

      {!installations && !error && (
        <div className="text-sm text-[var(--text-secondary)]">Loading…</div>
      )}

      {installations && installations.length === 0 && (
        <div className="text-sm text-[var(--text-secondary)]">
          The GitHub App isn't installed on any repositories yet.
          {installUrl && (
            <>
              {' '}
              <a href={installUrl} className="text-[var(--accent)] hover:underline">
                Install it now
              </a>.
            </>
          )}
        </div>
      )}

      {installations && installations.length > 0 && (
        <div className="space-y-5">
          {installations.map((inst) => (
            <div key={inst.id}>
              <div className="flex items-center gap-2 mb-2">
                <img src={inst.account.avatarUrl} alt="" className="w-5 h-5 rounded-full" />
                <a
                  href={inst.account.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors"
                >
                  {inst.account.login}
                </a>
                <span className="text-xs text-[var(--text-secondary)]">
                  ({inst.account.type})
                </span>
              </div>
              <ul className="space-y-1 pl-7">
                {inst.repositories.length === 0 && (
                  <li className="text-xs text-[var(--text-secondary)] italic">
                    No repositories selected for this installation.
                  </li>
                )}
                {inst.repositories.map((repo) => (
                  <li key={repo.id} className="flex items-center gap-2 text-sm">
                    <a
                      href={repo.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors"
                    >
                      {repo.fullName}
                    </a>
                    {repo.private && (
                      <span className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)] border border-[var(--border)] rounded px-1.5 py-0.5">
                        private
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UsersSection({ currentUserId }: { currentUserId: number }) {
  const [users, setUsers] = useState<KnownUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transferringTo, setTransferringTo] = useState<number | null>(null);

  useEffect(() => {
    fetchKnownUsers()
      .then((data) => setUsers(data.users))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load users'));
  }, []);

  async function handleTransfer(target: KnownUser) {
    if (!confirm(
      `Transfer ownership to @${target.login}? You will lose access to these settings.`,
    )) {
      return;
    }
    setTransferringTo(target.userId);
    try {
      await transferOwnership(target.userId);
      // Reload — after transfer the current user is no longer the owner, so
      // they'll bounce to the 403 screen.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transfer failed');
      setTransferringTo(null);
    }
  }

  return (
    <div className="mt-6 p-6 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Users
        </h2>
        {users && (
          <span className="text-xs text-[var(--text-secondary)]">
            {users.length} user{users.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <p className="text-xs text-[var(--text-secondary)] mb-4">
        Everyone who has signed in to this Cruise Line install. Transfer ownership to
        another user to hand off these settings.
      </p>

      {error && (
        <div className="mb-3 p-3 rounded-lg bg-red-900/20 border border-red-700/50 text-red-400 text-sm">
          {error}
        </div>
      )}

      {!users && !error && (
        <div className="text-sm text-[var(--text-secondary)]">Loading…</div>
      )}

      {users && users.length === 0 && (
        <div className="text-sm text-[var(--text-secondary)]">No users have signed in yet.</div>
      )}

      {users && users.length > 0 && (
        <ul className="divide-y divide-[var(--border)]">
          {users.map((u) => (
            <li key={u.userId} className="flex items-center gap-3 py-3">
              <img src={u.avatarUrl} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                    @{u.login}
                  </span>
                  {u.isOwner && (
                    <span className="text-[10px] uppercase tracking-wide bg-[var(--accent)]/20 text-[var(--accent)] rounded px-1.5 py-0.5">
                      owner
                    </span>
                  )}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  Last seen {formatRelative(u.lastSeenAt)} · {u.loginCount} sign-in{u.loginCount === 1 ? '' : 's'}
                </div>
              </div>
              {!u.isOwner && u.userId !== currentUserId && (
                <button
                  onClick={() => handleTransfer(u)}
                  disabled={transferringTo !== null}
                  className="text-xs px-3 py-1.5 rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] disabled:opacity-50 transition-colors"
                >
                  {transferringTo === u.userId ? 'Transferring…' : 'Make owner'}
                </button>
              )}
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

function StepBadge({ step, done }: { step: number; done?: boolean }) {
  return (
    <div
      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
        done
          ? 'bg-green-600 text-white'
          : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border)]'
      }`}
    >
      {done ? '✓' : step}
    </div>
  );
}
