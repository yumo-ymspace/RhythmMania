/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Serverless Replay Upload Endpoint
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors, sendJson, sendError } from '../_lib/response.js';
import { getSessionFromReq } from '../_lib/auth.js';
import { getCatalogSetId } from '../_lib/catalog.js';
import { query } from '../_lib/db.js';

const MAX_REPLAY_PAYLOAD_BYTES = 8 * 1024 * 1024;
const MAX_REPLAY_FRAMES = 100000;
const RECORD_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const BEATMAP_HASH_PATTERN = /^(?:fnv_|meta_)[a-f0-9]{16}$/;
const GRADES = new Set(['SS', 'S', 'A', 'B', 'C', 'D']);

function isFiniteInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return sendError(res, 405, 'Method Not Allowed');
  }

  try {
    // 1. Authenticate user
    const session = await getSessionFromReq(req);
    if (!session) {
      return sendError(res, 401, 'Unauthorized: Please sign in with Google to upload replays');
    }

    const payload = req.body?.record || req.body;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return sendError(res, 400, 'Invalid request: Missing replay payload');
    }

    const {
      id,
      beatmapTitle,
      beatmapArtist,
      keyCount = 4,
      score,
      accuracy,
      maxCombo,
      grade,
      isFailed,
      scoreState,
      replayFrames = [],
      recordedSettings,
      mods = [],
      catalogSetId,
      catalogMapId,
      beatmapHash,
    } = payload;

    // 2. Server-side validation
    if (
      typeof id !== 'string' ||
      !RECORD_ID_PATTERN.test(id) ||
      typeof catalogMapId !== 'string' ||
      typeof beatmapHash !== 'string' ||
      !BEATMAP_HASH_PATTERN.test(beatmapHash) ||
      !isFiniteInteger(score, 0, 2_147_483_647) ||
      typeof accuracy !== 'number' ||
      !Number.isFinite(accuracy) ||
      accuracy < 0 ||
      accuracy > 100 ||
      !isFiniteInteger(maxCombo, 0, 2_147_483_647) ||
      !isFiniteInteger(keyCount, 2, 8) ||
      typeof grade !== 'string' ||
      !GRADES.has(grade) ||
      !scoreState ||
      typeof scoreState !== 'object' ||
      Array.isArray(scoreState) ||
      !Array.isArray(replayFrames) ||
      !Array.isArray(mods) ||
      !mods.every((mod) => typeof mod === 'string' && /^[A-Z0-9]{2,4}$/.test(mod))
    ) {
      return sendError(res, 400, 'Replay payload contains invalid fields');
    }

    if (isFailed || scoreState?.failed) {
      return sendError(res, 400, 'Failed runs cannot be uploaded to online leaderboards');
    }

    if (scoreState?.isAutoplay || mods.includes('AT')) {
      return sendError(res, 400, 'Autoplay runs cannot be uploaded');
    }

    if (payload.uploadEligibility !== 'eligible') {
      return sendError(res, 400, 'Replay is not eligible for upload');
    }

    const expectedSetId = getCatalogSetId(catalogMapId);
    if (!expectedSetId || (catalogSetId !== undefined && catalogSetId !== expectedSetId)) {
      return sendError(res, 400, 'Replay does not reference a supported catalog difficulty');
    }

    if (replayFrames.length > MAX_REPLAY_FRAMES) {
      return sendError(res, 400, 'Replay frame size exceeds maximum server limit');
    }

    const rawPayloadString = JSON.stringify(payload);
    if (rawPayloadString.length > MAX_REPLAY_PAYLOAD_BYTES) {
      return sendError(res, 400, 'Replay payload size exceeds 8MB server limit');
    }

    const setId = expectedSetId;

    // 3. Upsert beatmap_sets & beatmap_difficulties if missing
    await query(
      `INSERT INTO beatmap_sets (id, title, artist, creator, mode)
       VALUES ($1, $2, $3, $4, 3)
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, artist = EXCLUDED.artist, updated_at = NOW()`,
      [setId, beatmapTitle || 'Unknown Title', beatmapArtist || 'Unknown Artist', 'Catalog']
    );

    await query(
      `INSERT INTO beatmap_difficulties (id, beatmap_set_id, name, key_count, beatmap_hash, mode)
       VALUES ($1, $2, $3, $4, $5, 3)
       ON CONFLICT (id) DO UPDATE SET beatmap_hash = EXCLUDED.beatmap_hash`,
      [catalogMapId, setId, payload.beatmapDifficulty || 'Normal', keyCount, beatmapHash]
    );

    // 4. Save replay in Postgres
    await query(
      `INSERT INTO replays (
        id, user_id, beatmap_set_id, beatmap_difficulty_id, beatmap_hash,
        score, accuracy, max_combo, grade, is_failed,
        score_state, replay_frames, recorded_settings, mods,
        replay_source, upload_status
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14,
        'account-local', 'uploaded'
      ) ON CONFLICT (id) DO UPDATE SET
        score = EXCLUDED.score,
        accuracy = EXCLUDED.accuracy,
        max_combo = EXCLUDED.max_combo,
        grade = EXCLUDED.grade,
        score_state = EXCLUDED.score_state,
        replay_frames = EXCLUDED.replay_frames,
        upload_status = 'uploaded'`,
      [
        id,
        session.userId,
        setId,
        catalogMapId,
        beatmapHash,
        score,
        accuracy,
        maxCombo,
        grade || 'D',
        false,
        JSON.stringify(scoreState || {}),
        JSON.stringify(replayFrames || []),
        JSON.stringify(recordedSettings || {}),
        JSON.stringify(mods || []),
      ]
    );

    return sendJson(res, 200, {
      success: true,
      data: {
        recordId: id,
        uploadStatus: 'uploaded',
        message: 'Replay uploaded successfully to server',
      },
    });
  } catch (e: any) {
    console.error('Error in replay upload handler:', e);
    return sendError(res, 500, e?.message || 'Internal server error while uploading replay');
  }
}
