import { useState, useEffect, useId, useRef } from 'react';
import { Plus, Trash, X, ListNumbers, PencilSimple } from '@phosphor-icons/react';
import { addRuleApi, deleteRuleApi, updateRuleApi } from '../../api';
import { useInvalidateRules, useRules } from './useRules';
import { IconButton } from '../../ui';

interface RulesPanelProps {
  owner: string;
  repo: string;
  onClose: () => void;
  /** Pre-fill the new rule input */
  prefill?: string;
}

export function RulesPanel({ owner, repo, onClose, prefill }: RulesPanelProps) {
  const [newRule, setNewRule] = useState(prefill ?? '');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const newRuleRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();

  // Escape closes, unless something inside (an edit box) claimed it. Focus
  // goes back to whatever opened the panel.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, []);

  // Auto-focus and select when opened with a prefill
  useEffect(() => {
    if (prefill && newRuleRef.current) {
      newRuleRef.current.focus();
      newRuleRef.current.select();
    }
  }, []);

  const rulesQuery = useRules(owner, repo);
  const invalidateRules = useInvalidateRules(owner, repo);
  const rules = rulesQuery.data ?? [];

  /** Run a change, then refetch; a failure shows above the list instead of vanishing */
  async function change(action: () => Promise<unknown>): Promise<boolean> {
    setError(null);
    try {
      await action();
      await invalidateRules();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      return false;
    }
  }

  async function handleAdd() {
    if (!newRule.trim() || adding) return;
    setAdding(true);
    if (await change(() => addRuleApi(owner, repo, newRule.trim()))) setNewRule('');
    setAdding(false);
  }

  async function handleDelete(ruleId: number) {
    await change(() => deleteRuleApi(owner, repo, ruleId));
  }

  async function handleSaveEdit(ruleId: number) {
    if (!editText.trim()) return;
    if (await change(() => updateRuleApi(owner, repo, ruleId, editText.trim()))) setEditingId(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-sunken/70" onClick={onClose} />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-lg max-h-[80vh] rounded-xl bg-canvas border border-line shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <div className="flex items-center gap-2">
            <ListNumbers size={18} className="text-accent" />
            <h2 id={titleId} className="text-base font-semibold text-fg-strong">Review Rules</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-fg-muted">{owner}/{repo}</span>
            <IconButton label="Close" variant="ghost" size="sm" icon={<X size={16} />} onClick={onClose} />
          </div>
        </div>

        {/* Rules list */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {rulesQuery.isError && (
            <p role="alert" className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger-fg">
              Couldn't load rules: {rulesQuery.error.message}
            </p>
          )}
          {error && (
            <p role="alert" className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger-fg">{error}</p>
          )}
          {rulesQuery.isPending ? (
            <div className="text-center text-sm text-fg-muted py-8">Loading rules...</div>
          ) : rulesQuery.isError ? null : rules.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-fg-muted mb-1">No review rules configured</p>
              <p className="text-xs text-fg-muted/60">Rules guide the AI analysis — add rules for patterns, conventions, or areas to watch.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <div key={rule.id} className="group flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-surface transition-colors">
                  <span className="flex-shrink-0 w-6 h-6 rounded bg-accent/10 text-accent text-xs font-semibold flex items-center justify-center mt-0.5">
                    {rule.ruleNumber}
                  </span>
                  {editingId === rule.id ? (
                    <div className="flex-1 min-w-0">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-md bg-canvas border border-line text-fg resize-none focus:outline-none focus:border-accent"
                        rows={2}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(rule.id); }
                          if (e.key === 'Escape') { e.preventDefault(); setEditingId(null); }
                        }}
                      />
                      <div className="flex gap-1 mt-1">
                        <button onClick={() => handleSaveEdit(rule.id)} className="text-xs text-accent hover:underline">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-fg-muted hover:underline ml-2">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-fg leading-relaxed">{rule.rule}</span>
                      <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                        <IconButton
                          label={`Edit rule ${rule.ruleNumber}`}
                          variant="ghost"
                          size="sm"
                          icon={<PencilSimple size={13} />}
                          onClick={() => { setEditingId(rule.id); setEditText(rule.rule); }}
                        />
                        <IconButton
                          label={`Delete rule ${rule.ruleNumber}`}
                          variant="ghost"
                          size="sm"
                          className="hover:text-danger-fg"
                          icon={<Trash size={13} />}
                          onClick={() => handleDelete(rule.id)}
                        />
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add rule input */}
        <div className="px-6 py-4 border-t border-line">
          <div className="flex items-start gap-2">
            <textarea
              ref={newRuleRef}
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a review rule..."
              aria-label="New review rule"
              rows={2}
              className="flex-1 px-3 py-2 text-sm rounded-lg bg-surface border border-line text-fg placeholder:text-fg-muted resize-none focus:outline-none focus:border-accent"
            />
            <IconButton
              label="Add rule"
              variant="accent"
              size="lg"
              icon={<Plus size={16} weight="bold" />}
              onClick={handleAdd}
              disabled={!newRule.trim() || adding}
            />
          </div>
          <p className="text-xs text-fg-muted/50 mt-2">
            Rules are applied to all analyses and chats for this repo. The agent will reference rules by number.
          </p>
        </div>
      </div>
    </div>
  );
}
