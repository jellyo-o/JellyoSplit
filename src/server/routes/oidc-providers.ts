import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../auth/middleware';
import { refreshOIDCStrategies } from '../auth/oidc';
import { config } from '../config';

const router = Router();

const requireAdmin = (req: any, res: any, next: any) => {
  if (req.user && req.user.role === 'ADMIN') return next();
  res.status(403).json({ error: 'Admin access required' });
};

export interface OidcProviderConfig {
  id: string;
  name: string;
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  enabled: boolean;
  autoProvision: boolean;
}

async function getProviders(): Promise<OidcProviderConfig[]> {
  const setting = await prisma.setting.findUnique({ where: { key: 'oidcProviders' } });
  if (!setting) return [];
  try {
    return JSON.parse(setting.value);
  } catch {
    return [];
  }
}

async function saveProviders(providers: OidcProviderConfig[]) {
  await prisma.setting.upsert({
    where: { key: 'oidcProviders' },
    create: { key: 'oidcProviders', value: JSON.stringify(providers) },
    update: { value: JSON.stringify(providers) },
  });
}

// Public: list enabled providers (name + id only, for login page)
router.get('/available', async (_req, res, next) => {
  try {
    const providers = await getProviders();
    const available: { id: string; name: string; source: 'database' }[] = providers
      .filter((p) => p.enabled)
      .map((p) => ({ id: p.id, name: p.name, source: 'database' as const }));

    // Include env var provider if configured
    if (config.OIDC_ISSUER && config.OIDC_CLIENT_ID) {
      const envName = await prisma.setting.findUnique({ where: { key: 'oidcDisplayName' } });
      available.unshift({
        id: 'env',
        name: envName?.value || 'Sign in with SSO',
        source: 'database', // use same shape
      });
    }

    res.json({ providers: available });
  } catch (err) {
    next(err);
  }
});

// Admin: list all providers with full details
router.get('/', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const providers = await getProviders();

    // Include env var info
    const envProvider = config.OIDC_ISSUER
      ? {
          id: 'env',
          name: 'Environment Variable Provider',
          issuerUrl: config.OIDC_ISSUER,
          clientId: config.OIDC_CLIENT_ID,
          clientSecret: config.OIDC_CLIENT_SECRET ? '••••••••' : '',
          enabled: config.AUTH_MODE !== 'local',
          autoProvision: true,
          source: 'env' as const,
        }
      : null;

    // Get global auto-provision setting
    const autoProvisionSetting = await prisma.setting.findUnique({ where: { key: 'oidcAutoProvision' } });
    const oidcAutoProvision = autoProvisionSetting?.value !== 'false';

    res.json({
      providers: providers.map((p) => ({ ...p, clientSecret: '••••••••', source: 'database' })),
      envProvider,
      oidcAutoProvision,
    });
  } catch (err) {
    next(err);
  }
});

const providerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  issuerUrl: z.string().url('Must be a valid URL'),
  clientId: z.string().min(1, 'Client ID is required'),
  clientSecret: z.string().min(1, 'Client Secret is required'),
  enabled: z.boolean().default(true),
  autoProvision: z.boolean().default(true),
});

// Admin: add provider
router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const data = providerSchema.parse(req.body);
    const providers = await getProviders();

    const newProvider: OidcProviderConfig = {
      id: crypto.randomBytes(8).toString('base64url'),
      ...data,
    };

    providers.push(newProvider);
    await saveProviders(providers);

    // Re-register passport strategies
    await refreshOIDCStrategies();

    res.json({ provider: { ...newProvider, clientSecret: '••••••••', source: 'database' } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: err.issues });
    }
    next(err);
  }
});

// Admin: update provider
router.put('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = providerSchema.partial().parse(req.body);
    const providers = await getProviders();

    const idx = providers.findIndex((p) => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Provider not found' });

    // If clientSecret is the masked value, keep the original
    if (data.clientSecret === '••••••••') {
      delete data.clientSecret;
    }

    providers[idx] = { ...providers[idx], ...data };
    await saveProviders(providers);

    await refreshOIDCStrategies();

    res.json({ provider: { ...providers[idx], clientSecret: '••••••••', source: 'database' } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: err.issues });
    }
    next(err);
  }
});

// Admin: delete provider
router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const providers = await getProviders();
    const filtered = providers.filter((p) => p.id !== id);
    if (filtered.length === providers.length) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    await saveProviders(filtered);
    await refreshOIDCStrategies();

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Admin: update global OIDC auto-provision setting
router.put('/settings/auto-provision', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    await prisma.setting.upsert({
      where: { key: 'oidcAutoProvision' },
      create: { key: 'oidcAutoProvision', value: String(enabled) },
      update: { value: String(enabled) },
    });
    res.json({ oidcAutoProvision: enabled });
  } catch (err) {
    next(err);
  }
});

export default router;
