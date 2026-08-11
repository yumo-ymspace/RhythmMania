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
import type {
  Beatmap,
  ColumnJudgementCounts,
  GameSettings,
  KeyBindings,
  PlayHistoryRecord,
  ReplayFrame,
  ReplaySource,
  ScoreState,
  UploadEligibility,
  UploadStatus,
} from '../types';
import { migrateHistoryRecord } from './replayManager';
import {
  BABYLON_PLAYFIELD_WIDTH_MAX,
  BABYLON_PLAYFIELD_WIDTH_MIN,
  PLAYFIELD_WIDTH_MAX,
  PLAYFIELD_WIDTH_MIN,
  SCROLL_SPEED_MAX,
  SCROLL_SPEED_MIN,
} from '../components/settings/defaultSettings';

// SECURITY LIMIT CONSTANTS
export const MAX_COMPRESSED_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB max compressed size for .osz
export const MAX_TOTAL_UNCOMPRESSED_SIZE_BYTES = 250 * 1024 * 1024; // 250 MB max uncompressed zip size
export const MAX_ZIP_ENTRIES = 500; // 500 files max per zip/osz
export const MAX_SINGLE_ENTRY_SIZE_BYTES = 80 * 1024 * 1024; // 80 MB max size for any single uncompressed entry
export const MAX_BEATMAP_NOTES = 20000; // 20k notes max to prevent infinite loops / memory exhaustion
export const MAX_BEATMAP_TIMING_POINTS = 5000; // 5k timing points max
export const MAX_OSU_TEXT_BYTES = 2 * 1024 * 1024; // 2 MB max size for the .osu text content
export const MAX_REPLAY_FRAMES = 1_000_000;
export const MAX_MEDIA_URL_LENGTH = 2048;

type UnknownRecord = Record<string, unknown>;
type ZipObjectWithData = JSZip.JSZipObject & { _data?: { uncompressedSize?: number } };

export interface ZipExtractionBudget {
  totalBytes: number;
}

export function createZipExtractionBudget(): ZipExtractionBudget {
  return { totalBytes: 0 };
}

/** Decode hostile text only after checking its encoded UTF-8 byte length. */
export function decodeBoundedUtf8(data: ArrayBuffer | ArrayBufferView, context = 'text'): string {
  const bytes = data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (bytes.byteLength > MAX_OSU_TEXT_BYTES) {
    throw new Error(`Security Exception: ${context} exceeds the UTF-8 size limit.`);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`Security Exception: ${context} is not valid UTF-8.`);
  }
}

