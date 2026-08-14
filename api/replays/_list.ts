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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return sendError(res, 405, 'Method Not Allowed');
  }

  const chartRevisionId = typeof req.query.chartRevisionId === 'string' ? req.query.chartRevisionId : '';

  if (!chartRevisionId || chartRevisionId.length > 256) {
    return sendError(res, 400, 'Missing chartRevisionId parameter');
  }

  try {
    const session = await getSessionFromReq(req);
    const dbRes = await query<{
      id: string;
      user_id: string | null;
      score: number;
      accuracy: number;
      max_combo: number;
      grade: string;
      mods: unknown;
      created_at: Date | string;
      beatmap_set_id: string;
       chart_revision_id: string;
      beatmap_hash: string;
      username: string | null;
      avatar_url: string | null;
      beatmap_title: string | null;
      beatmap_artist: string | null;
       beatmap_difficulty: string | null;
    }>(
      `SELECT 
        r.id,
        r.user_id,
        r.score,
        r.accuracy,
        r.max_combo,
        r.grade,
        r.mods,
        r.created_at,
        r.beatmap_set_id,
         r.beatmap_hash, r.chart_revision_id,
        u.username,
        u.avatar_url,
        bs.title as beatmap_title,
        bs.artist as beatmap_artist,
         cr.difficulty_name as beatmap_difficulty
       FROM replays r
       LEFT JOIN users u ON r.user_id = u.id
       JOIN beatmap_sets bs ON r.beatmap_set_id = bs.id
       JOIN beatmap_chart_revisions cr ON r.chart_revision_id = cr.id
        WHERE r.chart_revision_id = $1
         AND r.upload_status = 'uploaded'
         AND r.is_failed = false
         AND bs.catalog_state = 'active'
         AND cr.is_active = true
         AND cr.canonical_chart IS NOT NULL
      ORDER BY r.score DESC
      LIMIT 50`,
       [chartRevisionId]
    );

    const replays = dbRes.rows.map((row) => ({
      id: row.id,
      score: row.score,
      accuracy: row.accuracy,
      maxCombo: row.max_combo,
      grade: row.grade,
      mods: Array.isArray(row.mods) ? row.mods : [],
       createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
      catalogSetId: row.beatmap_set_id,
       catalogMapId: row.chart_revision_id,
      chartRevisionId: row.chart_revision_id,
      beatmapHash: row.beatmap_hash,
      userId: row.user_id,
      username: row.username || 'Guest Player',
      avatarUrl: row.avatar_url,
      beatmapTitle: row.beatmap_title || 'Unknown Title',
      beatmapArtist: row.beatmap_artist || 'Unknown Artist',
      beatmapDifficulty: row.beatmap_difficulty || 'Normal',
      isOwn: Boolean(session && row.user_id === session.userId),
    }));

    return sendJson(res, 200, {
      success: true,
      data: {
        replays,
        total: replays.length,
      },
    });
  } catch (e: unknown) {
    const databaseCode = typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string' ? e.code : undefined;
    console.error('Replay list request failed:', e instanceof Error ? e.name : 'unknown', databaseCode || 'no-code');
    return sendError(res, 500, databaseCode === '42703' || databaseCode === '42P01'
      ? 'Replay leaderboard database schema is unavailable'
      : 'Replay leaderboard unavailable');
  }
}
