import { Outlet, useMatch } from 'react-router';
import { cx } from '../lib/cx';
import { Sidebar } from './Sidebar';

/**
 * Sidebar + main area. On narrow screens only one shows: the inbox at the
 * root, the PR on a PR page.
 */
export function AppShell() {
  const onPr = !!useMatch('/:owner/:repo/pull/:pr/*');
  return (
    <div className="flex h-screen overflow-hidden bg-canvas text-fg">
      <Sidebar className={cx(onPr && 'hidden md:flex')} />
      <main className={cx('min-w-0 flex-1 overflow-hidden', !onPr && 'hidden md:block')}>
        <Outlet />
      </main>
    </div>
  );
}
