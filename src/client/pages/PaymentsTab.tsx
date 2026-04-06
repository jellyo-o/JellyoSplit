import React, { useState, useMemo } from 'react';
import { Pencil, Check, X, Trash2 } from 'lucide-react';
import { useGatheringContext } from '../context/GatheringContext';
import { fetchApi } from '../lib/api';
import { cn } from '../lib/utils';
import { computeCategoryShares } from '../lib/splits';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Participant, Category } from '../hooks/useGathering';
import { useSessionState } from '../hooks/useSessionState';

function getAssignedParticipants(category: Category, allParticipants: Participant[]): Participant[] {
  return allParticipants.filter((p) =>
    p.categoryAssignments?.some((a: any) => a.categoryId === category.id) ||
    category.participants?.some((cp: any) => cp.participantId === p.id)
  );
}

export default function PaymentsTab() {
  const { gathering, optimistic } = useGatheringContext();
  const sk = `payments:${gathering.id}`;
  const [participantId, setParticipantId] = useSessionState(`${sk}:pid`, '');
  const [categoryId, setCategoryId] = useSessionState(`${sk}:cid`, '');
  const [amount, setAmount] = useSessionState(`${sk}:amount`, '');
  const [note, setNote] = useSessionState(`${sk}:note`, '');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPid, setEditPid] = useState('');
  const [editCid, setEditCid] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote] = useState('');

  const addPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!participantId || !amount) return;
    const parsedAmount = parseFloat(amount);
    const catId = categoryId || null;
    const paymentNote = note || null;
    const tempId = `_temp_${Date.now()}`;

    setAmount('');
    setNote('');

    optimistic(
      (prev) => ({
        ...prev,
        payments: [
          {
            id: tempId,
            participantId,
            categoryId: catId,
            amount: parsedAmount,
            note: paymentNote,
            paidById: null,
            createdAt: new Date().toISOString(),
          },
          ...prev.payments,
        ],
      }),
      () => fetchApi(`/gatherings/${gathering.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({ participantId, categoryId: catId, amount: parsedAmount, note: paymentNote }),
      })
    );
  };

  const deletePayment = (paymentId: string) => {
    optimistic(
      (prev) => ({ ...prev, payments: prev.payments.filter((p) => p.id !== paymentId) }),
      () => fetchApi(`/gatherings/${gathering.id}/payments/${paymentId}`, { method: 'DELETE' })
    );
  };

  const startEdit = (p: any) => {
    setEditingId(p.id);
    setEditPid(p.participantId);
    setEditCid(p.categoryId || '');
    setEditAmount(p.amount.toString());
    setEditNote(p.note || '');
  };

  const saveEdit = () => {
    if (!editingId || !editPid || !editAmount) return;
    const parsedAmount = parseFloat(editAmount);
    if (isNaN(parsedAmount)) return;
    const catId = editCid || null;
    const paymentNote = editNote || null;
    const id = editingId;
    setEditingId(null);

    optimistic(
      (prev) => ({
        ...prev,
        payments: prev.payments.map((p) =>
          p.id === id ? { ...p, participantId: editPid, categoryId: catId, amount: parsedAmount, note: paymentNote } : p
        ),
      }),
      () => fetchApi(`/gatherings/${gathering.id}/payments/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ participantId: editPid, categoryId: catId, amount: parsedAmount, note: paymentNote }),
      })
    );
  };

  const cancelEdit = () => setEditingId(null);

  // Compute unaccounted amounts
  const summary = useMemo(() => {
    let totalExpenses = 0;
    let totalPaid = 0;

    for (const cat of gathering.categories) {
      totalExpenses += cat.totalAmount;
    }

    for (const pay of gathering.payments) {
      totalPaid += pay.amount;
    }

    // Pre-compute shares for all categories
    const allShares: Record<string, Record<string, { share: number }>> = {};
    for (const cat of gathering.categories) {
      const assigned = getAssignedParticipants(cat, gathering.participants);
      allShares[cat.id] = computeCategoryShares(cat.id, cat.totalAmount, assigned);
    }

    // Per-participant: what they owe vs what they paid
    const perParticipantBase = gathering.participants.map((p) => {
      let owed = 0;
      for (const cat of gathering.categories) {
        const si = allShares[cat.id]?.[p.id];
        if (si) owed += si.share;
      }

      const paid = gathering.payments
        .filter((pay) => pay.participantId === p.id)
        .reduce((sum, pay) => sum + pay.amount, 0);

      return { participant: p, owed, paid, balance: paid - owed };
    });

    // Overall adjustments — each redistributes independently to all others
    const owedCount = perParticipantBase.filter(p => p.owed > 0.01).length;
    if (owedCount > 1) {
      // Snapshot base owed before any overall adjustments
      const baseOwed = perParticipantBase.map(p => p.owed);
      for (let i = 0; i < perParticipantBase.length; i++) {
        const p = perParticipantBase[i].participant;
        for (const adj of p.adjustments?.filter((a: any) => a.categoryId === null) ?? []) {
          let diff = 0; // positive = pays more
          if (adj.type === 'redistribute_less' || adj.type === 'percentage') {
            diff = -(baseOwed[i] * adj.value / 100);
          } else if (adj.type === 'redistribute_more') {
            diff = baseOwed[i] * adj.value / 100;
          } else if (adj.type === 'fixed_less' || adj.type === 'fixed') {
            diff = -adj.value;
          } else if (adj.type === 'fixed_more') {
            diff = adj.value;
          }
          if (Math.abs(diff) < 0.001) continue;

          perParticipantBase[i] = { ...perParticipantBase[i], owed: perParticipantBase[i].owed + diff };
          const redistEach = -diff / (owedCount - 1);
          for (let j = 0; j < perParticipantBase.length; j++) {
            if (j !== i && baseOwed[j] > 0.01) {
              perParticipantBase[j] = { ...perParticipantBase[j], owed: perParticipantBase[j].owed + redistEach };
            }
          }
        }
      }
      // Recompute balances
      for (let i = 0; i < perParticipantBase.length; i++) {
        perParticipantBase[i] = { ...perParticipantBase[i], balance: perParticipantBase[i].paid - perParticipantBase[i].owed };
      }
    }
    const perParticipant = perParticipantBase;

    return { totalExpenses, totalPaid, unaccounted: totalExpenses - totalPaid, perParticipant };
  }, [gathering]);

  return (
    <div className="space-y-8">
      {/* Record payment form */}
      <section className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Record Payment</h2>
        <form onSubmit={addPayment} className="flex flex-col gap-4">
          <div className="flex gap-4">
            <select
              className="flex-1 rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
              value={participantId}
              onChange={e => setParticipantId(e.target.value)}
              required
            >
              <option value="">Who paid?</option>
              {gathering.participants.map(p => (
                <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>
              ))}
            </select>
            <select
              className="flex-1 rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
            >
              <option value="">Overall (No specific category)</option>
              {gathering.categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-4">
            <Input
              type="number"
              step="0.01"
              placeholder={`Amount (${gathering.currency})`}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              required
            />
            <Input
              className="flex-1"
              placeholder="Note (optional)"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
            <Button type="submit">Record</Button>
          </div>
        </form>
      </section>

      {/* Unaccounted summary */}
      <section className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Payment Tracker</h2>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center p-3 rounded-xl bg-gray-50 dark:bg-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Total Expenses</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{gathering.currency} {summary.totalExpenses.toFixed(2)}</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-gray-50 dark:bg-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Total Paid</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{gathering.currency} {summary.totalPaid.toFixed(2)}</p>
          </div>
          <div className={cn(
            "text-center p-3 rounded-xl",
            summary.unaccounted > 0.01
              ? "bg-amber-50 dark:bg-amber-900/20"
              : summary.unaccounted < -0.01
                ? "bg-red-50 dark:bg-red-900/20"
                : "bg-green-50 dark:bg-green-900/20"
          )}>
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              {summary.unaccounted > 0.01 ? 'Still Owed' : summary.unaccounted < -0.01 ? 'Overpaid' : 'Status'}
            </p>
            <p className={cn(
              "text-lg font-bold",
              summary.unaccounted > 0.01
                ? "text-amber-700 dark:text-amber-400"
                : summary.unaccounted < -0.01
                  ? "text-red-700 dark:text-red-400"
                  : "text-green-700 dark:text-green-400"
            )}>
              {Math.abs(summary.unaccounted) < 0.01
                ? 'Fully Paid'
                : `${gathering.currency} ${Math.abs(summary.unaccounted).toFixed(2)}`}
            </p>
          </div>
        </div>

        {/* Per-participant breakdown */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200 dark:border-gray-600">
                <th className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400">Participant</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400">Owes</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400">Paid</th>
                <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400">Balance</th>
              </tr>
            </thead>
            <tbody>
              {summary.perParticipant.map(({ participant: pt, owed, paid, balance }) => (
                (owed > 0.01 || paid > 0.01) && (
                  <tr key={pt.id} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="px-3 py-2">
                      <span>{pt.emoji} {pt.name}</span>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">
                      {gathering.currency} {owed.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">
                      {paid > 0 ? `${gathering.currency} ${paid.toFixed(2)}` : <span className="text-gray-300 dark:text-gray-600">&mdash;</span>}
                    </td>
                    <td className={cn(
                      "px-3 py-2 text-right font-bold",
                      balance > 0.01 ? "text-green-600 dark:text-green-400"
                        : balance < -0.01 ? "text-red-600 dark:text-red-400"
                        : "text-gray-400 dark:text-gray-500"
                    )}>
                      {balance > 0.01
                        ? `+${gathering.currency} ${balance.toFixed(2)}`
                        : balance < -0.01
                          ? `${gathering.currency} ${balance.toFixed(2)}`
                          : 'Settled'}
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Payment history */}
      <section className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Payment History</h2>
        <div className="space-y-3">
          {gathering.payments.map(p => {
            const participant = gathering.participants.find(pt => pt.id === p.participantId);
            const category = p.categoryId ? gathering.categories.find(c => c.id === p.categoryId) : null;

            if (editingId === p.id) {
              return (
                <div key={p.id} className="bg-gray-50 dark:bg-gray-700 px-4 py-3 rounded-xl border-2 border-primary-400 dark:border-primary-600 space-y-3">
                  <div className="flex gap-3">
                    <select
                      className="flex-1 rounded-lg border border-gray-200 dark:border-gray-600 px-2 py-1.5 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 cursor-pointer"
                      value={editPid}
                      onChange={e => setEditPid(e.target.value)}
                    >
                      {gathering.participants.map(pt => (
                        <option key={pt.id} value={pt.id}>{pt.emoji} {pt.name}</option>
                      ))}
                    </select>
                    <select
                      className="flex-1 rounded-lg border border-gray-200 dark:border-gray-600 px-2 py-1.5 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 cursor-pointer"
                      value={editCid}
                      onChange={e => setEditCid(e.target.value)}
                    >
                      <option value="">Overall</option>
                      {gathering.categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-3 items-center">
                    <Input
                      type="number"
                      step="0.01"
                      value={editAmount}
                      onChange={e => setEditAmount(e.target.value)}
                      className="w-32"
                    />
                    <Input
                      value={editNote}
                      onChange={e => setEditNote(e.target.value)}
                      placeholder="Note"
                      className="flex-1"
                    />
                    <button onClick={saveEdit} className="text-green-600 dark:text-green-400 cursor-pointer p-1">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={cancelEdit} className="text-gray-400 cursor-pointer p-1">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div key={p.id} className="group flex items-center justify-between bg-gray-50 dark:bg-gray-700 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600">
                <div>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{participant?.name || 'Unknown'}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                    paid for {category ? category.name : 'overall'}
                  </span>
                  {p.note && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{p.note}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900 dark:text-gray-100">
                    {gathering.currency} {p.amount.toFixed(2)}
                  </span>
                  <button
                    onClick={() => startEdit(p)}
                    className="text-gray-300 dark:text-gray-500 hover:text-primary-500 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity p-1"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deletePayment(p.id)}
                    className="text-gray-300 dark:text-gray-500 hover:text-red-500 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity p-1"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
          {gathering.payments.length === 0 && (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No payments recorded yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
