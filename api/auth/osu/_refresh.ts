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
import { getEnvConfig } from '../../_lib/env.js';
import { handleCors, requireSameOrigin, sendError, sendJson } from '../../_lib/response.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'Method Not Allowed');
  if (!requireSameOrigin(req, res)) return;

  const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken.trim() : '';
  if (!refreshToken || refreshToken.length > 4096) {
    return sendError(res, 400, 'Missing refresh token');
  }

  const env = getEnvConfig();
  if (!env.osuClientId || !env.osuClientSecret) {
    return sendError(res, 500, 'osu! OAuth credentials are not configured');
  }

  try {
    const tokenRes = await fetch('https://osu.ppy.sh/oauth/token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: env.osuClientId,
        client_secret: env.osuClientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: 'public identify',
      }),
    });

    const tokenData: unknown = await tokenRes.json();
    if (
      !isRecord(tokenData) ||
      !tokenRes.ok ||
      typeof tokenData.access_token !== 'string' ||
      !tokenData.access_token
    ) {
      return sendError(res, 401, 'Failed to refresh osu! token');
    }

    return sendJson(res, 200, {
      success: true,
      data: {
        accessToken: tokenData.access_token,
        refreshToken: typeof tokenData.refresh_token === 'string' ? tokenData.refresh_token : refreshToken,
        expiresIn: typeof tokenData.expires_in === 'number' ? tokenData.expires_in : 86400,
      },
    });
  } catch (error) {
    console.error('osu! token refresh failed:', error instanceof Error ? error.name : 'unknown');
    return sendError(res, 500, 'osu! token refresh failed');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
