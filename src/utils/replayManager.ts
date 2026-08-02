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

import { Beatmap, GameSettings, PlayHistoryRecord, ReplayFrame, ReplaySource, ScoreState, UploadEligibility, UploadStatus } from '../types';
import { storageManager } from './storageManager';

export const CURRENT_REPLAY_SCHEMA_VERSION = 2;

/**
 * Fast deterministic hash for beatmap content or metadata.
 */
export function computeBeatmapHash(map: Partial<Beatmap> & { originalContent?: string }): string {
  if (map.originalContent && map.originalContent.trim().length > 0) {
    return 'fnv_' + hashString(map.originalContent);
  }
  const metaStr = `${map.title || ''}|${map.artist || ''}|${map.creator || ''}|${map.difficulty || ''}|${map.keyCount || 4}|${map.notes?.length || 0}|${map.duration || 0}`;
  return 'meta_' + hashString(metaStr);
}

function hashString(str: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x243f6a88;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ code, 1540483477) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export interface CatalogIdentityInfo {
  catalogSetId: string | null;
  catalogMapId: string | null;
  chartRevisionId: string | null;
  isServerCatalogMap: boolean;
}

/**
 * Resolves catalog set ID, catalog map ID, and server map boolean for a given beatmap.
 */
export function determineCatalogIdentity(beatmap: Beatmap | null, beatmapId: string): CatalogIdentityInfo {
  const bm = beatmap;
  const chartRevisionId = bm?.chartRevisionId || null;
  const isServer = Boolean(chartRevisionId && bm?.isServerMap);

  if (!isServer) {
    return {
      catalogSetId: null,
      catalogMapId: null,
      chartRevisionId: null,
      isServerCatalogMap: false,
    };
  }

  const catalogSetId = bm?.catalogSetId || null;

  const catalogMapId = bm?.catalogMapId || beatmapId || null;

  return {
    catalogSetId,
    catalogMapId,
    chartRevisionId,
    isServerCatalogMap: true,
  };
}

/**
 * Determines whether a replay run is eligible for future server upload.
 */
export function determineUploadEligibility(params: {
  isServerCatalogMap: boolean;
  isAutoplay?: boolean;
  isFailed?: boolean;
  replayFramesCount?: number;
  mode?: number;
}): UploadEligibility {
  if (params.isAutoplay) return 'ineligible_autoplay';
  if (params.isFailed) return 'ineligible_failed';
  if (!params.isServerCatalogMap) return 'ineligible_local_map';
  if (params.replayFramesCount === 0) return 'ineligible_no_replay_frames';
  if (params.mode !== undefined && params.mode !== 3 && params.mode !== null) return 'ineligible_mode';
  return 'eligible';
}

/**
 * Factory helper to create a fresh, schema-v2 PlayHistoryRecord.
 */
export function createPlayHistoryRecord(params: {
  id: string;
  timestamp: number;
  beatmap: Beatmap;
  scoreState: ScoreState;
  replayFrames: ReplayFrame[];
  recordedSettings?: GameSettings;
  mods?: string[];
  replaySource?: ReplaySource;
}): PlayHistoryRecord {
  const { id, timestamp, beatmap, scoreState, replayFrames, recordedSettings, mods, replaySource = 'guest-local' } = params;
  
  const catalogInfo = determineCatalogIdentity(beatmap, beatmap.id);
  const hash = (beatmap as any).beatmapHash || computeBeatmapHash(beatmap);

  let gradeChar = 'D';
  const acc = scoreState.accuracy;
  if (scoreState.failed) gradeChar = 'F';
  else if (acc >= 100) gradeChar = 'SS';
  else if (acc >= 95) gradeChar = 'S';
  else if (acc >= 90) gradeChar = 'A';
  else if (acc >= 80) gradeChar = 'B';
  else if (acc >= 70) gradeChar = 'C';

  const uploadEligibility = determineUploadEligibility({
    isServerCatalogMap: catalogInfo.isServerCatalogMap,
    isAutoplay: scoreState.isAutoplay || mods?.includes('AT'),
    isFailed: scoreState.failed,
    replayFramesCount: replayFrames.length,
    mode: beatmap.mode,
  });

  return {
    id,
    timestamp,
    beatmapId: beatmap.id,
    beatmapTitle: beatmap.title,
    beatmapArtist: beatmap.artist,
    keyCount: beatmap.keyCount,
    score: scoreState.score,
    accuracy: scoreState.accuracy,
    maxCombo: scoreState.maxCombo,
    grade: gradeChar,
    isFailed: Boolean(scoreState.failed),
    scoreState: { ...scoreState, recordId: id },
    replayFrames,
    recordedSettings,
    mods: mods ? [...mods] : [],

    // Schema V2 fields
    schemaVersion: CURRENT_REPLAY_SCHEMA_VERSION,
    replaySource,
    catalogSetId: catalogInfo.catalogSetId,
    catalogMapId: catalogInfo.catalogMapId,
    chartRevisionId: catalogInfo.chartRevisionId,
    checksum: beatmap.checksum,
    checksumAlgorithm: beatmap.checksumAlgorithm,
    beatmapHash: hash,
    uploadEligibility,
    uploadStatus: 'local_only',
    isServerCatalogMap: catalogInfo.isServerCatalogMap,
  };
}

