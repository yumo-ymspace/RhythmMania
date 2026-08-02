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
import { handleCors, sendJson } from '../_lib/response.js';
import { clearSessionCookie, isSecureRequest, parseCookies, SESSION_COOKIE_NAME } from '../_lib/auth.js';
import { query } from '../_lib/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
  }

  try {
    const cookies = parseCookies(req);
    const sessionId = cookies[SESSION_COOKIE_NAME];

    if (sessionId) {
      await query('DELETE FROM sessions WHERE id = $1', [sessionId]);
    }

    clearSessionCookie(res, isSecureRequest(req));

    return sendJson(res, 200, {
      success: true,
      message: 'Successfully logged out',
    });
  } catch (e: any) {
    console.error('Logout error:', e);
    clearSessionCookie(res, isSecureRequest(req));
    return sendJson(res, 200, {
      success: true,
      message: 'Cleared local session state',
    });
  }
}
