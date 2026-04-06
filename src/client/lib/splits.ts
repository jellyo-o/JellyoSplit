/**
 * Computes the effective share each participant owes for a single category.
 *
 * Each adjustment redistributes independently to ALL other participants.
 * This means if A gets -$10 and B gets +$14.60, B still receives part of
 * A's redistribution, and A still receives part of B's redistribution.
 * Adjustments stack and don't interfere with each other.
 */
export interface ShareInfo {
  share: number;
  adjLabel: string | null;
}

export function computeCategoryShares(
  categoryId: string,
  totalAmount: number,
  assignedParticipants: { id: string; adjustments?: any[] }[],
): Record<string, ShareInfo> {
  const count = assignedParticipants.length;
  if (count === 0) return {};
  if (count === 1) {
    const p = assignedParticipants[0];
    return { [p.id]: { share: totalAmount, adjLabel: null } };
  }

  const baseShare = totalAmount / count;

  // Collect each adjustment's diff from base (positive = pays more, negative = pays less)
  const diffs: { pid: string; diff: number; label: string }[] = [];

  for (const p of assignedParticipants) {
    const adj = (p.adjustments ?? []).find((a: any) => a.categoryId === categoryId);
    if (!adj) continue;

    let diff = 0;
    let label = '';

    if (adj.type === 'redistribute_less' || adj.type === 'percentage') {
      diff = -(baseShare * adj.value / 100);
      label = `↓${adj.value}%`;
    } else if (adj.type === 'redistribute_more') {
      diff = baseShare * adj.value / 100;
      label = `↑${adj.value}%`;
    } else if (adj.type === 'fixed_less' || adj.type === 'fixed') {
      diff = -adj.value;
      label = `↓${adj.value}`;
    } else if (adj.type === 'fixed_more') {
      diff = adj.value;
      label = `↑${adj.value}`;
    }

    if (diff !== 0) diffs.push({ pid: p.id, diff, label });
  }

  // Compute final shares: each person gets their own diff applied,
  // plus the opposite of every OTHER person's diff split among (count-1) people
  const result: Record<string, ShareInfo> = {};

  for (const p of assignedParticipants) {
    let share = baseShare;
    let adjLabel: string | null = null;

    for (const d of diffs) {
      if (d.pid === p.id) {
        // Own adjustment
        share += d.diff;
        adjLabel = d.label;
      } else {
        // Absorb redistribution from this other person's adjustment
        share -= d.diff / (count - 1);
      }
    }

    result[p.id] = { share, adjLabel };
  }

  return result;
}
