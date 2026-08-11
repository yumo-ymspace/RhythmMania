import crypto from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSessionFromReq } from '../_lib/auth.js';
import { withTransaction } from '../_lib/db.js';
import { extractBearerToken, fetchEligibleOsuSetWithToken } from '../_lib/osu.js';
import { handleCors, requireSameOrigin, sendError, sendJson } from '../_lib/response.js';
import { PENDING_REGISTRATION_TTL_MS } from '../_lib/catalogRegistration.js';

interface RegisteredChart {
  id: number;
  filename: string;
  version: string;
  keyCount: number;
  checksum: string;
  starRating: number;
}

interface CatalogResponse {
  cloudSetId: string;
  sourceSetId: number;
  state: 'pending' | 'active';
  token?: string;
  charts: Array<RegisteredChart & {
    chartRevisionId: string;
    originalOsuFilename: string;
    difficulty: string;
    name: string;
    checksumAlgorithm: 'md5' | 'sha256';
    isActive: boolean;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toCatalogChart(chart: RegisteredChart, cloudSetId: string, isActive: boolean) {
  return {
    ...chart,
    chartRevisionId: `osuapi_${cloudSetId.slice('osuapi_'.length)}_b${chart.id}_${chart.checksum}`,
    originalOsuFilename: chart.filename,
    difficulty: chart.version,
    name: chart.version,
    checksumAlgorithm: (chart.checksum.length === 64 ? 'sha256' : 'md5') as 'md5' | 'sha256',
    isActive,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'Method Not Allowed');
  if (!requireSameOrigin(req, res)) return;

  const session = await getSessionFromReq(req);
  if (!session) return sendError(res, 401, 'Sign in with Google to register maps for online scores');
  const accessToken = extractBearerToken(req);
  if (!accessToken) return sendError(res, 401, 'Connect osu! to register a download');

  const body: unknown = req.body;
  const setId = isRecord(body) ? body.beatmapsetId : undefined;
  const sourceSetId = typeof setId === 'number' && Number.isInteger(setId) && setId >= 1 && setId <= 2_147_483_647 ? setId : null;
  if (sourceSetId === null) return sendError(res, 400, 'Invalid beatmapset id');

  try {
    const set = await fetchEligibleOsuSetWithToken(accessToken, sourceSetId);
    if (!set) return sendError(res, 422, 'The osu! set is not an eligible mania set (ranked, loved, or graveyard)');
    if (
      set.title.length < 1 || set.title.length > 255 ||
      set.artist.length < 1 || set.artist.length > 255 ||
      set.creator.length < 1 || set.creator.length > 255 ||
      set.status.length < 1 || set.status.length > 32 ||
      set.charts.length > 100 ||
      set.charts.some((chart) =>
        !Number.isInteger(chart.id) || chart.id < 1 ||
        chart.filename.length < 1 || chart.filename.length > 512 ||
        chart.version.length < 1 || chart.version.length > 255 ||
        !Number.isInteger(chart.keyCount) || chart.keyCount < 2 || chart.keyCount > 8 ||
        !/^(?:[a-f0-9]{32}|[a-f0-9]{64})$/i.test(chart.checksum)
      )
    ) {
      return sendError(res, 422, 'The osu! set metadata could not be verified');
    }

    const cloudSetId = `osuapi_${sourceSetId}`;
    const token = crypto.randomBytes(24).toString('base64url');
    const response = await withTransaction(async (client): Promise<CatalogResponse> => {
      const existing = await client.query<{ catalog_state: 'pending' | 'active'; source_metadata: unknown; source_set_id: number }>(
        `SELECT catalog_state, source_metadata, source_set_id
          FROM beatmap_sets WHERE id = $1 AND source = 'osuapi' FOR UPDATE`,
        [cloudSetId],
      );
      const existingRow = existing.rows[0];
      if (existingRow?.catalog_state === 'active') {
        const charts = await client.query<{ id: number; source_chart_id: number; original_osu_filename: string; difficulty_name: string; checksum: string; key_count: number; is_active: boolean }>(
          `SELECT id, source_chart_id, original_osu_filename, difficulty_name, checksum, key_count, is_active
           FROM beatmap_chart_revisions WHERE beatmap_set_id = $1 ORDER BY key_count, difficulty_name`,
          [cloudSetId],
        );
        return {
          cloudSetId,
          sourceSetId: existingRow.source_set_id,
          state: 'active',
           charts: charts.rows.map((chart) => toCatalogChart({ id: chart.source_chart_id, filename: chart.original_osu_filename, version: chart.difficulty_name, keyCount: chart.key_count, checksum: chart.checksum, starRating: 0 }, cloudSetId, chart.is_active)),
        };
      }
      await client.query(
        `INSERT INTO beatmap_sets (id, title, artist, creator, mode, source, source_set_id, catalog_state, rank_status, cover_url, source_metadata)
          VALUES ($1,$2,$3,$4,3,'osuapi',$5,'pending',$6,$7,$8)
          ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, artist=EXCLUDED.artist, creator=EXCLUDED.creator,
            mode=3, source_set_id=EXCLUDED.source_set_id, catalog_state='pending', rank_status=EXCLUDED.rank_status,
            cover_url=EXCLUDED.cover_url, source_metadata=EXCLUDED.source_metadata, updated_at=NOW()
          WHERE beatmap_sets.catalog_state = 'pending'`,
        [cloudSetId, set.title, set.artist, set.creator, sourceSetId, set.status, set.coverUrl || null, JSON.stringify({
          token,
          userId: session.userId,
          charts: set.charts,
          registrationExpiresAt: new Date(Date.now() + PENDING_REGISTRATION_TTL_MS).toISOString(),
        })],
      );
      await client.query(
        `UPDATE beatmap_chart_revisions SET is_active = FALSE, is_current = FALSE, canonical_chart = NULL
         WHERE beatmap_set_id = $1`,
        [cloudSetId],
      );
      for (const chart of set.charts) {
        await client.query(
          `INSERT INTO beatmap_chart_revisions (id, beatmap_set_id, source_chart_id, original_osu_filename, difficulty_name, key_count, mode, checksum, checksum_algorithm, is_current, is_active, canonical_chart)
           VALUES ($1,$2,$3,$4,$5,$6,3,$7,$8,TRUE,FALSE,NULL)
           ON CONFLICT (id) DO UPDATE SET checksum=EXCLUDED.checksum, checksum_algorithm=EXCLUDED.checksum_algorithm,
             original_osu_filename=EXCLUDED.original_osu_filename, difficulty_name=EXCLUDED.difficulty_name,
             key_count=EXCLUDED.key_count, is_current=FALSE, is_active=FALSE, canonical_chart=NULL`,
          [`osuapi_${sourceSetId}_b${chart.id}_${chart.checksum}`, cloudSetId, chart.id, chart.filename, chart.version, chart.keyCount, chart.checksum, chart.checksum.length === 64 ? 'sha256' : 'md5'],
        );
      }
      return {
        cloudSetId,
        sourceSetId,
        state: 'pending',
        token,
        charts: set.charts.map((chart) => toCatalogChart(chart, cloudSetId, false)),
      };
    });
    return sendJson(res, 200, { success: true, data: response });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    if (message.includes('invalid or expired')) return sendError(res, 401, 'osu! authorization failed');
    if (message.includes('rate limit')) return sendError(res, 429, 'Catalog rate limit exceeded');
    console.error('Catalog register-download failed:', error instanceof Error ? error.name : 'unknown');
    return sendError(res, 500, 'Failed to register osu! set for download');
  }
}
