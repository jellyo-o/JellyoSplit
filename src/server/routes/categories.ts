import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireCollaborator, requireEditor } from '../auth/middleware';
import { emitToGathering } from '../services/realtime';

const router = Router({ mergeParams: true });

const categorySchema = z.object({
  name: z.string().min(1),
  totalAmount: z.number().min(0),
});

const sourceSchema = z.object({
  name: z.string().min(1),
  amount: z.number().min(0),
  note: z.string().optional().nullable(),
});

const reorderSchema = z.object({
  categoryIds: z.array(z.string())
});

// Reorder categories
// Need to define it before /:categoryId so it doesn't match as an ID
router.put('/reorder', requireEditor, async (req, res, next) => {
  try {
    const gatheringId = (req.params.gatheringId || req.params.id || req.body.gatheringId) as string;
    const { categoryIds } = reorderSchema.parse(req.body);

    const categories = await prisma.category.findMany({
      where: { id: { in: categoryIds }, gatheringId }
    });
    if (categories.length !== categoryIds.length) {
      return res.status(400).json({ error: 'Some categories do not belong to this gathering' });
    }

    const updates = categoryIds.map((id, index) =>
      prisma.category.update({
        where: { id },
        data: { sortOrder: index }
      })
    );

    await prisma.$transaction(updates);

    emitToGathering(gatheringId, 'gathering:categories:reordered');
    emitToGathering(gatheringId, 'gathering:updated');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Create
router.post('/', requireEditor, async (req, res, next) => {
  try {
    const gatheringId = (req.params.gatheringId || req.params.id || req.body.gatheringId) as string;
    const { name, totalAmount } = categorySchema.parse(req.body);

    const lastCategory = await prisma.category.findFirst({
      where: { gatheringId },
      orderBy: { sortOrder: 'desc' }
    });

    const category = await prisma.category.create({
      data: {
        gatheringId,
        name,
        totalAmount,
        sortOrder: lastCategory ? lastCategory.sortOrder + 1 : 0
      }
    });

    emitToGathering(gatheringId, 'gathering:category:added', category);
    emitToGathering(gatheringId, 'gathering:updated');
    res.json(category);
  } catch (err) {
    next(err);
  }
});

// List
router.get('/', requireCollaborator, async (req, res, next) => {
  try {
    const gatheringId = (req.params.gatheringId || req.params.id) as string;
    const categories = await prisma.category.findMany({
      where: { gatheringId },
      orderBy: { sortOrder: 'asc' }
    });
    res.json(categories);
  } catch (err) {
    next(err);
  }
});

// Update
router.put('/:categoryId', requireEditor, async (req, res, next) => {
  try {
    const gatheringId = (req.params.gatheringId || req.params.id) as string;
    const categoryId = req.params.categoryId as string;
    const { name, totalAmount } = categorySchema.parse(req.body);

    const existing = await prisma.category.findFirst({
      where: { id: categoryId, gatheringId }
    });
    if (!existing) return res.status(404).json({ error: 'Category not found' });

    const category = await prisma.category.update({
      where: { id: categoryId },
      data: { name, totalAmount }
    });

    emitToGathering(gatheringId, 'gathering:category:updated', category);
    emitToGathering(gatheringId, 'gathering:updated');
    res.json(category);
  } catch (err) {
    next(err);
  }
});

// Delete
router.delete('/:categoryId', requireEditor, async (req, res, next) => {
  try {
    const gatheringId = (req.params.gatheringId || req.params.id) as string;
    const categoryId = req.params.categoryId as string;

    const existing = await prisma.category.findFirst({
      where: { id: categoryId, gatheringId }
    });
    if (!existing) return res.status(404).json({ error: 'Category not found' });

    await prisma.category.delete({
      where: { id: categoryId }
    });

    emitToGathering(gatheringId, 'gathering:category:deleted', { id: categoryId });
    emitToGathering(gatheringId, 'gathering:updated');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// --- Sources ---

router.post('/:categoryId/sources', requireEditor, async (req, res, next) => {
  try {
    const gatheringId = (req.params.gatheringId || req.params.id) as string;
    const categoryId = req.params.categoryId as string;
    const { name, amount, note } = sourceSchema.parse(req.body);

    const category = await prisma.category.findFirst({
      where: { id: categoryId, gatheringId }
    });
    if (!category) return res.status(404).json({ error: 'Category not found' });

    const source = await prisma.categorySource.create({
      data: { categoryId, name, amount, note: note || null },
    });

    emitToGathering(gatheringId, 'gathering:updated');
    res.json(source);
  } catch (err) {
    next(err);
  }
});

router.put('/:categoryId/sources/:sourceId', requireEditor, async (req, res, next) => {
  try {
    const gatheringId = (req.params.gatheringId || req.params.id) as string;
    const sourceId = req.params.sourceId as string;
    const { name, amount, note } = sourceSchema.parse(req.body);

    const existing = await prisma.categorySource.findFirst({
      where: { id: sourceId, category: { gatheringId } }
    });
    if (!existing) return res.status(404).json({ error: 'Source not found' });

    const source = await prisma.categorySource.update({
      where: { id: sourceId },
      data: { name, amount, note: note || null },
    });

    emitToGathering(gatheringId, 'gathering:updated');
    res.json(source);
  } catch (err) {
    next(err);
  }
});

router.delete('/:categoryId/sources/:sourceId', requireEditor, async (req, res, next) => {
  try {
    const gatheringId = (req.params.gatheringId || req.params.id) as string;
    const sourceId = req.params.sourceId as string;

    const existing = await prisma.categorySource.findFirst({
      where: { id: sourceId, category: { gatheringId } }
    });
    if (!existing) return res.status(404).json({ error: 'Source not found' });

    await prisma.categorySource.delete({ where: { id: sourceId } });

    emitToGathering(gatheringId, 'gathering:updated');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
