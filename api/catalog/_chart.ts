import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionFromReq } from '../_lib/auth.js';
import { findChartRevision } from '../_lib/cloudCatalog.js';
import { handleCors, sendError, sendJson } from '../_lib/response.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return sendError(res, 405, 'Method Not Allowed');
  if (!await getSessionFromReq(req)) return sendError(res, 401, 'Sign in to access cloud maps');
  const id = typeof req.query.chartRevisionId === 'string' ? req.query.chartRevisionId : '';
  if (!id || id.length > 256) return sendError(res, 400, 'Missing chart revision id');
  const row = await findChartRevision(id);
  if (!row) return sendError(res, 404, 'Chart revision not found');
  return sendJson(res, 200, { success: true, data: {
    chartRevisionId: row.chart_revision_id, cloudSetId: row.cloud_set_id, source: row.source,
    sourceSetId: row.source_set_id, sourceChartId: row.source_chart_id,
    originalOsuFilename: row.original_osu_filename, checksum: row.checksum,
    checksumAlgorithm: row.checksum_algorithm, title: row.title, artist: row.artist,
    creator: row.creator, difficulty: row.difficulty, keyCount: row.key_count, mode: row.mode,
    state: row.catalog_state, isActive: row.is_active,
    downloadUrl: `/api/catalog/download?cloudSetId=${encodeURIComponent(row.cloud_set_id)}`,
  }});
}
