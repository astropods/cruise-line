import { Outlet, useMatch } from 'react-router';
import { cx } from '../lib/cx';
import { Sidebar } from './Sidebar';
import { ShellProvider, useShell } from './ShellContext';

/**
 * Sidebar + main area. On narrow screens only one shows: the inbox at the
 * root, the page itself (a PR, settings) everywhere else. While a side panel
 * is open the sidebar hides at every width, so the PR and the panel share
 * the screen.
 */
export function AppShell() {
  return (
    <ShellProvider>
      <ShellLayout />
    </ShellProvider>
  );
}

function ShellLayout() {
  const atInbox = !!useMatch({ path: '/', end: true });
  const { panelOpen } = useShell();
  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-fg">
      <Sidebar className={cx(panelOpen ? 'hidden' : !atInbox && 'hidden md:flex')} />
      <main className={cx('min-w-0 flex-1 overflow-hidden', atInbox && 'hidden md:block')}>
        <Outlet />
      </main>
    </div>
  );
}
