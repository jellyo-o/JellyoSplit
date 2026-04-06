import { Router } from 'express';
import passport from 'passport';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../auth/middleware';
import { config } from '../config';
import { getStrategyName, isStrategyRegistered } from '../auth/oidc';

const router = Router();

const registerSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  displayName: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
});

router.get('/system-status', async (req, res) => {
  const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
  res.json({ hasAdmin: adminCount > 0 });
});

router.post('/register', async (req, res, next) => {
  try {
    const { username, password, displayName, email } = registerSchema.parse(req.body);

    // Check if registration is enabled
    const regSetting = await prisma.setting.findUnique({ where: { key: 'registrationEnabled' } });
    if (regSetting?.value === 'false') {
      // Allow if no admin exists yet (first user setup)
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount > 0) {
        return res.status(403).json({ error: 'Registration is disabled' });
      }
    }

    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const isFirstUser = await prisma.user.count() === 0;
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        displayName,
        email: email || undefined,
        role: isFirstUser ? 'ADMIN' : 'USER',
      },
    });

    req.login(user, (err) => {
      if (err) return next(err);
      res.json({ user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role } });
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: err.issues });
    }
    next(err);
  }
});

router.post('/login', passport.authenticate('local'), (req, res) => {
  const user = req.user as any;
  res.json({ user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role } });
});

router.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });
});

router.get('/me', requireAuth, (req, res) => {
  const user = req.user as any;
  res.json({ user: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl, role: user.role } });
});

// Legacy OIDC route (backward compat for env var provider)
router.get('/oidc', (req, res, next) => {
  passport.authenticate('oidc')(req, res, next);
});

router.get('/oidc/callback', passport.authenticate('oidc', {
  successRedirect: '/',
  failureRedirect: '/login',
}));

// Provider-specific OIDC routes
router.get('/oidc/:providerId', (req, res, next) => {
  const strategyName = getStrategyName(req.params.providerId);
  if (!isStrategyRegistered(strategyName)) {
    return res.status(404).json({ error: 'OIDC provider not found or not configured' });
  }
  passport.authenticate(strategyName, { scope: 'openid profile email' })(req, res, next);
});

router.get('/oidc/:providerId/callback', (req, res, next) => {
  const strategyName = getStrategyName(req.params.providerId);
  if (!isStrategyRegistered(strategyName)) {
    return res.redirect('/login?error=provider_not_found');
  }
  passport.authenticate(strategyName, {
    successRedirect: '/',
    failureRedirect: '/login?error=oidc_failed',
  })(req, res, next);
});

export default router;
