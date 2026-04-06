import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireCollaborator, requireEditor } from '../auth/middleware';
import { emitToGathering } from '../services/realtime';

const router = Router({ mergeParams: true }); // to access :gatheringId if mounted under /gatherings/:gatheringId

const participantSchema = z.object({
  name: z.string().min(1),
  emoji: z.string().optional().nullable(),
});

// Create
router.post('/', requireEditor, async (req, res, next) => {
  try {
    const gatheringId = (req.params.gatheringId || req.params.id || req.body.gatheringId) as string;
    const { name, emoji } = participantSchema.parse(req.body);

    const participant = await prisma.participant.create({
      data: {
        gatheringId,
        name,
        emoji,
      }
    });

    emitToGathering(gatheringId, 'gathering:participant:added', participant);
    emitToGathering(gatheringId, 'gathering:updated');
    res.json(participant);
  } catch (err) {
    next(err);
  }
});

// List
router.get('/', requireCollaborator, async (req, res, next) => {
  try {
    const gatheringId = (req.params.gatheringId || req.params.id) as string;
    const participants = await prisma.participant.findMany({
      where: { gatheringId },
      orderBy: { createdAt: 'asc' }
    });
    res.json(participants);
  } catch (err) {
    next(err);
  }
});

// Update
router.put('/:participantId', requireEditor, async (req, res, next) => {
  try {
    const gatheringId = (req.params.gatheringId || req.params.id) as string;
    const participantId = req.params.participantId as string;
    const { name, emoji } = participantSchema.parse(req.body);

    const existing = await prisma.participant.findFirst({
      where: { id: participantId, gatheringId }
    });
    if (!existing) return res.status(404).json({ error: 'Participant not found' });

    const participant = await prisma.participant.update({
      where: { id: participantId },
      data: { name, emoji }
    });

    emitToGathering(gatheringId, 'gathering:participant:updated', participant);
    emitToGathering(gatheringId, 'gathering:updated');
    res.json(participant);
  } catch (err) {
    next(err);
  }
});

// Delete
router.delete('/:participantId', requireEditor, async (req, res, next) => {
  try {
    const gatheringId = (req.params.gatheringId || req.params.id) as string;
    const participantId = req.params.participantId as string;

    const existing = await prisma.participant.findFirst({
      where: { id: participantId, gatheringId }
    });
    if (!existing) return res.status(404).json({ error: 'Participant not found' });

    await prisma.participant.delete({
      where: { id: participantId }
    });

    emitToGathering(gatheringId, 'gathering:participant:deleted', { id: participantId });
    emitToGathering(gatheringId, 'gathering:updated');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
