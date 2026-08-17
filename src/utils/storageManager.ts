/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 *
 * This source code is licensed under the PolyForm Perimeter License 1.0.1.
 * You may modify and use this file for non-competing purposes, provided 
 * that open and explicit attribution is maintained.
 *
 * For the full license terms, see the LICENSE file in the root directory
 * from: https://github.com/yumo-ymspace/RhythmMania
 */

import { Beatmap, CloudBeatmapSource, HitObject, TimingControlPoint } from '../types';
import { AssetLifecycleManager, getMediaCacheKey } from './assetLifecycle';
import { TempMemoryCache } from './tempMemoryCache';
import {
  isSafeAssetUrl,
  MAX_BEATMAP_NOTES,
  MAX_BEATMAP_TIMING_POINTS,
  MAX_COMPRESSED_SIZE_BYTES,
  MAX_MEDIA_URL_LENGTH,
  MAX_OSU_TEXT_BYTES,
} from './securityLimits';

export interface SavedBeatmap extends Beatmap {
  packageId?: string;
  parentPackageId?: string;
  audioFilename?: string;
  videoFilename?: string | null;
  bgFilename?: string | null;
  originalContent?: string;
  isServerMap?: boolean;
  cloudSetId?: string;
  chartRevisionId?: string;
  source?: CloudBeatmapSource;
  sourceSetId?: number;
  sourceChartId?: number;
  originalOsuFilename?: string;
  checksum?: string;
  checksumAlgorithm?: 'md5' | 'sha256';
  importedAt?: number; // epoch ms when first saved locally; used by "Date Added" sort
  starRating?: number;
  starRatingSource?: 'osu-api-download' | 'chart-content' | 'legacy-fallback';
  starRatingVersion?: number;
  isCached?: boolean;
}

export interface PackageRecord {
  id: string;
  name: string;
  zipData?: ArrayBuffer;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, min: number, max: number): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function safeString(value: unknown, maxLength: number, fallback = ''): string {
  return typeof value === 'string' && value.length <= maxLength ? value : fallback;
}

function safeMediaUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_MEDIA_URL_LENGTH) return '';
  return !value || isSafeAssetUrl(value) ? value : '';
}

function isPackageRecord(value: unknown, expectedId: string): value is PackageRecord {
  if (!isRecord(value) || value.id !== expectedId || !(value.zipData instanceof ArrayBuffer)) return false;
  return value.zipData.byteLength <= MAX_COMPRESSED_SIZE_BYTES;
}

function sanitizeHitObject(value: unknown, index: number, keyCount: number): HitObject | null {
  if (!isRecord(value)) return null;
  const time = finiteNumber(value.time, 0, 10000000);
  const column = finiteNumber(value.column, 0, keyCount - 1);
  if (time === null || column === null || !Number.isInteger(column)) return null;
  const type = value.type === 'normal' || value.type === 'hold' ? value.type : null;
  if (!type) return null;
  const note: HitObject = {
    id: safeString(value.id, 200, `stored_note_${index}`),
    time,
    column,
    type,
    isHit: Boolean(value.isHit),
    isReleased: Boolean(value.isReleased),
    isMissed: Boolean(value.isMissed),
    isHoldFailed: Boolean(value.isHoldFailed),
  };
  const endTime = value.endTime === undefined ? undefined : finiteNumber(value.endTime, time + 1, 10000000);
  if (value.endTime !== undefined && endTime === null) return null;
  if (endTime !== undefined && endTime !== null) note.endTime = endTime;
  for (const field of ['hitTime', 'releaseTime', 'releaseGraceUntil'] as const) {
    if (value[field] !== undefined) {
      const number = finiteNumber(value[field], 0, 10000000);
      if (number === null) return null;
      note[field] = number;
    }
  }
  for (const field of ['x', 'y', 'hitSound'] as const) {
    if (value[field] !== undefined) {
      const max = field === 'x' ? 512 : field === 'y' ? 384 : 255;
      const number = finiteNumber(value[field], 0, max);
      if (number === null) return null;
      note[field] = number;
    }
  }
  if (isRecord(value.hitSample)) {
    const normalSet = finiteNumber(value.hitSample.normalSet, 0, 1000);
    const additionSet = finiteNumber(value.hitSample.additionSet, 0, 1000);
    const sampleIndex = finiteNumber(value.hitSample.index, 0, 1000);
    const volume = finiteNumber(value.hitSample.volume, 0, 1000);
    if (normalSet === null || additionSet === null || sampleIndex === null || volume === null) return null;
    note.hitSample = {
      normalSet,
      additionSet,
      index: sampleIndex,
      volume,
      filename: value.hitSample.filename === undefined ? undefined : safeString(value.hitSample.filename, 512),
    };
  }
  return note;
}

