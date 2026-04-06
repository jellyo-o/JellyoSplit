import dotenv from 'dotenv';

dotenv.config();

export const config = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  BASE_URL: process.env.BASE_URL || 'http://localhost:4000',
  DATABASE_URL: process.env.DATABASE_URL || '',
  SESSION_SECRET: process.env.SESSION_SECRET || 'supersecretjellyosplit',
  AUTH_MODE: process.env.AUTH_MODE || 'local', // 'local' | 'oidc' | 'both'
  OIDC_ISSUER: process.env.OIDC_ISSUER || '',
  OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID || '',
  OIDC_CLIENT_SECRET: process.env.OIDC_CLIENT_SECRET || '',
  OIDC_CALLBACK_URL: process.env.OIDC_CALLBACK_URL || `${process.env.BASE_URL || 'http://localhost:4000'}/api/auth/oidc/callback`,
};
