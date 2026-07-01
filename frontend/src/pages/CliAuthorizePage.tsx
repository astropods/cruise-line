import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

interface AuthorizeInfo {
  user: {
    userId: number;
    login: string;
    avatarUrl: string;
  };
  redirectUri: string;
  clientId: string;
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; info: AuthorizeInfo }
  | { kind: 'error'; message: string }
  | { kind: 'approving' }
  | { kind: 'denied' };

// Redirect back to the loopback URL with an OAuth-style error. The CLI's
// local server watches for this and reports a clean cancellation instead
// of appearing to hang.
function buildDenyUrl(redirectUri: string, state: string): string {
  const url = new URL(redirectUri);
  url.searchParams.set('error', 'access_denied');
  url.searchParams.set('state', state);
  return url.toString();
}

export function CliAuthorizePage() {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<State>({ kind: 'loading' });

  // Bundle up every OAuth param once. The consent screen echoes the same
  // set of params back when the user clicks Approve, so both requests hit
  // the same server-side validator.
  const params = {
    response_type: searchParams.get('response_type') ?? '',
    client_id: searchParams.get('client_id') ?? '',
    redirect_uri: searchParams.get('redirect_uri') ?? '',
    state: searchParams.get('state') ?? '',
    code_challenge: searchParams.get('code_challenge') ?? '',
    code_challenge_method: searchParams.get('code_challenge_method') ?? '',
  };

  useEffect(() => {
    (async () => {
      const query = new URLSearchParams(params).toString();
      const res = await fetch(`/api/cli/authorize/params?${query}`, {
        credentials: 'include',
      });

      if (res.status === 401) {
        // Not logged in — kick to GitHub OAuth and come back to this exact
        // URL (path + query) so all the PKCE params survive the round-trip.
        const returnTo = encodeURIComponent(
          window.location.pathname + window.location.search,
        );
        window.location.href = `/api/auth/github?return_to=${returnTo}`;
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({
          kind: 'error',
          message: (body as { error?: string }).error ?? `HTTP ${res.status}`,
        });
        return;
      }

      const info = (await res.json()) as AuthorizeInfo;
      setState({ kind: 'ready', info });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function approve() {
    setState({ kind: 'approving' });
    try {
      const res = await fetch('/api/cli/authorize/approve', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responseType: params.response_type,
          clientId: params.client_id,
          redirectUri: params.redirect_uri,
          state: params.state,
          codeChallenge: params.code_challenge,
          codeChallengeMethod: params.code_challenge_method,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setState({
          kind: 'error',
          message: (body as { error?: string }).error ?? `HTTP ${res.status}`,
        });
        return;
      }

      const { redirectUrl } = (await res.json()) as { redirectUrl: string };
      window.location.href = redirectUrl;
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Failed to approve',
      });
    }
  }

  function deny() {
    if (params.redirect_uri && params.state) {
      window.location.href = buildDenyUrl(params.redirect_uri, params.state);
      return;
    }
    setState({ kind: 'denied' });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] p-6">
      <div className="w-full max-w-md rounded-2xl bg-[var(--bg-secondary)] p-8 shadow-lg border border-[var(--border-subtle)]">
        <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-1">
          Authorize the Cruise Line CLI
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          A command-line tool on your machine is requesting access to Cruise
          Line as you.
        </p>

        {state.kind === 'loading' && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {state.kind === 'error' && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-400">
            {state.message}
          </div>
        )}

        {state.kind === 'denied' && (
          <div className="rounded-lg bg-[var(--bg-primary)] p-4 text-sm text-[var(--text-secondary)]">
            Request denied. You can close this window.
          </div>
        )}

        {(state.kind === 'ready' || state.kind === 'approving') && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <img
                src={state.kind === 'ready' ? state.info.user.avatarUrl : ''}
                alt=""
                className="w-10 h-10 rounded-full"
              />
              <div>
                <div className="text-sm text-[var(--text-primary)] font-medium">
                  Signed in as{' '}
                  {state.kind === 'ready' ? state.info.user.login : ''}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  Redirects to{' '}
                  <code className="text-[var(--text-primary)]">
                    {state.kind === 'ready' ? state.info.redirectUri : ''}
                  </code>
                </div>
              </div>
            </div>

            <ul className="text-sm text-[var(--text-secondary)] space-y-2 mb-6 list-disc list-inside">
              <li>Read pull request walkthroughs you have access to</li>
              <li>Check analysis status</li>
              <li>Read-only — cannot post comments, trigger or delete walkthroughs, edit review rules, or change settings</li>
            </ul>

            <div className="flex gap-3">
              <button
                onClick={deny}
                disabled={state.kind === 'approving'}
                className="flex-1 px-4 py-2 rounded-lg border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-primary)] disabled:opacity-50"
              >
                Deny
              </button>
              <button
                onClick={approve}
                disabled={state.kind === 'approving'}
                className="flex-1 px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                {state.kind === 'approving' ? 'Approving…' : 'Approve'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
