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
import { getSessionFromReq } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
  }

  try {
    const session = await getSessionFromReq(req);

    if (!session) {
      return sendJson(res, 200, {
        success: true,
        data: { user: null },
      });
    }

    return sendJson(res, 200, {
      success: true,
      data: {
        user: {
          id: session.userId,
          username: session.username,
          email: session.email || null,
          avatarUrl: session.avatarUrl || null,
          role: session.role || 'user',
        },
      },
    });
  } catch (e: any) {
    console.error('Error fetching current user session:', e);
    return sendJson(res, 200, {
      success: true,
      data: { user: null },
      error: 'Failed to retrieve session',
    });
  }
}