export function addExtractedZipBytes(
  budget: ZipExtractionBudget,
  byteLength: number,
  name: string,
): void {
  if (!Number.isFinite(byteLength) || byteLength < 0 || byteLength > MAX_SINGLE_ENTRY_SIZE_BYTES) {
    throw new Error(`Security Exception: File "${name}" exceeds the extracted entry size limit.`);
  }
  const nextTotal = budget.totalBytes + byteLength;
  if (!Number.isSafeInteger(nextTotal) || nextTotal > MAX_TOTAL_UNCOMPRESSED_SIZE_BYTES) {
    throw new Error('Security Exception: Package extracted size exceeds the total limit.');
  }
  budget.totalBytes = nextTotal;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getZipUncompressedSize(file: JSZip.JSZipObject): number {
  return (file as ZipObjectWithData)._data?.uncompressedSize ?? 0;
}

function isReplaySource(value: unknown): value is ReplaySource {
  return value === 'guest-local' || value === 'account-local' || value === 'server-remote' || value === 'imported';
}

function isUploadEligibility(value: unknown): value is UploadEligibility {
  return typeof value === 'string' && [
    'eligible',
    'ineligible_local_map',
    'ineligible_autoplay',
    'ineligible_failed',
    'ineligible_mode',
    'ineligible_no_replay_frames',
  ].includes(value);
}

function isUploadStatus(value: unknown): value is UploadStatus {
  return value === 'local_only' || value === 'pending' || value === 'uploaded' || value === 'failed';
}

/**
 * Checks if a URL is safe to fetch or load.
 * Only allows relative paths, same-origin URLs, /beatmaps/... paths, or blob: URLs.
 * Rejects arbitrary external http/https/ftp/etc. URLs.
 */
export function isSafeAssetUrl(url: string): boolean {
  const value = typeof url === 'string' ? url.trim() : '';
  if (!value || value.startsWith('//')) return false;

  if (value.startsWith('blob:')) {
    try {
      return new URL(value).protocol === 'blob:';
    } catch {
      return false;
    }
  }

  if (value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) return true;
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    try {
      const parsed = new URL(value);
      return typeof window !== 'undefined'
        && (parsed.protocol === 'http:' || parsed.protocol === 'https:')
        && parsed.origin === window.location.origin;
    } catch {
      return false;
    }
  }

  if (!value.includes('://')) return true;

  try {
    const parsed = new URL(value, typeof window !== 'undefined' ? window.location.origin : undefined);
    return typeof window !== 'undefined' && parsed.origin === window.location.origin;
  } catch {
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
export function validateZipLimits(zip: JSZip): void {
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
    const uncompressedSize = getZipUncompressedSize(fileObj);
    
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
  const uncompressedSize = getZipUncompressedSize(fileObj);
  if (uncompressedSize > MAX_SINGLE_ENTRY_SIZE_BYTES) {
    throw new Error(`Security Exception: File "${name}" exceeds single entry size limit (${(uncompressedSize / (1024 * 1024)).toFixed(1)} MB, limit: ${(MAX_SINGLE_ENTRY_SIZE_BYTES / (1024 * 1024)).toFixed(1)} MB)`);
  }
}

/**
 * Validates a color string to prevent script or HTML injection.
 */
export function validateStringColor(color: unknown, defaultColor: string): string {
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
export function sanitizeSettings(parsed: unknown, defaultSettings: GameSettings): GameSettings {
  if (!isRecord(parsed)) return defaultSettings;
  const settings = parsed;
  
  const clamp = (val: unknown, min: number, max: number, fallback: number): number => {
    const num = Number(val);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
  };

  const sanitizeString = (val: unknown, fallback: string, maxLength = 50): string => {
    if (typeof val !== 'string') return fallback;
    const cleaned = val.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim();
    if (cleaned.length > maxLength) return cleaned.slice(0, maxLength);
    return cleaned || fallback;
  };

  const bindings: KeyBindings = {};
  const rawBindings = isRecord(settings.bindings) ? settings.bindings : {};
  for (const k of Object.keys(rawBindings)) {
      const numKey = Number(k);
      const rawBinding = rawBindings[k] ?? rawBindings[String(numKey)];
       if (Number.isFinite(numKey) && numKey >= 2 && numKey <= 8 && Array.isArray(rawBinding)) {
        bindings[numKey] = rawBinding
          .slice(0, numKey)
          .map((b: unknown) => {
            if (typeof b !== 'string') return '';
             // A literal space is the intentional center-lane binding in odd key modes.
             const clean = b === ' ' ? b : b.trim();
            if (clean.length > 10) return clean.slice(0, 10);
            return clean;
          });
    }
  }

  for (const k of [2, 3, 4, 5, 6, 7, 8]) {
    if (!bindings[k] || !Array.isArray(bindings[k]) || bindings[k].length !== k) {
      bindings[k] = [...defaultSettings.bindings[k]];
    }
  }

  const selectedMods: string[] = [];
  if (Array.isArray(settings.selectedMods)) {
    for (const mod of settings.selectedMods) {
      if (typeof mod === 'string' && /^[a-zA-Z0-9]{2,4}$/.test(mod)) {
        selectedMods.push(mod.toUpperCase());
      }
    }
  }

  const customSkinColors: string[] = [];
  if (Array.isArray(settings.customSkinColors)) {
    for (const col of settings.customSkinColors) {
      customSkinColors.push(validateStringColor(col, '#ffffff'));
    }
  } else {
    customSkinColors.push(...(defaultSettings.customSkinColors || []));
  }
  const sanitizeLanePalettes = (value: unknown, fallback: Record<number, string[]> = {}) => {
    const result: Record<number, string[]> = {};
    if (!value || typeof value !== 'object') return fallback;
    for (const keyCount of [2, 3, 4, 5, 6, 7, 8]) {
      const colors = (value as Record<string, unknown>)[keyCount];
      if (Array.isArray(colors) && colors.length === keyCount) {
        result[keyCount] = colors.map(color => validateStringColor(color, '#ffffff'));
      } else if (fallback[keyCount]) {
        result[keyCount] = [...fallback[keyCount]];
      }
    }
    return result;
  };

  const renderEngine = settings.skinId === 'rhythmmania-3d' || settings.renderEngine === 'babylon' ? 'babylon' : 'canvas';
  const sizeMax = renderEngine === 'babylon'
    ? 1.2
    : settings.playfieldStyle === 'circle'
      ? 1.5
      : (settings.squareRenderStyle === 'rhythmplus' || settings.squareRenderStyle === 'rhythmplus-dynamic') ? 1.1 : 1.05;
  const widthMin = renderEngine === 'babylon' ? BABYLON_PLAYFIELD_WIDTH_MIN : PLAYFIELD_WIDTH_MIN;
  const widthMax = renderEngine === 'babylon' ? BABYLON_PLAYFIELD_WIDTH_MAX : PLAYFIELD_WIDTH_MAX;

  return {
    scrollSpeed: clamp(settings.scrollSpeed, SCROLL_SPEED_MIN, SCROLL_SPEED_MAX, defaultSettings.scrollSpeed),
    audioOffset: clamp(settings.audioOffset, -1000, 1000, defaultSettings.audioOffset),
    visualOffset: clamp(settings.visualOffset, -1000, 1000, defaultSettings.visualOffset),
    hitsoundVolume: clamp(settings.hitsoundVolume, 0, 1, defaultSettings.hitsoundVolume),
    musicVolume: clamp(settings.musicVolume, 0, 1, defaultSettings.musicVolume),
    previewVolume: clamp(settings.previewVolume, 0, 1, defaultSettings.previewVolume),
    masterVolume: clamp(settings.masterVolume, 0, 1, defaultSettings.masterVolume),
    keyMode: clamp(settings.keyMode, 2, 8, defaultSettings.keyMode),
    bindings: bindings,
    upsurfaceNoteMode: renderEngine === 'babylon'
      ? false
      : Boolean(settings.upsurfaceNoteMode),
    videoOpacity: 1.0,
    backgroundDim: clamp(settings.backgroundDim, 0, 1, defaultSettings.backgroundDim),
    menuBackgroundDim: clamp(settings.menuBackgroundDim, 0, 1, defaultSettings.menuBackgroundDim ?? 0.3),
    disableVideo: Boolean(settings.disableVideo),
    videoOffset: clamp(settings.videoOffset, -10000, 10000, defaultSettings.videoOffset || 0),
    disableParticles: Boolean(settings.disableParticles),
    disableLaneShake: Boolean(settings.disableLaneShake),
    limitDprToOne: false,
    skinId: renderEngine === 'babylon' ? 'rhythmmania-3d' : sanitizeString(settings.skinId, defaultSettings.skinId || 'custom'),
    customSkinColors: customSkinColors,
    customSkinName: settings.customSkinName ? sanitizeString(settings.customSkinName, 'custom', 30) : undefined,
    squareRenderStyle: settings.squareRenderStyle === 'rhythmplus-dynamic'
      ? 'rhythmplus-dynamic'
      : settings.squareRenderStyle === 'rhythmplus' ? 'rhythmplus' : 'rhythmmania',
    receptorColorsByKeyCount: sanitizeLanePalettes(settings.receptorColorsByKeyCount, defaultSettings.receptorColorsByKeyCount),
    noteOpacity: clamp(settings.noteOpacity, 0, 1, defaultSettings.noteOpacity || 1.0),
    receptorOpacity: clamp(settings.receptorOpacity, 0, 1, defaultSettings.receptorOpacity || 1.0),
    judgementOpacity: clamp(settings.judgementOpacity, 0, 1, defaultSettings.judgementOpacity || 1.0),
    judgementSize: clamp(settings.judgementSize, 0.5, 2, defaultSettings.judgementSize || 1.0),
    judgementPositionY: clamp(settings.judgementPositionY, 20, 85, defaultSettings.judgementPositionY || 50),
    laneSeparatorOpacity: clamp(settings.laneSeparatorOpacity, 0, 1, defaultSettings.laneSeparatorOpacity || 0.30),
    circleSize: clamp(settings.circleSize, 0.5, 2, defaultSettings.circleSize || 1.0),
    noteSizeMultiplier: clamp(settings.noteSizeMultiplier, 0.85, sizeMax, defaultSettings.noteSizeMultiplier || 1.0),
    receptorSizeMultiplier: clamp(settings.receptorSizeMultiplier ?? settings.circleSize, 0.85, sizeMax, defaultSettings.receptorSizeMultiplier || 1.0),
    playfieldStyle: settings.playfieldStyle === 'circle' ? 'circle' : 'square',
     playfieldWidthPercent: clamp(settings.playfieldWidthPercent, widthMin, widthMax, Math.max(widthMin, Math.min(widthMax, defaultSettings.playfieldWidthPercent || 40))),
    progressBarTop: Boolean(settings.progressBarTop),
    selectedMods: selectedMods,
    bindPause: sanitizeString(settings.bindPause, defaultSettings.bindPause || 'escape', 15),
    bindRetry: sanitizeString(settings.bindRetry, defaultSettings.bindRetry || 'r', 15),
     renderEngine,
     babylonFloor: settings.babylonFloor !== undefined ? Boolean(settings.babylonFloor) : (defaultSettings.babylonFloor ?? true),
     enableMapSV: settings.enableMapSV !== undefined ? Boolean(settings.enableMapSV) : true,
    enableSongPreview: settings.enableSongPreview !== undefined ? Boolean(settings.enableSongPreview) : true,
    showFpsCounter: Boolean(settings.showFpsCounter),
  };
}

/**
 * Validates and sanitizes a history record loaded from local storage.
 * Ensures strip/clamp of values and removes potential dangerous blob URLs.
 */
export function sanitizeHistoryRecord(rawRecord: unknown, defaultSettings: GameSettings, availableBeatmaps: Beatmap[] = []): PlayHistoryRecord | null {
  if (!isRecord(rawRecord)) return null;
  const record = rawRecord;

  const clamp = (val: unknown, min: number, max: number, fallback: number): number => {
    const num = Number(val);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
  };

  const sanitizeString = (val: unknown, maxLength = 100): string => {
    if (typeof val !== 'string') return '';
    // Strip HTML, blob URLs, or other dangerous content
    let cleaned = val.replace(/blob:/gi, '').replace(/javascript:/gi, '');
    cleaned = cleaned.replace(/[^a-zA-Z0-9_\-\s.#:()]/g, '').trim();
    if (cleaned.length > maxLength) return cleaned.slice(0, maxLength);
    return cleaned;
  };

  // Validate ScoreState
  const scoreInput = isRecord(record.scoreState) ? record.scoreState : null;
  if (!scoreInput) return null;

  const scoreState: ScoreState = {
    score: clamp(scoreInput.score, 0, 1000000000, 0),
    combo: clamp(scoreInput.combo, 0, 100000, 0),
    maxCombo: clamp(scoreInput.maxCombo, 0, 100000, 0),
    hp: clamp(scoreInput.hp, 0, 100, 0),
    perfectCount: clamp(scoreInput.perfectCount, 0, 100000, 0),
    marvelousCount: clamp(scoreInput.marvelousCount, 0, 100000, 0),
    greatCount: clamp(scoreInput.greatCount, 0, 100000, 0),
    goodCount: clamp(scoreInput.goodCount, 0, 100000, 0),
    badCount: clamp(scoreInput.badCount, 0, 100000, 0),
    missCount: clamp(scoreInput.missCount, 0, 100000, 0),
    accuracy: clamp(scoreInput.accuracy, 0, 100, 0),
    completed: Boolean(scoreInput.completed),
    failed: Boolean(scoreInput.failed),
    recordId: sanitizeString(scoreInput.recordId, 50),
    unstableRate: null,
    hitErrorSampleCount: clamp(scoreInput.hitErrorSampleCount, 0, 100000, 0),
    columnJudgements: [],
  };

  if (typeof scoreInput.unstableRate === 'number' && Number.isFinite(scoreInput.unstableRate) && scoreInput.unstableRate >= 0) {
    scoreState.unstableRate = clamp(scoreInput.unstableRate, 0, 10000, 0);
  }

  const rawKeyCount = Number(record.keyCount);
  const keyCount = Number.isInteger(rawKeyCount) && rawKeyCount >= 2 && rawKeyCount <= 8 ? rawKeyCount : 4;
  const columnJudgements: ColumnJudgementCounts[] = [];
  if (Array.isArray(scoreInput.columnJudgements)) {
    for (const item of scoreInput.columnJudgements) {
      if (isRecord(item)) {
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

  if (scoreInput.isAutoplay !== undefined) {
    scoreState.isAutoplay = Boolean(scoreInput.isAutoplay);
  }

  // Validate replayFrames
  const replayFrames: ReplayFrame[] = [];
  if (Array.isArray(record.replayFrames)) {
    if (record.replayFrames.length > MAX_REPLAY_FRAMES) return null;
    const framesByTime = new Map<number, ReplayFrame>();
    for (const frame of record.replayFrames) {
      if (!isRecord(frame) || !Array.isArray(frame.keysPressed) || frame.keysPressed.length !== keyCount ||
        !frame.keysPressed.every((key): key is boolean => typeof key === 'boolean')) return null;
      const time = Number(frame.time);
      if (!Number.isFinite(time) || time < 0 || time > 10000000) return null;
      const keysPressed = [...frame.keysPressed];
      // Sorting and last-write-wins make duplicate timestamps deterministic.
      framesByTime.set(time, { time, keysPressed });
    }
    const sortedTimes = Array.from(framesByTime.keys()).sort((a, b) => a - b);
    for (const time of sortedTimes) {
      const frame = framesByTime.get(time);
      if (frame) replayFrames.push(frame);
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
    keyCount,
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
    schemaVersion: typeof record.schemaVersion === 'number' ? record.schemaVersion : undefined,
    replaySource: isReplaySource(record.replaySource) ? record.replaySource : undefined,
    catalogSetId: typeof record.catalogSetId === 'string' || record.catalogSetId === null ? record.catalogSetId : undefined,
    catalogMapId: typeof record.catalogMapId === 'string' || record.catalogMapId === null ? record.catalogMapId : undefined,
    chartRevisionId: typeof record.chartRevisionId === 'string' || record.chartRevisionId === null ? record.chartRevisionId : undefined,
    checksum: typeof record.checksum === 'string' ? record.checksum.slice(0, 128) : undefined,
    checksumAlgorithm: record.checksumAlgorithm === 'md5' || record.checksumAlgorithm === 'sha256' ? record.checksumAlgorithm : undefined,
    beatmapHash: typeof record.beatmapHash === 'string' ? record.beatmapHash : undefined,
    uploadEligibility: isUploadEligibility(record.uploadEligibility) ? record.uploadEligibility : undefined,
    uploadStatus: isUploadStatus(record.uploadStatus) ? record.uploadStatus : undefined,
    isServerCatalogMap: typeof record.isServerCatalogMap === 'boolean' ? record.isServerCatalogMap : undefined,
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
