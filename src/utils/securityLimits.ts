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

import JSZip from 'jszip';
import { Beatmap, GameSettings, PlayHistoryRecord, ReplaySource, UploadEligibility, UploadStatus } from '../types';
import { migrateHistoryRecord } from './replayManager';
import {
  BABYLON_PLAYFIELD_WIDTH_MAX,
  BABYLON_PLAYFIELD_WIDTH_MIN,
  PLAYFIELD_WIDTH_MAX,
  PLAYFIELD_WIDTH_MIN,
} from '../components/settings/defaultSettings';

// SECURITY LIMIT CONSTANTS
export const MAX_COMPRESSED_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB max compressed size for .osz
export const MAX_SKIN_COMPRESSED_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB max compressed size for .osk
export const MAX_TOTAL_UNCOMPRESSED_SIZE_BYTES = 250 * 1024 * 1024; // 250 MB max uncompressed zip size
export const MAX_ZIP_ENTRIES = 500; // 500 files max per zip/osz
export const MAX_SINGLE_ENTRY_SIZE_BYTES = 80 * 1024 * 1024; // 80 MB max size for any single uncompressed entry
export const MAX_BEATMAP_NOTES = 20000; // 20k notes max to prevent infinite loops / memory exhaustion
export const MAX_BEATMAP_TIMING_POINTS = 5000; // 5k timing points max
export const MAX_OSU_TEXT_BYTES = 2 * 1024 * 1024; // 2 MB max size for the .osu text content

/**
 * Checks if a URL is safe to fetch or load.
 * Only allows relative paths, same-origin URLs, /beatmaps/... paths, or blob: URLs.
 * Rejects arbitrary external http/https/ftp/etc. URLs.
 */
export function isSafeAssetUrl(url: string): boolean {
  if (!url) return false;
  
  // Allow blob URLs
  if (url.startsWith('blob:')) {
    return true;
  }
  
  // Allow same-origin/relative paths
  if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../') || !url.includes('://')) {
    return true;
  }
  
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : undefined);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    
    // Check if same origin
    if (origin && parsed.origin === origin) {
      return true;
    }
    
    // Only allow specific paths on same origin if it was relative
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Throws an error if the asset URL is unsafe.
 */
export function assertSafeAssetUrl(url: string, context = 'Asset URL'): void {
  if (!isSafeAssetUrl(url)) {
    throw new Error(`Security Exception: Unsafe URL blocked for ${context}: "${url}"`);
  }
}

/**
 * Validates zip structural integrity and limits before decompressing/extracting.
 * Prevents client-side DoS (zip bombs, excessive file sizes, memory exhaustion).
 */
export function validateZipLimits(zip: JSZip, isSkin = false): void {
  const files = zip.files;
  const fileKeys = Object.keys(files);
  
  if (fileKeys.length > MAX_ZIP_ENTRIES) {
    throw new Error(`Security Exception: Too many files in package (${fileKeys.length} files, limit: ${MAX_ZIP_ENTRIES})`);
  }
  
  let totalUncompressedSize = 0;
  
  for (const key of fileKeys) {
    const fileObj = files[key];
    if (fileObj.dir) continue;
    
    // Read uncompressed size from the zip header if available
    const uncompressedSize = (fileObj as any)._data?.uncompressedSize ?? 0;
    
    if (uncompressedSize > MAX_SINGLE_ENTRY_SIZE_BYTES) {
      throw new Error(`Security Exception: File "${key}" exceeds single entry size limit (${(uncompressedSize / (1024 * 1024)).toFixed(1)} MB, limit: ${(MAX_SINGLE_ENTRY_SIZE_BYTES / (1024 * 1024)).toFixed(1)} MB)`);
    }
    
    totalUncompressedSize += uncompressedSize;
  }
  
  const totalLimit = MAX_TOTAL_UNCOMPRESSED_SIZE_BYTES;
  if (totalUncompressedSize > totalLimit) {
    throw new Error(`Security Exception: Package uncompressed size exceeds limit (${(totalUncompressedSize / (1024 * 1024)).toFixed(1)} MB, limit: ${(totalLimit / (1024 * 1024)).toFixed(1)} MB)`);
  }
}

/**
 * Validates individual entry contents size before loading async.
 */
