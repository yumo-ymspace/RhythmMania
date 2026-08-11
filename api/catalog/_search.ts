import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  extractBearerToken,
  isOsuSearchStatus,
  searchEligibleOsuSetsWithToken,
} from '../_lib/osu.js';
import { handleCors, sendError, sendJson } from '../_lib/response.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return sendError(res, 405, 'Method Not Allowed');

  try {
    const accessToken = extractBearerToken(req);
    if (!accessToken) return sendError(res, 401, 'Connect osu! to search the catalog');

    const text = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    if (!text) return sendError(res, 400, 'Search query is required');

    const statusRaw = typeof req.query.s === 'string' ? req.query.s.trim().toLowerCase() : 'ranked';
    if (!isOsuSearchStatus(statusRaw)) {
      return sendError(res, 400, 'Status must be ranked, loved, or graveyard');
    }

    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.slice(0, 256) : undefined;
    const upstream = await searchEligibleOsuSetsWithToken(accessToken, text, statusRaw, cursor);

    return sendJson(res, 200, {
      success: true,
      data: upstream.sets.map((set) => ({
        ...set,
        id: `osuapi_${set.sourceSetId}`,
        source: 'osuapi',
        catalogState: 'pending',
      })),
      meta: { cursor: upstream.cursor, status: statusRaw },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'osu! search failed';
    if (message.includes('invalid or expired')) return sendError(res, 401, 'osu! authorization failed');
    if (message.includes('rate limit')) return sendError(res, 429, 'Catalog rate limit exceeded');
    console.error('Catalog search failed:', error instanceof Error ? error.name : 'unknown');
    return sendError(res, 500, 'osu! catalog search failed');
  }
}
