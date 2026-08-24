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

import { Beatmap, GameSettings, PlayHistoryRecord, ReplayClientInfo } from '../types';
import { sanitizeHistoryRecord } from './securityLimits';
import { CURRENT_REPLAY_SCHEMA_VERSION, RMR_EXTENSION, RMR_MIME_TYPE } from './replayManager';

export const REPLAY_EXPORT_FORMAT = 'rhythmmania-replay-export';

export const MAX_IMPORT_FILE_BYTES = 64 * 1024 * 1024;
const MAX_IMPORT_RECORDS = 500;

interface ReplayExportEnvelope {
  format: typeof REPLAY_EXPORT_FORMAT;
  schemaVersion: number;
  exportedAt: number;
  records: PlayHistoryRecord[];
  exporter?: ReplayClientInfo | null;
  sourceSetIds?: number[];
}

function collectExporterInfo(): ReplayClientInfo | null {
  try {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    let browser = 'unknown';
    let os = 'unknown';
    if (ua) {
      if (/Edg\//.test(ua)) browser = 'Edge';
      else if (/OPR|Opera/.test(ua)) browser = 'Opera';
      else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome';
      else if (/Firefox\//.test(ua)) browser = 'Firefox';
      else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
      if (/Windows NT/.test(ua)) os = 'Windows';
      else if (/Mac OS X/.test(ua)) os = 'macOS';
      else if (/Android/.test(ua)) os = 'Android';
      else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
      else if (/Linux/.test(ua)) os = 'Linux';
    }
    let timezone = 'UTC';
    let timezoneOffset = 0;
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; timezoneOffset = new Date().getTimezoneOffset(); } catch { /* defaults */ }
    return {
      userAgent: ua.slice(0, 500),
      browser,
      os,
      platform: typeof navigator !== 'undefined' ? (navigator.platform || '') : '',
      language: typeof navigator !== 'undefined' ? (navigator.language || '') : '',
      timezone: timezone.slice(0, 80),
      timezoneOffset,
      screenWidth: typeof window !== 'undefined' ? window.screen?.width : undefined,
      screenHeight: typeof window !== 'undefined' ? window.screen?.height : undefined,
      appVersion: 'v0.9.4',
    };
  } catch { return null; }
}

export function downloadReplayExport(records: PlayHistoryRecord[], filenameBase: string): void {
  const sourceSetIds = Array.from(new Set(
    records.map(r => r.sourceSetId).filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
  )).slice(0, 100);
  const envelope: ReplayExportEnvelope = {
    format: REPLAY_EXPORT_FORMAT,
    schemaVersion: CURRENT_REPLAY_SCHEMA_VERSION,
    exportedAt: Date.now(),
    records,
    exporter: collectExporterInfo(),
    sourceSetIds: sourceSetIds.length ? sourceSetIds : undefined,
  };
  const blob = new Blob([JSON.stringify(envelope)], { type: RMR_MIME_TYPE });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeBase = filenameBase.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().slice(0, 60) || 'replay';
  a.href = url;
  a.download = `rhythmmania-${safeBase}${RMR_EXTENSION}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function parseReplayImport(
  text: string,
  defaultSettings: GameSettings,
  availableBeatmaps: Beatmap[] = []
): { records: PlayHistoryRecord[]; rejectedCount: number } {
  if (typeof text !== 'string') return { records: [], rejectedCount: 1 };
  const stripped = text.trim().replace(/^\uFEFF/, '');
  if (!stripped || new TextEncoder().encode(stripped).byteLength > MAX_IMPORT_FILE_BYTES) {
    return { records: [], rejectedCount: 1 };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return { records: [], rejectedCount: 1 };
  }

  let rawRecords: unknown[] = [];
  if (Array.isArray(parsed)) {
    rawRecords = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const envelope = parsed as { records?: unknown; scoreState?: unknown; data?: unknown };
    if (Array.isArray(envelope.records)) {
      rawRecords = envelope.records;
    } else if (Array.isArray(envelope.data)) {
      rawRecords = envelope.data;
    } else if (envelope.scoreState && typeof envelope.scoreState === 'object') {
      rawRecords = [parsed];
    } else {
      const vals = Object.values(parsed as Record<string, unknown>);
      const maybeArr = vals.find(v => Array.isArray(v) && v.length > 0 && typeof v[0] === 'object');
      if (Array.isArray(maybeArr)) rawRecords = maybeArr as unknown[];
    }
  }

  if (rawRecords.length === 0) return { records: [], rejectedCount: 1 };
  let rejectedCount = 0;
  if (rawRecords.length > MAX_IMPORT_RECORDS) {
    rejectedCount = rawRecords.length - MAX_IMPORT_RECORDS;
    rawRecords = rawRecords.slice(0, MAX_IMPORT_RECORDS);
  }

  const records: PlayHistoryRecord[] = [];
  for (const raw of rawRecords) {
    const clean = sanitizeHistoryRecord(raw, defaultSettings, availableBeatmaps, { allowFailed: true });
    if (clean && clean.id) {
      records.push({
        ...clean,
        replaySource: 'imported',
        uploadEligibility: 'ineligible_local_map',
        uploadStatus: 'local_only',
      });
    } else {
      rejectedCount++;
    }
  }
  return { records, rejectedCount };
}

export function isRmrFilename(name: string): boolean {
  return name.toLowerCase().endsWith(RMR_EXTENSION);
}
