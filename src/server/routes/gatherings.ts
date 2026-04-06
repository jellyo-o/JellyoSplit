import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireCollaborator, requireEditor, requireOwner } from '../auth/middleware';
import { emitToGathering } from '../services/realtime';

const router = Router();

const createGatheringSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  date: z.string().optional(),
  currency: z.string().optional(),
});

const updateGatheringSchema = createGatheringSchema.partial().extend({
  status: z.enum(['active', 'settled', 'archived']).optional()
});

// Create
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const data = createGatheringSchema.parse(req.body);
    const userId = (req.user as any).id;

    const gathering = await prisma.gathering.create({
      data: {
        ...data,
        date: data.date ? new Date(data.date) : null,
        ownerId: userId,
        collaborators: {
          create: {
            userId: userId,
            role: 'editor',
          }
        }
      },
      include: {
        collaborators: true,
      }
    });
    
    res.json(gathering);
  } catch (err) {
    next(err);
  }
});

// List
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = (req.user as any).id;
    const gatherings = await prisma.gathering.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { collaborators: { some: { userId } } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { participants: true, collaborators: true } },
        categories: { select: { totalAmount: true } },
      },
    });
    const result = gatherings.map((g) => ({
      ...g,
      participantCount: g._count.participants,
      collaboratorCount: g._count.collaborators,
      totalAmount: g.categories.reduce((sum, c) => sum + c.totalAmount, 0),
      categories: undefined,
      _count: undefined,
    }));
    res.json(result);
  } catch (err) {
    next(err);
  }
});


// Import gathering from JSON
router.post('/import', requireAuth, async (req, res, next) => {
  try {
    const userId = (req.user as any).id;
    const data = req.body;

    if (!data.version || !data.gathering || !data.participants || !data.categories) {
      return res.status(400).json({ error: 'Invalid import file format' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const gathering = await tx.gathering.create({
        data: {
          name: data.gathering.name,
          description: data.gathering.description || null,
          date: data.gathering.date ? new Date(data.gathering.date) : null,
          currency: data.gathering.currency || 'SGD',
          status: 'active',
          ownerId: userId,
          collaborators: { create: { userId, role: 'editor' } },
        },
      });

      const pMap: Record<string, string> = {};
      for (const p of data.participants) {
        const created = await tx.participant.create({
          data: { gatheringId: gathering.id, name: p.name, emoji: p.emoji || null },
        });
        pMap[p._ref] = created.id;
      }

      const cMap: Record<string, string> = {};
      for (const c of data.categories) {
        const created = await tx.category.create({
          data: {
            gatheringId: gathering.id,
            name: c.name,
            totalAmount: c.totalAmount,
            sortOrder: c.sortOrder || 0,
          },
        });
        cMap[c._ref] = created.id;

        // Import sources for this category
        for (const s of c.sources || []) {
          await tx.categorySource.create({
            data: { categoryId: created.id, name: s.name, amount: s.amount, note: s.note || null },
          });
        }
      }

      for (const a of data.assignments || []) {
        const cId = cMap[a.categoryRef];
        const pId = pMap[a.participantRef];
        if (cId && pId) {
          await tx.categoryParticipant.create({ data: { categoryId: cId, participantId: pId } });
        }
      }

      for (const a of data.adjustments || []) {
        const cId = a.categoryRef ? cMap[a.categoryRef] : null;
        const pId = pMap[a.participantRef];
        if (pId) {
          await tx.adjustment.create({
            data: { categoryId: cId, participantId: pId, type: a.type, value: a.value, reason: a.reason || null },
          });
        }
      }

      for (const p of data.payments || []) {
        const cId = p.categoryRef ? cMap[p.categoryRef] : null;
        const pId = pMap[p.participantRef];
        if (pId) {
          await tx.payment.create({
            data: {
              gatheringId: gathering.id,
              categoryId: cId,
              participantId: pId,
              paidById: userId,
              amount: p.amount,
              note: p.note || null,
            },
          });
        }
      }

      return gathering;
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Join via share code.
// The prompt says `/api/join/:shareCode`, so this might be mounted separately, or here as `/join/:shareCode`.
// I will mount it in `gatherings` as `/join/:shareCode` and mount `gatherings` at `/api/gatherings`, 
// or I can create a `/api/join` route in index.ts. Let's put it here as `/join/:shareCode` to group it.
router.post('/join/:shareCode', requireAuth, async (req, res, next) => {
  try {
    const shareCode = req.params.shareCode as string;
    const userId = (req.user as any).id;

    const gathering = await prisma.gathering.findUnique({
      where: { shareCode }
    });

    if (!gathering) return res.status(404).json({ error: 'Gathering not found' });

    if (gathering.ownerId === userId) {
      return res.json(gathering); // already owner
    }

    const collab = await prisma.gatheringCollaborator.upsert({
      where: { gatheringId_userId: { gatheringId: gathering.id, userId } },
      create: { gatheringId: gathering.id, userId, role: 'editor' },
      update: {}
    });

    emitToGathering(gathering.id, 'gathering:collaborator:added', collab);
    emitToGathering(gathering.id, 'gathering:updated');

    res.json(gathering);
  } catch (err) {
    next(err);
  }
});

// Get by ID
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const userId = (req.user as any).id;

    const gathering = await prisma.gathering.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, displayName: true, avatarUrl: true } },
        collaborators: {
          include: { user: { select: { id: true, displayName: true, avatarUrl: true } } }
        },
        participants: {
          include: {
            categoryAssignments: true,
            adjustments: true
          }
        },
        categories: {
          orderBy: { sortOrder: 'asc' },
          include: {
            participants: true,
            adjustments: true,
            sources: true,
          }
        },
        payments: true,
      }
    });

    if (!gathering) return res.status(404).json({ error: 'Not found' });

    const isCollaborator = gathering.collaborators.some(c => c.userId === userId) || gathering.ownerId === userId;
    if (!isCollaborator) return res.status(403).json({ error: 'Forbidden' });

    res.json(gathering);
  } catch (err) {
    next(err);
  }
});