/**
 * Migrates legacy unversioned or v1 records to the version 2 schema.
 */
export function migrateHistoryRecord(rawRecord: any, availableBeatmaps: Beatmap[] = []): PlayHistoryRecord | null {
  if (!rawRecord || typeof rawRecord !== 'object') return null;

  const beatmapId = String(rawRecord.beatmapId || '');
  const baseId = beatmapId.includes('_converted_') ? beatmapId.split('_converted_')[0] : beatmapId;
  const matchedMap = availableBeatmaps.find(m => m.id === beatmapId || m.id === baseId);

  const catalogInfo = determineCatalogIdentity(matchedMap || null, beatmapId);
  const hash = rawRecord.beatmapHash || (matchedMap ? computeBeatmapHash(matchedMap) : computeBeatmapHash({
    title: rawRecord.beatmapTitle || '',
    artist: rawRecord.beatmapArtist || '',
    keyCount: rawRecord.keyCount || 4,
  }));

  const replayFrames = Array.isArray(rawRecord.replayFrames) ? rawRecord.replayFrames : [];
  const isAutoplay = Boolean(rawRecord.scoreState?.isAutoplay || (Array.isArray(rawRecord.mods) && rawRecord.mods.includes('AT')));
  const isNoFail = Array.isArray(rawRecord.mods) && rawRecord.mods.some((mod: any) => typeof mod === 'string' && mod.toUpperCase() === 'NF');
  const isFailed = isNoFail ? false : Boolean(rawRecord.isFailed || rawRecord.scoreState?.failed);

  const uploadEligibility: UploadEligibility = rawRecord.uploadEligibility && !(isNoFail && rawRecord.uploadEligibility === 'ineligible_failed')
    ? rawRecord.uploadEligibility
    : determineUploadEligibility({
    isServerCatalogMap: catalogInfo.isServerCatalogMap,
    isAutoplay,
    isFailed,
    replayFramesCount: replayFrames.length,
    mode: matchedMap?.mode,
  });

  return {
    ...rawRecord,
    schemaVersion: CURRENT_REPLAY_SCHEMA_VERSION,
    replaySource: rawRecord.replaySource || 'guest-local',
    catalogSetId: rawRecord.catalogSetId ?? catalogInfo.catalogSetId,
    catalogMapId: rawRecord.catalogMapId ?? catalogInfo.catalogMapId,
    beatmapHash: hash,
    uploadEligibility,
    isFailed,
    scoreState: { ...rawRecord.scoreState, failed: isFailed },
    uploadStatus: (rawRecord.uploadStatus as UploadStatus) || 'local_only',
    isServerCatalogMap: rawRecord.isServerCatalogMap ?? catalogInfo.isServerCatalogMap,
  };
}

/**
  * Migrates loaded IndexedDB beatmaps to ensure catalog identity, canonical map IDs, and FNV hashes are populated.
  */
export async function migrateAndNormalizeBeatmaps(rawMaps: Beatmap[]): Promise<{ maps: Beatmap[]; migratedCount: number }> {
  let migratedCount = 0;
  const normalized = await Promise.all(
    rawMaps.map(async (m) => {
      const map = { ...m } as any;
      let dirty = false;

      const isServer = Boolean(map.isServerMap && map.chartRevisionId);

      if (isServer) {
        const catalogSetId = map.catalogSetId || null;
        if (map.catalogSetId !== catalogSetId) {
          map.catalogSetId = catalogSetId;
          dirty = true;
        }

        if (!map.isServerMap) {
          map.isServerMap = true;
          dirty = true;
        }
      } else {
        if (map.catalogSetId !== null && map.catalogSetId !== undefined) { map.catalogSetId = null; dirty = true; }
        if (map.catalogMapId !== null && map.catalogMapId !== undefined) { map.catalogMapId = null; dirty = true; }
        if (map.chartRevisionId !== null && map.chartRevisionId !== undefined) { map.chartRevisionId = null; dirty = true; }
        if (map.isServerMap !== false) { map.isServerMap = false; dirty = true; }
      }

      const hash = map.beatmapHash || computeBeatmapHash(map);
      if (map.beatmapHash !== hash) {
        map.beatmapHash = hash;
        dirty = true;
      }

      if (dirty) {
        migratedCount++;
        try {
          await storageManager.saveBeatmap(map as any);
        } catch (e) {
          console.warn('Failed to persist migrated beatmap record:', e);
        }
      }

      return map as Beatmap;
    })
  );

  return { maps: normalized, migratedCount };
}
