/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 *
 * This source code is licensed under the PolyForm Perimeter License 1.0.1.
 * You may modify and use this file for non-competing purposes, provided 
 * that open and explicit attribution is maintained.
 *
 * For the full license terms, see the LICENSE file in the root directory
 * from: https://github.com/yumo-ymspace/RhythmMania
 */

import pg from 'pg';
import { getEnvConfig, isValidDbTlsConfig, normalizeDatabaseUrl } from './env.js';

const { Pool } = pg;

let poolInstance: pg.Pool | null = null;

export function getDbPool(): pg.Pool {
  if (poolInstance) {
    return poolInstance;
  }

  const env = getEnvConfig();

  if (!isValidDbTlsConfig(env)) {
    throw new Error('Invalid PostgreSQL TLS configuration');
  }
  const connectionString = env.databaseUrl ? normalizeDatabaseUrl(env.databaseUrl) : null;
  if (env.databaseUrl && !connectionString) {
    throw new Error('Invalid PostgreSQL connection string');
  }

  const sslOption = env.pgSslMode === 'disable' ? false : { rejectUnauthorized: true };

  if (connectionString) {
    poolInstance = new Pool({
      connectionString,
      ssl: env.pgSslMode === 'disable' ? false : sslOption,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  } else {
    if (!env.pgHost || !env.pgDatabase || !env.pgUser) {
      throw new Error('Missing PostgreSQL connection configuration');
    }
    poolInstance = new Pool({
      host: env.pgHost,
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
    console.error('Unexpected error on idle PostgreSQL client:', err instanceof Error ? err.name : 'unknown');
  });

  return poolInstance;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const pool = getDbPool();
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getDbPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
