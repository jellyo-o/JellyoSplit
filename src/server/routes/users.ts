import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../auth/middleware';

const router = Router();

// Middleware to check if user is an ADMIN
const requireAdmin = (req: any, res: any, next: any) => {
  if (req.user && req.user.role === 'ADMIN') {
    return next();
  }
  res.status(403).json({ error: 'Admin access required' });
};

// List all users
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      role: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ users });
});

// Update user role
router.put('/:id/role', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (role !== 'ADMIN' && role !== 'USER') {
    return res.status(400).json({ error: 'Invalid role' });
  }

  // Prevent admin from demoting themselves (optional, but safer)
  if (id === (req.user as any).id && role === 'USER') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
          return res.status(400).json({ error: 'Cannot demote the only admin' });
      }
  }

  const user = await prisma.user.update({
    where: { id: id as string },
    data: { role },
  });

  res.json({ user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role } });
});

export default router;
