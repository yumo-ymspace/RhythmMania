const CATALOG_SET_METADATA_KEY = 'rhythm_mania_v1_catalog_set_metadata';

export interface CatalogSetMetadata {
  sourceSetId: number;
  title: string;
  artist: string;
  creator: string;
  slimCoverUrl?: string;
  savedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isApprovedCoverUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'assets.ppy.sh' && url.pathname.startsWith('/beatmaps/');
  } catch {
    return false;
  }
}

function readAll(): Record<string, CatalogSetMetadata> {
  if (typeof window === 'undefined') return {};
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(CATALOG_SET_METADATA_KEY) || '{}');
    if (!isRecord(raw)) return {};
    const result: Record<string, CatalogSetMetadata> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!isRecord(value)) continue;
      const sourceSetId = Number(value.sourceSetId);
      if (!Number.isInteger(sourceSetId) || sourceSetId < 1) continue;
      if (typeof value.title !== 'string' || typeof value.artist !== 'string' || typeof value.creator !== 'string') continue;
      result[key] = {
        sourceSetId,
        title: value.title.slice(0, 300),
        artist: value.artist.slice(0, 300),
        creator: value.creator.slice(0, 300),
        slimCoverUrl: isApprovedCoverUrl(value.slimCoverUrl) ? value.slimCoverUrl : undefined,
        savedAt: Number.isFinite(Number(value.savedAt)) ? Number(value.savedAt) : 0,
      };
    }
    return result;
  } catch {
    return {};
  }
}

export function getCatalogSetMetadata(sourceSetId: number): CatalogSetMetadata | null {
  return readAll()[String(sourceSetId)] || null;
}

export function saveCatalogSetMetadata(metadata: Omit<CatalogSetMetadata, 'savedAt'>): void {
  if (typeof window === 'undefined' || !Number.isInteger(metadata.sourceSetId) || metadata.sourceSetId < 1) return;
  try {
    const all = readAll();
    all[String(metadata.sourceSetId)] = { ...metadata, savedAt: Date.now() };
    const entries = Object.entries(all).sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, 500);
    window.localStorage.setItem(CATALOG_SET_METADATA_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Local metadata is an enhancement; quota failures must not block downloads.
  }
}
