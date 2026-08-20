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

import dotenv from 'dotenv';
import crypto from 'crypto';

// Pre-load dotenv for local runtime environments
dotenv.config();

export interface ServerEnvConfig {
  databaseUrl?: string;
  pgHost?: string;
  pgPort: number;
  pgDatabase?: string;
  pgUser?: string;
  pgPassword?: string;
  pgSslMode: string;
  sessionSecret: string;
  googleClientId?: string;
  googleClientSecret?: string;
  osuClientId?: string;
  osuClientSecret?: string;
  isProduction: boolean;
}

let localDevelopmentSecret: string | undefined;
const DATABASE_TLS_QUERY_PARAMETERS = new Set(['ssl', 'sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'sslpassword']);

export function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

function getSessionSecret(isProduction: boolean): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured) {
    if (isProduction && configured.length < 32) {
      throw new Error('Invalid production session security configuration');
    }
    return configured;
  }

  if (isProduction) {
    throw new Error('Missing production session security configuration');
  }

  // Development sessions are intentionally invalidated when the process restarts.
  localDevelopmentSecret ??= crypto.randomBytes(32).toString('hex');
  return localDevelopmentSecret;
}

export function getEnvConfig(): ServerEnvConfig {
  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  const pgHost = process.env.PGHOST || process.env.POSTGRES_HOST;
  const pgPort = parseInt(process.env.PGPORT || process.env.POSTGRES_PORT || '5432', 10);
  const pgDatabase = process.env.PGDATABASE || process.env.POSTGRES_DATABASE;
  const pgUser = process.env.PGUSER || process.env.POSTGRES_USER;
  const pgPassword = process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD;
  const pgSslMode = (process.env.PGSSLMODE || 'verify-full').trim().toLowerCase();
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const osuClientId = process.env.OSU_CLIENT_ID;
  const osuClientSecret = process.env.OSU_CLIENT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';

  return {
    databaseUrl,
    pgHost,
    pgPort,
    pgDatabase,
    pgUser,
    pgPassword,
    pgSslMode,
    googleClientId,
    googleClientSecret,
    osuClientId,
    osuClientSecret,
    isProduction,
    sessionSecret: getSessionSecret(isProduction),
  };
}

export function isValidDbTlsConfig(config: Pick<ServerEnvConfig, 'pgSslMode' | 'isProduction'>): boolean {
  if (!['disable', 'prefer', 'require', 'verify-ca', 'verify-full'].includes(config.pgSslMode)) {
    return false;
  }
  // Production may use an explicitly approved beta database without TLS.
  return !(config.isProduction && config.pgSslMode === 'disable' && !isInsecurePgTlsExplicitlyAllowed());
}

export function isSafeDatabaseUrl(databaseUrl: string): boolean {
  return normalizeDatabaseUrl(databaseUrl) !== null;
}

/**
 * Keep provider connection options while making TLS policy explicit in PGSSLMODE.
 * PostgreSQL providers commonly include sslmode=require in DATABASE_URL.
 */
export function normalizeDatabaseUrl(databaseUrl: string): string | null {
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') return null;
    for (const key of [...parsed.searchParams.keys()]) {
      if (DATABASE_TLS_QUERY_PARAMETERS.has(key.toLowerCase())) {
        parsed.searchParams.delete(key);
      }
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function isInsecurePgTlsExplicitlyAllowed(): boolean {
  const value = process.env.ALLOW_INSECURE_PG_TLS?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

export function validateDbEnv(): { valid: boolean; reason?: string } {
  const config = getEnvConfig();
  if (!isValidDbTlsConfig(config)) {
    return {
      valid: false,
      reason: 'Invalid PostgreSQL TLS configuration.',
    };
  }
  if (config.databaseUrl) {
    if (!isSafeDatabaseUrl(config.databaseUrl)) {
      return {
        valid: false,
        reason: 'DATABASE_URL contains unsupported or unsafe connection parameters.',
      };
    }
    return { valid: true };
  }
  if (config.pgHost && config.pgDatabase && config.pgUser) {
    return { valid: true };
  }
  return {
    valid: false,
    reason: 'Missing DATABASE_URL or PGHOST/PGDATABASE/PGUSER environment configuration.',
  };
}
