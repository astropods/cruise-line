import { Navigate, NavLink, useParams } from 'react-router';
import { Cpu, Plug, Users, type Icon } from '@phosphor-icons/react';
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
      <div className="mx-auto flex max-w-[1040px] flex-col gap-8 px-6 py-10 md:flex-row md:gap-14 md:px-10">
        <nav aria-label="Settings" className="flex flex-shrink-0 flex-col gap-0.5 md:w-52">
          <p className="px-3 pb-3 text-xs font-semibold tracking-wider text-fg-muted uppercase">Settings</p>
          {SETTINGS_SECTIONS.map(({ id, label }) => {
            const Glyph = ICONS[id];
            return (
              <NavLink
                key={id}
                to={`/settings/${id}`}
                className={({ isActive }) => cx(
                  'flex h-9 items-center gap-2.5 rounded-md border px-3 text-sm transition-colors',
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