// Export gathering as JSON
router.get('/:id/export', requireAuth, async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const userId = (req.user as any).id;

    const gathering = await prisma.gathering.findUnique({
      where: { id },
      include: {
        participants: { include: { adjustments: true } },
        categories: {
          orderBy: { sortOrder: 'asc' },
          include: { participants: true, sources: true },
        },
        payments: true,
      },
    });

    if (!gathering) return res.status(404).json({ error: 'Not found' });

    const isOwner = gathering.ownerId === userId;
    const collab = await prisma.gatheringCollaborator.findUnique({
      where: { gatheringId_userId: { gatheringId: id, userId } },
    });
    if (!isOwner && !collab) return res.status(403).json({ error: 'Forbidden' });

    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      gathering: {
        name: gathering.name,
        description: gathering.description,
        date: gathering.date?.toISOString() ?? null,
        currency: gathering.currency,
      },
      participants: gathering.participants.map((p) => ({
        _ref: p.id,
        name: p.name,
        emoji: p.emoji,
      })),
      categories: gathering.categories.map((c) => ({
        _ref: c.id,
        name: c.name,
        totalAmount: c.totalAmount,
        sortOrder: c.sortOrder,
        sources: (c as any).sources?.map((s: any) => ({
          name: s.name,
          amount: s.amount,
          note: s.note,
        })) ?? [],
      })),
      assignments: gathering.categories.flatMap((c) =>
        c.participants.map((cp) => ({
          categoryRef: c.id,
          participantRef: cp.participantId,
        }))
      ),
      adjustments: gathering.participants.flatMap((p) =>
        p.adjustments.map((a) => ({
          categoryRef: a.categoryId,
          participantRef: p.id,
          type: a.type,
          value: a.value,
          reason: a.reason,
        }))
      ),
      payments: gathering.payments.map((p) => ({
        categoryRef: p.categoryId,
        participantRef: p.participantId,
        amount: p.amount,
        note: p.note,
      })),
    };

    const safeName = gathering.name.replace(/[^a-zA-Z0-9 ]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_export.json"`);
    res.json(exportData);
  } catch (err) {
    next(err);
  }
});

// Update
router.put('/:id', requireEditor, async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const data = updateGatheringSchema.parse(req.body);

    const gathering = await prisma.gathering.update({
      where: { id },
      data: {
        ...data,
        date: data.date ? new Date(data.date) : undefined,
      }
    });

    emitToGathering(id, 'gathering:updated', gathering);
    res.json(gathering);
  } catch (err) {
    next(err);
  }
});

// Delete
router.delete('/:id', requireOwner, async (req, res, next) => {
  try {
    const id = req.params.id as string;
    await prisma.gathering.delete({ where: { id } });
    emitToGathering(id, 'gathering:deleted');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Regenerate share code
router.post('/:id/shareCode', requireOwner, async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const gathering = await prisma.gathering.update({
      where: { id },
      data: { shareCode: crypto.randomBytes(8).toString('base64url') }
    });
    emitToGathering(id, 'gathering:updated', gathering);
    res.json({ shareCode: gathering.shareCode });
  } catch (err) {
    next(err);
  }
});

// List collaborators
router.get('/:id/collaborators', requireCollaborator, async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const collabs = await prisma.gatheringCollaborator.findMany({
      where: { gatheringId: id },
      include: { user: { select: { id: true, displayName: true, avatarUrl: true } } }
    });
    res.json(collabs);
  } catch (err) {
    next(err);
  }
});

// Change role
router.put('/:id/collaborators/:userId', requireOwner, async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const userId = req.params.userId as string;
    const { role } = z.object({ role: z.enum(['editor', 'viewer']) }).parse(req.body);

    const collab = await prisma.gatheringCollaborator.update({
      where: { gatheringId_userId: { gatheringId: id, userId } },
      data: { role }
    });

    emitToGathering(id, 'gathering:updated');
    res.json(collab);
  } catch (err) {
    next(err);
  }
});

// Remove collaborator
router.delete('/:id/collaborators/:userId', requireOwner, async (req, res, next) => {
  try {
    const id = req.params.id as string;
    const userId = req.params.userId as string;
    await prisma.gatheringCollaborator.delete({
      where: { gatheringId_userId: { gatheringId: id, userId } }
    });

    emitToGathering(id, 'gathering:updated');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
