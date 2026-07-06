import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  fetchSetupStatus,
  logout,
  type SetupStatus,
  type UserInfo,
} from '../api';
import { CliTokensSection } from '../components/CliTokensSection';

/**
 * Public landing page. Serves as the entry point for anyone downloading the
 * CLI — reachable without signing in so the install one-liner is copyable
 * from the URL alone. Signed-in extras (token list, owner-only nav link)
 * render conditionally.
 */
export function HomePage() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [userChecked, setUserChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await fetchSetupStatus();
        if (!cancelled) setStatus(s);
      } catch {
        /* setup status is best-effort */
      }
    })();
    // Auth is optional here — a 401 is fine and just means "not signed in".
    // We can't reuse fetchUser directly because it force-redirects on 401.
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (res.ok) {
          const u = (await res.json()) as UserInfo;
          if (!cancelled) setUser(u);
        }
      } catch {
        /* offline / server down — treat as signed-out */
      } finally {
        if (!cancelled) setUserChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const host = status?.appUrl?.replace(/\/$/, '') ?? '';
  const installCommand = host
    ? `curl -fsSL ${host}/install.sh | sh`
    : 'Loading install command…';

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <TopNav user={user} userChecked={userChecked} status={status} />

      <main className="max-w-2xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="flex flex-col items-center text-center mb-14">
          <img
            src="/logo.png"
            alt="Cruise Line"
            width={180}
            height={180}
            className="mb-4 select-none"
            draggable={false}
          />
          <h1 className="text-4xl font-semibold text-[var(--text-bright)] tracking-tight">
            Cruise Line
          </h1>
        </div>

        {/* Install */}
        <section className="mb-10">
          <SectionHeading label="1" title="Install" />
          <CopyBlock value={installCommand} disabled={!host} />
          <p className="text-xs text-[var(--text-secondary)] mt-3">
            Installs to <code>/usr/local/bin</code> if writable, otherwise{' '}
            <code>~/.local/bin</code>. Only macOS binaries are shipped today
            (arm64 + amd64).
          </p>
        </section>

        {/* Sign in / tokens */}
        <section className="mb-10">
          <SectionHeading label="2" title="Sign in and issue a token" />
          {!userChecked ? (
            <div className="p-6 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-sm text-[var(--text-secondary)]">
              Loading…
            </div>
          ) : user ? (
            <>
              <div className="p-6 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] mb-4">
                <div className="flex items-center gap-3">
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="w-10 h-10 rounded-full"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-[var(--text-primary)]">
                      Signed in as{' '}
                      <span className="font-medium">@{user.login}</span>
                    </div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      Run the login command below to issue a token for this account.
                    </div>
                  </div>
                  <button
                    onClick={() => logout()}
                    className="text-xs px-3 py-1.5 rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              </div>
              {host && (
                <CopyBlock value={`cruise-line login ${host}`} />
              )}
              <div className="mt-6">
                <CliTokensSection />
              </div>
            </>
          ) : status?.configured === false ? (
            // Pre-setup: OAuth isn't wired up yet (client_id is empty),
            // so the sign-in button would land the user on a GitHub error
            // page. Show a waiting message instead. The owner sees the
            // "Finish setup" chip in the top nav.
            <div className="p-6 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
              <p className="text-sm text-[var(--text-secondary)]">
                This deployment isn't fully set up yet. Once an owner
                completes the GitHub App connection, you'll be able to sign
                in here and issue CLI tokens.
              </p>
            </div>
          ) : (
            <div className="p-6 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                Sign in to view and manage the CLI tokens issued to your
                machines. Tokens are read-only and expire after 90 days.
              </p>
              <a
                href="/api/auth/github?return_to=/"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors"
              >
                <GitHubMark />
                Sign in with GitHub
              </a>
            </div>
          )}
        </section>

        {/* Getting started */}
        <section className="mb-12">
          <SectionHeading label="3" title="Try it" />
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            After you're logged in, poll for a walkthrough and fetch it as JSON:
          </p>
          <div className="space-y-3">
            <CopyBlock value="cruise-line pr status owner/repo#42 --wait" />
            <CopyBlock value="cruise-line pr walkthrough owner/repo#42 | jq ." />
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-4">
            Full command list:{' '}
            <code>cruise-line help</code>. Upgrade the CLI later with{' '}
            <code>cruise-line upgrade</code>.
          </p>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] py-6">
        <div className="max-w-2xl mx-auto px-6 flex items-center justify-between text-xs text-[var(--text-secondary)]">
          <div>Cruise Line</div>
          {user?.isOwner && (
            <Link
              to="/settings"
              className="hover:text-[var(--text-primary)] transition-colors"
            >
              Install settings →
            </Link>
          )}
        </div>
      </footer>
    </div>
  );
}

// ---------- pieces ----------

function TopNav({
  user,
  userChecked,
  status,
}: {
  user: UserInfo | null;
  userChecked: boolean;
  status: SetupStatus | null;
}) {
  // Show the setup nudge to owners on unconfigured installs — otherwise
  // there's no visible entry point to /settings from the home page.
  const needsSetup = status && !status.configured;
  return (
    <nav className="border-b border-[var(--border)] py-3">
      <div className="max-w-2xl mx-auto px-6 flex items-center justify-between">
        <div className="text-sm font-medium tracking-tight text-[var(--text-primary)]">
          Cruise Line
        </div>
        <div className="flex items-center gap-3">
          {needsSetup && (
            <Link
              to="/settings"
              className="text-xs px-3 py-1.5 rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
            >
              Finish setup
            </Link>
          )}
          {userChecked && user && (
            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <img
                src={user.avatarUrl}
                alt=""
                className="w-6 h-6 rounded-full"
              />
              <span>@{user.login}</span>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

function SectionHeading({ label, title }: { label: string; title: string }) {
  return (
    <div className="flex items-baseline gap-3 mb-3">
      <span className="text-xs font-mono text-[var(--text-secondary)]">
        {label}
      </span>
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">
        {title}
      </h2>
    </div>
  );
}

function CopyBlock({ value, disabled = false }: { value: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (disabled) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      // A 1.5s window is enough for the user to notice the state change
      // without leaving the "Copied" state visible after they've moved on.
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // navigator.clipboard fails silently in some contexts (insecure origin,
      // sandboxed iframe). Users can still select the text manually.
    }
  }

  return (
    <div className="group relative">
      <pre className="p-4 pr-14 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] font-mono text-sm text-[var(--text-primary)] overflow-x-auto">
        <code>{value}</code>
      </pre>
      <button
        onClick={copy}
        disabled={disabled}
        aria-label="Copy to clipboard"
        className="absolute top-2 right-2 px-2 py-1 text-xs rounded-md border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:text-[var(--text-primary)] disabled:cursor-not-allowed"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function GitHubMark() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-1.92c-3.2.7-3.87-1.54-3.87-1.54-.52-1.32-1.28-1.67-1.28-1.67-1.04-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.18 1.18a11.06 11.06 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.58.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.43-2.7 5.4-5.26 5.69.41.35.78 1.05.78 2.12v3.15c0 .3.21.66.8.55A11.51 11.51 0 0 0 23.5 12c0-6.35-5.15-11.5-11.5-11.5Z" />
    </svg>
  );
}
