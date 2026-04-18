export function LoginPage() {
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-6 bg-[var(--bg-primary)]">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Cruise Line</h1>
      <p className="text-[var(--text-secondary)]">Sign in with GitHub to view walkthroughs.</p>
      <a
        href="/api/auth/github"
        className="px-6 py-3 text-base font-medium rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
      >
        Sign in with GitHub
      </a>
    </div>
  );
}
