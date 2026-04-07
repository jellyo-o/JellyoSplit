import { useEffect, useState, useCallback } from 'react';
import { Check } from 'lucide-react';
import { useGatheringContext } from '../context/GatheringContext';
import { fetchApi } from '../lib/api';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/Button';

interface Transaction {
  fromParticipantId: string;
  toParticipantId: string;
  amount: number;
}

function txKey(gatheringId: string, tx: Transaction) {
  return `${gatheringId}:${tx.fromParticipantId}:${tx.toParticipantId}`;
}

export default function SettleTab() {
  const { gathering, optimistic, canEdit } = useGatheringContext();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [settledTxs, setSettledTxs] = useState<Set<string>>(new Set());

  // Load persisted settled state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`settled:${gathering.id}`);
      if (stored) setSettledTxs(new Set(JSON.parse(stored)));
    } catch {}
  }, [gathering.id]);

  const persistSettled = useCallback((next: Set<string>) => {
    setSettledTxs(next);
    localStorage.setItem(`settled:${gathering.id}`, JSON.stringify([...next]));
  }, [gathering.id]);

  useEffect(() => {
    async function loadSettlement() {
      try {
        const data = await fetchApi(`/gatherings/${gathering.id}/settlement/compute`);
        setTransactions(data.transactions);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadSettlement();
  }, [gathering.id, gathering.payments, gathering.participants, gathering.categories]);

  const markAsSettled = () => {
    optimistic(
      (prev) => ({ ...prev, status: 'settled' }),
      () => fetchApi(`/gatherings/${gathering.id}/settlement/markSettled`, { method: 'POST' })
    );
  };

  const undoSettle = () => {
    optimistic(
      (prev) => ({ ...prev, status: 'active' }),
      () => fetchApi(`/gatherings/${gathering.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: gathering.name, status: 'active' }),
      })
    );
  };

  const toggleTx = (tx: Transaction) => {
    const key = txKey(gathering.id, tx);
    const next = new Set(settledTxs);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    persistSettled(next);
  };

  const markAllSettled = () => {
    const next = new Set(settledTxs);
    for (const tx of transactions) next.add(txKey(gathering.id, tx));
    persistSettled(next);
  };

  const clearAllSettled = () => {
    persistSettled(new Set());
  };

  const getParticipantName = (id: string) => {
    const p = gathering.participants.find(pt => pt.id === id);
    return p ? `${p.emoji || ''} ${p.name}` : 'Unknown';
  };

  if (loading) {
    return <div className="p-6 text-gray-500 dark:text-gray-400">Computing settlement...</div>;
  }

  const settledCount = transactions.filter(tx => settledTxs.has(txKey(gathering.id, tx))).length;
  const allSettled = settledCount === transactions.length && transactions.length > 0;

  return (
    <div className="space-y-8">
      <section className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Settlement Plan</h2>
            {transactions.length > 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {settledCount} of {transactions.length} settled
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {gathering.status !== 'settled' && transactions.length > 0 && (
              <>
                {!allSettled && (
                  <Button size="sm" variant="outline" onClick={markAllSettled}>
                    Mark All Paid
                  </Button>
                )}
                {settledCount > 0 && (
                  <Button size="sm" variant="ghost" onClick={clearAllSettled}>
                    Reset
                  </Button>
                )}
                {allSettled && canEdit && (
                  <Button onClick={markAsSettled} className="bg-green-600 hover:bg-green-700 text-white">
                    Finalize Settlement
                  </Button>
                )}
              </>
            )}
            {gathering.status === 'settled' && (
              <div className="flex items-center gap-2">
                <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 px-3 py-1 rounded-full text-sm font-bold">
                  Settled
                </span>
                {canEdit && (
                  <Button size="sm" variant="ghost" onClick={undoSettle}>
                    Undo
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {transactions.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">Everyone is settled up! No transactions needed.</p>
          ) : (
            transactions.map((tx, idx) => {
              const key = txKey(gathering.id, tx);
              const isSettled = settledTxs.has(key);
              return (
                <div
                  key={idx}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors",
                    isSettled
                      ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800"
                      : "bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600"
                  )}
                >
                  <button
                    onClick={() => toggleTx(tx)}
                    className={cn(
                      "w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors",
                      isSettled
                        ? "bg-green-500 border-green-500 text-white"
                        : "border-gray-300 dark:border-gray-500 hover:border-primary-400"
                    )}
                  >
                    {isSettled && <Check className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 flex items-center justify-between min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={cn("font-medium text-gray-900 dark:text-gray-100 truncate", isSettled && "line-through text-gray-400 dark:text-gray-500")}>
                        {getParticipantName(tx.fromParticipantId)}
                      </span>
                      <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">-&gt;</span>
                      <span className={cn("font-medium text-gray-900 dark:text-gray-100 truncate", isSettled && "line-through text-gray-400 dark:text-gray-500")}>
                        {getParticipantName(tx.toParticipantId)}
                      </span>
                    </div>
                    <span className={cn("font-bold flex-shrink-0 ml-3", isSettled ? "text-green-600 dark:text-green-400" : "text-gray-900 dark:text-gray-100")}>
                      {gathering.currency} {tx.amount.toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
