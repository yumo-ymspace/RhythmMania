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

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors, sendJson } from './_lib/response.js';
import { validateDbEnv, getEnvConfig } from './_lib/env.js';
import { query } from './_lib/db.js';
import metadata from '../metadata.json' with { type: 'json' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
  }

  const envCheck = validateDbEnv();
  let dbConnected = false;
  let dbLatencyMs: number | null = null;
  let dbError: string | null = null;

  if (envCheck.valid) {
    const start = Date.now();
    try {
      await query('SELECT 1 as health_check');
      dbConnected = true;
      dbLatencyMs = Date.now() - start;
    } catch (e: unknown) {
      dbConnected = false;
      console.error('Health database check failed:', e instanceof Error ? e.name : 'unknown');
      dbError = 'Database query failed';
    }
  } else {
    dbError = envCheck.reason || 'Database environment variables not configured';
  }

  const env = getEnvConfig();

  return sendJson(res, 200, {
    success: true,
    data: {
      status: 'ok',
      version: metadata.version || '0.7.6',
      timestamp: new Date().toISOString(),
      environment: env.isProduction ? 'production' : 'development',
      database: {
        configured: envCheck.valid,
        connected: dbConnected,
        latencyMs: dbLatencyMs,
        error: dbError ? dbError : undefined,
      },
    },
  });
}
