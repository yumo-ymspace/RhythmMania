import JSZip from 'jszip';
import SparkMD5 from 'spark-md5';
import { Beatmap, CloudBeatmapSource, CloudChartRef } from '../types';
import { parseBeatmap, parseMediaPaths } from './beatmapParser';
import { storageManager, SavedBeatmap } from './storageManager';
import { MAX_COMPRESSED_SIZE_BYTES, assertSafeAssetUrl, validateZipEntrySize, validateZipLimits } from './securityLimits';

export interface CloudPackageDescriptor {
  cloudSetId: string;
  source: CloudBeatmapSource;
  downloadUrl: string;
  charts: CloudChartRef[];
  title: string;
}

export interface CloudImportProgress { loaded: number; total: number; phase: 'download' | 'scan' | 'save'; }

async function sha256(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function md5(content: string): string {
  return SparkMD5.ArrayBuffer.hash(new TextEncoder().encode(content));
}

function assertCloudDownloadUrl(descriptor: CloudPackageDescriptor): void {
  if (descriptor.source === 'bundled') {
    assertSafeAssetUrl(descriptor.downloadUrl, 'Cloud package download');
    return;
  }
  if (/^\/api\/catalog\/download\?cloudSetId=osuapi_\d+$/.test(descriptor.downloadUrl)) return;
  const expected = /^https:\/\/osudl\.org\/s\/(\d+)$/;
  if (!expected.test(descriptor.downloadUrl)) throw new Error('Cloud package URL is not an approved osu! mirror URL');
}

export async function importCloudPackage(
  descriptor: CloudPackageDescriptor,
  onBeatmap: (map: Beatmap) => void,
  onProgress?: (progress: CloudImportProgress) => void,
): Promise<Beatmap[]> {
  assertCloudDownloadUrl(descriptor);
  const response = await fetch(descriptor.downloadUrl, { credentials: 'include' });
  if (!response.ok || !response.body) throw new Error(`Cloud package download failed (${response.status})`);
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_COMPRESSED_SIZE_BYTES) throw new Error('Cloud package exceeds the compressed size limit');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    if (!part.value) continue;
    loaded += part.value.byteLength;
    if (loaded > MAX_COMPRESSED_SIZE_BYTES) { await reader.cancel(); throw new Error('Cloud package exceeds the compressed size limit'); }
    chunks.push(part.value);
    onProgress?.({ loaded, total: declared, phase: 'download' });
  }
  const blob = new Blob(chunks, { type: 'application/octet-stream' });
  const zip = await JSZip.loadAsync(blob);
  validateZipLimits(zip);
  const expectedByFilename = new Map(descriptor.charts.map(chart => [chart.originalOsuFilename, chart]));
  const maps: Beatmap[] = [];
  for (const [filename, entry] of Object.entries(zip.files)) {
    if (entry.dir || !filename.toLowerCase().endsWith('.osu')) continue;
    validateZipEntrySize(entry, filename);
    const content = await entry.async('text');
    const expected = expectedByFilename.get(filename);
    if (!expected) continue;
    const checksum = expected.checksumAlgorithm === 'sha256' ? await sha256(content) : md5(content);
    if (checksum.toLowerCase() !== expected.checksum.toLowerCase()) throw new Error(`Verified chart checksum mismatch for ${filename}`);
    const parsed = parseBeatmap(content, expected.chartRevisionId);
    if (parsed.mode !== 3 || parsed.keyCount !== expected.keyCount || parsed.notes.length === 0) throw new Error(`Unsupported chart in ${filename}`);
    const media = parseMediaPaths(content);
    const map: SavedBeatmap = { ...parsed, id: expected.chartRevisionId, packageId: descriptor.cloudSetId, cloudSetId: descriptor.cloudSetId, chartRevisionId: expected.chartRevisionId, catalogSetId: descriptor.cloudSetId, catalogMapId: expected.chartRevisionId, source: descriptor.source, sourceSetId: expected.sourceChartId, sourceChartId: expected.sourceChartId, originalOsuFilename: filename, checksum: expected.checksum, checksumAlgorithm: expected.checksumAlgorithm, audioFilename: media.audioFilename, videoFilename: media.videoFilename, bgFilename: media.bgFilename, originalContent: content, isServerMap: true, oszUrl: descriptor.downloadUrl, beatmapHash: expected.checksum };
    maps.push(map);
    onProgress?.({ loaded, total: declared, phase: 'scan' });
  }
  if (maps.length !== descriptor.charts.length) throw new Error('Cloud archive did not contain every expected verified chart');
  onProgress?.({ loaded, total: declared, phase: 'save' });
  try {
    await storageManager.savePackage(descriptor.cloudSetId, `${descriptor.title}.osz`, blob);
    for (const map of maps) { await storageManager.saveBeatmap(map); onBeatmap(map); }
    return maps;
  } catch (error) {
    await storageManager.deletePackageAndAllBeatmaps(descriptor.cloudSetId);
    throw error;
  }
}
