import { Router, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../auth/middleware';
import { config } from '../config';
import { getStrategyName, isStrategyRegistered } from '../auth/oidc';
import { safeRedirectTarget } from '../lib/safeRedirect';

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

// Wrap res.redirect so the session (containing OIDC state/nonce/code_verifier)
// is fully persisted to the store BEFORE the browser follows the 302 to the
// IdP. Without this, an async store like connect-pg-simple can race the
// redirect, causing `did not find expected authorization request details in
// session, req.session["oidc:<host>"] is undefined` on the callback.
function saveSessionBeforeRedirect(req: any, res: any, next: any) {
  const origRedirect = res.redirect.bind(res);
  res.redirect = (...args: any[]) => {
    req.session.save((err: any) => {
      if (err) return next(err);
      origRedirect(...args);
    });
  };
  next();
}

// Capture and validate `?next=` so we can redirect the user back to the URL
// they originally requested (e.g. /gathering/join/<shareCode>) after the OIDC
// round-trip. Always validated server-side to prevent open-redirect — the
// client could be tricked into sending an attacker-controlled value.
function captureNextParam(req: Request, _res: Response, next: NextFunction) {
  const raw = typeof req.query.next === 'string' ? req.query.next : null;
  const safe = safeRedirectTarget(raw);
  // Store on the session so it survives the OIDC round-trip; clear any
  // previously-stored value so a stale one can't leak across attempts.
  (req.session as any).postLoginRedirect = safe || undefined;
  next();
}

// Consume the stashed redirect target on the callback. Re-validate as a
// belt-and-suspenders check in case the session got tampered with.
function consumePostLoginRedirect(req: Request): string {
  const stored = (req.session as any).postLoginRedirect;
  delete (req.session as any).postLoginRedirect;
  return safeRedirectTarget(stored) ?? '/';
}

function oidcCallback(strategyName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate(strategyName, (err: any, user: any) => {
      if (err) return next(err);
      if (!user) return res.redirect('/login?error=oidc_failed');
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        return res.redirect(consumePostLoginRedirect(req));
      });
    })(req, res, next);
  };
}

// Legacy OIDC route (backward compat for env var provider)
router.get('/oidc', captureNextParam, saveSessionBeforeRedirect, (req, res, next) => {
  passport.authenticate('oidc', { scope: 'openid profile email' })(req, res, next);
});

router.get('/oidc/callback', oidcCallback('oidc'));

// Provider-specific OIDC routes
router.get('/oidc/:providerId', captureNextParam, saveSessionBeforeRedirect, (req, res, next) => {
  const strategyName = getStrategyName(req.params.providerId as string);
  if (!isStrategyRegistered(strategyName)) {
    return res.status(404).json({ error: 'OIDC provider not found or not configured' });
  }
  passport.authenticate(strategyName, { scope: 'openid profile email' })(req, res, next);
});

router.get('/oidc/:providerId/callback', (req, res, next) => {
  const strategyName = getStrategyName(req.params.providerId as string);
  if (!isStrategyRegistered(strategyName)) {
    return res.redirect('/login?error=provider_not_found');
  }
  oidcCallback(strategyName)(req, res, next);
});

export default router;
