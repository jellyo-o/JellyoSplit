import { prisma } from '../lib/prisma';

export interface SettlementTransaction {
  fromParticipantId: string;
  toParticipantId: string;
  amount: number;
}

export async function computeSettlement(gatheringId: string): Promise<SettlementTransaction[]> {
  const gathering = await prisma.gathering.findUnique({
    where: { id: gatheringId },
    include: {
      participants: {
        include: {
          categoryAssignments: true,
          adjustments: true,
          payments: true,
        }
      },
      categories: {
        include: {
          participants: true,
          adjustments: true,
        }
      },
      payments: true,
    }
  });

  if (!gathering) throw new Error('Gathering not found');

  const balances: Record<string, number> = {};
  for (const p of gathering.participants) {
    balances[p.id] = 0;
  }

  // Calculate each participant's fair share per category
  for (const category of gathering.categories) {
    let categoryTotal = category.totalAmount;
    
    if (category.participants.length > 0) {
      let splitCount = category.participants.length;
      let splitAmount = categoryTotal / splitCount;

      for (const cp of category.participants) {
        balances[cp.participantId] -= splitAmount;
      }

      // Each adjustment redistributes independently to ALL other participants.
      for (const adj of category.adjustments) {
        let diff = 0; // positive = pays more, negative = pays less
        if (adj.type === 'redistribute_less' || adj.type === 'percentage') {
          diff = -(splitAmount * adj.value / 100);
        } else if (adj.type === 'redistribute_more') {
          diff = splitAmount * adj.value / 100;
        } else if (adj.type === 'fixed_less' || adj.type === 'fixed') {
          diff = -adj.value;
        } else if (adj.type === 'fixed_more') {
          diff = adj.value;
        }
        if (Math.abs(diff) < 0.001) continue;

        // Apply diff to the adjusted person
        balances[adj.participantId] -= diff; // diff>0 means pays more → balance goes down
        // Redistribute opposite among all others
        const redistEach = diff / (splitCount - 1);
        for (const cp of category.participants) {
          if (cp.participantId !== adj.participantId) {
            balances[cp.participantId] += redistEach;
          }
        }
      }
    }
  }

  // Overall adjustments — each redistributes independently to all others
  const balancesBeforeOverall: Record<string, number> = { ...balances };
  const participantCount = gathering.participants.length;

  if (participantCount > 1) {
    for (const p of gathering.participants) {
      for (const adj of p.adjustments.filter(a => a.categoryId === null)) {
        const base = Math.abs(balancesBeforeOverall[p.id]);
        let diff = 0; // positive = pays more
        if (adj.type === 'redistribute_less' || adj.type === 'percentage') {
          diff = -(base * adj.value / 100);
        } else if (adj.type === 'redistribute_more') {
          diff = base * adj.value / 100;
        } else if (adj.type === 'fixed_less' || adj.type === 'fixed') {
          diff = -adj.value;
        } else if (adj.type === 'fixed_more') {
          diff = adj.value;
        }
        if (Math.abs(diff) < 0.001) continue;

        balances[p.id] -= diff;
        const redistEach = diff / (participantCount - 1);
        for (const other of gathering.participants) {
          if (other.id !== p.id) {
            balances[other.id] += redistEach;
          }
        }
      }
    }
  }

  // Payments
  for (const payment of gathering.payments) {
    balances[payment.participantId] += payment.amount;
  }

  // Simplify debts
  const debtors = Object.keys(balances).filter(id => balances[id] < -0.01).map(id => ({ id, amount: -balances[id] })).sort((a, b) => b.amount - a.amount);
  const creditors = Object.keys(balances).filter(id => balances[id] > 0.01).map(id => ({ id, amount: balances[id] })).sort((a, b) => b.amount - a.amount);

  const transactions: SettlementTransaction[] = [];

  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const amount = Math.min(debtor.amount, creditor.amount);

    transactions.push({
      fromParticipantId: debtor.id,
      toParticipantId: creditor.id,
      amount: parseFloat(amount.toFixed(2)),
    });

    debtor.amount -= amount;
    creditor.amount -= amount;

    if (debtor.amount < 0.01) i++;
    if (creditor.amount < 0.01) j++;
  }

  return transactions;
}
