import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionFromReq } from '../_lib/auth.js';
import { findChartRevision } from '../_lib/cloudCatalog.js';
import { query } from '../_lib/db.js';
import {
  decodeCanonicalChart,
  parseReplayUploadPayload,
  verifyReplayAgainstChart,
} from '../_lib/replayVerification.js';
import { handleCors, requireSameOrigin, sendError, sendJson } from '../_lib/response.js';

const MAX_REPLAY_PAYLOAD_BYTES = 8 * 1024 * 1024;
const MIN_HOLD_TICK_INTERVAL_MS = 10;
const MAX_HOLD_TICK_INTERVAL_MS = 100;

function serverHoldTickInterval(): number | null {
  const value = Number(process.env.HOLD_TICK_INTERVAL_MS);
  return Number.isInteger(value) && value >= MIN_HOLD_TICK_INTERVAL_MS && value <= MAX_HOLD_TICK_INTERVAL_MS ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'Method Not Allowed');
  if (!requireSameOrigin(req, res)) return;

  try {
    const session = await getSessionFromReq(req);
    if (!session) return sendError(res, 401, 'Unauthorized: Please sign in with Google to upload replays');

    const body: unknown = req.body;
    const payload = isRecord(body) && isRecord(body.record) ? body.record : body;
    const payloadBytes = Buffer.byteLength(JSON.stringify(payload ?? null), 'utf8');
    if (payloadBytes > MAX_REPLAY_PAYLOAD_BYTES) return sendError(res, 400, 'Replay payload size exceeds 8MB server limit');

    const parsed = parseReplayUploadPayload(payload);
    if (!parsed.ok) return sendError(res, 400, parsed.error);
    const input = parsed.value;
    if (input.scoreState.isAutoplay === true) return sendError(res, 422, 'Autoplay runs cannot be uploaded');
    if (input.holdRulesVersion === 2 && input.holdTickIntervalMs !== serverHoldTickInterval()) {
      return sendError(res, 422, 'Replay hold rules do not match this deployment');
    }

    const chart = await findChartRevision(input.chartRevisionId);
    if (!chart) return sendError(res, 400, 'Replay does not reference a known catalog chart revision');
    if (chart.mode !== 3 || chart.key_count !== input.keyCount) return sendError(res, 400, 'Replay chart metadata does not match the catalog revision');
    if (input.checksumAlgorithm !== chart.checksum_algorithm || input.checksum.toLowerCase() !== chart.checksum.toLowerCase()) {
      return sendError(res, 400, 'Replay checksum does not match the catalog revision');
    }

    const canonicalChart = decodeCanonicalChart(chart.canonical_chart);
    const isIndependentlyVerified = chart.catalog_state === 'active' && chart.is_active && canonicalChart !== null;
    const verified = isIndependentlyVerified && canonicalChart ? verifyReplayAgainstChart(input, canonicalChart) : null;
    if (isIndependentlyVerified && !verified) return sendError(res, 422, 'Replay does not match the authoritative chart result');

    // Keep legacy profile joins populated while chart_revision_id remains the
    // authoritative replay identity.
    const legacyDifficultyId = `cloud_${chart.cloud_set_id}_${chart.source_chart_id ?? chart.chart_revision_id.slice(-64)}`.slice(0, 128);
    await query(
      `INSERT INTO beatmap_difficulties (id, beatmap_set_id, name, key_count, mode, beatmap_hash)
       VALUES ($1, $2, $3, $4, 3, $5)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, key_count = EXCLUDED.key_count, mode = 3`,
      [legacyDifficultyId, chart.cloud_set_id, chart.difficulty, chart.key_count, input.beatmapHash],
    );

    // A pending row is intentionally non-competitive. It is retained for a
    // retry after private chart verification, but its client score is never
    // treated as accepted evidence.
    const uploadStatus = verified ? 'uploaded' : 'pending';
    const score = verified?.score ?? input.score;
    const accuracy = verified?.accuracy ?? input.accuracy;
    const maxCombo = verified?.maxCombo ?? input.maxCombo;
    const grade = verified?.grade ?? input.grade;
    const isFailed = verified?.isFailed ?? input.isFailed;
    const scoreState = verified?.scoreState ?? input.scoreState;

    const saved = await query(
      `INSERT INTO replays (
         id, user_id, beatmap_set_id, beatmap_difficulty_id, chart_revision_id, beatmap_hash,
         score, accuracy, max_combo, grade, is_failed,
         score_state, replay_frames, recorded_settings, mods,
         replay_source, upload_status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'account-local', $16)
       ON CONFLICT (id) DO UPDATE SET
         beatmap_set_id = EXCLUDED.beatmap_set_id,
         chart_revision_id = EXCLUDED.chart_revision_id,
         beatmap_hash = EXCLUDED.beatmap_hash,
         score = EXCLUDED.score,
         accuracy = EXCLUDED.accuracy,
         max_combo = EXCLUDED.max_combo,
         grade = EXCLUDED.grade,
         is_failed = EXCLUDED.is_failed,
         score_state = EXCLUDED.score_state,
         replay_frames = EXCLUDED.replay_frames,
         recorded_settings = EXCLUDED.recorded_settings,
         mods = EXCLUDED.mods,
         upload_status = EXCLUDED.upload_status
       WHERE replays.user_id = EXCLUDED.user_id`,
      [
        input.id,
        session.userId,
        chart.cloud_set_id,
        legacyDifficultyId,
        input.chartRevisionId,
        input.beatmapHash,
        score,
        accuracy,
        maxCombo,
        grade,
        isFailed,
        JSON.stringify(scoreState),
        JSON.stringify(input.replayFrames),
        JSON.stringify(input.recordedSettings),
        JSON.stringify(input.mods),
        uploadStatus,
      ],
    );

    if (saved.rowCount === 0) return sendError(res, 409, 'Replay ID is already owned by another account');
    return sendJson(res, uploadStatus === 'uploaded' ? 200 : 202, {
      success: true,
      data: {
        recordId: input.id,
        uploadStatus,
        verified: uploadStatus === 'uploaded',
        message: uploadStatus === 'uploaded'
          ? 'Replay uploaded successfully to server'
          : 'Replay stored pending independent chart verification',
      },
    });
  } catch (error: unknown) {
    console.error('Replay upload request failed:', error instanceof Error ? error.name : 'unknown');
    return sendError(res, 500, 'Replay upload service unavailable');
  }
}
