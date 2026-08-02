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
    if (!session) return sendError(res, 401, 'Sign in to browse the cloud catalog');
    const text = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.slice(0, 256) : undefined;
    const source = req.query.source === 'osu' ? 'osu' : 'local';
    if (source === 'osu') {
      const limit = await query(`INSERT INTO catalog_search_rate_limits (user_id, window_started, request_count) VALUES ($1, NOW(), 1)
        ON CONFLICT (user_id) DO UPDATE SET request_count = CASE WHEN catalog_search_rate_limits.window_started < NOW() - INTERVAL '1 minute' THEN 1 ELSE catalog_search_rate_limits.request_count + 1 END,
        window_started = CASE WHEN catalog_search_rate_limits.window_started < NOW() - INTERVAL '1 minute' THEN NOW() ELSE catalog_search_rate_limits.window_started END
        RETURNING request_count`, [session.userId]);
      if (Number(limit.rows[0]?.request_count) > 10) return sendError(res, 429, 'Catalog search rate limit exceeded');
      const upstream = await searchEligibleOsuSets(text, cursor);
      return sendJson(res, 200, { success: true, data: upstream.sets, meta: { cursor: upstream.cursor } });
    }
    const pattern = `%${text.replace(/[%_\\]/g, '\\$&')}%`;
    const result = await query(`
     SELECT bs.id AS cloud_set_id, bs.source, bs.source_set_id, bs.title, bs.artist, bs.creator,
            bs.cover_url, bs.catalog_state, bs.rank_status, bs.download_url, bs.osz_url, bs.source_metadata,
           COALESCE(json_agg(json_build_object(
             'chartRevisionId', cr.id, 'cloudSetId', bs.id, 'sourceChartId', cr.source_chart_id,
             'originalOsuFilename', cr.original_osu_filename, 'checksum', cr.checksum,
             'checksumAlgorithm', cr.checksum_algorithm, 'difficulty', cr.difficulty_name,
             'keyCount', cr.key_count, 'mode', cr.mode, 'isActive', cr.is_active
           ) ORDER BY cr.key_count, cr.difficulty_name) FILTER (WHERE cr.id IS NOT NULL), '[]') AS charts
    FROM beatmap_sets bs LEFT JOIN beatmap_chart_revisions cr ON cr.beatmap_set_id = bs.id
    WHERE bs.catalog_state = 'active' AND (bs.title ILIKE $1 ESCAPE '\\' OR bs.artist ILIKE $1 ESCAPE '\\' OR bs.creator ILIKE $1 ESCAPE '\\')
      GROUP BY bs.id ORDER BY lower(bs.artist), lower(bs.title) LIMIT 50`, [pattern]);
    return sendJson(res, 200, { success: true, data: result.rows.map((row: any) => {
      const bundledUrl = row.source === 'bundled' && row.source_metadata?.filename
        ? `/beatmaps/${encodeURIComponent(row.source_metadata.filename)}`
        : null;
      const downloadUrl = row.download_url || row.osz_url || bundledUrl;
      return {
       id: row.cloud_set_id, cloudSetId: row.cloud_set_id, source: row.source,
       sourceSetId: row.source_set_id, title: row.title, artist: row.artist, creator: row.creator,
       coverUrl: row.cover_url, catalogState: row.catalog_state, rankStatus: row.rank_status,
       oszUrl: downloadUrl, downloadUrl, difficulties: row.charts,
      };
    }) });
  } catch (error) {
    console.error('Catalog search failed:', error);
    return sendError(res, 500, 'Cloud catalog search failed. Verify the catalog database migration and credentials.');
  }
}
