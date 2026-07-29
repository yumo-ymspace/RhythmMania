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

  const difficultyId = (req.query.difficultyId || req.query.difficulty_id) as string;
  const hash = (req.query.hash || req.query.beatmapHash) as string;

  if (!difficultyId && !hash) {
    return sendError(res, 400, 'Missing difficultyId or hash parameter');
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
      mods: any;
      created_at: Date;
      beatmap_set_id: string;
      beatmap_difficulty_id: string;
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
        r.beatmap_difficulty_id,
        r.beatmap_hash,
        u.username,
        u.avatar_url,
        bs.title as beatmap_title,
        bs.artist as beatmap_artist,
        bd.name as beatmap_difficulty
      FROM replays r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN beatmap_sets bs ON r.beatmap_set_id = bs.id
      LEFT JOIN beatmap_difficulties bd ON r.beatmap_difficulty_id = bd.id
      WHERE (r.beatmap_difficulty_id = $1 OR ($2 != '' AND r.beatmap_hash = $2))
        AND r.is_failed = false
      ORDER BY r.score DESC
      LIMIT 50`,
      [difficultyId || '', hash || '']
    );

    const replays = dbRes.rows.map((row) => ({
      id: row.id,
      score: row.score,
      accuracy: row.accuracy,
      maxCombo: row.max_combo,
      grade: row.grade,
      mods: Array.isArray(row.mods) ? row.mods : [],
      createdAt: row.created_at.toISOString(),
      catalogSetId: row.beatmap_set_id,
      catalogMapId: row.beatmap_difficulty_id,
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
  } catch (e: any) {
    console.error('Error fetching replay list:', e);
    return sendError(res, 500, e?.message || 'Failed to fetch leaderboard replays');
  }
}
