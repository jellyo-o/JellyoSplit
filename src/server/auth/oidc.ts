import passport from 'passport';
import { Issuer, Strategy, TokenSet, UserinfoResponse } from 'openid-client';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import type { OidcProviderConfig } from '../routes/oidc-providers';

// Track registered strategy names so we can log which are active
const registeredStrategies = new Set<string>();

async function getAutoProvision(providerId: string): Promise<boolean> {
  // For DB providers, check per-provider setting
  if (providerId !== 'env') {
    const setting = await prisma.setting.findUnique({ where: { key: 'oidcProviders' } });
    if (setting) {
      try {
        const providers: OidcProviderConfig[] = JSON.parse(setting.value);
        const provider = providers.find((p) => p.id === providerId);
        if (provider) return provider.autoProvision;
      } catch {}
    }
  }
  // For env provider, check global setting
  const autoProvisionSetting = await prisma.setting.findUnique({ where: { key: 'oidcAutoProvision' } });
  return autoProvisionSetting?.value !== 'false';
}

function createOIDCCallback(providerId: string, issuerUrl: string) {
  return async (tokenSet: TokenSet, userinfo: UserinfoResponse, done: (err: any, user?: any) => void) => {
    try {
      const oidcSub = userinfo.sub;
      const issuer = issuerUrl;
      let user = await prisma.user.findUnique({
        where: { oidcSub },
      });

      if (!user) {
        const autoProvision = await getAutoProvision(providerId);
        if (!autoProvision) {
          return done(null, false);
        }

        const isFirstUser = await prisma.user.count() === 0;
        user = await prisma.user.create({
          data: {
            oidcSub,
            oidcIssuer: issuer,
            displayName: userinfo.name || userinfo.preferred_username || 'OIDC User',
            email: userinfo.email || null,
            avatarUrl: userinfo.picture || null,
            role: isFirstUser ? 'ADMIN' : 'USER',
          },
        });
      } else {
        user = await prisma.user.update({
          where: { oidcSub },
          data: {
            displayName: userinfo.name || userinfo.preferred_username || user.displayName,
            email: userinfo.email || user.email,
            avatarUrl: userinfo.picture || user.avatarUrl,
          },
        });
      }

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  };
}

async function registerProvider(
  strategyName: string,
  issuerUrl: string,
  clientId: string,
  clientSecret: string,
  callbackUrl: string
) {
  try {
    const issuer = await Issuer.discover(issuerUrl);
    const client = new issuer.Client({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: [callbackUrl],
      response_types: ['code'],
    });

    const providerId = strategyName.replace('oidc-', '');
    passport.use(
      strategyName,
      new Strategy(
        { client },
        createOIDCCallback(providerId, issuerUrl)
      )
    );
    registeredStrategies.add(strategyName);
    return true;
  } catch (err) {
    console.error(`Failed to configure OIDC strategy "${strategyName}":`, err);
    return false;
  }
}

export async function configureOIDC() {
  // Register env var provider
  if (config.AUTH_MODE !== 'local' && config.OIDC_ISSUER && config.OIDC_CLIENT_ID) {
    await registerProvider(
      'oidc-env',
      config.OIDC_ISSUER,
      config.OIDC_CLIENT_ID,
      config.OIDC_CLIENT_SECRET,
      config.OIDC_CALLBACK_URL
    );
    // Also register as 'oidc' for backward compatibility
    await registerProvider(
      'oidc',
      config.OIDC_ISSUER,
      config.OIDC_CLIENT_ID,
      config.OIDC_CLIENT_SECRET,
      config.OIDC_CALLBACK_URL
    );
  }

  // Register DB providers
  await registerDatabaseProviders();
}

async function registerDatabaseProviders() {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: 'oidcProviders' } });
    if (!setting) return;

    const providers: OidcProviderConfig[] = JSON.parse(setting.value);
    for (const provider of providers) {
      if (!provider.enabled) continue;
      const callbackUrl = `${config.BASE_URL}/api/auth/oidc/${provider.id}/callback`;
      await registerProvider(
        `oidc-${provider.id}`,
        provider.issuerUrl,
        provider.clientId,
        provider.clientSecret,
        callbackUrl
      );
    }
  } catch (err) {
    console.error('Failed to load OIDC providers from database:', err);
  }
}

// Called when providers are added/updated/deleted from admin
export async function refreshOIDCStrategies() {
  await registerDatabaseProviders();
}

export function getStrategyName(providerId: string): string {
  if (providerId === 'env') return 'oidc-env';
  return `oidc-${providerId}`;
}

export function isStrategyRegistered(strategyName: string): boolean {
  return registeredStrategies.has(strategyName);
}
