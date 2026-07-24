/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Google OAuth URL Generator
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRequestOrigin, handleCors, sendJson, sendError } from '../../_lib/response.js';
import { getEnvConfig } from '../../_lib/env.js';
import { generateOAuthState, isSecureRequest, setOAuthStateCookie } from '../../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return sendError(res, 405, 'Method Not Allowed');
  }

  try {
    const env = getEnvConfig();
    const clientId = env.googleClientId;

    const redirectUri = `${getRequestOrigin(req)}/api/auth/google/callback`;

    if (!clientId) {
      // If GOOGLE_CLIENT_ID is not configured, send descriptive response
      return sendJson(res, 200, {
        success: false,
        error: 'GOOGLE_CLIENT_ID environment variable is not configured on the server.',
        meta: { redirectUri }
      });
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      access_type: 'offline',
      prompt: 'select_account',
      state: generateOAuthState(),
    });
    const state = params.get('state');
    if (!state) {
      return sendError(res, 500, 'Failed to initialize OAuth state');
    }
    setOAuthStateCookie(res, state, isSecureRequest(req));

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return sendJson(res, 200, {
      success: true,
      data: {
        url: googleAuthUrl,
        redirectUri,
      },
    });
  } catch (error) {
    console.error('Failed to initialize Google OAuth URL:', error);
    return sendError(res, 500, 'Failed to initialize Google OAuth on the server.');
  }
}
