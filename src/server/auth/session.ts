import session from 'express-session';
import pgSession from 'connect-pg-simple';
import { Pool } from 'pg';
import { config } from '../config';

const PgSession = pgSession(session);

const pool = new Pool({
  connectionString: config.DATABASE_URL,
});

export const sessionMiddleware = session({
  store: new PgSession({
    pool,
    tableName: 'Session', // Match Prisma schema
    createTableIfMissing: false, // Prisma handles the schema
  }),
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
});
