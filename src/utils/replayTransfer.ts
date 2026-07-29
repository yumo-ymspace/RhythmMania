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

import { Beatmap, GameSettings, PlayHistoryRecord } from '../types';
import { sanitizeHistoryRecord } from './securityLimits';
import { CURRENT_REPLAY_SCHEMA_VERSION } from './replayManager';

export const REPLAY_EXPORT_FORMAT = 'rhythmmania-replay-export';

// Imported files carry per-frame replay data, so they can be large; still cap
// them like any other hostile input.
export const MAX_IMPORT_FILE_BYTES = 64 * 1024 * 1024;
const MAX_IMPORT_RECORDS = 500;

interface ReplayExportEnvelope {
  format: typeof REPLAY_EXPORT_FORMAT;
  schemaVersion: number;
  exportedAt: number;
  records: PlayHistoryRecord[];
}

export function downloadReplayExport(records: PlayHistoryRecord[], filenameBase: string): void {
  const envelope: ReplayExportEnvelope = {
    format: REPLAY_EXPORT_FORMAT,
    schemaVersion: CURRENT_REPLAY_SCHEMA_VERSION,
    exportedAt: Date.now(),
    records,
  };
  const blob = new Blob([JSON.stringify(envelope)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeBase = filenameBase.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().slice(0, 60) || 'replay';
  a.href = url;
  a.download = `rhythmmania-${safeBase}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Parses an exported replay file back into sanitized local records.
 * Accepts the export envelope, a bare record array, or a single bare record.
 * Every record passes through sanitizeHistoryRecord (which also migrates the
 * schema) and is marked as imported/local-only so it can never be uploaded.
 */
export function parseReplayImport(
  text: string,
  defaultSettings: GameSettings,
  availableBeatmaps: Beatmap[] = []
): { records: PlayHistoryRecord[]; rejectedCount: number } {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { records: [], rejectedCount: 1 };
  }

  let rawRecords: any[] = [];
  if (Array.isArray(parsed)) {
    rawRecords = parsed;
  } else if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.records)) {
      rawRecords = parsed.records;
    } else if (parsed.scoreState && typeof parsed.scoreState === 'object') {
      rawRecords = [parsed];
    }
  }

  if (rawRecords.length === 0) return { records: [], rejectedCount: 1 };
  if (rawRecords.length > MAX_IMPORT_RECORDS) {
    rawRecords = rawRecords.slice(0, MAX_IMPORT_RECORDS);
  }

  const records: PlayHistoryRecord[] = [];
  let rejectedCount = 0;
  for (const raw of rawRecords) {
    const clean = sanitizeHistoryRecord(raw, defaultSettings, availableBeatmaps);
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
