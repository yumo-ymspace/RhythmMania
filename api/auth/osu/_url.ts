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
import { generateOAuthState, isSecureRequest, setOsuOAuthStateCookie } from '../../_lib/auth.js';
import { getEnvConfig } from '../../_lib/env.js';
import { getRequestOrigin, handleCors, sendError, sendJson } from '../../_lib/response.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return sendError(res, 405, 'Method Not Allowed');

  try {
    const env = getEnvConfig();
    const clientId = env.osuClientId;
    const redirectUri = `${getRequestOrigin(req)}/api/auth/osu/callback`;

    if (!clientId) {
      return sendJson(res, 200, {
        success: false,
        error: 'OSU_CLIENT_ID environment variable is not configured on the server.',
        meta: { redirectUri },
      });
    }

    const state = generateOAuthState();
    setOsuOAuthStateCookie(res, state, isSecureRequest(req));

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'public identify',
      state,
    });

    return sendJson(res, 200, {
      success: true,
      data: {
        url: `https://osu.ppy.sh/oauth/authorize?${params.toString()}`,
        redirectUri,
      },
    });
  } catch (error) {
    console.error('Failed to initialize osu! OAuth URL:', error);
    return sendError(res, 500, 'Failed to initialize osu! OAuth on the server.');
  }
}
