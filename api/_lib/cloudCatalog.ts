import { query } from './db.js';

export interface CloudChartRow {
  chart_revision_id: string;
  cloud_set_id: string;
  source: 'bundled' | 'osuapi';
  source_set_id: number | null;
  source_chart_id: number | null;
  title: string;
  artist: string;
  creator: string;
  cover_url: string | null;
  catalog_state: 'pending' | 'active';
  rank_status: string | null;
  download_url: string | null;
  original_osu_filename: string;
  checksum: string;
  checksum_algorithm: 'md5' | 'sha256';
  difficulty: string;
  key_count: number;
  mode: 3;
  is_active: boolean;
}

const SELECT = `
  SELECT cr.id AS chart_revision_id, bs.id AS cloud_set_id, bs.source, bs.source_set_id,
         cr.source_chart_id, bs.title, bs.artist, bs.creator, bs.cover_url,
         bs.catalog_state, bs.rank_status, bs.download_url, cr.original_osu_filename,
         cr.checksum, cr.checksum_algorithm, cr.difficulty_name AS difficulty,
         cr.key_count, cr.mode, cr.is_active
  FROM beatmap_chart_revisions cr
  JOIN beatmap_sets bs ON bs.id = cr.beatmap_set_id`;

export async function findChartRevision(chartRevisionId: string): Promise<CloudChartRow | null> {
  const result = await query<CloudChartRow>(`${SELECT} WHERE cr.id = $1`, [chartRevisionId]);
  return result.rows[0] || null;
}

export async function findActiveChartRevision(chartRevisionId: string): Promise<CloudChartRow | null> {
  const result = await query<CloudChartRow>(
    `${SELECT} WHERE cr.id = $1 AND cr.is_active = TRUE AND bs.catalog_state = 'active'`,
    [chartRevisionId]
  );
  return result.rows[0] || null;
}

export function isCloudSetActive(row: CloudChartRow): boolean {
  return row.catalog_state === 'active' && row.is_active;
}
