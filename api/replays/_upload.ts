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
import { findActiveChartRevision } from '../_lib/cloudCatalog.js';
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
      chartRevisionId,
      beatmapHash,
      checksum,
    } = payload;

    // 2. Server-side validation
    if (
      typeof id !== 'string' ||
      !RECORD_ID_PATTERN.test(id) ||
      typeof chartRevisionId !== 'string' || chartRevisionId.length < 1 || chartRevisionId.length > 256 ||
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

    const isNoFail = mods.some((mod) => mod.toUpperCase() === 'NF');
    if ((isFailed || scoreState?.failed) && !isNoFail) {
      return sendError(res, 400, 'Failed runs cannot be uploaded to online leaderboards');
    }

    if (scoreState?.isAutoplay || mods.includes('AT')) {
      return sendError(res, 400, 'Autoplay runs cannot be uploaded');
    }

    if (payload.uploadEligibility !== 'eligible') {
      return sendError(res, 400, 'Replay is not eligible for upload');
    }

    const chart = await findActiveChartRevision(chartRevisionId);
    if (!chart) return sendError(res, 400, 'Replay does not reference an active verified chart revision');
    if (chart.mode !== 3 || chart.key_count !== keyCount) return sendError(res, 400, 'Replay chart metadata does not match the verified revision');
    if (typeof checksum !== 'string' || checksum.toLowerCase() !== chart.checksum.toLowerCase()) return sendError(res, 400, 'Replay checksum does not match the verified chart revision');

    if (replayFrames.length > MAX_REPLAY_FRAMES) {
      return sendError(res, 400, 'Replay frame size exceeds maximum server limit');
    }

    const rawPayloadString = JSON.stringify(payload);
    if (rawPayloadString.length > MAX_REPLAY_PAYLOAD_BYTES) {
      return sendError(res, 400, 'Replay payload size exceeds 8MB server limit');
    }

    // Save only a replay. Catalog rows are created by seed/registration, never uploads.
    const saved = await query(
      `INSERT INTO replays (
         id, user_id, beatmap_set_id, beatmap_difficulty_id, chart_revision_id, beatmap_hash,
        score, accuracy, max_combo, grade, is_failed,
        score_state, replay_frames, recorded_settings, mods,
        replay_source, upload_status
      ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11,
         $12, $13, $14, $15,
        'account-local', 'uploaded'
      ) ON CONFLICT (id) DO UPDATE SET
        score = EXCLUDED.score,
        accuracy = EXCLUDED.accuracy,
        max_combo = EXCLUDED.max_combo,
        grade = EXCLUDED.grade,
        score_state = EXCLUDED.score_state,
        replay_frames = EXCLUDED.replay_frames,
         upload_status = 'uploaded'
       WHERE replays.user_id = EXCLUDED.user_id`,
      [
         id,
         session.userId,
         chart.cloud_set_id,
         null,
         chartRevisionId,
         beatmapHash,
         score,
        accuracy,
        maxCombo,
        grade || 'D',
        false,
         JSON.stringify({ ...(scoreState || {}), failed: false }),
        JSON.stringify(replayFrames || []),
        JSON.stringify(recordedSettings || {}),
        JSON.stringify(mods || []),
      ]
    );

    if (saved.rowCount === 0) {
      return sendError(res, 409, 'Replay ID is already owned by another account');
    }

    return sendJson(res, 200, {
      success: true,
      data: {
        recordId: id,
        uploadStatus: 'uploaded',
        message: 'Replay uploaded successfully to server',
      },
    });
  } catch (e: unknown) {
    console.error('Error in replay upload handler:', e);
    return sendError(res, 500, e instanceof Error ? e.message : 'Internal server error while uploading replay');
  }
}
