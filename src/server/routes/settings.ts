import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../auth/middleware';

const router = Router();

const SETTING_DEFAULTS: Record<string, string> = {
  registrationEnabled: 'true',
  defaultCurrency: 'SGD',
  appName: 'GatherSplit',
  oidcDisplayName: 'Sign in with SSO',
  authMode: 'local',
  oidcAutoProvision: 'true',
};

const requireAdmin = (req: any, res: any, next: any) => {
  if (req.user && req.user.role === 'ADMIN') {
    return next();
  }
  res.status(403).json({ error: 'Admin access required' });
};

// AUTH_MODE in env (when set) is the source of truth, since it's what actually
// drives strategy registration in `configureOIDC`. The DB row is only the
// fallback when env is unset, otherwise the UI and the backend can disagree
// (e.g. login page hides the SSO button while OIDC strategies are live).
const authModeFromEnv = (): string | null => {
  const raw = process.env.AUTH_MODE?.toLowerCase();
  return raw === 'local' || raw === 'oidc' || raw === 'both' ? raw : null;
};

// Get all settings (admin only for full settings, public subset for everyone)
router.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const dbSettings = await prisma.setting.findMany();
    const settings: Record<string, string> = { ...SETTING_DEFAULTS };
    for (const s of dbSettings) {
      settings[s.key] = s.value;
    }
    const envAuthMode = authModeFromEnv();
    if (envAuthMode) settings.authMode = envAuthMode;
    res.json({ settings, authModeManagedByEnv: envAuthMode !== null });
  } catch (err) {
    next(err);
  }
});

// Get public settings (no auth required - needed for login/register pages)
router.get('/public', async (req, res, next) => {
  try {
    const dbSettings = await prisma.setting.findMany({
      where: {
        key: { in: ['registrationEnabled', 'appName', 'oidcDisplayName', 'authMode'] },
      },
    });
    const settings: Record<string, string> = {
      registrationEnabled: SETTING_DEFAULTS.registrationEnabled,
      appName: SETTING_DEFAULTS.appName,
      oidcDisplayName: SETTING_DEFAULTS.oidcDisplayName,
      authMode: SETTING_DEFAULTS.authMode,
    };
    for (const s of dbSettings) {
      settings[s.key] = s.value;
    }
    const envAuthMode = authModeFromEnv();
    if (envAuthMode) settings.authMode = envAuthMode;
    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

const updateSettingsSchema = z.record(z.string(), z.string());

// Update settings (admin only)
router.put('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const updates = updateSettingsSchema.parse(req.body);
    const allowedKeys = Object.keys(SETTING_DEFAULTS);

    for (const [key, value] of Object.entries(updates)) {
      if (!allowedKeys.includes(key)) continue;
      await prisma.setting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    }

    const dbSettings = await prisma.setting.findMany();
    const settings: Record<string, string> = { ...SETTING_DEFAULTS };
    for (const s of dbSettings) {
      settings[s.key] = s.value;
    }
    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

export default router;
