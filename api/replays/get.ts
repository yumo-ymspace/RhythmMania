/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Serverless Replay Fetch Endpoint
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors, sendJson, sendError } from '../_lib/response.js';
import { query } from '../_lib/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return sendError(res, 405, 'Method Not Allowed');
  }

  const id = (req.query.id || req.query.replayId) as string;

  if (!id) {
    return sendError(res, 400, 'Missing replay id parameter');
  }

  try {
    const dbRes = await query<{
      id: string;
      user_id: number | null;
      beatmap_set_id: string | null;
      beatmap_difficulty_id: string | null;
      beatmap_hash: string;
      score: number;
      accuracy: number;
      max_combo: number;
      grade: string;
      is_failed: boolean;
      score_state: any;
      replay_frames: any;
      recorded_settings: any;
      mods: any;
      replay_source: string;
      upload_status: string;
      created_at: Date;
      username: string | null;
      avatar_url: string | null;
      beatmap_title: string | null;
      beatmap_artist: string | null;
      beatmap_difficulty: string | null;
      osz_url: string | null;
    }>(
      `SELECT 
        r.*,
        u.username,
        u.avatar_url,
        bs.title as beatmap_title,
        bs.artist as beatmap_artist,
        bs.osz_url,
        bd.name as beatmap_difficulty
      FROM replays r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN beatmap_sets bs ON r.beatmap_set_id = bs.id
      LEFT JOIN beatmap_difficulties bd ON r.beatmap_difficulty_id = bd.id
      WHERE r.id = $1`,
      [id]
    );

    if (dbRes.rows.length === 0) {
      return sendError(res, 404, 'Replay not found');
    }

    const row = dbRes.rows[0];

    const record = {
      schemaVersion: 2,
      id: row.id,
      timestamp: new Date(row.created_at).getTime(),
      beatmapId: row.beatmap_difficulty_id || '',
      beatmapTitle: row.beatmap_title || 'Unknown Title',
      beatmapArtist: row.beatmap_artist || 'Unknown Artist',
      beatmapDifficulty: row.beatmap_difficulty || 'Normal',
      keyCount: row.score_state?.keyCount || 4,
      score: row.score,
      accuracy: row.accuracy,
      maxCombo: row.max_combo,
      grade: row.grade,
      isFailed: row.is_failed,
      scoreState: typeof row.score_state === 'string' ? JSON.parse(row.score_state) : row.score_state,
      replayFrames: typeof row.replay_frames === 'string' ? JSON.parse(row.replay_frames) : row.replay_frames || [],
      recordedSettings: typeof row.recorded_settings === 'string' ? JSON.parse(row.recorded_settings) : row.recorded_settings || {},
      mods: Array.isArray(row.mods) ? row.mods : [],
      replaySource: row.replay_source || 'account-local',
      uploadStatus: row.upload_status || 'uploaded',
      uploadEligibility: 'eligible',
      catalogSetId: row.beatmap_set_id || undefined,
      catalogMapId: row.beatmap_difficulty_id || undefined,
      beatmapHash: row.beatmap_hash,
      isServerCatalogMap: true,
      username: row.username || 'Guest Player',
      avatarUrl: row.avatar_url,
      oszUrl: row.osz_url || undefined,
    };

    return sendJson(res, 200, {
      success: true,
      data: {
        record,
      },
    });
  } catch (e: any) {
    console.error('Error fetching replay detail:', e);
    return sendError(res, 500, e?.message || 'Failed to fetch replay details');
  }
}