export function validateZipEntrySize(fileObj: JSZip.JSZipObject, name: string): void {
  const uncompressedSize = (fileObj as any)._data?.uncompressedSize ?? 0;
  if (uncompressedSize > MAX_SINGLE_ENTRY_SIZE_BYTES) {
    throw new Error(`Security Exception: File "${name}" exceeds single entry size limit (${(uncompressedSize / (1024 * 1024)).toFixed(1)} MB, limit: ${(MAX_SINGLE_ENTRY_SIZE_BYTES / (1024 * 1024)).toFixed(1)} MB)`);
  }
}

/**
 * Validates a color string to prevent script or HTML injection.
 */
export function validateStringColor(color: any, defaultColor: string): string {
  if (typeof color !== 'string') return defaultColor;
  const hexRegex = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  if (hexRegex.test(color)) return color;
  
  const rgbRegex = /^rgba?\((\s*\d+\s*,){2}\s*\d+\s*(,\s*[0-9.]+\s*)?\)$/;
  if (rgbRegex.test(color)) return color;

  const basicColors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'white', 'black', 'gray', 'grey', 'cyan', 'magenta', 'transparent'];
  if (basicColors.includes(color.toLowerCase())) return color;

  return defaultColor;
}

/**
 * Whitelist/clamp validate critical settings fields.
 * Safe fallback is returned on validation failure.
 */
