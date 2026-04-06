import { useState, useMemo } from 'react';
import { DndContext, DragEndEvent, DragOverlay, useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { UserPlus, Users, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { Participant, Category } from '../hooks/useGathering';
import { useGatheringContext } from '../context/GatheringContext';
import { fetchApi } from '../lib/api';
import { cn } from '../lib/utils';
import { computeCategoryShares } from '../lib/splits';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { useSessionState } from '../hooks/useSessionState';

/* ---------- helpers ---------- */

function getAssignedParticipants(category: Category, allParticipants: Participant[]): Participant[] {
  return allParticipants.filter((p) =>
    p.categoryAssignments?.some((a: any) => a.categoryId === category.id) ||
    category.participants?.some((cp: any) => cp.participantId === p.id)
  );
}

/* ---------- DraggableParticipant ---------- */

function DraggableParticipant({ participant }: { participant: Participant }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `draggable-${participant.id}`,
    data: { participant }
  });

  const style = { transform: CSS.Translate.toString(transform) };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "flex items-center gap-2 bg-white dark:bg-gray-800 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm cursor-grab active:cursor-grabbing select-none",
        isDragging && "opacity-50"
      )}
    >
      <span className="text-lg">{participant.emoji}</span>
      <span className="font-medium text-gray-700 dark:text-gray-300 text-sm">{participant.name}</span>
    </div>
  );
}

/* ---------- AvatarStack ---------- */

function AvatarStack({ participants, max = 8, onClick }: { participants: Participant[]; max?: number; onClick?: () => void }) {
  const shown = participants.slice(0, max);
  const overflow = participants.length - max;

  return (
    <button
      onClick={onClick}
      className="flex items-center cursor-pointer group"
      type="button"
    >
      <div className="flex -space-x-1.5">
        {shown.map((p) => (
          <span
            key={p.id}
            className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-600 border-2 border-white dark:border-gray-800 text-xs group-hover:ring-1 group-hover:ring-primary-300 transition-all"
            title={p.name}
          >
            {p.emoji || p.name[0].toUpperCase()}
          </span>
        ))}
      </div>
      {overflow > 0 && (
        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 font-medium group-hover:text-primary-500 transition-colors">
          +{overflow}
        </span>
      )}
    </button>
  );
}

/* ---------- MassAssignModal ---------- */

function MassAssignModal({ category, onClose }: { category: Category; onClose: () => void }) {
  const { gathering, optimistic } = useGatheringContext();

  const currentlyAssigned = new Set(
    category.participants?.map((cp: any) => cp.participantId) ?? []
  );
  for (const p of gathering.participants) {
    if (p.categoryAssignments?.some((a: any) => a.categoryId === category.id)) {
      currentlyAssigned.add(p.id);
    }
  }

  const [selected, setSelected] = useState<Set<string>>(new Set(currentlyAssigned));

  const toggle = (pid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(gathering.participants.map((p) => p.id)));
  const selectNone = () => setSelected(new Set());

  const save = () => {
    const ids = Array.from(selected);
    onClose();

    optimistic(
      (prev) => ({
        ...prev,
        categories: prev.categories.map((c) =>
          c.id === category.id
            ? { ...c, participants: ids.map((pid) => ({ id: `_t_${pid}`, categoryId: category.id, participantId: pid })) }
            : c
        ),
        participants: prev.participants.map((p) => {
          const wasAssigned = p.categoryAssignments.some((a: any) => a.categoryId === category.id);
          const nowAssigned = selected.has(p.id);
          if (wasAssigned === nowAssigned) return p;
          if (nowAssigned) {
            return { ...p, categoryAssignments: [...p.categoryAssignments, { id: `_t_${p.id}`, categoryId: category.id, participantId: p.id }] };
          }
          return { ...p, categoryAssignments: p.categoryAssignments.filter((a: any) => a.categoryId !== category.id) };
        }),
      }),
      () => fetchApi(`/gatherings/${gathering.id}/assignments/bulk`, {
        method: 'POST',
        body: JSON.stringify({ categoryId: category.id, participantIds: ids }),
      })
    );
  };

  const changed =
    selected.size !== currentlyAssigned.size ||
    Array.from(selected).some((id) => !currentlyAssigned.has(id));

  return (
    <Modal isOpen onClose={onClose} title={`Assign to ${category.name}`}>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Select participants to include in this expense.
      </p>

      <div className="flex gap-2 mb-3">
        <button onClick={selectAll} className="text-xs text-primary-600 dark:text-primary-400 hover:underline cursor-pointer">
          Select all
        </button>
        <span className="text-xs text-gray-300 dark:text-gray-600">|</span>
        <button onClick={selectNone} className="text-xs text-primary-600 dark:text-primary-400 hover:underline cursor-pointer">
          Clear
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto space-y-1 mb-6">
        {gathering.participants.map((p) => (
          <label
            key={p.id}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-colors",
              selected.has(p.id)
                ? "bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700"
                : "hover:bg-gray-50 dark:hover:bg-gray-700 border border-transparent"
            )}
          >
            <input
              type="checkbox"
              checked={selected.has(p.id)}
              onChange={() => toggle(p.id)}
              className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 cursor-pointer"
            />
            {p.emoji && <span className="text-lg">{p.emoji}</span>}
            <span className="font-medium text-sm text-gray-700 dark:text-gray-300">{p.name}</span>
          </label>
        ))}
      </div>

      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {selected.size} of {gathering.participants.length} selected
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={!changed}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- CategoryDetailModal ---------- */

