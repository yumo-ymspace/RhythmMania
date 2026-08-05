interface OsuChart { id: number; filename: string; version: string; keyCount: number; checksum: string; }
interface EligibleOsuSet { title: string; artist: string; creator: string; status: string; coverUrl?: string; charts: OsuChart[]; }
type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecords(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function toChart(value: UnknownRecord, filename: string): OsuChart | null {
  const id = Number(value.id);
  const keyCount = Number(value.cs);
  const checksum = typeof value.checksum === 'string' ? value.checksum : '';
  if (!Number.isInteger(id) || id < 1 || !checksum || keyCount < 2 || keyCount > 8) return null;

  const osuFile = isRecord(value.osu_file) ? value.osu_file : undefined;
  return {
    id,
    filename: typeof osuFile?.filename === 'string' ? osuFile.filename : filename,
    version: typeof value.version === 'string' ? value.version : 'Normal',
    keyCount,
    checksum,
  };
}

let cached: { token: string; expiresAt: number } | null = null;
const eligibleStatuses = new Set(['ranked', 'loved']);

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60000) return cached.token;
  const id = process.env.OSU_CLIENT_ID;
  const secret = process.env.OSU_CLIENT_SECRET;
  if (!id || !secret) throw new Error('osu! API credentials are not configured');
  const response = await fetch('https://osu.ppy.sh/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: Number(id), client_secret: secret, grant_type: 'client_credentials', scope: 'public' }) });
  if (!response.ok) throw new Error('osu! authorization failed');
  const data: unknown = await response.json();
  if (!isRecord(data)) throw new Error('osu! authorization returned an invalid response');
  if (typeof data.access_token !== 'string' || !data.access_token) throw new Error('osu! authorization returned no token');
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600;
  cached = { token: data.access_token, expiresAt: Date.now() + expiresIn * 1000 };
  return data.access_token;
}

export async function osuApi(path: string): Promise<unknown> {
  const response = await fetch(`https://osu.ppy.sh/api/v2${path}`, { headers: { Authorization: `Bearer ${await accessToken()}`, Accept: 'application/json' } });
  if (!response.ok) throw new Error('osu! API request failed');
  return response.json();
}

export async function fetchEligibleOsuSet(setId: number): Promise<EligibleOsuSet | null> {
  const rawSet = await osuApi(`/beatmapsets/${setId}`);
  if (!isRecord(rawSet) || !eligibleStatuses.has(String(rawSet.status))) return null;
  const charts = asRecords(rawSet.beatmaps)
    .filter(beatmap => beatmap.mode_int === 3)
    .map(beatmap => toChart(beatmap, `${beatmap.id}.osu`))
    .filter((chart): chart is OsuChart => chart !== null);
  if (!charts.length) return null;
  const cover = isRecord(rawSet.cover) && typeof rawSet.cover.url === 'string' ? rawSet.cover.url : undefined;
  return { title: String(rawSet.title || 'Unknown Title'), artist: String(rawSet.artist || 'Unknown Artist'), creator: String(rawSet.creator || 'Unknown Mapper'), status: String(rawSet.status), coverUrl: cover, charts };
}

export async function searchEligibleOsuSets(text: string, cursor?: string): Promise<{ sets: Array<EligibleOsuSet & { sourceSetId: number }>; cursor?: string }> {
  const params = new URLSearchParams({ q: text, limit: '50', mode: 'mania' });
  if (cursor) params.set('cursor_string', cursor);
  const rawResponse = await osuApi(`/beatmapsets/search?${params.toString()}`);
  if (!isRecord(rawResponse)) return { sets: [], cursor: undefined };
  const sets = asRecords(rawResponse.beatmapsets).filter(set => eligibleStatuses.has(String(set.status))).map((set) => ({
    sourceSetId: Number(set.id), title: String(set.title || 'Unknown Title'), artist: String(set.artist || 'Unknown Artist'), creator: String(set.creator || 'Unknown Mapper'), status: String(set.status), coverUrl: isRecord(set.covers) && typeof set.covers.card === 'string' ? set.covers.card : undefined,
    charts: asRecords(set.beatmaps).filter(beatmap => beatmap.mode_int === 3).map(beatmap => toChart(beatmap, `${beatmap.id}.osu`)).filter((chart): chart is OsuChart => chart !== null),
  })).filter((set) => set.charts.length > 0);
  return { sets, cursor: typeof rawResponse.cursor_string === 'string' ? rawResponse.cursor_string : undefined };
}