export function sanitizeSettings(parsed: any, defaultSettings: GameSettings): GameSettings {
  if (!parsed || typeof parsed !== 'object') return defaultSettings;
  
  const clamp = (val: any, min: number, max: number, fallback: number): number => {
    const num = Number(val);
    if (isNaN(num)) return fallback;
    return Math.max(min, Math.min(max, num));
  };

  const sanitizeString = (val: any, fallback: string, maxLength = 50): string => {
    if (typeof val !== 'string') return fallback;
    const cleaned = val.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim();
    if (cleaned.length > maxLength) return cleaned.slice(0, maxLength);
    return cleaned || fallback;
  };

  const bindings: any = {};
  if (parsed.bindings && typeof parsed.bindings === 'object') {
    for (const k of Object.keys(parsed.bindings)) {
      const numKey = Number(k);
      if (!isNaN(numKey) && numKey >= 2 && numKey <= 8 && Array.isArray(parsed.bindings[numKey])) {
        bindings[numKey] = parsed.bindings[numKey]
          .slice(0, numKey)
          .map((b: any) => {
            if (typeof b !== 'string') return '';
            const clean = b.trim();
            if (clean.length > 10) return clean.slice(0, 10);
            return clean;
          });
      }
    }
  }

  for (const k of [2, 3, 4, 5, 6, 7, 8]) {
    if (!bindings[k] || !Array.isArray(bindings[k]) || bindings[k].length !== k) {
      bindings[k] = [...defaultSettings.bindings[k]];
    }
  }

  const selectedMods: string[] = [];
  if (Array.isArray(parsed.selectedMods)) {
    for (const mod of parsed.selectedMods) {
      if (typeof mod === 'string' && /^[a-zA-Z0-9]{2,4}$/.test(mod)) {
        selectedMods.push(mod);
      }
    }
  }

  const customSkinColors: string[] = [];
  if (Array.isArray(parsed.customSkinColors)) {
    for (const col of parsed.customSkinColors) {
      customSkinColors.push(validateStringColor(col, '#ffffff'));
    }
  } else {
    customSkinColors.push(...(defaultSettings.customSkinColors || []));
  }

  const renderEngine = parsed.renderEngine === 'pixi' ? 'pixi' : parsed.renderEngine === 'babylon' ? 'babylon' : 'canvas';
  const widthMin = renderEngine === 'babylon' ? BABYLON_PLAYFIELD_WIDTH_MIN : PLAYFIELD_WIDTH_MIN;
  const widthMax = renderEngine === 'babylon' ? BABYLON_PLAYFIELD_WIDTH_MAX : PLAYFIELD_WIDTH_MAX;

  return {
    scrollSpeed: clamp(parsed.scrollSpeed, 1, 40, defaultSettings.scrollSpeed),
    audioOffset: clamp(parsed.audioOffset, -1000, 1000, defaultSettings.audioOffset),
    visualOffset: clamp(parsed.visualOffset, -1000, 1000, defaultSettings.visualOffset),
    hitsoundVolume: clamp(parsed.hitsoundVolume, 0, 1, defaultSettings.hitsoundVolume),
    musicVolume: clamp(parsed.musicVolume, 0, 1, defaultSettings.musicVolume),
    previewVolume: clamp(parsed.previewVolume, 0, 1, defaultSettings.previewVolume),
    masterVolume: clamp(parsed.masterVolume, 0, 1, defaultSettings.masterVolume),
    keyMode: clamp(parsed.keyMode, 2, 8, defaultSettings.keyMode),
    bindings: bindings,
    upsurfaceNoteMode: (parsed.renderEngine === 'babylon' || String(parsed.renderEngine) === 'babylon')
      ? false
      : Boolean(parsed.upsurfaceNoteMode),
    videoOpacity: 1.0,
    backgroundDim: clamp(parsed.backgroundDim, 0, 1, defaultSettings.backgroundDim),
    menuBackgroundDim: clamp(parsed.menuBackgroundDim, 0, 1, defaultSettings.menuBackgroundDim ?? 0.3),
    disableVideo: Boolean(parsed.disableVideo),
    videoOffset: clamp(parsed.videoOffset, -10000, 10000, defaultSettings.videoOffset || 0),
    disableParticles: Boolean(parsed.disableParticles),
    limitDprToOne: false,
    skinId: sanitizeString(parsed.skinId, defaultSettings.skinId || 'custom'),
    customSkinColors: customSkinColors,
    customSkinName: parsed.customSkinName ? sanitizeString(parsed.customSkinName, 'custom', 30) : undefined,
    squareRenderStyle: parsed.squareRenderStyle === 'rhythmplus' ? 'rhythmplus' : 'rhythmmania',
    rhythmplusColor: validateStringColor(parsed.rhythmplusColor, defaultSettings.rhythmplusColor || '#ffff00'),
    rhythmmaniaNoteColor: validateStringColor(parsed.rhythmmaniaNoteColor, defaultSettings.rhythmmaniaNoteColor || '#00b0ff'),
    rhythmmaniaReceptorColor: validateStringColor(parsed.rhythmmaniaReceptorColor, defaultSettings.rhythmmaniaReceptorColor || '#00b0ff'),
    circleNoteColor: validateStringColor(parsed.circleNoteColor, defaultSettings.circleNoteColor || '#00b0ff'),
    circleReceptorColor: validateStringColor(parsed.circleReceptorColor, defaultSettings.circleReceptorColor || '#00b0ff'),
    noteOpacity: clamp(parsed.noteOpacity, 0, 1, defaultSettings.noteOpacity || 1.0),
    receptorOpacity: clamp(parsed.receptorOpacity, 0, 1, defaultSettings.receptorOpacity || 1.0),
    judgementOpacity: clamp(parsed.judgementOpacity, 0, 1, defaultSettings.judgementOpacity || 1.0),
    judgementSize: clamp(parsed.judgementSize, 0.5, 2, defaultSettings.judgementSize || 1.0),
    laneSeparatorOpacity: clamp(parsed.laneSeparatorOpacity, 0, 1, defaultSettings.laneSeparatorOpacity || 0.30),
    circleSize: clamp(parsed.circleSize, 0.5, 2, defaultSettings.circleSize || 1.0),
    noteSizeMultiplier: clamp(parsed.noteSizeMultiplier, 0.5, 2, defaultSettings.noteSizeMultiplier || 1.0),
    playfieldStyle: parsed.playfieldStyle === 'circle' ? 'circle' : 'square',
     playfieldWidthPercent: clamp(parsed.playfieldWidthPercent, widthMin, widthMax, Math.max(widthMin, Math.min(widthMax, defaultSettings.playfieldWidthPercent || 40))),
    progressBarTop: Boolean(parsed.progressBarTop),
    selectedMods: selectedMods,
    bindPause: sanitizeString(parsed.bindPause, defaultSettings.bindPause || 'escape', 15),
    bindRetry: sanitizeString(parsed.bindRetry, defaultSettings.bindRetry || 'r', 15),
     renderEngine,
    babylonFloor: parsed.babylonFloor !== undefined ? Boolean(parsed.babylonFloor) : (defaultSettings.babylonFloor ?? true),
    babylonQuality:
      parsed.babylonQuality === 'low' ? 'low'
      : parsed.babylonQuality === 'medium' ? 'medium'
      : (defaultSettings.babylonQuality ?? 'high'),
    enableMapSV: parsed.enableMapSV !== undefined ? Boolean(parsed.enableMapSV) : true,
    enableSongPreview: parsed.enableSongPreview !== undefined ? Boolean(parsed.enableSongPreview) : true,
    showFpsCounter: Boolean(parsed.showFpsCounter),
  };
}

