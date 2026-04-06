import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireCollaborator, requireEditor } from '../auth/middleware';
import { emitToGathering } from '../services/realtime';

const router = Router({ mergeParams: true });

const adjustmentSchema = z.object({
  categoryId: z.string().optional().nullable(),
  participantId: z.string(),
  type: z.enum(['percentage', 'fixed', 'redistribute_less', 'redistribute_more', 'fixed_less', 'fixed_more']),
  value: z.number(),
  reason: z.string().optional().nullable(),
});

// Create
router.post('/', requireEditor, async (req, res, next) => {
  try {
    const gatheringId = (req.params.gatheringId || req.params.id || req.body.gatheringId) as string;
    const { categoryId, participantId, type, value, reason } = adjustmentSchema.parse(req.body);

    const participant = await prisma.participant.findFirst({
      where: { id: participantId, gatheringId }
    });
    if (!participant) return res.status(404).json({ error: 'Participant not found' });

    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: categoryId, gatheringId }
      });
      if (!category) return res.status(404).json({ error: 'Category not found' });
    }

    const adjustment = await prisma.adjustment.create({
      data: {
        categoryId,
        participantId,
        type,
        value,
        reason,
      }
    });

    emitToGathering(gatheringId, 'gathering:updated');
    res.json(adjustment);
  } catch (err) {
    next(err);
  }
});

// List
router.get('/', requireCollaborator, async (req, res, next) => {
  try {
    const gatheringId = (req.params.gatheringId || req.params.id) as string;
    // We need to fetch adjustments for participants in this gathering
    const adjustments = await prisma.adjustment.findMany({
      where: {
        participant: {
          gatheringId
        }
      }
    });
    res.json(adjustments);
  } catch (err) {
    next(err);
  }
});

// Update
router.put('/:adjustmentId', requireEditor, async (req, res, next) => {
  try {
    const gatheringId = (req.params.gatheringId || req.params.id) as string;
    const adjustmentId = req.params.adjustmentId as string;

    const existingAdj = await prisma.adjustment.findFirst({
      where: { id: adjustmentId, participant: { gatheringId } }
    });
    if (!existingAdj) return res.status(404).json({ error: 'Adjustment not found' });

    const { categoryId, type, value, reason } = z.object({
      categoryId: z.string().optional().nullable(),
      type: z.enum(['percentage', 'fixed', 'redistribute_less', 'redistribute_more', 'fixed_less', 'fixed_more']),
      value: z.number(),
      reason: z.string().optional().nullable(),
    }).parse(req.body);

    const adjustment = await prisma.adjustment.update({
      where: { id: adjustmentId },
      data: { categoryId, type, value, reason }
    });

    emitToGathering(gatheringId, 'gathering:updated');
    res.json(adjustment);
  } catch (err) {
    next(err);
  }
});

// Delete
router.delete('/:adjustmentId', requireEditor, async (req, res, next) => {
  try {
    const gatheringId = (req.params.gatheringId || req.params.id) as string;
    const adjustmentId = req.params.adjustmentId as string;

    const existing = await prisma.adjustment.findFirst({
      where: { id: adjustmentId, participant: { gatheringId } }
    });
    if (!existing) return res.status(404).json({ error: 'Adjustment not found' });

    await prisma.adjustment.delete({
      where: { id: adjustmentId }
    });

    emitToGathering(gatheringId, 'gathering:updated');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
