import { Server, Socket } from 'socket.io';
import { RequestHandler } from 'express';
import { prisma } from '../lib/prisma';

let ioInstance: Server | null = null;

export function setupRealtime(io: Server, sessionMiddleware: RequestHandler) {
  ioInstance = io;
  // Use session middleware in socket.io
  io.engine.use(sessionMiddleware as any);

  io.on('connection', (socket: Socket) => {
    const req = socket.request as any;
    const userId = req.session?.passport?.user;

    if (!userId) {
      socket.disconnect();
      return;
    }

    socket.on('join_gathering', async (gatheringId: string) => {
      try {
        const gathering = await prisma.gathering.findUnique({
          where: { id: gatheringId },
        });
        if (!gathering) return;

        if (gathering.ownerId !== userId) {
          const collab = await prisma.gatheringCollaborator.findUnique({
            where: { gatheringId_userId: { gatheringId, userId } },
          });
          if (!collab) return;
        }

        const room = `gathering:${gatheringId}`;
        socket.join(room);
      } catch {
        // Silently fail - don't expose errors to the client
      }
    });

    socket.on('leave_gathering', (gatheringId: string) => {
      const room = `gathering:${gatheringId}`;
      socket.leave(room);
    });
  });
}

export function emitToGathering(gatheringId: string, event: string, data?: any) {
  if (ioInstance) {
    ioInstance.to(`gathering:${gatheringId}`).emit(event, data);
  }
}
