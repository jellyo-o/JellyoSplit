import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireCollaborator, requireEditor } from '../auth/middleware';
import { emitToGathering } from '../services/realtime';

const router = Router({ mergeParams: true });

const paymentSchema = z.object({
  categoryId: z.string().optional().nullable(),
  participantId: z.string(),
  amount: z.number().min(0),
  note: z.string().optional().nullable(),
});

// Create
router.post('/', requireEditor, async (req, res, next) => {
  try {
    const gatheringId = (req.params.gatheringId || req.params.id || req.body.gatheringId) as string;
    const { categoryId, participantId, amount, note } = paymentSchema.parse(req.body);
    const userId = (req.user as any).id;

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

    const payment = await prisma.payment.create({
      data: {
        gatheringId,
        categoryId,
        participantId,
        amount,
        note,
        paidById: userId,
      }
    });

    emitToGathering(gatheringId, 'gathering:payment:added', payment);
    emitToGathering(gatheringId, 'gathering:updated');
    res.json(payment);
  } catch (err) {
    next(err);
  }
});

// List
router.get('/', requireCollaborator, async (req, res, next) => {
  try {
    const gatheringId = (req.params.gatheringId || req.params.id) as string;
    const payments = await prisma.payment.findMany({
      where: { gatheringId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(payments);
  } catch (err) {
    next(err);
  }
});

// Update
router.put('/:paymentId', requireEditor, async (req, res, next) => {
  try {
    const gatheringId = (req.params.gatheringId || req.params.id) as string;
    const paymentId = req.params.paymentId as string;
    const { categoryId, participantId, amount, note } = paymentSchema.parse(req.body);

    const existing = await prisma.payment.findFirst({
      where: { id: paymentId, gatheringId }
    });
    if (!existing) return res.status(404).json({ error: 'Payment not found' });

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

    const payment = await prisma.payment.update({
      where: { id: paymentId },
      data: { categoryId, participantId, amount, note }
    });

    emitToGathering(gatheringId, 'gathering:payment:updated', payment);
    emitToGathering(gatheringId, 'gathering:updated');
    res.json(payment);
  } catch (err) {
    next(err);
  }
});

// Delete
router.delete('/:paymentId', requireEditor, async (req, res, next) => {
  try {
    const gatheringId = (req.params.gatheringId || req.params.id) as string;
    const paymentId = req.params.paymentId as string;

    const existing = await prisma.payment.findFirst({
      where: { id: paymentId, gatheringId }
    });
    if (!existing) return res.status(404).json({ error: 'Payment not found' });

    await prisma.payment.delete({
      where: { id: paymentId }
    });

    emitToGathering(gatheringId, 'gathering:payment:deleted', { id: paymentId });
    emitToGathering(gatheringId, 'gathering:updated');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
