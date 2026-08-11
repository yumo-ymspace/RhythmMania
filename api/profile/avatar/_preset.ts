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
import { handleCors, requireSameOrigin, sendJson, sendError } from '../../_lib/response.js';
import { getSessionFromReq } from '../../_lib/auth.js';
import { query } from '../../_lib/db.js';

const PRESET_RE = /^preset_0[1-8]$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  try {
    if (req.method !== 'POST') {
      return sendError(res, 405, 'Method Not Allowed');
    }
    if (!requireSameOrigin(req, res)) return;

    const session = await getSessionFromReq(req);
    if (!session) {
      return sendError(res, 401, 'Authentication required');
    }

    const body = req.body || {};
    const presetId = typeof body.presetId === 'string' ? body.presetId : '';

    if (!PRESET_RE.test(presetId)) {
      return sendError(res, 400, 'Invalid preset id (expected preset_01 through preset_08)');
    }

    const avatarUrl = `/avatars/${presetId}.png`;

    await query(
      `UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2`,
      [avatarUrl, session.userId]
    );

    await query(`DELETE FROM user_avatars WHERE user_id = $1`, [session.userId]);

    return sendJson(res, 200, {
      success: true,
      data: { avatarUrl },
    });
  } catch (e: unknown) {
    console.error('Profile preset avatar request failed:', e instanceof Error ? e.name : 'unknown');
    return sendError(res, 500, 'Profile avatar service unavailable');
  }
}
