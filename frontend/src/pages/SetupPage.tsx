import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';

interface SetupStatus {
  configured: boolean;
  appSlug: string | null;
  githubUrl: string;
}

export function SetupPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [githubUrl, setGithubUrl] = useState('https://github.com');
  const [isGhe, setIsGhe] = useState(false);
  const [appUrl, setAppUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  const success = searchParams.get('success') === 'true';
  const installUrl = searchParams.get('install_url');
  const installed = searchParams.get('installed') === 'true'
    || searchParams.get('setup_action') === 'install';
  const error = searchParams.get('error');

  useEffect(() => {
    fetch('/api/setup/status', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        setStatus(data as SetupStatus);
        if ((data as SetupStatus).githubUrl !== 'https://github.com') {
          setGithubUrl((data as SetupStatus).githubUrl);
          setIsGhe(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
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
        }),
      });
      const data = (await res.json()) as { manifestUrl: string; manifest: string };

      // Submit a form to GitHub with the manifest
      // GitHub's app manifest flow requires a POST form submission
      const form = formRef.current!;
      form.action = data.manifestUrl;
      const input = form.querySelector('input[name="manifest"]') as HTMLInputElement;
      input.value = data.manifest;
      form.submit();
    } catch {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--bg-primary)]">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center p-8">
      <div className="max-w-lg w-full">
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">Cruise Line</h1>
        <p className="text-[var(--text-secondary)] mb-8">
          Set up your GitHub integration to start generating PR walkthroughs.
        </p>

        {/* Error banner */}
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
            <div className="text-sm text-green-400">
              Connected{status?.appSlug ? ` as "${status.appSlug}"` : ''}.
            </div>
          ) : (
            <>
              {/* Public URL — only shown on localhost where a tunnel is needed */}
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

              {/* GHE toggle */}
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
              </p>

              {/* Hidden form for GitHub manifest POST */}
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
          ) : installUrl || status?.configured ? (
            <>
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                Choose which repositories Cruise Line can access.
              </p>
              <a
                href={installUrl ?? `${status?.githubUrl ?? 'https://github.com'}/apps/${status?.appSlug ?? 'cruise-line'}/installations/new`}
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
      </div>
    </div>
  );
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
      {done ? '\u2713' : step}
    </div>
  );
}
