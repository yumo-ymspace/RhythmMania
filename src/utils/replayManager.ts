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
import { sanitizeSavedBeatmap, storageManager } from './storageManager';
import { computeGradeFromScoreState } from './scoreCalculator';
import { HOLD_TICK_RULES_VERSION, holdTickIntervalMs, LEGACY_HOLD_RULES_VERSION, resolveHoldTickInterval } from './holdTickRules';

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
  holdRules?: HoldRulesInfo;
}): PlayHistoryRecord {
  const { id, timestamp, beatmap, scoreState, replayFrames, recordedSettings, mods, replaySource = 'guest-local', holdRules = { holdRulesVersion: HOLD_TICK_RULES_VERSION, holdTickIntervalMs } } = params;
  
  const catalogInfo = determineCatalogIdentity(beatmap, beatmap.id);
  const hash = beatmap.beatmapHash || computeBeatmapHash(beatmap);

  const gradeChar = computeGradeFromScoreState(scoreState);

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
    holdRulesVersion: holdRules.holdRulesVersion,
    ...(holdRules.holdRulesVersion === HOLD_TICK_RULES_VERSION ? { holdTickIntervalMs: holdRules.holdTickIntervalMs } : {}),
  };
}

/**
 * Migrates legacy unversioned or v1 records to the version 2 schema.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface HoldRulesInfo {
  holdRulesVersion: 1 | 2;
  holdTickIntervalMs?: number;
}

export function getHoldRulesInfo(record: Record<string, unknown> | null | undefined): HoldRulesInfo {
  if (record?.holdRulesVersion === HOLD_TICK_RULES_VERSION) {
    return { holdRulesVersion: HOLD_TICK_RULES_VERSION, holdTickIntervalMs: resolveHoldTickInterval(record.holdTickIntervalMs) };
  }
  return { holdRulesVersion: LEGACY_HOLD_RULES_VERSION };
}

export function hasCatalogIdentity(beatmap: Beatmap | null): boolean {
  return Boolean(beatmap?.catalogSetId && beatmap.catalogMapId && beatmap.chartRevisionId);
}

export function migrateHistoryRecord(rawRecord: unknown, availableBeatmaps: Beatmap[] = []): PlayHistoryRecord | null {
  if (!isRecord(rawRecord)) return null;

  const beatmapId = String(rawRecord.beatmapId || '');
  const baseId = beatmapId.includes('_converted_') ? beatmapId.split('_converted_')[0] : beatmapId;
  const matchedMap = availableBeatmaps.find(m => m.id === beatmapId || m.id === baseId);

  const catalogInfo = determineCatalogIdentity(matchedMap || null, beatmapId);
  const hash = typeof rawRecord.beatmapHash === 'string' && rawRecord.beatmapHash
    ? rawRecord.beatmapHash
    : (matchedMap ? computeBeatmapHash(matchedMap) : computeBeatmapHash({
      title: typeof rawRecord.beatmapTitle === 'string' ? rawRecord.beatmapTitle : '',
      artist: typeof rawRecord.beatmapArtist === 'string' ? rawRecord.beatmapArtist : '',
      keyCount: typeof rawRecord.keyCount === 'number' ? rawRecord.keyCount : 4,
    }));

  const replayFrames = Array.isArray(rawRecord.replayFrames) ? rawRecord.replayFrames : [];
  const rawScoreState = isRecord(rawRecord.scoreState) ? rawRecord.scoreState : {};
  const rawMods = Array.isArray(rawRecord.mods) ? rawRecord.mods : [];
  const isAutoplay = Boolean(rawScoreState.isAutoplay || rawMods.includes('AT'));
  const isNoFail = rawMods.some(mod => typeof mod === 'string' && mod.toUpperCase() === 'NF');
  const isFailed = isNoFail ? false : Boolean(rawRecord.isFailed || rawScoreState.failed);

  const validEligibility = rawRecord.uploadEligibility === 'eligible' || rawRecord.uploadEligibility === 'ineligible_local_map' ||
    rawRecord.uploadEligibility === 'ineligible_autoplay' || rawRecord.uploadEligibility === 'ineligible_failed' ||
    rawRecord.uploadEligibility === 'ineligible_mode' || rawRecord.uploadEligibility === 'ineligible_no_replay_frames';
  const uploadEligibility: UploadEligibility = validEligibility && !(isNoFail && rawRecord.uploadEligibility === 'ineligible_failed')
     ? rawRecord.uploadEligibility as UploadEligibility
    : determineUploadEligibility({
    isServerCatalogMap: catalogInfo.isServerCatalogMap,
    isAutoplay,
    isFailed,
    replayFramesCount: replayFrames.length,
    mode: matchedMap?.mode,
  });

  const rawKeyCount = typeof rawRecord.keyCount === 'number' && Number.isInteger(rawRecord.keyCount) && rawRecord.keyCount >= 2 && rawRecord.keyCount <= 8 ? rawRecord.keyCount : 4;
  const rawReplaySource = rawRecord.replaySource === 'guest-local' || rawRecord.replaySource === 'account-local' || rawRecord.replaySource === 'server-remote' || rawRecord.replaySource === 'imported'
    ? rawRecord.replaySource : 'guest-local';
  const rawUploadStatus = rawRecord.uploadStatus === 'pending' || rawRecord.uploadStatus === 'uploaded' || rawRecord.uploadStatus === 'failed' || rawRecord.uploadStatus === 'local_only'
    ? rawRecord.uploadStatus : 'local_only';
  return {
    id: typeof rawRecord.id === 'string' ? rawRecord.id : `replay_${Date.now()}`,
    timestamp: typeof rawRecord.timestamp === 'number' && Number.isFinite(rawRecord.timestamp) ? rawRecord.timestamp : Date.now(),
    beatmapId,
    beatmapTitle: typeof rawRecord.beatmapTitle === 'string' ? rawRecord.beatmapTitle : '',
    beatmapArtist: typeof rawRecord.beatmapArtist === 'string' ? rawRecord.beatmapArtist : '',
    keyCount: rawKeyCount,
    score: typeof rawRecord.score === 'number' ? rawRecord.score : 0,
    accuracy: typeof rawRecord.accuracy === 'number' ? rawRecord.accuracy : 0,
    maxCombo: typeof rawRecord.maxCombo === 'number' ? rawRecord.maxCombo : 0,
    grade: typeof rawRecord.grade === 'string' ? rawRecord.grade : 'F',
    replayFrames: replayFrames as ReplayFrame[],
    recordedSettings: rawRecord.recordedSettings as PlayHistoryRecord['recordedSettings'],
    mods: rawMods.filter((mod): mod is string => typeof mod === 'string'),
    schemaVersion: CURRENT_REPLAY_SCHEMA_VERSION,
    replaySource: rawReplaySource,
    catalogSetId: typeof rawRecord.catalogSetId === 'string' || rawRecord.catalogSetId === null ? rawRecord.catalogSetId : catalogInfo.catalogSetId,
    catalogMapId: typeof rawRecord.catalogMapId === 'string' || rawRecord.catalogMapId === null ? rawRecord.catalogMapId : catalogInfo.catalogMapId,
    beatmapHash: hash,
    uploadEligibility,
    isFailed,
    scoreState: { ...rawScoreState, failed: isFailed } as ScoreState,
    uploadStatus: rawUploadStatus,
    isServerCatalogMap: typeof rawRecord.isServerCatalogMap === 'boolean' ? rawRecord.isServerCatalogMap : catalogInfo.isServerCatalogMap,
    chartRevisionId: typeof rawRecord.chartRevisionId === 'string' || rawRecord.chartRevisionId === null ? rawRecord.chartRevisionId : catalogInfo.chartRevisionId,
    checksum: typeof rawRecord.checksum === 'string' ? rawRecord.checksum : undefined,
    checksumAlgorithm: rawRecord.checksumAlgorithm === 'md5' || rawRecord.checksumAlgorithm === 'sha256' ? rawRecord.checksumAlgorithm : undefined,
    ...getHoldRulesInfo(rawRecord),
  };
}

/**
  * Migrates loaded IndexedDB beatmaps to ensure catalog identity, canonical map IDs, and FNV hashes are populated.
  */
export async function migrateAndNormalizeBeatmaps(rawMaps: unknown[]): Promise<{ maps: Beatmap[]; migratedCount: number }> {
  let migratedCount = 0;
  const normalized = await Promise.all(
    rawMaps.map(async (raw) => {
      const map = sanitizeSavedBeatmap(raw);
      if (!map) return null;
      let dirty = false;

      const hasIdentity = hasCatalogIdentity(map);
      const isServer = Boolean(map.isServerMap && hasIdentity);

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
      } else if (!hasIdentity) {
        if (map.catalogSetId !== null && map.catalogSetId !== undefined) { map.catalogSetId = null; dirty = true; }
        if (map.catalogMapId !== null && map.catalogMapId !== undefined) { map.catalogMapId = null; dirty = true; }
        if (map.chartRevisionId !== undefined) { map.chartRevisionId = undefined; dirty = true; }
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
          await storageManager.saveBeatmap(map);
        } catch (e) {
          console.warn('Failed to persist migrated beatmap record:', e);
        }
      }

      return map;
    })
  );

  return { maps: normalized.filter((map): map is NonNullable<typeof map> => map !== null), migratedCount };
}
