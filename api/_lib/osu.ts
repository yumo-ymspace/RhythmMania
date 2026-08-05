interface OsuChart { id: number; filename: string; version: string; keyCount: number; checksum: string; }
interface EligibleOsuSet { title: string; artist: string; creator: string; status: string; coverUrl?: string; charts: OsuChart[]; }
let cached: { token: string; expiresAt: number } | null = null;
const eligibleStatuses = new Set(['ranked', 'loved']);

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60000) return cached.token;
  const id = process.env.OSU_CLIENT_ID;
  const secret = process.env.OSU_CLIENT_SECRET;
  if (!id || !secret) throw new Error('osu! API credentials are not configured');
  const response = await fetch('https://osu.ppy.sh/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: Number(id), client_secret: secret, grant_type: 'client_credentials', scope: 'public' }) });
  if (!response.ok) throw new Error('osu! authorization failed');
  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('osu! authorization returned no token');
  cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return data.access_token;
}

export async function osuApi<T>(path: string): Promise<T> {
  const response = await fetch(`https://osu.ppy.sh/api/v2${path}`, { headers: { Authorization: `Bearer ${await accessToken()}`, Accept: 'application/json' } });
  if (!response.ok) throw new Error('osu! API request failed');
  return response.json() as Promise<T>;
}

export async function fetchEligibleOsuSet(setId: number): Promise<EligibleOsuSet | null> {
  const set = await osuApi<any>(`/beatmapsets/${setId}`);
  if (!eligibleStatuses.has(String(set.status))) return null;
  const charts: OsuChart[] = (Array.isArray(set.beatmaps) ? set.beatmaps : []).filter((b: any) => b.mode_int === 3 && Number.isInteger(b.difficulty_rating) || b.mode_int === 3).map((b: any) => ({ id: b.id, filename: b.osu_file?.filename || `${b.id}.osu`, version: String(b.version || 'Normal'), keyCount: Number(b.cs), checksum: String(b.checksum || '') })).filter((b: OsuChart) => b.id > 0 && b.checksum && b.keyCount >= 2 && b.keyCount <= 8);
  if (!charts.length) return null;
  return { title: String(set.title || 'Unknown Title'), artist: String(set.artist || 'Unknown Artist'), creator: String(set.creator || 'Unknown Mapper'), status: String(set.status), coverUrl: typeof set.cover?.url === 'string' ? set.cover.url : undefined, charts };
}

export async function searchEligibleOsuSets(text: string, cursor?: string): Promise<{ sets: Array<EligibleOsuSet & { sourceSetId: number }>; cursor?: string }> {
  const params = new URLSearchParams({ q: text, limit: '50', mode: 'mania' });
  if (cursor) params.set('cursor_string', cursor);
  const response = await osuApi<any>(`/beatmapsets/search?${params.toString()}`);
  const sets = (Array.isArray(response.beatmapsets) ? response.beatmapsets : []).filter((set: any) => eligibleStatuses.has(String(set.status))).map((set: any) => ({
    sourceSetId: Number(set.id), title: String(set.title || 'Unknown Title'), artist: String(set.artist || 'Unknown Artist'), creator: String(set.creator || 'Unknown Mapper'), status: String(set.status), coverUrl: typeof set.covers?.card === 'string' ? set.covers.card : undefined,
    charts: (Array.isArray(set.beatmaps) ? set.beatmaps : []).filter((b: any) => b.mode_int === 3 && b.checksum && Number(b.cs) >= 2 && Number(b.cs) <= 8).map((b: any) => ({ id: Number(b.id), filename: `${b.id}.osu`, version: String(b.version || 'Normal'), keyCount: Number(b.cs), checksum: String(b.checksum) })),
  })).filter((set: EligibleOsuSet) => set.charts.length > 0);
  return { sets, cursor: typeof response.cursor_string === 'string' ? response.cursor_string : undefined };
}