/**
 * Validates and sanitizes a history record loaded from local storage.
 * Ensures strip/clamp of values and removes potential dangerous blob URLs.
 */
export function sanitizeHistoryRecord(record: any, defaultSettings: GameSettings, availableBeatmaps: Beatmap[] = []): PlayHistoryRecord | null {
  if (!record || typeof record !== 'object') return null;

  const clamp = (val: any, min: number, max: number, fallback: number): number => {
    const num = Number(val);
    if (isNaN(num)) return fallback;
    return Math.max(min, Math.min(max, num));
  };

  const sanitizeString = (val: any, maxLength = 100): string => {
    if (typeof val !== 'string') return '';
    // Strip HTML, blob URLs, or other dangerous content
    let cleaned = val.replace(/blob:/gi, '').replace(/javascript:/gi, '');
    cleaned = cleaned.replace(/[^a-zA-Z0-9_\-\s.#:()]/g, '').trim();
    if (cleaned.length > maxLength) return cleaned.slice(0, maxLength);
    return cleaned;
  };

  // Validate ScoreState
  const scoreState: any = {};
  if (record.scoreState && typeof record.scoreState === 'object') {
    scoreState.score = clamp(record.scoreState.score, 0, 1000000000, 0);
    scoreState.combo = clamp(record.scoreState.combo, 0, 100000, 0);
    scoreState.maxCombo = clamp(record.scoreState.maxCombo, 0, 100000, 0);
    scoreState.hp = clamp(record.scoreState.hp, 0, 100, 0);
    scoreState.perfectCount = clamp(record.scoreState.perfectCount, 0, 100000, 0);
    scoreState.marvelousCount = clamp(record.scoreState.marvelousCount, 0, 100000, 0);
    scoreState.greatCount = clamp(record.scoreState.greatCount, 0, 100000, 0);
    scoreState.goodCount = clamp(record.scoreState.goodCount, 0, 100000, 0);
    scoreState.badCount = clamp(record.scoreState.badCount, 0, 100000, 0);
    scoreState.missCount = clamp(record.scoreState.missCount, 0, 100000, 0);
    scoreState.accuracy = clamp(record.scoreState.accuracy, 0, 100, 0);
    scoreState.completed = Boolean(record.scoreState.completed);
    scoreState.failed = Boolean(record.scoreState.failed);
    scoreState.recordId = sanitizeString(record.scoreState.recordId, 50);

    // Sanitize precision metric fields
    if (typeof record.scoreState.unstableRate === 'number' && Number.isFinite(record.scoreState.unstableRate) && record.scoreState.unstableRate >= 0) {
      scoreState.unstableRate = clamp(record.scoreState.unstableRate, 0, 10000, 0);
    } else {
      scoreState.unstableRate = null;
    }

    scoreState.hitErrorSampleCount = clamp(record.scoreState.hitErrorSampleCount, 0, 100000, 0);

    const keyCount = clamp(record.keyCount, 2, 8, 4);
    const columnJudgements: any[] = [];
    if (Array.isArray(record.scoreState.columnJudgements)) {
      for (const item of record.scoreState.columnJudgements) {
        if (item && typeof item === 'object') {
          const colIndex = clamp(item.column, 0, keyCount - 1, -1);
          if (colIndex >= 0) {
            columnJudgements.push({
              column: colIndex,
              marvelousCount: clamp(item.marvelousCount, 0, 100000, 0),
              perfectCount: clamp(item.perfectCount, 0, 100000, 0),
              greatCount: clamp(item.greatCount, 0, 100000, 0),
              goodCount: clamp(item.goodCount, 0, 100000, 0),
              badCount: clamp(item.badCount, 0, 100000, 0),
              missCount: clamp(item.missCount, 0, 100000, 0),
            });
          }
        }
      }
    }
    scoreState.columnJudgements = columnJudgements;

    if (record.scoreState.isAutoplay !== undefined) {
      scoreState.isAutoplay = Boolean(record.scoreState.isAutoplay);
    }
  } else {
    return null;
  }

  // Validate replayFrames
  const replayFrames: any[] = [];
  if (Array.isArray(record.replayFrames)) {
    for (const frame of record.replayFrames) {
      if (frame && typeof frame === 'object') {
        replayFrames.push({
          time: clamp(frame.time, 0, 10000000, 0),
          keysPressed: Array.isArray(frame.keysPressed) ? frame.keysPressed.map(Boolean) : []
        });
      }
    }
  }

  const recordedSettings = record.recordedSettings 
    ? sanitizeSettings(record.recordedSettings, defaultSettings)
    : undefined;

  const mods: string[] = [];
  if (Array.isArray(record.mods)) {
    for (const m of record.mods) {
      if (typeof m === 'string' && /^[a-zA-Z0-9]{2,4}$/.test(m)) {
        mods.push(m);
      }
    }
  }

  const isNoFail = mods.some(mod => mod.toUpperCase() === 'NF');

  // Failed runs are intentionally ephemeral unless No Fail was active.
  if ((Boolean(record.isFailed) || scoreState.failed) && !isNoFail) {
    return null;
  }

  // NF runs are completed ranked plays, not failed replays.
  if (isNoFail) {
    scoreState.failed = false;
  }

  const baseCleaned: PlayHistoryRecord = {
    id: sanitizeString(record.id, 50),
    timestamp: clamp(record.timestamp, 0, 2000000000000, Date.now()),
    beatmapId: sanitizeString(record.beatmapId, 100),
    beatmapTitle: sanitizeString(record.beatmapTitle, 100),
    beatmapArtist: sanitizeString(record.beatmapArtist, 100),
    keyCount: clamp(record.keyCount, 2, 8, 4),
    score: clamp(record.score, 0, 1000000000, 0),
    accuracy: clamp(record.accuracy, 0, 100, 0),
    maxCombo: clamp(record.maxCombo, 0, 100000, 0),
    grade: sanitizeString(record.grade, 5),
    isFailed: isNoFail ? false : Boolean(record.isFailed),
    scoreState,
    replayFrames,
    recordedSettings,
    mods,
    // Preserve existing v2 fields if already populated
    schemaVersion: record.schemaVersion,
    replaySource: record.replaySource,
    catalogSetId: record.catalogSetId,
    catalogMapId: record.catalogMapId,
    beatmapHash: record.beatmapHash,
    uploadEligibility: record.uploadEligibility,
    uploadStatus: record.uploadStatus,
    isServerCatalogMap: record.isServerCatalogMap,
  };

  return migrateHistoryRecord(baseCleaned, availableBeatmaps);
}

/**
 * Sanitizes a URL for safe use inside CSS url("...") context.
 * Rejects quotes and parentheses (CSS breakouts). Whitespace in paths is percent-encoded.
 * Also enforces the isSafeAssetUrl check to only allow blob: or same-origin paths.
 */
export function sanitizeCssUrl(url: string, fallback = '/backgrounds/Ferineon.webp'): string {
  if (!url || typeof url !== 'string') return fallback;

  if (url.includes('"') || url.includes("'") || url.includes('(') || url.includes(')') || url.includes('\\')) {
    console.warn('Security Exception: CSS URL contains injection patterns:', url);
    return fallback;
  }

  // Encode spaces / unsafe path chars for url("...") without rejecting legitimate asset names
  let safe = url;
  try {
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      safe = url;
    } else if (/^https?:\/\//i.test(url)) {
      const u = new URL(url);
      u.pathname = u.pathname.split('/').map(seg => encodeURIComponent(decodeURIComponent(seg))).join('/');
      safe = u.toString();
    } else {
      // relative / absolute path
      const q = url.indexOf('?');
      const h = url.indexOf('#');
      let path = url;
      let suffix = '';
      if (q >= 0 || h >= 0) {
        const cut = [q, h].filter(i => i >= 0).sort((a, b) => a - b)[0];
        path = url.slice(0, cut);
        suffix = url.slice(cut);
      }
      safe = path.split('/').map((seg, i) => {
        if (i === 0 && seg === '') return '';
        try { return encodeURIComponent(decodeURIComponent(seg)); } catch { return encodeURIComponent(seg); }
      }).join('/') + suffix;
    }
  } catch {
    return fallback;
  }

  if (!isSafeAssetUrl(url) && !isSafeAssetUrl(safe)) {
    console.warn('Security Exception: Unsafe URL blocked in CSS context:', url);
    return fallback;
  }

  return safe;
}