/** Runtime guard for records read from IndexedDB or legacy localStorage. */
export function sanitizeSavedBeatmap(raw: unknown): SavedBeatmap | null {
  if (!isRecord(raw)) return null;
  const keyCount = finiteNumber(raw.keyCount, 2, 9);
  const duration = finiteNumber(raw.duration, 0, 10000000);
  const bpm = finiteNumber(raw.bpm, 0.01, 10000);
  const hpDrainRate = finiteNumber(raw.hpDrainRate, 0, 10);
  const overallDifficulty = finiteNumber(raw.overallDifficulty, 0, 10);
  const sliderMultiplier = finiteNumber(raw.sliderMultiplier, 0.001, 10);
  if (keyCount === null || duration === null || bpm === null || hpDrainRate === null || overallDifficulty === null || sliderMultiplier === null ||
      !Number.isInteger(keyCount) || !Array.isArray(raw.notes) || raw.notes.length > MAX_BEATMAP_NOTES ||
      !Array.isArray(raw.timingPoints) || raw.timingPoints.length > MAX_BEATMAP_TIMING_POINTS) return null;

  const notes: HitObject[] = [];
  for (let i = 0; i < raw.notes.length; i++) {
    const note = sanitizeHitObject(raw.notes[i], i, keyCount);
    if (!note || note.column >= keyCount) return null;
    notes.push(note);
  }
  const timingPoints: TimingControlPoint[] = [];
  for (const point of raw.timingPoints) {
    if (!isRecord(point)) return null;
    const timeMs = finiteNumber(point.timeMs, -1000000, 10000000);
    const beatLength = finiteNumber(point.beatLength, -600000, 600000);
    const svMultiplier = finiteNumber(point.svMultiplier, -1000, 1000);
    if (timeMs === null || beatLength === null || beatLength === 0 || svMultiplier === null || typeof point.uninherited !== 'boolean') return null;
    timingPoints.push({ timeMs, beatLength, uninherited: point.uninherited, svMultiplier });
  }
  const mode = raw.mode === undefined ? 3 : finiteNumber(raw.mode, 3, 3);
  if (mode === null || !Number.isInteger(keyCount)) return null;
  const baseBeatLength = raw.baseBeatLength === undefined ? undefined : finiteNumber(raw.baseBeatLength, 0.001, 600000);
  if (raw.baseBeatLength !== undefined && baseBeatLength === null) return null;
  const breaks: Array<{ startTime: number; endTime: number }> = [];
  if (raw.breaks !== undefined) {
    if (!Array.isArray(raw.breaks) || raw.breaks.length > 10000) return null;
    for (const item of raw.breaks) {
      if (!isRecord(item)) return null;
      const startTime = finiteNumber(item.startTime, 0, 10000000);
      const endTime = finiteNumber(item.endTime, 0, 10000000);
      if (startTime === null || endTime === null || endTime <= startTime) return null;
      breaks.push({ startTime, endTime });
    }
  }
  const hitSoundUrls: Record<string, string> = {};
  if (raw.hitSoundUrls !== undefined) {
    if (!isRecord(raw.hitSoundUrls) || Object.keys(raw.hitSoundUrls).length > 100) return null;
    for (const [name, url] of Object.entries(raw.hitSoundUrls)) hitSoundUrls[safeString(name, 512)] = safeMediaUrl(url);
  }
  const originalContent = raw.originalContent === undefined ? undefined : safeString(raw.originalContent, MAX_OSU_TEXT_BYTES);
  if (raw.originalContent !== undefined && (originalContent === '' || new TextEncoder().encode(originalContent).byteLength > MAX_OSU_TEXT_BYTES)) return null;
  const starRating = raw.starRating === undefined ? undefined : finiteNumber(raw.starRating, 0, 20);
  if (raw.starRating !== undefined && starRating === null) return null;
  const starRatingSource = raw.starRatingSource === 'osu-api-download' || raw.starRatingSource === 'chart-content' || raw.starRatingSource === 'legacy-fallback'
    ? raw.starRatingSource
    : undefined;
  const starRatingVersion = raw.starRatingVersion === undefined ? undefined : finiteNumber(raw.starRatingVersion, 1, 100);
  if (raw.starRatingVersion !== undefined && (starRatingVersion === null || !Number.isInteger(starRatingVersion))) return null;
  const result: SavedBeatmap = {
    id: safeString(raw.id, 300),
    title: safeString(raw.title, 300, 'Unknown Title'),
    artist: safeString(raw.artist, 300, 'Unknown Artist'),
    creator: safeString(raw.creator, 300, 'Unknown Mapper'),
    difficulty: safeString(raw.difficulty, 200, 'Normal'),
    bpm,
    keyCount,
    duration,
    notes,
    hpDrainRate,
    overallDifficulty,
    timingPoints,
    sliderMultiplier,
    baseBeatLength: baseBeatLength ?? undefined,
    breaks,
    audioUrl: safeMediaUrl(raw.audioUrl),
    videoUrl: safeMediaUrl(raw.videoUrl),
    bgUrl: safeMediaUrl(raw.bgUrl),
    hitSoundUrls,
    videoStartTime: raw.videoStartTime === undefined ? undefined : finiteNumber(raw.videoStartTime, -1000000, 10000000) ?? undefined,
    previewTime: raw.previewTime === undefined ? undefined : finiteNumber(raw.previewTime, -1, 10000000) ?? undefined,
    mode: 3,
    catalogSetId: typeof raw.catalogSetId === 'string' || raw.catalogSetId === null ? raw.catalogSetId : null,
    catalogMapId: typeof raw.catalogMapId === 'string' || raw.catalogMapId === null ? raw.catalogMapId : null,
    beatmapHash: safeString(raw.beatmapHash, 256) || undefined,
    isServerMap: Boolean(raw.isServerMap),
    chartRevisionId: typeof raw.chartRevisionId === 'string' ? raw.chartRevisionId : undefined,
    checksum: safeString(raw.checksum, 128) || undefined,
    checksumAlgorithm: raw.checksumAlgorithm === 'md5' || raw.checksumAlgorithm === 'sha256' ? raw.checksumAlgorithm : undefined,
    packageId: safeString(raw.packageId, 300) || undefined,
    parentPackageId: safeString(raw.parentPackageId, 300) || undefined,
    audioFilename: safeString(raw.audioFilename, 512) || undefined,
    videoFilename: raw.videoFilename === null ? null : safeString(raw.videoFilename, 512) || undefined,
    bgFilename: raw.bgFilename === null ? null : safeString(raw.bgFilename, 512) || undefined,
    originalContent,
    cloudSetId: safeString(raw.cloudSetId, 300) || undefined,
    source: raw.source === 'osuapi' ? 'osuapi' : undefined,
    sourceSetId: raw.sourceSetId === undefined ? undefined : finiteNumber(raw.sourceSetId, 1, 2147483647) ?? undefined,
    sourceChartId: raw.sourceChartId === undefined ? undefined : finiteNumber(raw.sourceChartId, 1, 2147483647) ?? undefined,
    originalOsuFilename: safeString(raw.originalOsuFilename, 512) || undefined,
    importedAt: raw.importedAt === undefined ? undefined : finiteNumber(raw.importedAt, 0, 2000000000000) ?? undefined,
    starRating: starRating ?? undefined,
    starRatingSource,
    starRatingVersion: starRatingVersion ?? undefined,
    isCached: raw.isCached === undefined ? undefined : Boolean(raw.isCached),
  };
  if (!result.id) return null;
  return result;
}

