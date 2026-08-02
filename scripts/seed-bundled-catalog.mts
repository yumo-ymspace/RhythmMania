import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import JSZip from 'jszip';
import pg from 'pg';
import { bundledCatalogOverrides } from './bundledCatalogOverrides.ts';

const root = process.cwd();
const supported = (mode: number, keys: number) => mode === 3 && keys >= 2 && keys <= 8;
const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
function metadata(content: string) {
  const get = (key: string) => content.match(new RegExp(`^${key}:(.*)$`, 'mi'))?.[1]?.trim() || '';
  return { title: get('Title'), artist: get('Artist'), creator: get('Creator'), difficulty: get('Version'), mode: Number(get('Mode') || 3), keys: Number(get('CircleSize') || 4) };
}

const env = process.env;
const pool = new pg.Pool({ connectionString: env.DATABASE_URL || env.POSTGRES_URL, host: env.PGHOST, port: env.PGPORT ? Number(env.PGPORT) : undefined, database: env.PGDATABASE, user: env.PGUSER, password: env.PGPASSWORD, ssl: env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false } });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const files = (await fs.readdir(path.join(root, 'public', 'beatmaps'))).filter(file => file.toLowerCase().endsWith('.osz'));
  for (const file of files) {
    const base = file.slice(0, -4);
    const slug = bundledCatalogOverrides[file] || slugify(base);
    if (!slug) throw new Error(`Cannot derive a slug for ${file}`);
    const setId = `rmbm_${slug}`;
    const buffer = await fs.readFile(path.join(root, 'public', 'beatmaps', file));
    const zip = await JSZip.loadAsync(buffer);
    const charts: Array<{ filename: string; content: string; meta: ReturnType<typeof metadata>; checksum: string }> = [];
    for (const [filename, entry] of Object.entries(zip.files)) {
      if (entry.dir || !filename.toLowerCase().endsWith('.osu')) continue;
      const content = await entry.async('string');
      const meta = metadata(content);
      if (!supported(meta.mode, meta.keys)) continue;
      charts.push({ filename, content, meta, checksum: crypto.createHash('sha256').update(Buffer.from(content, 'utf8')).digest('hex') });
    }
    if (!charts.length) continue;
    const first = charts[0]!.meta;
    const packageUrl = `/beatmaps/${encodeURIComponent(file)}`;
    const previous = await client.query<{ source_metadata: { packageDigest?: string } }>('SELECT source_metadata FROM beatmap_sets WHERE id = $1', [setId]);
    const packageDigest = crypto.createHash('sha256').update(buffer).digest('hex');
    if (previous.rows[0]?.source_metadata?.packageDigest && previous.rows[0].source_metadata.packageDigest !== packageDigest) {
      console.warn(`Replacing bundled catalog set ${setId}; old scores and replays will be deleted.`);
      await client.query('DELETE FROM beatmap_sets WHERE id = $1', [setId]);
    }
    await client.query(`INSERT INTO beatmap_sets (id,title,artist,creator,osz_url,mode,source,source_slug,catalog_state,download_url,source_metadata)
      VALUES ($1,$2,$3,$4,$5,3,'bundled',$6,'active',$5,$7)
      ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,artist=EXCLUDED.artist,creator=EXCLUDED.creator,osz_url=EXCLUDED.osz_url,download_url=EXCLUDED.download_url,source_metadata=EXCLUDED.source_metadata,updated_at=NOW()`,
      [setId, first.title || base, first.artist || 'Unknown Artist', first.creator || 'Unknown Mapper', packageUrl, slug, JSON.stringify({ packageDigest, filename: file })]);
    for (const chart of charts) {
      const revisionId = `${setId}_${chart.checksum}`;
      await client.query(`INSERT INTO beatmap_chart_revisions (id,beatmap_set_id,original_osu_filename,difficulty_name,key_count,mode,checksum,checksum_algorithm,is_current,is_active)
        VALUES ($1,$2,$3,$4,$5,3,$6,'sha256',TRUE,TRUE)
        ON CONFLICT (id) DO UPDATE SET difficulty_name=EXCLUDED.difficulty_name,key_count=EXCLUDED.key_count,is_current=TRUE,is_active=TRUE`,
        [revisionId, setId, chart.filename, chart.meta.difficulty || 'Normal', chart.meta.keys, chart.checksum]);
    }
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
