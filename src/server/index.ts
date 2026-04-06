import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import passport from 'passport';
import path from 'path';
import { config } from './config';
import { sessionMiddleware } from './auth/session';
import './auth/local';
import { configureOIDC } from './auth/oidc';
import { setupRealtime } from './services/realtime';

import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import gatheringsRoutes from './routes/gatherings';
import participantsRoutes from './routes/participants';
import categoriesRoutes from './routes/categories';
import assignmentsRoutes from './routes/assignments';
import adjustmentsRoutes from './routes/adjustments';
import paymentsRoutes from './routes/payments';
import settlementRoutes from './routes/settlement';
import settingsRoutes from './routes/settings';
import oidcProvidersRoutes from './routes/oidc-providers';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: config.BASE_URL,
    credentials: true,
  },
});

app.use(cors({
  origin: config.BASE_URL,
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/gatherings', gatheringsRoutes);
app.use('/api/gatherings/:gatheringId/participants', participantsRoutes);
app.use('/api/gatherings/:gatheringId/categories', categoriesRoutes);
app.use('/api/gatherings/:gatheringId/assignments', assignmentsRoutes);
app.use('/api/gatherings/:gatheringId/adjustments', adjustmentsRoutes);
app.use('/api/gatherings/:gatheringId/payments', paymentsRoutes);
app.use('/api/gatherings/:gatheringId/settlement', settlementRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/oidc-providers', oidcProvidersRoutes);

// Serve static files from the React client in production/docker
app.use(express.static(path.join(__dirname, '../../dist/client')));

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../../dist/client/index.html'));
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal Server Error' });
});

// Setup Realtime Socket.IO
setupRealtime(io, sessionMiddleware);

async function start() {
  await configureOIDC();

  httpServer.listen(config.PORT, () => {
    console.log(`Server is running on port ${config.PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
