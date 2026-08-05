export interface OsuChart {
  id: number;
  filename: string;
  version: string;
  keyCount: number;
  checksum: string;
}

export interface EligibleOsuSet {
  title: string;
  artist: string;
  creator: string;
  status: string;
  coverUrl?: string;
  charts: OsuChart[];
}

export type OsuSearchStatus = 'ranked' | 'loved' | 'graveyard';

type UnknownRecord = Record<string, unknown>;

const ELIGIBLE_STATUSES = new Set<string>(['ranked', 'loved', 'graveyard']);

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

function coverFromSet(rawSet: UnknownRecord): string | undefined {
  if (isRecord(rawSet.covers) && typeof rawSet.covers.card === 'string') return rawSet.covers.card;
  if (isRecord(rawSet.cover) && typeof rawSet.cover.url === 'string') return rawSet.cover.url;
  return undefined;
}

function parseEligibleSet(rawSet: UnknownRecord, requireEligibleStatus: boolean): (EligibleOsuSet & { sourceSetId: number }) | null {
  const sourceSetId = Number(rawSet.id);
  if (!Number.isInteger(sourceSetId) || sourceSetId < 1) return null;
  const status = String(rawSet.status || '');
  if (requireEligibleStatus && !ELIGIBLE_STATUSES.has(status)) return null;

  const charts = asRecords(rawSet.beatmaps)
    .filter((beatmap) => beatmap.mode_int === 3)
    .map((beatmap) => toChart(beatmap, `${beatmap.id}.osu`))
    .filter((chart): chart is OsuChart => chart !== null);
  if (!charts.length) return null;

  return {
    sourceSetId,
    title: String(rawSet.title || 'Unknown Title'),
    artist: String(rawSet.artist || 'Unknown Artist'),
    creator: String(rawSet.creator || 'Unknown Mapper'),
    status,
    coverUrl: coverFromSet(rawSet),
    charts,
  };
}

export function extractBearerToken(req: { headers: { authorization?: string | string[] } }): string | null {
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value || typeof value !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  const token = match?.[1]?.trim();
  return token || null;
}

export async function osuApiWithToken(accessToken: string, path: string): Promise<unknown> {
  const response = await fetch(`https://osu.ppy.sh/api/v2${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (response.status === 401) throw new Error('osu! token is invalid or expired');
  if (response.status === 429) throw new Error('osu! rate limit exceeded');
  if (!response.ok) throw new Error(`osu! API request failed (${response.status})`);
  return response.json();
}

export async function fetchEligibleOsuSetWithToken(accessToken: string, setId: number): Promise<EligibleOsuSet | null> {
  const rawSet = await osuApiWithToken(accessToken, `/beatmapsets/${setId}`);
  if (!isRecord(rawSet)) return null;
  const parsed = parseEligibleSet(rawSet, true);
  if (!parsed) return null;
  return {
    title: parsed.title,
    artist: parsed.artist,
    creator: parsed.creator,
    status: parsed.status,
    coverUrl: parsed.coverUrl,
    charts: parsed.charts,
  };
}

export async function searchEligibleOsuSetsWithToken(
  accessToken: string,
  text: string,
  status: OsuSearchStatus,
  cursor?: string,
): Promise<{ sets: Array<EligibleOsuSet & { sourceSetId: number }>; cursor?: string }> {
  const params = new URLSearchParams({
    q: text,
    limit: '50',
    mode: 'mania',
    s: status,
  });
  if (cursor) params.set('cursor_string', cursor);
  const rawResponse = await osuApiWithToken(accessToken, `/beatmapsets/search?${params.toString()}`);
  if (!isRecord(rawResponse)) return { sets: [], cursor: undefined };
  const sets = asRecords(rawResponse.beatmapsets)
    .map((set) => parseEligibleSet(set, true))
    .filter((set): set is EligibleOsuSet & { sourceSetId: number } => set !== null);
  return {
    sets,
    cursor: typeof rawResponse.cursor_string === 'string' ? rawResponse.cursor_string : undefined,
  };
}

export function isOsuSearchStatus(value: unknown): value is OsuSearchStatus {
  return value === 'ranked' || value === 'loved' || value === 'graveyard';
}
