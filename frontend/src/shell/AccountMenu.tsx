import { CaretUp, SignOut, Terminal } from '@phosphor-icons/react';
import { logout, type UserInfo } from '../api';
import { Avatar, Menu } from '../ui';

export function AccountMenu({ user }: { user: UserInfo }) {
  return (
    <Menu
      side="top"
      align="start"
      className="w-full"
      items={[
        { kind: 'link', label: 'CLI access', icon: <Terminal size={14} />, to: '/cli' },
        { kind: 'divider' },
        { label: 'Sign out', icon: <SignOut size={14} />, onSelect: () => { void logout(); } },
      ]}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className="flex h-10 w-full items-center gap-2.5 rounded-md px-2 text-left transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Avatar login={user.login} src={user.avatarUrl} size={20} />
          <span className="flex-grow truncate text-sm text-fg">@{user.login}</span>
          <CaretUp size={12} className="text-fg-muted" />
        </button>
      )}
    />
  );
}
