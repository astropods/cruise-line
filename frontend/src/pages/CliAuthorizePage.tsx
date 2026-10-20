import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  approveCliAuthorization,
  fetchCliAuthorizeInfo,
  type CliAuthorizeInfo as AuthorizeInfo,
  type CliAuthorizeParams,
} from '../api';

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
  const params: CliAuthorizeParams = {
    response_type: searchParams.get('response_type') ?? '',
    client_id: searchParams.get('client_id') ?? '',
    redirect_uri: searchParams.get('redirect_uri') ?? '',
    state: searchParams.get('state') ?? '',
    code_challenge: searchParams.get('code_challenge') ?? '',
    code_challenge_method: searchParams.get('code_challenge_method') ?? '',
  };

  useEffect(() => {
    // A signed-out viewer is sent through GitHub sign-in and back to this
    // exact URL, query included, so the PKCE params survive the round trip.
    fetchCliAuthorizeInfo(params)
      .then((info) => setState({ kind: 'ready', info }))
      .catch((err) => setState({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to load' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function approve() {
    setState({ kind: 'approving' });
    try {
      const { redirectUrl } = await approveCliAuthorization(params);
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
    <div className="min-h-screen flex items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-md rounded-2xl bg-surface p-8 shadow-lg border border-[var(--border-subtle)]">
        <h1 className="text-xl font-semibold text-fg mb-1">
          Authorize the Cruise Line CLI
        </h1>
        <p className="text-sm text-fg-muted mb-6">
          A command-line tool on your machine is requesting access to Cruise
          Line as you.
        </p>

        {state.kind === 'loading' && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {state.kind === 'error' && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-400">
            {state.message}
          </div>
        )}

        {state.kind === 'denied' && (
          <div className="rounded-lg bg-canvas p-4 text-sm text-fg-muted">
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
                <div className="text-sm text-fg font-medium">
                  Signed in as{' '}
                  {state.kind === 'ready' ? state.info.user.login : ''}
                </div>
                <div className="text-xs text-fg-muted">
                  Redirects to{' '}
                  <code className="text-fg">
                    {state.kind === 'ready' ? state.info.redirectUri : ''}
                  </code>
                </div>
              </div>
            </div>

            <ul className="text-sm text-fg-muted space-y-2 mb-6 list-disc list-inside">
              <li>Read pull request reviews and review rules</li>
              <li>Check analysis status and list connected repositories</li>
              <li>Trigger a new analysis on a pull request</li>
              <li>Cannot post comments, delete reviews, edit review rules, use chat, or change settings</li>
            </ul>

            <div className="flex gap-3">
              <button
                onClick={deny}
                disabled={state.kind === 'approving'}
                className="flex-1 px-4 py-2 rounded-lg border border-[var(--border-subtle)] text-fg hover:bg-canvas disabled:opacity-50"
              >
                Deny
              </button>
              <button
                onClick={approve}
                disabled={state.kind === 'approving'}
                className="flex-1 px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent-strong disabled:opacity-50"
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
