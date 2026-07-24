/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Session Bootstrap Endpoint
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
