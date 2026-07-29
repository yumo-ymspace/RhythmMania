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
  isProduction: boolean;
}

export function getEnvConfig(): ServerEnvConfig {
  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  const pgHost = process.env.PGHOST || process.env.POSTGRES_HOST;
  const pgPort = parseInt(process.env.PGPORT || process.env.POSTGRES_PORT || '5432', 10);
  const pgDatabase = process.env.PGDATABASE || process.env.POSTGRES_DATABASE;
  const pgUser = process.env.PGUSER || process.env.POSTGRES_USER;
  const pgPassword = process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD;
  const pgSslMode = process.env.PGSSLMODE || 'prefer';
  const sessionSecret = process.env.SESSION_SECRET || 'rhythm-mania-default-development-session-secret-key-321';
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  return {
    databaseUrl,
    pgHost,
    pgPort,
    pgDatabase,
    pgUser,
    pgPassword,
    pgSslMode,
    sessionSecret,
    googleClientId,
    googleClientSecret,
    isProduction: process.env.NODE_ENV === 'production',
  };
}

export function validateDbEnv(): { valid: boolean; reason?: string } {
  const config = getEnvConfig();
  if (config.databaseUrl) {
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
