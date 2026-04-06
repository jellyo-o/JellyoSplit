import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireCollaborator, requireEditor, requireOwner } from '../auth/middleware';
import { emitToGathering } from '../services/realtime';
import { computeSettlement } from '../services/settlement';

const router = Router({ mergeParams: true });

// Compute settlement
router.get('/compute', requireCollaborator, async (req, res, next) => {
  try {
    const gatheringId = (req.params.gatheringId || req.params.id) as string;
    const transactions = await computeSettlement(gatheringId);
    res.json({ transactions });
  } catch (err) {
    next(err);
  }
});

// Mark as settled
router.post('/markSettled', requireEditor, async (req, res, next) => {
  try {
    const gatheringId = (req.params.gatheringId || req.params.id) as string;
    
    const gathering = await prisma.gathering.update({
      where: { id: gatheringId },
      data: { status: 'settled' }
    });

    emitToGathering(gatheringId, 'gathering:updated', gathering);
    res.json({ success: true, gathering });
  } catch (err) {
    next(err);
  }
});

export default router;
