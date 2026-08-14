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
import { handleCors, sendError, sendJson } from '../_lib/response.js';
import { query } from '../_lib/db.js';
import { sanitizeActivityMessage, sanitizeActivityStatus } from '../_lib/profile.js';

const SEARCH_WINDOW_MS = 60_000;
const SEARCH_LIMIT = 30;
const MAX_QUERY_LENGTH = 64;
const searchRateLimits = new Map<string, { startedAt: number; count: number }>();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return sendError(res, 405, 'Method Not Allowed');

  const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (rawQuery.length > MAX_QUERY_LENGTH) return sendError(res, 400, 'Search query is too long');
  if (rawQuery.length < 2) return sendJson(res, 200, { success: true, data: [] });

  const now = Date.now();
  const key = getClientKey(req);
  const current = searchRateLimits.get(key);
  if (!current || now - current.startedAt >= SEARCH_WINDOW_MS) {
    searchRateLimits.set(key, { startedAt: now, count: 1 });
  } else {
    current.count += 1;
    if (current.count > SEARCH_LIMIT) return sendError(res, 429, 'Profile search rate limit exceeded');
  }
  if (searchRateLimits.size > 10_000) {
    for (const [entryKey, entry] of searchRateLimits) {
      if (now - entry.startedAt >= SEARCH_WINDOW_MS) searchRateLimits.delete(entryKey);
    }
  }

  try {
    const pattern = `%${rawQuery.replace(/[%_\\]/g, '\\$&')}%`;
    const result = await query<{
      id: string;
      username: string;
      avatar_url: string | null;
      display_name: string | null;
      handle: string | null;
      activity_status: string | null;
      activity_message: string | null;
    }>(
      `SELECT u.id, u.username, u.avatar_url, up.display_name, up.handle,
              up.activity_status, up.activity_message
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE (u.id ILIKE $1 ESCAPE '\\'
          OR u.username ILIKE $1 ESCAPE '\\'
          OR up.display_name ILIKE $1 ESCAPE '\\'
          OR up.handle ILIKE $1 ESCAPE '\\')
       ORDER BY CASE
          WHEN lower(up.handle) = lower($2) THEN 0
          WHEN lower(up.display_name) = lower($2) THEN 1
          WHEN lower(up.handle) LIKE lower($2) || '%' THEN 2
          WHEN lower(up.display_name) LIKE lower($2) || '%' THEN 3
          ELSE 4 END,
          COALESCE(up.display_name, u.username), u.id
       LIMIT 20`,
      [pattern, rawQuery]
    );

    return sendJson(res, 200, {
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        username: row.username,
        displayName: row.display_name || row.username,
        handle: row.handle,
        avatarUrl: row.avatar_url,
        activityStatus: sanitizeActivityStatus(row.activity_status),
        activityMessage: sanitizeActivityMessage(row.activity_message),
      })),
    });
  } catch (error) {
    console.error('Profile search failed:', error instanceof Error ? error.name : 'unknown');
    return sendError(res, 500, 'Failed to search profiles');
  }
}

function getClientKey(req: VercelRequest): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  const value = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  return (value || req.socket?.remoteAddress || 'unknown').split(',')[0].trim().slice(0, 128);
}
