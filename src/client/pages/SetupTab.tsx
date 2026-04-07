import React, { useState, useRef, useEffect } from 'react';
import { Pencil, Check, X, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useGatheringContext } from '../context/GatheringContext';
import { fetchApi } from '../lib/api';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useSessionState } from '../hooks/useSessionState';

let tempIdCounter = 0;
function tempId() {
  return `_temp_${++tempIdCounter}_${Date.now()}`;
}

function EditableParticipant({ id, name, emoji, onRemove }: {
  id: string;
  name: string;
  emoji?: string | null;
  onRemove: () => void;
}) {
  const { gathering, optimistic, canEdit } = useGatheringContext();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === name) {
      setDraft(name);
      setEditing(false);
      return;
    }
    setEditing(false);
    optimistic(
      (prev) => ({
        ...prev,
        participants: prev.participants.map((p) =>
          p.id === id ? { ...p, name: trimmed } : p
        ),
      }),
      () => fetchApi(`/gatherings/${gathering.id}/participants/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: trimmed, emoji }),
      })
    );
  };

  const cancel = () => {
    setDraft(name);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-700 px-3 py-1.5 rounded-xl border-2 border-primary-400 dark:border-primary-600 animate-[fadeIn_100ms_ease-out]">
        {emoji && <span className="text-xl mr-1">{emoji}</span>}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') cancel();
          }}
          className="bg-transparent outline-none text-sm font-medium text-gray-900 dark:text-gray-100 w-24 min-w-0"
        />
        <button onClick={save} className="text-green-600 dark:text-green-400 cursor-pointer p-0.5">
          <Check className="w-3.5 h-3.5" />
        </button>
        <button onClick={cancel} className="text-gray-400 cursor-pointer p-0.5">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-2 bg-gray-50 dark:bg-gray-700 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 animate-[fadeIn_150ms_ease-out] max-w-full min-w-0">
      {emoji && <span className="text-xl flex-shrink-0">{emoji}</span>}
      <span className="font-medium text-gray-700 dark:text-gray-300 truncate">{name}</span>
      {canEdit && (
        <>
          <button
            onClick={() => setEditing(true)}
            className="text-gray-300 dark:text-gray-500 hover:text-primary-500 dark:hover:text-primary-400 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
            title="Edit name"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={onRemove}
            className="ml-auto text-gray-400 hover:text-red-500 font-bold cursor-pointer"
          >
            &times;
          </button>
        </>
      )}
    </div>
  );
}

function EditableSource({ source, currency, onSave, onRemove }: {
  source: any;
  currency: string;
  onSave: (name: string, amount: number, note: string | null) => void;
  onRemove: () => void;
}) {
  const { canEdit } = useGatheringContext();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(source.name);
  const [draftAmount, setDraftAmount] = useState(source.amount.toString());
  const [draftNote, setDraftNote] = useState(source.note || '');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) nameRef.current?.focus();
  }, [editing]);

  const save = () => {
    const trimmed = draftName.trim();
    const amt = parseFloat(draftAmount);
    if (!trimmed || isNaN(amt)) { cancel(); return; }
    setEditing(false);
    onSave(trimmed, amt, draftNote.trim() || null);
  };

  const cancel = () => {
    setDraftName(source.name);
    setDraftAmount(source.amount.toString());
    setDraftNote(source.note || '');
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700 border-2 border-primary-400 dark:border-primary-600">
        <input
          ref={nameRef}
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
          className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100 min-w-0"
          placeholder="Name"
        />
        <input
          value={draftAmount}
          onChange={(e) => setDraftAmount(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
          type="number"
          step="0.01"
          className="w-20 bg-transparent outline-none text-sm text-gray-500 dark:text-gray-400 text-right"
        />
        <input
          value={draftNote}
          onChange={(e) => setDraftNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
          className="w-24 bg-transparent outline-none text-xs text-gray-400 min-w-0"
          placeholder="Note"
        />
        <button onClick={save} className="text-green-600 dark:text-green-400 cursor-pointer p-0.5 flex-shrink-0">
          <Check className="w-3.5 h-3.5" />
        </button>
        <button onClick={cancel} className="text-gray-400 cursor-pointer p-0.5 flex-shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="group flex items-center justify-between text-sm px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-gray-400 dark:text-gray-500 text-xs">&#8226;</span>
        <span className="text-gray-700 dark:text-gray-300 truncate">{source.name}</span>
        {source.note && <span className="text-xs text-gray-400 truncate">({source.note})</span>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-gray-500 dark:text-gray-400">{currency} {source.amount.toFixed(2)}</span>
        {canEdit && (
          <>
            <button
              onClick={() => setEditing(true)}
              className="text-gray-300 dark:text-gray-500 hover:text-primary-500 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
              title="Edit item"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button onClick={onRemove} className="text-gray-400 hover:text-red-500 cursor-pointer">&times;</button>
          </>
        )}
      </div>
    </div>
  );
}

function EditableCategory({ id, name, totalAmount, currency, onRemove }: {
  id: string;
  name: string;
  totalAmount: number;
  currency: string;
  onRemove: () => void;
}) {
  const { gathering, optimistic, canEdit } = useGatheringContext();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftAmount, setDraftAmount] = useState(totalAmount.toString());
  const nameRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [newSrcName, setNewSrcName] = useState('');
  const [newSrcAmount, setNewSrcAmount] = useState('');

  const category = gathering.categories.find((c) => c.id === id);
  const sources: any[] = category?.sources ?? [];

  useEffect(() => {
    if (editing) nameRef.current?.focus();
  }, [editing]);

  const save = () => {
    const trimmedName = draftName.trim();
    const parsedAmount = parseFloat(draftAmount);
    if (!trimmedName || isNaN(parsedAmount)) {
      cancel();
      return;
    }
    if (trimmedName === name && parsedAmount === totalAmount) {
      setEditing(false);
      return;
    }
    setEditing(false);
    optimistic(
      (prev) => ({
        ...prev,
        categories: prev.categories.map((c) =>
          c.id === id ? { ...c, name: trimmedName, totalAmount: parsedAmount } : c
        ),
      }),
      () => fetchApi(`/gatherings/${gathering.id}/categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: trimmedName, totalAmount: parsedAmount }),
      })
    );
  };

  const cancel = () => {
    setDraftName(name);
    setDraftAmount(totalAmount.toString());
    setEditing(false);
  };

  const addSource = (e: React.FormEvent) => {
    e.preventDefault();
    const sName = newSrcName.trim();
    const sAmount = parseFloat(newSrcAmount);
    if (!sName || isNaN(sAmount)) return;
    setNewSrcName('');
    setNewSrcAmount('');
    const srcId = tempId();
    optimistic(
      (prev) => ({
        ...prev,
        categories: prev.categories.map((c) =>
          c.id === id ? { ...c, sources: [...(c.sources || []), { id: srcId, name: sName, amount: sAmount, note: null }] } : c
        ),
      }),
      () => fetchApi(`/gatherings/${gathering.id}/categories/${id}/sources`, {
        method: 'POST',
        body: JSON.stringify({ name: sName, amount: sAmount }),
      })
    );
  };

  const removeSource = (sourceId: string) => {
    optimistic(
      (prev) => ({
        ...prev,
        categories: prev.categories.map((c) =>
          c.id === id ? { ...c, sources: (c.sources || []).filter((s: any) => s.id !== sourceId) } : c
        ),
      }),
      () => fetchApi(`/gatherings/${gathering.id}/categories/${id}/sources/${sourceId}`, { method: 'DELETE' })
    );
  };

  const sourcesTotal = sources.reduce((s: number, src: any) => s + src.amount, 0);

  if (editing) {
    return (
      <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700 px-4 py-3 rounded-xl border-2 border-primary-400 dark:border-primary-600">
        <div className="flex-1 flex flex-col gap-1">
          <input
            ref={nameRef}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
            className="bg-transparent outline-none text-sm font-medium text-gray-900 dark:text-gray-100"
          />
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">{currency}</span>
            <input
              value={draftAmount}
              onChange={(e) => setDraftAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
              type="number"
              step="0.01"
              className="bg-transparent outline-none text-xs text-gray-500 dark:text-gray-400 w-20"
            />
          </div>
        </div>
        <button onClick={save} className="text-green-600 dark:text-green-400 cursor-pointer p-1">
          <Check className="w-4 h-4" />
        </button>
        <button onClick={cancel} className="text-gray-400 cursor-pointer p-1">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-600 animate-[fadeIn_150ms_ease-out] overflow-hidden">
      {/* Main row */}
      <div className="group flex items-center justify-between bg-gray-50 dark:bg-gray-700 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer flex-shrink-0"
            title={expanded ? 'Collapse breakdown' : 'Expand breakdown'}
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <div className="flex flex-col min-w-0">
            <span className="font-medium text-gray-900 dark:text-gray-100 truncate">{name}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {currency} {totalAmount.toFixed(2)}
              </span>
              {sources.length > 0 && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  ({sources.length} item{sources.length !== 1 ? 's' : ''})
                </span>
              )}
            </div>
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditing(true)}
              className="text-gray-300 dark:text-gray-500 hover:text-primary-500 dark:hover:text-primary-400 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onRemove}
              className="text-gray-400 hover:text-red-500 font-bold cursor-pointer"
            >
              &times;
            </button>
          </div>
        )}
      </div>

      {/* Expanded sources section */}
      {expanded && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 space-y-2">
          {sources.map((s: any) => (
            <EditableSource
              key={s.id}
              source={s}
              currency={currency}
              onSave={(name, amount, note) => {
                optimistic(
                  (prev) => ({
                    ...prev,
                    categories: prev.categories.map((c) =>
                      c.id === id
                        ? { ...c, sources: (c.sources || []).map((src: any) => src.id === s.id ? { ...src, name, amount, note } : src) }
                        : c
                    ),
                  }),
                  () => fetchApi(`/gatherings/${gathering.id}/categories/${id}/sources/${s.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({ name, amount, note }),
                  })
                );
              }}
              onRemove={() => removeSource(s.id)}
            />
          ))}

          {canEdit && (
            <form onSubmit={addSource} className="flex gap-2 items-center">
              <Plus className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <input
                value={newSrcName}
                onChange={(e) => setNewSrcName(e.target.value)}
                placeholder="Item name (e.g. McDonalds)"
                className="flex-1 bg-transparent border-b border-gray-200 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 outline-none py-1 min-w-0"
              />
              <input
                value={newSrcAmount}
                onChange={(e) => setNewSrcAmount(e.target.value)}
                placeholder="Amount"
                type="number"
                step="0.01"
                className="w-24 bg-transparent border-b border-gray-200 dark:border-gray-600 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 outline-none py-1"
              />
              <Button type="submit" size="sm" variant="ghost" className="flex-shrink-0 h-7 px-2 text-xs">Add</Button>
            </form>
          )}

          {sources.length > 0 && (
            <div className={cn(
              "text-xs px-3 py-1.5 rounded-lg flex items-center justify-between",
              Math.abs(sourcesTotal - totalAmount) < 0.01
                ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                : "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
            )}>
              <span>Breakdown total: {currency} {sourcesTotal.toFixed(2)}</span>
              {Math.abs(sourcesTotal - totalAmount) < 0.01
                ? <span>Matches total</span>
                : <span>{currency} {Math.abs(totalAmount - sourcesTotal).toFixed(2)} {sourcesTotal < totalAmount ? 'unaccounted' : 'over'}</span>
              }
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SetupTab() {
  const { gathering, optimistic, canEdit } = useGatheringContext();
  const sk = `setup:${gathering.id}`;
  const [newParticipant, setNewParticipant] = useSessionState(`${sk}:newParticipant`, '');
  const [bulkMode, setBulkMode] = useSessionState(`${sk}:bulkMode`, false);
  const [bulkText, setBulkText] = useSessionState(`${sk}:bulkText`, '');

  const [newCategory, setNewCategory] = useSessionState(`${sk}:newCategory`, '');
  const [newAmount, setNewAmount] = useSessionState(`${sk}:newAmount`, '');
  const [bulkCategoryMode, setBulkCategoryMode] = useSessionState(`${sk}:bulkCatMode`, false);
  const [bulkCategoryText, setBulkCategoryText] = useSessionState(`${sk}:bulkCatText`, '');

  const addParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newParticipant.trim();
    if (!name) return;
    setNewParticipant('');
    const id = tempId();
    optimistic(
      (prev) => ({
        ...prev,
        participants: [...prev.participants, { id, name, emoji: null, categoryAssignments: [], adjustments: [] }],
      }),
      () => fetchApi(`/gatherings/${gathering.id}/participants`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
    );
  };

  const addBulkParticipants = async () => {
    const names = bulkText.split(/[,\n]/).map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return;
    setBulkText('');
    setBulkMode(false);
    const newParticipants = names.map((name) => ({
      id: tempId(), name, emoji: null, categoryAssignments: [] as any[], adjustments: [] as any[],
    }));
    optimistic(
      (prev) => ({ ...prev, participants: [...prev.participants, ...newParticipants] }),
      async () => {
        for (const name of names) {
          await fetchApi(`/gatherings/${gathering.id}/participants`, {
            method: 'POST', body: JSON.stringify({ name }),
          });
        }
      }
    );
  };

  const removeParticipant = (pid: string) => {
    optimistic(
      (prev) => ({ ...prev, participants: prev.participants.filter((p) => p.id !== pid) }),
      () => fetchApi(`/gatherings/${gathering.id}/participants/${pid}`, { method: 'DELETE' })
    );
  };

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCategory.trim();
    const amount = newAmount.trim() ? parseFloat(newAmount) : 0;
    if (!name || isNaN(amount)) return;
    setNewCategory('');
    setNewAmount('');
    const id = tempId();
    optimistic(
      (prev) => ({
        ...prev,
        categories: [
          ...prev.categories,
          { id, name, totalAmount: amount, sortOrder: prev.categories.length, participants: [], adjustments: [], sources: [] },
        ],
      }),
      () => fetchApi(`/gatherings/${gathering.id}/categories`, {
        method: 'POST', body: JSON.stringify({ name, totalAmount: amount }),
      })
    );
  };

  const addBulkCategories = async () => {
    const lines = bulkCategoryText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;
    setBulkCategoryText('');
    setBulkCategoryMode(false);
    const parsed = lines.map((line) => {
      const match = line.match(/^(.+?)[,\s]+(\d+(?:\.\d+)?)$/);
      if (match) return { name: match[1].trim(), amount: parseFloat(match[2]) };
      return { name: line, amount: 0 };
    }).filter((c) => c.name);
    const newCategories = parsed.map((c, i) => ({
      id: tempId(), name: c.name, totalAmount: c.amount,
      sortOrder: gathering.categories.length + i, participants: [] as any[], adjustments: [] as any[], sources: [] as any[],
    }));
    optimistic(
      (prev) => ({ ...prev, categories: [...prev.categories, ...newCategories] }),
      async () => {
        for (const c of parsed) {
          await fetchApi(`/gatherings/${gathering.id}/categories`, {
            method: 'POST', body: JSON.stringify({ name: c.name, totalAmount: c.amount }),
          });
        }
      }
    );
  };

  const removeCategory = (cid: string) => {
    optimistic(
      (prev) => ({ ...prev, categories: prev.categories.filter((c) => c.id !== cid) }),
      () => fetchApi(`/gatherings/${gathering.id}/categories/${cid}`, { method: 'DELETE' })
    );
  };

  return (
    <div className="space-y-8">
      {/* Participants Section */}
      <section className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-x-hidden">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Participants <span className="text-sm font-normal text-gray-400 dark:text-gray-500">({gathering.participants.length})</span></h2>
          {canEdit && (
            <button
              onClick={() => setBulkMode(!bulkMode)}
              className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline cursor-pointer"
            >
              {bulkMode ? 'Single add' : 'Bulk add'}
            </button>
          )}
        </div>

        {canEdit && (bulkMode ? (
          <div className="space-y-3">
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={'Paste names separated by commas or newlines:\nAlice, Bob, Charlie\nDave\nEve'}
              rows={4}
              className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 shadow-sm resize-none"
            />
            <Button onClick={addBulkParticipants} disabled={!bulkText.trim()}>
              Add All
            </Button>
          </div>
        ) : (
          <form onSubmit={addParticipant} className="flex gap-3 mb-6">
            <Input
              className="flex-1"
              value={newParticipant}
              onChange={(e) => setNewParticipant(e.target.value)}
              placeholder="Name (e.g. Alice)"
            />
            <Button type="submit">Add</Button>
          </form>
        ))}

        <div className="flex flex-wrap gap-3 mt-4 overflow-hidden min-w-0">
          {gathering.participants.map((p) => (
            <EditableParticipant
              key={p.id}
              id={p.id}
              name={p.name}
              emoji={p.emoji}
              onRemove={() => removeParticipant(p.id)}
            />
          ))}
          {gathering.participants.length === 0 && (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No participants added yet.</p>
          )}
        </div>
      </section>

      {/* Categories Section */}
      <section className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Categories & Expenses <span className="text-sm font-normal text-gray-400 dark:text-gray-500">({gathering.categories.length})</span></h2>
          {canEdit && (
            <button
              onClick={() => setBulkCategoryMode(!bulkCategoryMode)}
              className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline cursor-pointer"
            >
              {bulkCategoryMode ? 'Single add' : 'Bulk add'}
            </button>
          )}
        </div>

        {canEdit && (bulkCategoryMode ? (
          <div className="space-y-3">
            <textarea
              value={bulkCategoryText}
              onChange={(e) => setBulkCategoryText(e.target.value)}
              placeholder={'One per line, "Name, Amount":\nDrinks, 120\nDinner, 350\nVenue, 200'}
              rows={4}
              className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 shadow-sm resize-none"
            />
            <Button onClick={addBulkCategories} disabled={!bulkCategoryText.trim()}>
              Add All
            </Button>
          </div>
        ) : (
          <form onSubmit={addCategory} className="flex gap-3 mb-6">
            <Input
              className="flex-1"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Expense (e.g. Drinks, Dinner)"
            />
            <Input
              className="w-32"
              type="number"
              step="0.01"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              placeholder={`Amount (${gathering.currency})`}
            />
            <Button type="submit">Add</Button>
          </form>
        ))}

        <div className="space-y-3 mt-4">
          {gathering.categories.map((c) => (
            <EditableCategory
              key={c.id}
              id={c.id}
              name={c.name}
              totalAmount={c.totalAmount}
              currency={gathering.currency}
              onRemove={() => removeCategory(c.id)}
            />
          ))}
          {gathering.categories.length === 0 && (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No expenses added yet.</p>
          )}
          {gathering.categories.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 mt-1">
              <span className="font-semibold text-gray-900 dark:text-gray-100">Total</span>
              <span className="font-bold text-gray-900 dark:text-gray-100">
                {gathering.currency} {gathering.categories.reduce((sum, c) => sum + c.totalAmount, 0).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
