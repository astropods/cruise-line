import { Logo } from '../../shell/Logo';

export function LoginPage() {
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-6 bg-canvas">
      <Logo size={64} />
      <h1 className="text-2xl font-semibold text-fg">Cruise Line</h1>
      <p className="text-fg-muted">Sign in with GitHub to view reviews.</p>
      <a
        href="/api/auth/github"
        className="px-6 py-3 text-base font-medium rounded-lg bg-accent-emphasis text-white hover:bg-accent-emphasis/85 transition-colors"
      >
        Sign in with GitHub
      </a>
    </div>
  );
}
