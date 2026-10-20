import { Link, Navigate, NavLink, useParams } from 'react-router';
import { CaretLeft, Cpu, Plug, Users, type Icon } from '@phosphor-icons/react';
import { useCurrentUser } from '../../app/session';
import { cx } from '../../lib/cx';
import { useKnownUsers } from './queries';
import { BasicSetupSection } from './sections/BasicSetupSection';
import { ModelsSection } from './sections/ModelsSection';
import { UsersSection } from './sections/UsersSection';
import { parseSettingsSection, SETTINGS_SECTIONS, type SettingsSectionId } from './sections';

const ICONS: Record<SettingsSectionId, Icon> = { basic: Plug, models: Cpu, users: Users };

/** Owner-only settings inside the shell: a section nav and the chosen section */
export function SettingsLayout() {
  const params = useParams<{ section: string }>();
  const section = parseSettingsSection(params.section);
  const { data: user } = useCurrentUser();
  const users = useKnownUsers();

  // Settings are owner-only; everything else a user can manage lives at /cli
  if (user && !user.isOwner) return <Navigate to="/" replace />;
  if (!section) return <Navigate to="/settings/basic" replace />;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[1040px] flex-col gap-6 px-4 py-6 md:flex-row md:gap-14 md:px-10 md:py-10">
        {/* Phones: a back link and a row of sections. Wider: a column beside the content. */}
        <nav aria-label="Settings" className="flex flex-shrink-0 flex-col gap-0.5 md:w-52">
          <Link to="/" className="mb-2 inline-flex items-center gap-1 self-start rounded text-sm text-fg-muted hover:text-fg md:hidden">
            <CaretLeft size={14} weight="bold" aria-hidden="true" />
            Inbox
          </Link>
          <p className="px-3 pb-3 text-xs font-semibold tracking-wider text-fg-muted uppercase max-md:px-0 max-md:pb-2">Settings</p>
          <div className="flex gap-1 overflow-x-auto md:flex-col md:gap-0.5">
          {SETTINGS_SECTIONS.map(({ id, label }) => {
            const Glyph = ICONS[id];
            return (
              <NavLink
                key={id}
                to={`/settings/${id}`}
                className={({ isActive }) => cx(
                  'flex h-9 flex-shrink-0 items-center gap-2.5 rounded-md border px-3 text-sm whitespace-nowrap transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-accent',
                  isActive ? 'border-line bg-surface font-medium text-fg-strong' : 'border-transparent text-fg hover:bg-surface/60',
                )}
              >
                {({ isActive }) => (
                  <>
                    <Glyph size={16} className={isActive ? 'text-accent' : 'text-fg-muted'} aria-hidden="true" />
                    <span className="flex-grow">{label}</span>
                    {id === 'users' && users.data && <span className="text-xs text-fg-muted">{users.data.users.length}</span>}
                  </>
                )}
              </NavLink>
            );
          })}
          </div>
        </nav>

        <div className="min-w-0 max-w-[720px] flex-grow">
          {section === 'basic' && <BasicSetupSection />}
          {section === 'models' && <ModelsSection />}
          {section === 'users' && user && <UsersSection currentUserId={user.userId} />}
        </div>
      </div>
    </div>
  );
}
