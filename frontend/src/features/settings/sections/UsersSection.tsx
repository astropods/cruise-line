import { DotsThree } from '@phosphor-icons/react';
import type { KnownUser, UserRole } from '../../../api';
import { formatAgoPhrase } from '../../../lib/time';
import { Avatar, IconButton, Menu, Pill } from '../../../ui';
import { useKnownUsers, useSetUserRole } from '../queries';
import { Notice, SectionHeader } from '../SettingsParts';

export function UsersSection({ currentUserId }: { currentUserId: number }) {
  const query = useKnownUsers();
  const setRole = useSetUserRole();
  const users = query.data?.users ?? [];
  const ownerCount = users.filter((u) => u.role === 'owner').length;

  function changeRole(target: KnownUser, role: UserRole) {
    const isSelf = target.userId === currentUserId;
    const losesAccess = isSelf && role === 'user';
    const prompt = losesAccess
      ? 'Make yourself a member? You will lose access to these settings.'
      : role === 'owner'
        ? `Make @${target.login} an owner? They will be able to change these settings.`
        : `Make @${target.login} a member? They will lose access to these settings.`;
    if (!confirm(prompt)) return;
    setRole.mutate(
      { userId: target.userId, role },
      // Giving up your own ownership bounces you out of settings
      { onSuccess: () => { if (losesAccess) window.location.href = '/'; } },
    );
  }

  return (
    <>
      <SectionHeader title="Users">
        Everyone who has signed in to Cruise Line. Owners can change these settings; there must always be at least one.
      </SectionHeader>

      {query.isError && <Notice tone="danger">{query.error.message}</Notice>}
      {setRole.isError && <Notice tone="danger">{setRole.error.message}</Notice>}
      {query.isPending && <p className="py-7 text-sm text-fg-muted">Loading…</p>}
      {query.data && users.length === 0 && <p className="py-7 text-sm text-fg-muted">No one has signed in yet.</p>}

      {users.length > 0 && (
        <table className="mt-2 w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line text-xs font-medium tracking-wide text-fg-muted uppercase">
              <th scope="col" className="h-10 px-1 font-medium">User</th>
              <th scope="col" className="hidden w-32 px-1 font-medium sm:table-cell">Role</th>
              <th scope="col" className="hidden w-32 px-1 font-medium md:table-cell">Last seen</th>
              <th scope="col" className="w-10 px-1"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isOwner = u.role === 'owner';
              const isLastOwner = isOwner && ownerCount <= 1;
              const isSelf = u.userId === currentUserId;
              return (
                <tr key={u.userId} className="h-[60px] border-b border-line last:border-b-0">
                  <td className="px-1">
                    <div className="flex items-center gap-3">
                      <Avatar login={u.login} src={u.avatarUrl} size={32} />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-fg-strong">@{u.login}</span>
                        <span className="text-[13px] text-fg-muted">
                          {isSelf && 'You · '}{u.loginCount} sign-in{u.loginCount === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-1 sm:table-cell">
                    <Pill tone={isOwner ? 'accent' : 'neutral'} className="h-6">{isOwner ? 'Owner' : 'Member'}</Pill>
                  </td>
                  <td className="hidden px-1 text-[13px] text-fg md:table-cell">{formatAgoPhrase(u.lastSeenAt)}</td>
                  <td className="px-1 text-right">
                    <Menu
                      items={[
                        isOwner
                          ? {
                              label: isLastOwner ? 'Last owner can’t be removed' : 'Make member',
                              onSelect: () => changeRole(u, 'user'),
                              disabled: isLastOwner || setRole.isPending,
                            }
                          : { label: 'Make owner', onSelect: () => changeRole(u, 'owner'), disabled: setRole.isPending },
                      ]}
                      trigger={(props) => (
                        <IconButton label={`Actions for @${u.login}`} variant="ghost" icon={<DotsThree size={16} weight="bold" />} {...props} />
                      )}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