const DB_NAME = 'RhythmManiaDB';
const DB_VERSION = 3;

class SimpleBlobCache {
  private cache = new Map<string, { audioUrl: string; videoUrl: string; bgUrl: string; hitSoundUrls: Record<string, string> }>();
  private order: string[] = [];

  constructor(private capacity = 8) {}

  public get(id: string) {
    const key = getMediaCacheKey(id);
    if (!this.cache.has(key)) return null;
    this.order = this.order.filter(k => k !== key).concat(key);
    return this.cache.get(key)!;
  }

  public put(id: string, urls: { audioUrl: string; videoUrl: string; bgUrl: string; hitSoundUrls?: Record<string, string> }) {
    const key = getMediaCacheKey(id);
    if (this.cache.has(key)) {
      const prev = this.cache.get(key)!;
      // Revoke replaced URLs that are no longer referenced
      if (prev.audioUrl && prev.audioUrl !== urls.audioUrl) AssetLifecycleManager.releaseSpecific(prev.audioUrl);
      if (prev.videoUrl && prev.videoUrl !== urls.videoUrl) AssetLifecycleManager.releaseSpecific(prev.videoUrl);
      if (prev.bgUrl && prev.bgUrl !== urls.bgUrl) AssetLifecycleManager.releaseSpecific(prev.bgUrl);
      for (const [name, url] of Object.entries(prev.hitSoundUrls)) {
        if (url && url !== urls.hitSoundUrls?.[name]) AssetLifecycleManager.releaseSpecific(url);
      }
      this.order = this.order.filter(k => k !== key);
    } else if (this.order.length >= this.capacity) {
      const oldest = this.order.shift();
      if (oldest) this.evict(oldest);
    }
    this.cache.set(key, { ...urls, hitSoundUrls: urls.hitSoundUrls || {} });
    this.order.push(key);
  }

