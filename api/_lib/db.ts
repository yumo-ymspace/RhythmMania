/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * PostgreSQL Connection Pooling Layer
 */

import pg from 'pg';
import { getEnvConfig } from './env.js';

const { Pool } = pg;

let poolInstance: pg.Pool | null = null;

export function getDbPool(): pg.Pool {
  if (poolInstance) {
    return poolInstance;
  }

  const env = getEnvConfig();

  const sslOption = env.pgSslMode === 'disable' ? false : { rejectUnauthorized: false };

  if (env.databaseUrl) {
    poolInstance = new Pool({
      connectionString: env.databaseUrl,
      ssl: env.pgSslMode === 'disable' ? false : sslOption,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  } else {
    poolInstance = new Pool({
      host: env.pgHost || 'localhost',
      port: env.pgPort || 5432,
      database: env.pgDatabase,
      user: env.pgUser,
      password: env.pgPassword,
      ssl: env.pgSslMode === 'disable' ? false : sslOption,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  poolInstance.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client:', err);
  });

  return poolInstance;
}

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  const pool = getDbPool();
  return pool.query<T>(text, params);
}
