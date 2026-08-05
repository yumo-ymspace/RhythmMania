import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionFromReq } from '../_lib/auth.js';
import { query } from '../_lib/db.js';
import { handleCors, sendError, sendJson } from '../_lib/response.js';
import { searchEligibleOsuSets } from '../_lib/osu.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return sendError(res, 405, 'Method Not Allowed');
  try {
    const session = await getSessionFromReq(req);
    if (!session) return sendError(res, 401, 'Sign in to browse the osu! mirror');
    const text = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.slice(0, 256) : undefined;
    const limit = await query(`INSERT INTO catalog_search_rate_limits (user_id, window_started, request_count) VALUES ($1, NOW(), 1)
      ON CONFLICT (user_id) DO UPDATE SET request_count = CASE WHEN catalog_search_rate_limits.window_started < NOW() - INTERVAL '1 minute' THEN 1 ELSE catalog_search_rate_limits.request_count + 1 END,
      window_started = CASE WHEN catalog_search_rate_limits.window_started < NOW() - INTERVAL '1 minute' THEN NOW() ELSE catalog_search_rate_limits.window_started END
      RETURNING request_count`, [session.userId]);
    if (Number(limit.rows[0]?.request_count) > 10) return sendError(res, 429, 'Catalog search rate limit exceeded');
    const upstream = await searchEligibleOsuSets(text, cursor);
    return sendJson(res, 200, {
      success: true,
      data: upstream.sets.map(set => ({ ...set, id: `osuapi_${set.sourceSetId}`, source: 'osuapi', catalogState: 'pending' })),
      meta: { cursor: upstream.cursor },
    });
  } catch (error) {
    console.error('Catalog search failed:', error);
    return sendError(res, 500, 'osu! mirror search failed. Verify the catalog database migration and credentials.');
  }
}
