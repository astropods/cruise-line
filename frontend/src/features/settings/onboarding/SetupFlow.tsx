import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { startGitHubAppSetup } from '../../../api';
import { Logo } from '../../../shell/Logo';
import { Button } from '../../../ui';

const STEPS = [
  { title: 'Connect to GitHub', body: 'Create a GitHub App that can read code and comment on pull requests.' },
  { title: 'Install on repositories', body: 'Choose which repositories Cruise Line can review.' },
  { title: 'Open a pull request', body: 'Cruise Line comments with a link to its review.' },
];

const inputClass = 'h-9 w-full rounded-md border border-line bg-canvas px-3 text-sm text-fg placeholder:text-fg-muted focus:border-accent-emphasis focus:outline-none';

/** First run: create the GitHub App. Installing it and everything after happens in Settings. */
export function SetupFlow({ defaultGithubUrl }: { defaultGithubUrl: string }) {
  const [params] = useSearchParams();
  const error = params.get('error');
  const [isGhe, setIsGhe] = useState(defaultGithubUrl !== 'https://github.com');
  const [githubUrl, setGithubUrl] = useState(defaultGithubUrl);
  const [appUrl, setAppUrl] = useState('');
  const [org, setOrg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

  async function connect() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { manifestUrl, manifest } = await startGitHubAppSetup({
        githubUrl: isGhe ? githubUrl : 'https://github.com',
        appUrl: appUrl || undefined,
        org: org || undefined,
      });
      // GitHub's manifest flow needs a real form POST, not fetch
      const form = formRef.current!;
      form.action = manifestUrl;
      (form.elements.namedItem('manifest') as HTMLInputElement).value = manifest;
      form.submit();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not start setup');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen justify-center bg-canvas px-6 py-16 text-fg">
      <div className="flex w-full max-w-lg flex-col gap-8">
        <div className="flex items-center gap-3">
          <Logo size={32} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-fg-strong">Set up Cruise Line</h1>
            <p className="text-sm text-fg-muted">Three steps, about two minutes.</p>
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger-fg">
            Setup failed: {error.replace(/_/g, ' ')}. Please try again.
          </div>
        )}

        <ol className="flex flex-col gap-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${i === 0 ? 'bg-accent text-canvas' : 'border border-line text-fg-muted'}`}>
                {i + 1}
              </span>
              <div>
                <p className={`text-sm font-medium ${i === 0 ? 'text-fg-strong' : 'text-fg-muted'}`}>{step.title}</p>
                <p className="text-[13px] text-fg-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
          {isLocalhost && (
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-fg">Public URL</span>
              <input type="url" value={appUrl} onChange={(e) => setAppUrl(e.target.value)} placeholder="https://your-tunnel.ngrok.io" className={inputClass} />
              <span className="text-xs text-fg-muted">
                You’re running locally, so GitHub needs a public URL for webhooks. Start a tunnel (for example{' '}
                <code className="text-accent">ngrok http 3200</code>) and paste its URL.
              </span>
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-fg">Organization <span className="font-normal text-fg-muted">(optional)</span></span>
            <input type="text" value={org} onChange={(e) => setOrg(e.target.value)} placeholder="my-company" className={inputClass} />
            <span className="text-xs text-fg-muted">The exact GitHub organization name to create the App under. Leave blank for your personal account.</span>
          </label>

          <label className="flex items-center gap-2 text-[13px] text-fg">
            <input type="checkbox" checked={isGhe} onChange={(e) => setIsGhe(e.target.checked)} className="accent-[var(--color-accent)]" />
            I’m using GitHub Enterprise
          </label>
          {isGhe && (
            <label className="flex flex-col gap-1.5">
              <span className="sr-only">GitHub Enterprise URL</span>
              <input type="url" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="https://github.example.com" className={inputClass} />
            </label>
          )}

          {submitError && <p className="text-sm text-danger-fg">{submitError}</p>}

          <div>
            <Button variant="primary" onClick={connect} disabled={submitting}>
              {submitting ? 'Redirecting to GitHub…' : 'Connect to GitHub'}
            </Button>
          </div>
          <p className="text-xs text-fg-muted">
            This creates a GitHub App with read access to code and write access to pull request comments, and makes you the
            owner of this Cruise Line install.
          </p>

          <form ref={formRef} method="POST" className="hidden">
            <input type="hidden" name="manifest" value="" />
          </form>
        </div>
      </div>
    </div>
  );
}
