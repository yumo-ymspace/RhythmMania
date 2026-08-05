import crypto from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionFromReq } from '../_lib/auth.js';
import { query } from '../_lib/db.js';
import { extractBearerToken, fetchEligibleOsuSetWithToken } from '../_lib/osu.js';
import { handleCors, sendError, sendJson } from '../_lib/response.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'Method Not Allowed');

  const session = await getSessionFromReq(req);
  if (!session) return sendError(res, 401, 'Sign in with Google to register maps for online scores');

  const accessToken = extractBearerToken(req);
  if (!accessToken) return sendError(res, 401, 'Connect osu! to register a download');

  const setId = req.body?.beatmapsetId;
  if (!Number.isInteger(setId) || setId < 1 || setId > 2147483647) {
    return sendError(res, 400, 'Invalid beatmapset id');
  }

  try {
    const set = await fetchEligibleOsuSetWithToken(accessToken, setId);
    if (!set) return sendError(res, 422, 'The osu! set is not an eligible mania set (ranked, loved, or graveyard)');

    const cloudSetId = `osuapi_${setId}`;
    const token = crypto.randomBytes(24).toString('base64url');

    await query(
      `INSERT INTO beatmap_sets (id, title, artist, creator, source, source_set_id, catalog_state, rank_status, cover_url, source_metadata)
      VALUES ($1,$2,$3,$4,'osuapi',$5,'pending',$6,$7,$8)
      ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, artist=EXCLUDED.artist, creator=EXCLUDED.creator,
        catalog_state='pending', rank_status=EXCLUDED.rank_status, cover_url=EXCLUDED.cover_url,
        source_metadata=EXCLUDED.source_metadata, updated_at=NOW()`,
      [
        cloudSetId,
        set.title,
        set.artist,
        set.creator,
        setId,
        set.status,
        set.coverUrl,
        JSON.stringify({ token, userId: session.userId, charts: set.charts }),
      ],
    );

    for (const chart of set.charts) {
      await query(
        `INSERT INTO beatmap_chart_revisions (id, beatmap_set_id, source_chart_id, original_osu_filename, difficulty_name, key_count, mode, checksum, checksum_algorithm, is_current, is_active)
        VALUES ($1,$2,$3,$4,$5,$6,3,$7,'md5',TRUE,FALSE)
        ON CONFLICT (id) DO UPDATE SET checksum=EXCLUDED.checksum, original_osu_filename=EXCLUDED.original_osu_filename`,
        [
          `osuapi_${setId}_b${chart.id}_${chart.checksum}`,
          cloudSetId,
          chart.id,
          chart.filename,
          chart.version,
          chart.keyCount,
          chart.checksum,
        ],
      );
    }

    return sendJson(res, 200, {
      success: true,
      data: {
        cloudSetId,
        token,
        sourceSetId: setId,
        charts: set.charts.map((chart) => ({
          ...chart,
          chartRevisionId: `osuapi_${setId}_b${chart.id}_${chart.checksum}`,
          originalOsuFilename: chart.filename,
          difficulty: chart.version,
          name: chart.version,
          checksumAlgorithm: 'md5',
        })),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    if (message.includes('invalid or expired')) return sendError(res, 401, message);
    if (message.includes('rate limit')) return sendError(res, 429, message);
    console.error('Catalog register-download failed:', error);
    return sendError(res, 500, 'Failed to register osu! set for download');
  }
}