function CategoryDetailModal({
  category,
  onClose,
  onRemove,
  onAddAdjustment,
  onRemoveAdjustment,
}: {
  category: Category;
  onClose: () => void;
  onRemove: (cid: string, pid: string) => void;
  onAddAdjustment: (cid: string, pid: string) => void;
  onRemoveAdjustment: (adjId: string) => void;
}) {
  const { gathering } = useGatheringContext();
  const assigned = getAssignedParticipants(category, gathering.participants);
  const perPerson = assigned.length > 0 ? category.totalAmount / assigned.length : 0;
  const sources: any[] = category.sources ?? [];
  const shares = computeCategoryShares(category.id, category.totalAmount, assigned);

  return (
    <Modal isOpen onClose={onClose} title={category.name} className="max-w-lg">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {assigned.length} participant{assigned.length !== 1 ? 's' : ''} &middot; {gathering.currency} {perPerson.toFixed(2)} base
        </p>
        <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
          {gathering.currency} {category.totalAmount.toFixed(2)}
        </span>
      </div>

      {/* Sources breakdown */}
      {sources.length > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Breakdown</p>
          <div className="space-y-1">
            {sources.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-300">{s.name}</span>
                <span className="text-gray-500 dark:text-gray-400">{gathering.currency} {s.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="max-h-80 overflow-y-auto space-y-1">
        {assigned.map((p) => {
          const si = shares[p.id];
          const share = si?.share ?? perPerson;
          const adjLabel = si?.adjLabel;
          const adj = p.adjustments?.find((a: any) => a.categoryId === category.id);
          return (
            <div
              key={p.id}
              className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-100 dark:border-gray-600"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{p.emoji}</span>
                <span className="font-medium text-sm text-gray-700 dark:text-gray-300">{p.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {gathering.currency} {share.toFixed(2)}
                </span>
                {adj && adjLabel && (
                  <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 px-1.5 py-0.5 rounded-md inline-flex items-center gap-1">
                    {adjLabel}
                    <button
                      onClick={() => onRemoveAdjustment(adj.id)}
                      className="hover:text-red-600 dark:hover:text-red-400 font-bold cursor-pointer leading-none"
                      title="Remove adjustment"
                    >
                      &times;
                    </button>
                  </span>
                )}
                {!adj && (
                  <button
                    onClick={() => onAddAdjustment(category.id, p.id)}
                    className="text-xs text-blue-500 hover:underline cursor-pointer"
                  >
                    Adj
                  </button>
                )}
                <button
                  onClick={() => onRemove(category.id, p.id)}
                  className="text-gray-400 hover:text-red-500 font-bold cursor-pointer"
                >
                  &times;
                </button>
              </div>
            </div>
          );
        })}
        {assigned.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
            No participants assigned yet.
          </p>
        )}
      </div>
    </Modal>
  );
}

/* ---------- CompactCategoryCard ---------- */

function CompactCategoryCard({
  category,
  onViewDetails,
  onMassAssign,
}: {
  category: Category;
  onViewDetails: (category: Category) => void;
  onMassAssign: (category: Category) => void;
}) {
  const { gathering } = useGatheringContext();
  const { isOver, setNodeRef } = useDroppable({
    id: `droppable-${category.id}`,
    data: { category },
  });

  const assigned = getAssignedParticipants(category, gathering.participants);
  const perPerson = assigned.length > 0 ? category.totalAmount / assigned.length : 0;
  const adjustmentCount = assigned.reduce(
    (acc, p) => acc + (p.adjustments?.some((a: any) => a.categoryId === category.id) ? 1 : 0),
    0
  );
  const sourceCount = category.sources?.length ?? 0;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "p-4 rounded-2xl border-2 transition-colors flex flex-col gap-3",
        isOver
          ? "bg-primary-50 dark:bg-primary-900/20 border-primary-400 dark:border-primary-600"
          : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm"
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-900 dark:text-gray-100 truncate">{category.name}</h3>
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400 flex-shrink-0 ml-2">
          {gathering.currency} {category.totalAmount.toFixed(2)}
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {assigned.length} {assigned.length === 1 ? 'person' : 'people'}
          </span>
          {assigned.length > 0 && (
            <span>{gathering.currency} {perPerson.toFixed(2)}/person</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {sourceCount > 0 && (
            <span className="text-gray-400 dark:text-gray-500">
              {sourceCount} item{sourceCount !== 1 ? 's' : ''}
            </span>
          )}
          {adjustmentCount > 0 && (
            <span className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 px-2 py-0.5 rounded-md">
              {adjustmentCount} adj
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        {assigned.length > 0 ? (
          <AvatarStack participants={assigned} onClick={() => onViewDetails(category)} />
        ) : (
          <span
            className="text-xs text-gray-400 dark:text-gray-500 border border-dashed border-gray-300 dark:border-gray-600 px-3 py-1.5 rounded-lg cursor-pointer hover:border-primary-300 hover:text-primary-500 transition-colors"
            onClick={() => onMassAssign(category)}
          >
            Drop or click to assign
          </span>
        )}
        <div className="flex items-center gap-1">
          {assigned.length > 0 && (
            <button
              onClick={() => onViewDetails(category)}
              className="text-gray-400 hover:text-primary-500 cursor-pointer p-1"
              title="View participants"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => onMassAssign(category)}
            className="text-gray-400 hover:text-primary-500 cursor-pointer p-1"
            title="Assign participants"
          >
            <UserPlus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- SpendingOverview ---------- */

function SpendingOverview({ onAddOverallAdjustment, onRemoveAdjustment }: { onAddOverallAdjustment: (pid: string) => void; onRemoveAdjustment: (adjId: string) => void }) {
  const { gathering } = useGatheringContext();
  const [showOverview, setShowOverview] = useSessionState(`split:${gathering.id}:showOverview`, true);

  const stats = useMemo(() => {
    // Pre-compute shares for all categories
    const allShares: Record<string, Record<string, { share: number }>> = {};
    for (const cat of gathering.categories) {
      const assigned = getAssignedParticipants(cat, gathering.participants);
      allShares[cat.id] = computeCategoryShares(cat.id, cat.totalAmount, assigned);
    }

    return gathering.participants.map((p) => {
      let totalOwed = 0;
      const catNames: string[] = [];

      for (const cat of gathering.categories) {
        const si = allShares[cat.id]?.[p.id];
        if (si) {
          totalOwed += si.share;
          catNames.push(cat.name);
        }
      }

      // Overall adjustments are all handled in the second-pass redistribute
      const overallAdjs = p.adjustments?.filter((a: any) => a.categoryId === null) ?? [];

      return {
        participant: p,
        categoryCount: catNames.length,
        categoryNames: catNames,
        totalOwed,
        overallAdjLabel: null as string | null,
        overallAdjId: overallAdjs.length > 0 ? overallAdjs[0].id as string : null as string | null,
        hasOverallAdj: overallAdjs.length > 0,
      };
    });
  }, [gathering]);

  // Second pass: handle overall redistribute across all participants
  const finalStats = useMemo(() => {
    // Check if any participant has overall redistribute adjustments
    // Collect ALL overall adjustments
    const adjEntries: { idx: number; type: string; value: number; adjId: string }[] = [];
    for (let i = 0; i < stats.length; i++) {
      const p = stats[i].participant;
      for (const adj of p.adjustments?.filter((a: any) => a.categoryId === null) ?? []) {
        adjEntries.push({ idx: i, type: adj.type, value: adj.value, adjId: adj.id });
      }
    }

    if (adjEntries.length === 0) return stats;

    const result = stats.map((s) => ({ ...s }));
    const totalCount = result.filter(s => s.categoryCount > 0).length;
    if (totalCount <= 1) return result;

    // Each adjustment redistributes independently to ALL others
    for (const { idx, type, value, adjId } of adjEntries) {
      const baseOwed = stats[idx].totalOwed; // always use pre-adjustment base
      let diff = 0; // positive = pays more
      let label = '';
      if (type === 'redistribute_less' || type === 'percentage') {
        diff = -(baseOwed * value / 100);
        label = `↓${value}%`;
      } else if (type === 'redistribute_more') {
        diff = baseOwed * value / 100;
        label = `↑${value}%`;
      } else if (type === 'fixed_less' || type === 'fixed') {
        diff = -value;
        label = `↓${value}`;
      } else if (type === 'fixed_more') {
        diff = value;
        label = `↑${value}`;
      }

      // Apply to the adjusted person
      result[idx] = { ...result[idx], totalOwed: result[idx].totalOwed + diff, overallAdjLabel: label, overallAdjId: adjId, hasOverallAdj: true };

      // Redistribute opposite to all others with categories
      const redistEach = -diff / (totalCount - 1);
      for (let i = 0; i < result.length; i++) {
        if (i !== idx && result[i].categoryCount > 0) {
          result[i] = { ...result[i], totalOwed: result[i].totalOwed + redistEach };
        }
      }
    }

    return result;
  }, [stats]);

  if (gathering.participants.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <button
        onClick={() => setShowOverview(!showOverview)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
        type="button"
      >
        <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Spending Overview</span>
        {showOverview ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {showOverview && (
        <div className="overflow-x-auto border-t border-gray-100 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/30">
                <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400">Participant</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400">Categories</th>
                <th className="text-right px-4 py-2 font-medium text-gray-500 dark:text-gray-400">Share</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {finalStats.map(({ participant: pt, categoryCount, categoryNames, totalOwed, overallAdjLabel, overallAdjId, hasOverallAdj }) => (
                <tr key={pt.id} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span>{pt.emoji}</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{pt.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400" title={categoryNames.join(', ')}>
                    {categoryCount > 0
                      ? categoryNames.length <= 2
                        ? categoryNames.join(', ')
                        : `${categoryCount} categories`
                      : <span className="text-gray-300 dark:text-gray-600">&mdash;</span>}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-900 dark:text-gray-100">
                    <div className="flex items-center justify-end gap-2">
                      {overallAdjLabel && overallAdjId && (
                        <span className="text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 px-1.5 py-0.5 rounded-md inline-flex items-center gap-1">
                          {overallAdjLabel}
                          <button
                            onClick={() => onRemoveAdjustment(overallAdjId)}
                            className="hover:text-red-600 dark:hover:text-red-400 font-bold cursor-pointer leading-none"
                            title="Remove adjustment"
                          >
                            &times;
                          </button>
                        </span>
                      )}
                      {totalOwed > 0 ? `${gathering.currency} ${totalOwed.toFixed(2)}` : <span className="text-gray-300 dark:text-gray-600">&mdash;</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!hasOverallAdj && categoryCount > 0 && (
                      <button
                        onClick={() => onAddOverallAdjustment(pt.id)}
                        className="text-xs text-blue-500 hover:underline cursor-pointer"
                      >
                        Adj
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------- SplitTab (main) ---------- */

export default function SplitTab() {
  const { gathering, optimistic } = useGatheringContext();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [adjustmentModal, setAdjustmentModal] = useState<{ cid: string | null; pid: string } | null>(null);
  const [adjType, setAdjType] = useState<'fixed' | 'percentage'>('percentage');
  const [adjDirection, setAdjDirection] = useState<'less' | 'more'>('less');
  const [adjValue, setAdjValue] = useState('');
  const [massAssignCategory, setMassAssignCategory] = useState<Category | null>(null);
  const [detailCategory, setDetailCategory] = useState<Category | null>(null);

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (over && over.id.toString().startsWith('droppable-')) {
      const categoryId = over.id.toString().replace('droppable-', '');
      const participantId = active.id.toString().replace('draggable-', '');
      optimistic(
        (prev) => ({
          ...prev,
          categories: prev.categories.map((c) =>
            c.id === categoryId
              ? { ...c, participants: [...c.participants, { id: `_t_${Date.now()}`, categoryId, participantId }] }
              : c
          ),
        }),
        () =>
          fetchApi(`/gatherings/${gathering.id}/assignments/toggle`, {
            method: 'POST',
            body: JSON.stringify({ categoryId, participantId, assigned: true }),
          })
      );
    }
  };

  const removeAssignment = (categoryId: string, participantId: string) => {
    optimistic(
      (prev) => ({
        ...prev,
        categories: prev.categories.map((c) =>
          c.id === categoryId
            ? { ...c, participants: c.participants.filter((cp: any) => cp.participantId !== participantId) }
            : c
        ),
        participants: prev.participants.map((p) =>
          p.id === participantId
            ? { ...p, categoryAssignments: p.categoryAssignments.filter((a: any) => a.categoryId !== categoryId) }
            : p
        ),
      }),
      () =>
        fetchApi(`/gatherings/${gathering.id}/assignments/toggle`, {
          method: 'POST',
          body: JSON.stringify({ categoryId, participantId, assigned: false }),
        })
    );
  };

  const removeAdjustment = (adjId: string) => {
    optimistic(
      (prev) => ({
        ...prev,
        participants: prev.participants.map((p) => ({
          ...p,
          adjustments: p.adjustments.filter((a: any) => a.id !== adjId),
        })),
      }),
      () => fetchApi(`/gatherings/${gathering.id}/adjustments/${adjId}`, { method: 'DELETE' })
    );
  };

  const saveAdjustment = () => {
    if (!adjustmentModal || !adjValue) return;
    const { cid, pid } = adjustmentModal;
    const type = adjType === 'percentage' ? `redistribute_${adjDirection}` : `fixed_${adjDirection}`;
    const value = parseFloat(adjValue);
    setAdjustmentModal(null);
    setAdjValue('');
    optimistic(
      (prev) => ({
        ...prev,
        participants: prev.participants.map((p) =>
          p.id === pid
            ? {
                ...p,
                adjustments: [
                  ...p.adjustments,
                  { id: `_t_${Date.now()}`, categoryId: cid, participantId: pid, type, value },
                ],
              }
            : p
        ),
      }),
      () =>
        fetchApi(`/gatherings/${gathering.id}/adjustments`, {
          method: 'POST',
          body: JSON.stringify({ categoryId: cid, participantId: pid, type, value, reason: 'Adjustment' }),
        })
    );
  };

  const activeParticipant = activeId
    ? gathering.participants.find((p) => `draggable-${p.id}` === activeId)
    : null;

  // Keep detail modal in sync with live gathering data
  const currentDetailCategory = detailCategory
    ? gathering.categories.find((c) => c.id === detailCategory.id) ?? null
    : null;

  return (
    <DndContext onDragStart={(e) => setActiveId(e.active.id as string)} onDragEnd={handleDragEnd}>
      <div className="flex flex-col md:flex-row gap-6 h-full">
        {/* Left: Participant Pool */}
        <div className="md:w-56 flex-shrink-0 bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
          <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
            Participants
          </h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
            Drag to a category, or use <UserPlus className="w-3 h-3 inline" /> to assign.
          </p>
          <div className="flex flex-col gap-2 overflow-y-auto">
            {gathering.participants.map((p) => (
              <DraggableParticipant key={p.id} participant={p} />
            ))}
          </div>
        </div>

        {/* Right: Overview + Categories */}
        <div className="flex-1 flex flex-col gap-4">
          <SpendingOverview
            onAddOverallAdjustment={(pid) => setAdjustmentModal({ cid: null, pid })}
            onRemoveAdjustment={removeAdjustment}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {gathering.categories.map((c) => (
              <CompactCategoryCard
                key={c.id}
                category={c}
                onViewDetails={(cat) => setDetailCategory(cat)}
                onMassAssign={(cat) => setMassAssignCategory(cat)}
              />
            ))}
            {gathering.categories.length === 0 && (
              <div className="col-span-full p-8 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
                No categories created yet. Go to the Setup tab.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeParticipant ? (
          <div className="flex items-center gap-2 bg-white dark:bg-gray-800 px-3 py-2 rounded-xl border-2 border-primary-500 shadow-xl opacity-90">
            <span className="text-lg">{activeParticipant.emoji}</span>
            <span className="font-medium text-gray-700 dark:text-gray-300 text-sm">{activeParticipant.name}</span>
          </div>
        ) : null}
      </DragOverlay>

      {/* Mass Assign Modal */}
      {massAssignCategory && (
        <MassAssignModal
          category={massAssignCategory}
          onClose={() => setMassAssignCategory(null)}
        />
      )}

      {/* Category Detail Modal */}
      {currentDetailCategory && (
        <CategoryDetailModal
          category={currentDetailCategory}
          onClose={() => setDetailCategory(null)}
          onRemove={removeAssignment}
          onAddAdjustment={(cid, pid) => {
            setDetailCategory(null);
            setAdjustmentModal({ cid, pid });
          }}
          onRemoveAdjustment={removeAdjustment}
        />
      )}

      {/* Adjustment Modal */}
      {adjustmentModal && (
        <Modal isOpen onClose={() => setAdjustmentModal(null)} title={adjustmentModal.cid ? 'Category Adjustment' : 'Overall Adjustment'}>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            The difference is automatically redistributed among everyone else.
          </p>
          <div className="flex gap-2 mb-4">
            <Button size="sm" variant={adjDirection === 'less' ? 'primary' : 'outline'} onClick={() => setAdjDirection('less')}>
              Pays Less
            </Button>
            <Button size="sm" variant={adjDirection === 'more' ? 'primary' : 'outline'} onClick={() => setAdjDirection('more')}>
              Pays More
            </Button>
          </div>
          <div className="flex gap-2 mb-4">
            <Button size="sm" variant={adjType === 'percentage' ? 'primary' : 'outline'} onClick={() => setAdjType('percentage')}>
              Percent (%)
            </Button>
            <Button size="sm" variant={adjType === 'fixed' ? 'primary' : 'outline'} onClick={() => setAdjType('fixed')}>
              Fixed ($)
            </Button>
          </div>
          <Input
            type="number"
            value={adjValue}
            onChange={(e) => setAdjValue(e.target.value)}
            placeholder={adjType === 'fixed' ? 'Amount' : 'Percentage'}
            className="mb-6"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAdjustmentModal(null)}>
              Cancel
            </Button>
            <Button onClick={saveAdjustment}>Save</Button>
          </div>
        </Modal>
      )}
    </DndContext>
  );
}
