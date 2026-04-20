import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash, X, ListNumbers, PencilSimple, Check } from '@phosphor-icons/react';
import { fetchRules, addRuleApi, deleteRuleApi, updateRuleApi, type ReviewRule } from '../api';

interface RulesPanelProps {
  owner: string;
  repo: string;
  onClose: () => void;
  /** Pre-fill the new rule input */
  prefill?: string;
}

export function RulesPanel({ owner, repo, onClose, prefill }: RulesPanelProps) {
  const [rules, setRules] = useState<ReviewRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRule, setNewRule] = useState(prefill ?? '');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const newRuleRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus and select when opened with a prefill
  useEffect(() => {
    if (prefill && newRuleRef.current) {
      newRuleRef.current.focus();
      newRuleRef.current.select();
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetchRules(owner, repo);
      setRules(res.rules);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [owner, repo]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    if (!newRule.trim() || adding) return;
    setAdding(true);
    try {
      await addRuleApi(owner, repo, newRule.trim());
      setNewRule('');
      await load();
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(ruleId: number) {
    await deleteRuleApi(owner, repo, ruleId);
    await load();
  }

  async function handleSaveEdit(ruleId: number) {
    if (!editText.trim()) return;
    await updateRuleApi(owner, repo, ruleId, editText.trim());
    setEditingId(null);
    await load();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-lg max-h-[80vh] rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <ListNumbers size={18} className="text-[var(--accent)]" />
            <h2 className="text-base font-semibold text-[var(--text-bright)]">Review Rules</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-secondary)]">{owner}/{repo}</span>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Rules list */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {loading ? (
            <div className="text-center text-sm text-[var(--text-secondary)] py-8">Loading rules...</div>
          ) : rules.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-[var(--text-secondary)] mb-1">No review rules configured</p>
              <p className="text-xs text-[var(--text-secondary)]/60">Rules guide the AI analysis — add rules for patterns, conventions, or areas to watch.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <div key={rule.id} className="group flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors">
                  <span className="flex-shrink-0 w-6 h-6 rounded bg-[var(--accent)]/10 text-[var(--accent)] text-xs font-semibold flex items-center justify-center mt-0.5">
                    {rule.ruleNumber}
                  </span>
                  {editingId === rule.id ? (
                    <div className="flex-1 min-w-0">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-md bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] resize-none focus:outline-none focus:border-[var(--accent)]"
                        rows={2}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(rule.id); }
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                      <div className="flex gap-1 mt-1">
                        <button onClick={() => handleSaveEdit(rule.id)} className="text-xs text-[var(--accent)] hover:underline">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-[var(--text-secondary)] hover:underline ml-2">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-[var(--text-primary)] leading-relaxed">{rule.rule}</span>
                      <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditingId(rule.id); setEditText(rule.rule); }}
                          className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
                          title="Edit rule"
                        >
                          <PencilSimple size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(rule.id)}
                          className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-red-400 transition-colors"
                          title="Delete rule"
                        >
                          <Trash size={13} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add rule input */}
        <div className="px-6 py-4 border-t border-[var(--border)]">
          <div className="flex items-start gap-2">
            <textarea
              ref={newRuleRef}
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a review rule..."
              rows={2}
              className="flex-1 px-3 py-2 text-sm rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] resize-none focus:outline-none focus:border-[var(--accent)]"
            />
            <button
              onClick={handleAdd}
              disabled={!newRule.trim() || adding}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              <Plus size={16} weight="bold" />
            </button>
          </div>
          <p className="text-xs text-[var(--text-secondary)]/50 mt-2">
            Rules are applied to all analyses and chats for this repo. The agent will reference rules by number.
          </p>
        </div>
      </div>
    </div>
  );
}
