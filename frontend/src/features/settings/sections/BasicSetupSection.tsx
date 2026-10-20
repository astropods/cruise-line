import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ArrowSquareOut } from '@phosphor-icons/react';
import { disconnectGitHubApp, type ConnectedInstallation, type ConnectedRepo } from '../../../api';
import { useSetupStatus } from '../../../app/session';
import { cx } from '../../../lib/cx';
import { Avatar, Button, buttonClass, Pill } from '../../../ui';
import { useConnectedRepos, useRepoSettingsList } from '../queries';
import { Notice, SectionHeader, SettingRow } from '../SettingsParts';
import { RepoScopeEditor } from './RepoScopeEditor';

export function BasicSetupSection() {
  const [params] = useSearchParams();
  const setup = useSetupStatus();
  const status = setup.data;
  const repos = useConnectedRepos();
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  // GitHub sends people back here after creating or installing the App
  const created = params.get('success') === 'true';
  const installUrl = params.get('install_url') ?? status?.installUrl ?? null;
  const installed = params.get('installed') === 'true' || params.get('setup_action') === 'install';
  const setupError = params.get('error');

  async function disconnect() {
    if (!confirm('Disconnect the GitHub App? Cruise Line stops reviewing until a new one is connected.')) return;
    setDisconnecting(true);
    setDisconnectError(null);
    try {
      await disconnectGitHubApp();
      window.location.href = '/settings';
    } catch (err) {
      setDisconnectError(err instanceof Error ? err.message : 'Failed to disconnect');
      setDisconnecting(false);
    }
  }

  const host = status ? new URL(status.githubUrl).host : 'github.com';

  return (
    <>
      <SectionHeader title="Basic setup">
        How Cruise Line connects to GitHub, and which repositories and paths it reviews.
      </SectionHeader>

      {setupError && <Notice tone="danger">Setup failed: {setupError.replace(/_/g, ' ')}. Please try again.</Notice>}
      {installed && <Notice tone="success">The GitHub App is installed. Cruise Line will review new pull requests on those repositories.</Notice>}
      {created && !installed && (
        <Notice tone="accent">
          <span className="flex flex-wrap items-center justify-between gap-3">
            The GitHub App is created. Next, choose which repositories it can access.
            {installUrl && <a href={installUrl} className={buttonClass({ variant: 'primary', size: 'sm' })}>Install on repositories</a>}
          </span>
        </Notice>
      )}

      <SettingRow label="GitHub App" hint="Reads code and posts review comments on pull requests.">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-2 text-sm font-medium text-fg-strong">
              <span className="h-2 w-2 flex-shrink-0 rounded-full bg-success" aria-hidden="true" />
              Connected{status?.appSlug ? ` as ${status.appSlug}` : ''}
            </span>
            <span className="pl-4 text-[13px] text-fg-muted">{host}</span>
          </div>
          {status?.appSlug && (
            <a
              href={`${status.githubUrl}/apps/${status.appSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({ size: 'sm' })}
            >
              View on GitHub <ArrowSquareOut size={12} aria-hidden="true" />
            </a>
          )}
        </div>
      </SettingRow>

      <SettingRow label="Repositories" hint="Limit a repository to certain paths so pull requests elsewhere are skipped.">
        {repos.isPending && <p className="text-sm text-fg-muted">Loading repositories…</p>}
        {repos.isError && <p className="text-sm text-danger-fg">{repos.error.message}</p>}
        {repos.data?.installations.length === 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-4 py-3.5 text-sm text-fg-muted">
            The GitHub App isn’t installed on any repositories yet.
            {installUrl && <a href={installUrl} className={buttonClass({ size: 'sm' })}>Install on repositories</a>}
          </div>
        )}
        {repos.data?.installations.map((inst) => (
          <InstallationRepos key={inst.id} installation={inst} installUrl={installUrl} />
        ))}
      </SettingRow>

      <SettingRow label="Disconnect" hint="Remove the GitHub App to connect a different GitHub account or Enterprise server." last>
        <div className="flex flex-col items-start gap-2">
          <Button variant="danger" onClick={disconnect} disabled={disconnecting}>
            {disconnecting ? 'Disconnecting…' : 'Disconnect GitHub App'}
          </Button>
          {disconnectError && <p role="alert" className="text-xs text-danger-fg">{disconnectError}</p>}
        </div>
      </SettingRow>
    </>
  );
}

function InstallationRepos({ installation, installUrl }: { installation: ConnectedInstallation; installUrl: string | null }) {
  const owner = installation.account.login;
  const settings = useRepoSettingsList(installation.repositories.map((r) => ({ owner, repo: r.name })));
  const [editing, setEditing] = useState<string | null>(null);
  const count = installation.repositories.length;

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-line">
      <div className="flex h-12 items-center justify-between gap-3 border-b border-line bg-surface px-4">
        <span className="flex min-w-0 items-center gap-2 text-[13px] text-fg-muted">
          <Avatar login={owner} src={installation.account.avatarUrl} size={16} />
          <span className="truncate">{count} {count === 1 ? 'repository' : 'repositories'} on {owner}</span>
        </span>
        {installUrl && (
          <a href={installUrl} className="flex-shrink-0 text-[13px] text-accent hover:underline">Add repositories</a>
        )}
      </div>
      {count === 0 && <p className="px-4 py-3 text-[13px] text-fg-muted italic">No repositories selected for this installation.</p>}
      {installation.repositories.map((repo, i) => (
        <RepoItem
          key={repo.id}
          owner={owner}
          repo={repo}
          scopePaths={settings[i]?.data?.settings.scopePaths ?? null}
          editing={editing === repo.name}
          onEdit={() => setEditing(editing === repo.name ? null : repo.name)}
          onDone={() => setEditing(null)}
          last={i === count - 1}
        />
      ))}
    </div>
  );
}

function RepoItem({ owner, repo, scopePaths, editing, onEdit, onDone, last }: {
  owner: string;
  repo: ConnectedRepo;
  scopePaths: string[] | null;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
  last: boolean;
}) {
  return (
    <div className={cx(!last && 'border-b border-line')}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-grow flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <a href={repo.htmlUrl} target="_blank" rel="noopener noreferrer" className="truncate text-sm font-medium text-fg-strong hover:text-accent">
              {repo.fullName}
            </a>
            {repo.private && <Pill shape="tag">Private</Pill>}
          </span>
          <span className="truncate text-[13px] text-fg-muted">
            {scopePaths === null
              ? '…'
              : scopePaths.length === 0
                ? 'All files'
                : <span className="font-mono text-xs text-fg">{scopePaths.join(' · ')}</span>}
          </span>
        </div>
        <Button size="sm" variant="ghost" onClick={onEdit} aria-expanded={editing} disabled={scopePaths === null}>
          {editing ? 'Close' : 'Edit scope'}
        </Button>
      </div>
      {editing && scopePaths && (
        <RepoScopeEditor owner={owner} repo={repo.name} savedPaths={scopePaths} onDone={onDone} />
      )}
    </div>
  );
}
