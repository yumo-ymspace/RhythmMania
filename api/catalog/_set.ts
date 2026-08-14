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
import { getSessionFromReq } from '../_lib/auth.js';
import { query } from '../_lib/db.js';
import { handleCors, sendError, sendJson } from '../_lib/response.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return sendError(res, 405, 'Method Not Allowed');
  if (!await getSessionFromReq(req)) return sendError(res, 401, 'Sign in to access cloud maps');
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!id || id.length > 128) return sendError(res, 400, 'Missing cloud set id');
  const result = await query(`SELECT bs.id, bs.title, bs.artist, bs.creator, bs.source, bs.source_set_id,
    bs.catalog_state, bs.rank_status, bs.cover_url,
    COALESCE(json_agg(json_build_object(
    'chartRevisionId', cr.id, 'cloudSetId', bs.id, 'sourceChartId', cr.source_chart_id,
    'originalOsuFilename', cr.original_osu_filename, 'checksum', cr.checksum,
    'checksumAlgorithm', cr.checksum_algorithm, 'difficulty', cr.difficulty_name,
    'keyCount', cr.key_count, 'mode', cr.mode,
    'isActive', (cr.is_active AND bs.catalog_state = 'active' AND cr.canonical_chart IS NOT NULL)
  ) ORDER BY cr.key_count, cr.difficulty_name) FILTER (WHERE cr.id IS NOT NULL), '[]') AS charts
  FROM beatmap_sets bs LEFT JOIN beatmap_chart_revisions cr ON cr.beatmap_set_id = bs.id
   WHERE bs.id = $1 AND bs.source = 'osuapi' GROUP BY bs.id`, [id]);
  if (!result.rows[0]) return sendError(res, 404, 'Cloud set not found');
  return sendJson(res, 200, { success: true, data: result.rows[0] });
}
