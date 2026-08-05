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
import { handleCors, sendJson, sendError } from '../_lib/response.js';
import { getSessionFromReq } from '../_lib/auth.js';
import { query } from '../_lib/db.js';
import { RESERVED_HANDLES, isValidHandle } from '../_lib/profile.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  try {
    if (req.method !== 'GET') {
      return sendError(res, 405, 'Method Not Allowed');
    }

    const session = await getSessionFromReq(req);
    if (!session) {
      return sendError(res, 401, 'Authentication required');
    }

    const handle = typeof req.query.handle === 'string' ? req.query.handle : '';

    if (!isValidHandle(handle)) {
      return sendJson(res, 200, {
        success: true,
        data: { handle, available: false, reason: 'invalid' },
      });
    }

    if (RESERVED_HANDLES.has(handle.toLowerCase())) {
      return sendJson(res, 200, {
        success: true,
        data: { handle, available: false, reason: 'reserved' },
      });
    }

    const conflictRes = await query<{ user_id: string }>(
      `SELECT user_id FROM user_profiles WHERE handle = $1 AND user_id != $2`,
      [handle, session.userId]
    );

    const available = conflictRes.rows.length === 0;

    return sendJson(res, 200, {
      success: true,
      data: { handle, available, reason: available ? 'ok' : 'taken' },
    });
  } catch (e: unknown) {
    console.error('Error in /api/profile/handle-check:', e);
    return sendError(res, 500, e instanceof Error ? e.message : 'Internal server error');
  }
}
