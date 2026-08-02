import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionFromReq } from '../_lib/auth.js';
import { query } from '../_lib/db.js';
import { handleCors, sendError } from '../_lib/response.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return sendError(res, 405, 'Method Not Allowed');

  const session = await getSessionFromReq(req);
  if (!session) return sendError(res, 401, 'Sign in to download osu!mania maps');

  const cloudSetId = typeof req.query.cloudSetId === 'string' ? req.query.cloudSetId : '';
  if (!/^osuapi_\d+$/.test(cloudSetId)) return sendError(res, 400, 'Invalid cloud set id');

  const result = await query<{ source_set_id: number; source_metadata: any; catalog_state: string }>(
    "SELECT source_set_id, source_metadata, catalog_state FROM beatmap_sets WHERE id = $1 AND source = 'osuapi'",
    [cloudSetId],
  );
  const row = result.rows[0];
  if (!row || (row.catalog_state !== 'active' && row.source_metadata?.userId !== session.userId)) {
    return sendError(res, 404, 'Cloud download not found');
  }

  const upstream = await fetch(`https://osudl.org/s/${row.source_set_id}`);
  if (!upstream.ok || !upstream.body) {
    return sendError(res, upstream.status >= 400 ? upstream.status : 502, 'osu! mirror download failed');
  }

  res.status(200);
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
  const length = upstream.headers.get('content-length');
  if (length) res.setHeader('Content-Length', length);

  const reader = upstream.body.getReader();
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      if (part.value) res.write(Buffer.from(part.value));
    }
    res.end();
  } catch (error) {
    reader.cancel().catch(() => {});
    if (!res.writableEnded) res.destroy(error instanceof Error ? error : undefined);
  }
}
