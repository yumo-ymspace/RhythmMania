import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionFromReq } from '../_lib/auth.js';
import { query } from '../_lib/db.js';
import { handleCors, sendError, sendJson } from '../_lib/response.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'Method Not Allowed');
  const session = await getSessionFromReq(req);
  if (!session) return sendError(res, 401, 'Sign in to activate a cloud download');
  const cloudSetId = req.body?.cloudSetId;
  const token = req.body?.token;
  const charts = req.body?.charts;
   if (typeof cloudSetId !== 'string' || !/^osuapi_\d+$/.test(cloudSetId) || typeof token !== 'string' || !token || !Array.isArray(charts) || charts.length === 0 || charts.some((chart: any) => !Number.isInteger(chart?.beatmapId) || chart.beatmapId < 1 || typeof chart?.checksum !== 'string' || !chart.checksum)) return sendError(res, 400, 'Invalid activation request');
  const result = await query<{ source_metadata: any; catalog_state: string; source_set_id: number }>('SELECT source_metadata, catalog_state, source_set_id FROM beatmap_sets WHERE id = $1 AND source = \'osuapi\'', [cloudSetId]);
  const row = result.rows[0];
   if (!row) return sendError(res, 404, 'Pending cloud set not found');
  if (row.source_metadata?.token !== token || row.source_metadata?.userId !== session.userId) return sendError(res, 403, 'Activation token is invalid or expired');
  const expected = Array.isArray(row.source_metadata.charts) ? row.source_metadata.charts : [];
  const submitted = charts.map((chart: any) => `${chart.beatmapId}:${String(chart.checksum || '').toLowerCase()}`).sort();
  const authoritative = expected.map((chart: any) => `${chart.id}:${String(chart.checksum || '').toLowerCase()}`).sort();
  if (submitted.length !== authoritative.length || submitted.some((value: string, index: number) => value !== authoritative[index])) return sendError(res, 422, 'Downloaded archive did not match official osu! chart checksums');
  await query(`UPDATE beatmap_sets SET catalog_state='active', updated_at=NOW(), source_metadata = source_metadata - 'token' - 'userId' WHERE id=$1`, [cloudSetId]);
  await query(`UPDATE beatmap_chart_revisions SET is_active=TRUE, is_current=TRUE WHERE beatmap_set_id=$1`, [cloudSetId]);
  return sendJson(res, 200, { success: true, data: { cloudSetId, state: 'active' } });
}
