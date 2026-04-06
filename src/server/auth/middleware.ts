import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return next(new AppError('Unauthorized', 401));
  }
  next();
};

export const requireOwner = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return next(new AppError('Unauthorized', 401));
    }

    const userId = (req.user as any).id;
    const gatheringId = (req.params.gatheringId || req.params.id) as string;

    if (!gatheringId) {
      return next(new AppError('Gathering ID not provided', 400));
    }

    const gathering = await prisma.gathering.findUnique({
      where: { id: gatheringId },
    });

    if (!gathering) {
      return next(new AppError('Gathering not found', 404));
    }

    if (gathering.ownerId !== userId) {
      return next(new AppError('Forbidden: Must be owner', 403));
    }

    next();
  } catch (err) {
    next(err);
  }
};

export const requireCollaborator = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return next(new AppError('Unauthorized', 401));
    }

    const userId = (req.user as any).id;
    const gatheringId = (req.params.gatheringId || req.params.id) as string;

    if (!gatheringId) {
      return next(new AppError('Gathering ID not provided', 400));
    }

    const gathering = await prisma.gathering.findUnique({
      where: { id: gatheringId },
    });

    if (!gathering) {
      return next(new AppError('Gathering not found', 404));
    }

    if (gathering.ownerId === userId) {
      return next();
    }

    const collab = await prisma.gatheringCollaborator.findUnique({
      where: {
        gatheringId_userId: { gatheringId, userId }
      }
    });

    if (!collab) {
      return next(new AppError('Forbidden', 403));
    }

    next();
  } catch (err) {
    next(err);
  }
};

export const requireEditor = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return next(new AppError('Unauthorized', 401));
    }

    const userId = (req.user as any).id;
    const gatheringId = (req.params.gatheringId || req.params.id) as string;

    if (!gatheringId) {
      return next(new AppError('Gathering ID not provided', 400));
    }

    const gathering = await prisma.gathering.findUnique({
      where: { id: gatheringId },
    });

    if (!gathering) {
      return next(new AppError('Gathering not found', 404));
    }

    if (gathering.ownerId === userId) {
      return next();
    }

    const collab = await prisma.gatheringCollaborator.findUnique({
      where: {
        gatheringId_userId: { gatheringId, userId }
      }
    });

    if (!collab || collab.role !== 'editor') {
      return next(new AppError('Forbidden: Must be editor', 403));
    }

    next();
  } catch (err) {
    next(err);
  }
};
