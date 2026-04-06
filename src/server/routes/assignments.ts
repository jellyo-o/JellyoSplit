import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireCollaborator, requireEditor } from '../auth/middleware';
import { emitToGathering } from '../services/realtime';

const router = Router({ mergeParams: true });

const toggleAssignmentSchema = z.object({
  categoryId: z.string(),
  participantId: z.string(),
  assigned: z.boolean(),
});

const bulkAssignSchema = z.object({
  categoryId: z.string(),
  participantIds: z.array(z.string()),
});

// Get assignments for a category or gathering
router.get('/', requireCollaborator, async (req, res, next) => {
  try {
    const gatheringId = (req.params.gatheringId || req.params.id) as string;
    const assignments = await prisma.categoryParticipant.findMany({
      where: {
        category: {
          gatheringId
        }
      }
    });
    res.json(assignments);
  } catch (err) {
    next(err);
  }
});

// Toggle single assignment
router.post('/toggle', requireEditor, async (req, res, next) => {
  try {
    const gatheringId = (req.params.gatheringId || req.params.id || req.body.gatheringId) as string;
    const { categoryId, participantId, assigned } = toggleAssignmentSchema.parse(req.body);

    const category = await prisma.category.findFirst({
      where: { id: categoryId, gatheringId }
    });
    if (!category) return res.status(404).json({ error: 'Category not found' });

    const participant = await prisma.participant.findFirst({
      where: { id: participantId, gatheringId }
    });
    if (!participant) return res.status(404).json({ error: 'Participant not found' });

    if (assigned) {
      await prisma.categoryParticipant.upsert({
        where: { categoryId_participantId: { categoryId, participantId } },
        create: { categoryId, participantId },
        update: {}
      });
    } else {
      await prisma.categoryParticipant.deleteMany({
        where: { categoryId, participantId }
      });
    }

    emitToGathering(gatheringId, 'gathering:updated');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Bulk assign participants to a category
router.post('/bulk', requireEditor, async (req, res, next) => {
  try {
    const gatheringId = (req.params.gatheringId || req.params.id || req.body.gatheringId) as string;
    const { categoryId, participantIds } = bulkAssignSchema.parse(req.body);

    const category = await prisma.category.findFirst({
      where: { id: categoryId, gatheringId }
    });
    if (!category) return res.status(404).json({ error: 'Category not found' });

    if (participantIds.length > 0) {
      const participants = await prisma.participant.findMany({
        where: { id: { in: participantIds }, gatheringId }
      });
      if (participants.length !== participantIds.length) {
        return res.status(400).json({ error: 'Some participants do not belong to this gathering' });
      }
    }

    // Delete existing assignments for this category
    await prisma.categoryParticipant.deleteMany({
      where: { categoryId }
    });

    // Create new assignments
    if (participantIds.length > 0) {
      await prisma.categoryParticipant.createMany({
        data: participantIds.map(participantId => ({
          categoryId,
          participantId
        }))
      });
    }

    emitToGathering(gatheringId, 'gathering:updated');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
