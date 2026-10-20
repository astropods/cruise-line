import { useState } from 'react';
import { Plus, X } from '@phosphor-icons/react';
import { normalizeScopePathClient } from '../../../lib/scopePath';
import { Button, IconButton } from '../../../ui';
import { useUpdateScope } from '../queries';

// Stable id (not array index) — avoids focus jump when removing middle rows.
interface ScopeRow {
  id: string;
  value: string;
}

const toRows = (paths: readonly string[]): ScopeRow[] => paths.map((value) => ({ id: crypto.randomUUID(), value }));

/** Edits the paths a repo is scoped to; empty means every PR is reviewed */
export function RepoScopeEditor({ owner, repo, savedPaths, onDone }: {
  owner: string;
  repo: string;
  savedPaths: string[];
  onDone: () => void;
}) {
  const [rows, setRows] = useState<ScopeRow[]>(() => toRows(savedPaths));
  // A row added with "Add path" takes focus so you can type straight away
  const [newRowId, setNewRowId] = useState<string | null>(null);
  const update = useUpdateScope(owner, repo);

  const normalized = rows.map((r) => normalizeScopePathClient(r.value)).filter((v) => v.length > 0);
  const dirty = normalized.length !== savedPaths.length || normalized.some((v, i) => v !== savedPaths[i]);

  function setValue(id: string, value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, value } : r)));
  }

  function save() {
    update.mutate(rows.map((r) => r.value.trim()).filter((p) => p.length > 0), { onSuccess: onDone });
  }

  return (
    <div className="flex flex-col gap-3 border-t border-line bg-surface/50 px-4 py-4">
      <p className="text-xs leading-5 text-fg-muted">
        Only review PRs that touch one of these paths. A directory like <code className="text-accent">agent</code> covers
        everything inside it; a file like <code className="text-accent">.github/workflows/deploy.yml</code> covers just that
        file. Leave it empty to review every PR.
      </p>

      {rows.length === 0 && <p className="text-xs text-fg-muted italic">No paths: every PR is reviewed.</p>}
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-2">
          <label className="sr-only" htmlFor={row.id}>Scope path</label>
          <input
            id={row.id}
            type="text"
            value={row.value}
            onChange={(e) => setValue(row.id, e.target.value)}
            placeholder="packages/api or Makefile"
            autoFocus={row.id === newRowId}
            className="h-8 min-w-0 flex-grow rounded-md border border-line bg-canvas px-2.5 font-mono text-xs text-fg placeholder:text-fg-muted focus:border-accent-emphasis focus:outline-none"
          />
          <IconButton
            label="Remove path"
            size="sm"
            icon={<X size={12} />}
            onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
          />
        </div>
      ))}

      {update.isError && <p className="text-xs text-danger-fg">{update.error.message}</p>}

      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" icon={<Plus size={12} />} onClick={() => {
          const id = crypto.randomUUID();
          setNewRowId(id);
          setRows((prev) => [...prev, { id, value: '' }]);
        }}>
          Add path
        </Button>
        <span className="flex-grow" />
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button size="sm" variant="primary" onClick={save} disabled={!dirty || update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
