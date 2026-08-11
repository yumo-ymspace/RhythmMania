import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionFromReq } from '../_lib/auth.js';
import { query } from '../_lib/db.js';
import { handleCors, sendError, sendJson } from '../_lib/response.js';

interface ReplayDetailRow {
  id: string;
  user_id: string | null;
  beatmap_set_id: string | null;
  beatmap_hash: string;
  chart_revision_id: string | null;
  checksum: string | null;
  checksum_algorithm: string | null;
  source: string | null;
  source_set_id: number | null;
  catalog_state: 'pending' | 'active' | null;
  chart_is_active: boolean | null;
  chart_key_count: number | null;
  chart_mode: number | null;
  chart_verified: boolean;
  score: number;
  accuracy: number;
  max_combo: number;
  grade: string;
  is_failed: boolean;
  score_state: unknown;
  replay_frames: unknown;
  recorded_settings: unknown;
  mods: unknown;
  replay_source: string;
  upload_status: string;
  created_at: Date;
  username: string | null;
  avatar_url: string | null;
  beatmap_title: string | null;
  beatmap_artist: string | null;
  beatmap_difficulty: string | null;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

function recordValue(value: unknown): Record<string, unknown> {
  const parsed = parseJson(value);
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed : [];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return sendError(res, 405, 'Method Not Allowed');

  const id = typeof (req.query.id || req.query.replayId) === 'string' ? (req.query.id || req.query.replayId) as string : '';
  const purpose = typeof req.query.purpose === 'string' ? req.query.purpose : 'view';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return sendError(res, 400, 'Missing replay id parameter');
  if (purpose !== 'view' && purpose !== 'download') return sendError(res, 400, 'Invalid replay access purpose');

  try {
    const session = await getSessionFromReq(req);
    const dbRes = await query<ReplayDetailRow>(
      `SELECT r.id, r.user_id, r.beatmap_set_id, r.beatmap_hash, r.chart_revision_id,
          cr.checksum, cr.checksum_algorithm, cr.is_active AS chart_is_active,
          cr.key_count AS chart_key_count, cr.mode AS chart_mode,
          (cr.canonical_chart IS NOT NULL) AS chart_verified,
          bs.source, bs.source_set_id, bs.catalog_state,
          r.score, r.accuracy, r.max_combo, r.grade, r.is_failed,
          r.score_state, r.replay_frames, r.recorded_settings, r.mods,
          r.replay_source, r.upload_status, r.created_at,
          u.username, u.avatar_url, bs.title AS beatmap_title, bs.artist AS beatmap_artist,
          cr.difficulty_name AS beatmap_difficulty
       FROM replays r
       LEFT JOIN users u ON r.user_id = u.id
       LEFT JOIN beatmap_sets bs ON r.beatmap_set_id = bs.id
       LEFT JOIN beatmap_chart_revisions cr ON r.chart_revision_id = cr.id
       WHERE r.id = $1`,
      [id],
    );
    const row = dbRes.rows[0];
    if (!row) return sendError(res, 404, 'Replay not found');
    const isOwn = Boolean(session && row.user_id === session.userId);
    if (purpose === 'download' && !isOwn) return sendError(res, 403, 'Only the replay owner may download this replay');
    if (row.upload_status !== 'uploaded' && !isOwn) return sendError(res, 404, 'Replay not found');
    if (row.upload_status === 'uploaded' && !row.chart_verified && !isOwn) return sendError(res, 404, 'Replay not found');
    if (row.chart_revision_id === null || row.chart_key_count === null || row.chart_mode !== 3) return sendError(res, 404, 'Replay chart revision is unavailable');

    const scoreState = recordValue(row.score_state);
    const mods = arrayValue(row.mods).filter((mod): mod is string => typeof mod === 'string');
    const isAcceptedChart = row.catalog_state === 'active' && row.chart_is_active === true && row.chart_verified;
    const record = {
      schemaVersion: 2,
      id: row.id,
      timestamp: new Date(row.created_at).getTime(),
      beatmapId: row.chart_revision_id,
      beatmapTitle: row.beatmap_title || 'Unknown Title',
      beatmapArtist: row.beatmap_artist || 'Unknown Artist',
      beatmapDifficulty: row.beatmap_difficulty || 'Normal',
      keyCount: row.chart_key_count,
      score: row.score,
      accuracy: row.accuracy,
      maxCombo: row.max_combo,
      grade: row.grade,
      isFailed: row.is_failed,
      scoreState,
      replayFrames: arrayValue(row.replay_frames),
      recordedSettings: recordValue(row.recorded_settings),
      mods,
      replaySource: row.replay_source || 'account-local',
      uploadStatus: row.upload_status,
      uploadEligibility: row.upload_status === 'uploaded' ? 'eligible' : 'ineligible_no_replay_frames',
      catalogSetId: row.beatmap_set_id || undefined,
      catalogMapId: row.chart_revision_id,
      chartRevisionId: row.chart_revision_id,
      beatmapHash: row.beatmap_hash,
      isServerCatalogMap: isAcceptedChart,
      username: row.username || 'Guest Player',
      avatarUrl: row.avatar_url,
      cloudSource: row.source || undefined,
      sourceSetId: row.source_set_id || undefined,
      checksum: row.checksum || undefined,
      checksumAlgorithm: row.checksum_algorithm === 'sha256' ? 'sha256' as const : 'md5' as const,
      catalogState: row.catalog_state || undefined,
    };
    return sendJson(res, 200, { success: true, data: { record, access: { view: true, canDownload: isOwn } } });
  } catch (error: unknown) {
    console.error('Replay detail request failed:', error instanceof Error ? error.name : 'unknown');
    return sendError(res, 500, 'Replay details unavailable');
  }
}