  public evict(id: string) {
    const key = getMediaCacheKey(id);
    const urls = this.cache.get(key);
    if (urls) {
      if (urls.audioUrl?.startsWith('blob:')) AssetLifecycleManager.releaseSpecific(urls.audioUrl);
      if (urls.videoUrl?.startsWith('blob:')) AssetLifecycleManager.releaseSpecific(urls.videoUrl);
      if (urls.bgUrl?.startsWith('blob:')) AssetLifecycleManager.releaseSpecific(urls.bgUrl);
      for (const url of Object.values(urls.hitSoundUrls)) AssetLifecycleManager.releaseSpecific(url);
    }
    this.cache.delete(key);
    this.order = this.order.filter(k => k !== key);
  }

  public clearAll() {
    for (const id of [...this.order]) this.evict(id);
    this.cache.clear();
    this.order = [];
  }
}

class StorageManager {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;
  public lruMediaCache = new SimpleBlobCache(3);

  constructor() {
    // Keep pure sanitizers and replay helpers importable in Node/test contexts.
    if (typeof window !== 'undefined' && window.indexedDB) {
      this.initPromise = this.init();
    }
  }

  private init(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB not supported'));
        return;
      }
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };
      request.onupgradeneeded = () => {
        const d = request.result;
        if (!d.objectStoreNames.contains('beatmaps')) d.createObjectStore('beatmaps', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('packages')) d.createObjectStore('packages', { keyPath: 'id' });
      };
    });
  }

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.initPromise) {
      try {
        return await this.initPromise;
      } catch (err) {
        this.initPromise = null;
        throw err;
      }
    }
    this.initPromise = this.init();
    try {
      return await this.initPromise;
    } catch (err) {
      this.initPromise = null;
      throw err;
    }
  }

  public async savePackage(id: string, name: string, zipBlob: Blob): Promise<void> {
    if (!id || id.length > 300 || !name || name.length > 512 || !(zipBlob instanceof Blob) || zipBlob.size > MAX_COMPRESSED_SIZE_BYTES) {
      throw new Error('Security Exception: Invalid or oversized beatmap package.');
    }
    const database = await this.getDB();
    const arrayBuffer = await zipBlob.arrayBuffer();

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('packages', 'readwrite');
      const store = tx.objectStore('packages');
      store.put({ id, name, zipData: arrayBuffer.slice(0) });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to save beatmap package.'));
      tx.onabort = () => reject(tx.error || new Error('Beatmap package transaction aborted.'));
    });
    TempMemoryCache.set(id, arrayBuffer);
  }

  /** Atomically stages a package and all of its validated difficulties. */
  public async savePackageWithBeatmaps(
    id: string,
    name: string,
    zipBlob: Blob,
    beatmaps: Beatmap[],
  ): Promise<void> {
    if (!id || id.length > 300 || !name || name.length > 512 || !(zipBlob instanceof Blob) || zipBlob.size > MAX_COMPRESSED_SIZE_BYTES) {
      throw new Error('Security Exception: Invalid or oversized beatmap package.');
    }
    const records = beatmaps.map(sanitizeSavedBeatmap);
    if (records.some(record => record === null) || records.length !== beatmaps.length || records.length === 0) {
      throw new Error('Security Exception: Invalid beatmap package contents.');
    }
    const arrayBuffer = await zipBlob.arrayBuffer();
    const database = await this.getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(['packages', 'beatmaps'], 'readwrite');
      tx.objectStore('packages').put({ id, name, zipData: arrayBuffer.slice(0) });
      for (const record of records) tx.objectStore('beatmaps').put({ ...record!, importedAt: record!.importedAt ?? Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to stage beatmap package.'));
      tx.onabort = () => reject(tx.error || new Error('Beatmap package transaction aborted.'));
    });
    TempMemoryCache.set(id, arrayBuffer);
  }

  public async saveBeatmap(beatmap: Beatmap): Promise<void> {
    const clean = sanitizeSavedBeatmap(beatmap);
    if (!clean) throw new Error('Security Exception: Invalid beatmap record.');
    const database = await this.getDB();
    const record: SavedBeatmap = { ...clean, importedAt: clean.importedAt ?? Date.now() };
    return new Promise<void>((resolve, reject) => {
      const tx = database.transaction('beatmaps', 'readwrite');
      tx.objectStore('beatmaps').put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to save beatmap record.'));
    });
  }

  public async getAllBeatmaps(): Promise<SavedBeatmap[]> {
    const database = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('beatmaps', 'readonly');
      const req = tx.objectStore('beatmaps').getAll();
      req.onsuccess = () => resolve((req.result as unknown[] || []).map(sanitizeSavedBeatmap).filter((map): map is SavedBeatmap => map !== null));
      req.onerror = () => reject(req.error);
    });
  }

  public async getPackage(id: string): Promise<Blob | null> {
    const database = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('packages', 'readonly');
      const req = tx.objectStore('packages').get(id);
      req.onsuccess = () => {
        const record: unknown = req.result;
        if (isPackageRecord(record, id)) {
          resolve(new Blob([record.zipData!], { type: 'application/octet-stream' }));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async deleteBeatmapAndCleanup(id: string): Promise<void> {
    const database = await this.getDB();
    this.lruMediaCache.evict(id);

    const beatmap: SavedBeatmap | null = await new Promise((resolve, reject) => {
      const tx = database.transaction('beatmaps', 'readonly');
      const req = tx.objectStore('beatmaps').get(id);
      req.onsuccess = () => resolve(sanitizeSavedBeatmap(req.result));
      req.onerror = () => reject(req.error);
    });

    if (!beatmap) return;

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('beatmaps', 'readwrite');
      tx.objectStore('beatmaps').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    if (beatmap.packageId) {
      const pkgId = beatmap.packageId;
      const allMaps = await this.getAllBeatmaps();
      const referencesExist = allMaps.some(m => m.packageId === pkgId);

      if (!referencesExist) {
        await new Promise<void>((resolve, reject) => {
          const tx = database.transaction('packages', 'readwrite');
          tx.objectStore('packages').delete(pkgId);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        TempMemoryCache.remove(pkgId);
      }
    }
  }

  public async deletePackageAndAllBeatmaps(cloudSetId: string): Promise<void> {
    const database = await this.getDB();
    const packageId = cloudSetId;

    // 1. Clear TempMemoryCache
    TempMemoryCache.remove(packageId);

    // 2. Evict LRU cache
    this.lruMediaCache.evict(cloudSetId);

    // 3. Find and delete all beatmaps matching id prefix, parentPackageId, or packageId
    const allMaps = await this.getAllBeatmaps();
    const mapsToDelete = allMaps.filter(
      m => m.cloudSetId === cloudSetId || m.parentPackageId === cloudSetId || m.packageId === packageId
    );

    for (const m of mapsToDelete) {
      this.lruMediaCache.evict(m.id);
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction('beatmaps', 'readwrite');
        tx.objectStore('beatmaps').delete(m.id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    // 4. Delete the package itself
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('packages', 'readwrite');
      tx.objectStore('packages').delete(packageId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const storageManager = new StorageManager();
