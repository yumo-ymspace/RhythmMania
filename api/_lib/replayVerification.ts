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

import crypto from 'crypto';
import JSZip from 'jszip';
import {
  COMBO_BASE_SCORE,
  computeAccuracyPercent,
  computeGrade,
  computeMaxComboPortion,
  computeModMultiplier,
  computeTotalScore,
  getHpDrainMultiplier,
  getComboMultiplier,
  getComboScoreChange,
} from '../../src/utils/scoreCalculator.js';
import { parseHoldTailTime } from '../../src/utils/holdTiming.js';

export type ChecksumAlgorithm = 'md5' | 'sha256';

export interface CanonicalNote {
  lane: number;
  timeMs: number;
  endTimeMs?: number;
}

export interface CanonicalTimingPoint {
  timeMs: number;
  beatLength: number;
  uninherited: boolean;
  svMultiplier: number;
}

/**
 * The only chart representation accepted by the replay verifier. It contains
 * no UI, audio, or browser objects and is safe to persist as JSONB.
 */
export interface CanonicalChart {
  chartRevisionId: string;
  checksum: string;
  checksumAlgorithm: ChecksumAlgorithm;
  keyCount: number;
  mode: 3;
  overallDifficulty: number;
  hpDrainRate: number;
  durationMs: number;
  notes: readonly CanonicalNote[];
  timingPoints: readonly CanonicalTimingPoint[];
}

export interface ReplayUploadInput {
  id: string;
  keyCount: number;
  score: number;
  accuracy: number;
  maxCombo: number;
  grade: string;
  isFailed: boolean;
  scoreState: Record<string, unknown>;
  replayFrames: readonly ReplayFrameInput[];
  recordedSettings: Record<string, unknown>;
  mods: readonly string[];
  chartRevisionId: string;
  beatmapHash: string;
  checksum: string;
  checksumAlgorithm: ChecksumAlgorithm;
  holdRulesVersion: 1 | 2;
  holdTickIntervalMs?: number;
}

export interface ReplayFrameInput {
  time: number;
  keysPressed: readonly boolean[];
}

export interface VerifiedReplayResult {
  score: number;
  accuracy: number;
  maxCombo: number;
  grade: string;
  isFailed: boolean;
  scoreState: Record<string, unknown>;
}

export interface ReplayPayloadError {
  ok: false;
  error: string;
}

export interface ReplayPayloadSuccess {
  ok: true;
  value: ReplayUploadInput;
}

export type ReplayPayloadResult = ReplayPayloadSuccess | ReplayPayloadError;

const MAX_REPLAY_FRAMES = 100_000;
const MAX_REPLAY_ID_LENGTH = 64;
const MAX_CHART_REVISION_ID_LENGTH = 256;
const BEATMAP_HASH_PATTERN = /^(?:fnv_|meta_)[a-f0-9]{16}$/;
const REPLAY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const GRADES = new Set(['SS', 'S', 'A', 'B', 'C', 'D', 'F']);
const MODS = new Set(['NF', 'EZ', 'HR', 'HT', 'DT', 'HD', 'AT']);
const MAX_NOTES = 20_000;
const MAX_TIMING_POINTS = 5_000;
const MAX_OSU_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 250 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 500;
const MAX_ARCHIVE_ENTRY_BYTES = 80 * 1024 * 1024;
const MIRROR_HOSTS = new Set(['catboy.best', 'osudl.org']);
const MIRROR_CONNECT_TIMEOUT_MS = 5_000;
const MIRROR_READ_TIMEOUT_MS = 5_000;
const MIRROR_TOTAL_TIMEOUT_MS = 20_000;
const MIN_HOLD_TICK_INTERVAL_MS = 10;
const MAX_HOLD_TICK_INTERVAL_MS = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function parseScoreState(value: unknown, keyCount: number): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const integerFields = [
    'score', 'combo', 'maxCombo', 'perfectCount', 'marvelousCount',
    'greatCount', 'goodCount', 'badCount', 'missCount',
  ];
  for (const field of integerFields) {
    if (!integer(value[field], 0, 2_147_483_647)) return null;
  }
  if (!finiteNumber(value.hp, 0, 100) || !finiteNumber(value.accuracy, 0, 100)) return null;
  const hp = value.hp;
  const accuracy = value.accuracy;
  if (typeof hp !== 'number' || typeof accuracy !== 'number' || hp > 100 || accuracy > 100) return null;
  if (typeof value.completed !== 'boolean' || typeof value.failed !== 'boolean') return null;
  if (value.isAutoplay !== undefined && typeof value.isAutoplay !== 'boolean') return null;
  if (!Array.isArray(value.columnJudgements) || value.columnJudgements.length !== keyCount) return null;
  for (let column = 0; column < keyCount; column++) {
    const entry = value.columnJudgements[column];
    if (!isRecord(entry) || entry.column !== column) return null;
    for (const field of ['marvelousCount', 'perfectCount', 'greatCount', 'goodCount', 'badCount', 'missCount']) {
      if (!integer(entry[field], 0, 2_147_483_647)) return null;
    }
  }
  return value;
}

function parseFrames(value: unknown, keyCount: number): ReplayFrameInput[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_REPLAY_FRAMES) return null;
  let previousTime = -1;
  const frames: ReplayFrameInput[] = [];
  for (const rawFrame of value) {
    if (!isRecord(rawFrame) || !finiteNumber(rawFrame.time, 0, 86_400_000)) return null;
    if (rawFrame.time < previousTime) return null;
    if (!Array.isArray(rawFrame.keysPressed) || rawFrame.keysPressed.length !== keyCount) return null;
    if (!rawFrame.keysPressed.every((key) => typeof key === 'boolean')) return null;
    frames.push({ time: rawFrame.time, keysPressed: [...rawFrame.keysPressed] });
    previousTime = rawFrame.time;
  }
  // Gameplay always emits an initial neutral frame. Requiring it prevents a
  // client from hiding input before the first serialized event.
  if (frames[0].time > 100 || frames[0].keysPressed.some(Boolean)) return null;
  return frames;
}

export function normalizeMods(value: unknown, keyCount: number): string[] | null {
  if (!Array.isArray(value) || value.length > 16) return null;
  const mods: string[] = [];
  for (const rawMod of value) {
    if (typeof rawMod !== 'string') return null;
    const mod = rawMod.toUpperCase();
    const keyMod = /^K([2-9])$/.exec(mod);
    if (!MODS.has(mod) && !keyMod) return null;
    if (mods.includes(mod)) return null;
    if (keyMod && Number(keyMod[1]) !== keyCount) return null;
    mods.push(mod);
  }
  if (mods.includes('EZ') && mods.includes('HR')) return null;
  if (mods.includes('HT') && mods.includes('DT')) return null;
  // Autoplay is a local practice mode, never a competitive modifier.
  if (mods.includes('AT')) return null;
  return mods.sort();
}

export function parseReplayUploadPayload(raw: unknown): ReplayPayloadResult {
  if (!isRecord(raw)) return { ok: false, error: 'Invalid replay payload' };
  const keyCount = raw.keyCount;
  const rawKeyCount = typeof raw.keyCount === 'number' ? raw.keyCount : 0;
  const scoreState = parseScoreState(raw.scoreState, rawKeyCount);
  const recordedSettings = raw.recordedSettings === undefined
    ? {}
    : isRecord(raw.recordedSettings) ? raw.recordedSettings : null;
  const mods = normalizeMods(raw.mods, typeof keyCount === 'number' ? keyCount : 0);
  const holdRulesVersion = raw.holdRulesVersion === undefined || raw.holdRulesVersion === 1
    ? 1
    : raw.holdRulesVersion === 2 ? 2 : null;
  const holdTickIntervalMs = raw.holdTickIntervalMs;
  if (
    typeof raw.id !== 'string' || raw.id.length > MAX_REPLAY_ID_LENGTH || !REPLAY_ID_PATTERN.test(raw.id) ||
    !integer(keyCount, 2, 9) ||
    !integer(raw.score, 0, 2_147_483_647) ||
    !finiteNumber(raw.accuracy, 0, 100) ||
    !integer(raw.maxCombo, 0, 2_147_483_647) ||
    typeof raw.grade !== 'string' || !GRADES.has(raw.grade) ||
    typeof raw.isFailed !== 'boolean' || !scoreState || !recordedSettings || !mods ||
    typeof raw.chartRevisionId !== 'string' || raw.chartRevisionId.length < 1 || raw.chartRevisionId.length > MAX_CHART_REVISION_ID_LENGTH ||
    typeof raw.beatmapHash !== 'string' || !BEATMAP_HASH_PATTERN.test(raw.beatmapHash) ||
    typeof raw.checksum !== 'string' || raw.checksum.length < 1 || raw.checksum.length > 128 ||
    (raw.checksumAlgorithm !== 'md5' && raw.checksumAlgorithm !== 'sha256') ||
    holdRulesVersion === null ||
    (holdRulesVersion === 2 && !integer(holdTickIntervalMs, MIN_HOLD_TICK_INTERVAL_MS, MAX_HOLD_TICK_INTERVAL_MS))
  ) {
    return { ok: false, error: 'Replay payload contains invalid fields' };
  }
  const replayFrames = parseFrames(raw.replayFrames, keyCount);
  if (!replayFrames) return { ok: false, error: 'Replay frames are empty, malformed, or out of order' };
  return {
    ok: true,
    value: {
      id: raw.id,
      keyCount,
      score: raw.score,
      accuracy: raw.accuracy,
      maxCombo: raw.maxCombo,
      grade: raw.grade,
      isFailed: raw.isFailed,
      scoreState,
      replayFrames,
      recordedSettings,
      mods,
      chartRevisionId: raw.chartRevisionId,
      beatmapHash: raw.beatmapHash,
      checksum: raw.checksum,
      checksumAlgorithm: raw.checksumAlgorithm,
      holdRulesVersion,
      ...(holdRulesVersion === 2 ? { holdTickIntervalMs: holdTickIntervalMs as number } : {}),
    },
  };
}

export function decodeCanonicalChart(value: unknown): CanonicalChart | null {
  if (!isRecord(value) || value.mode !== 3 || !integer(value.keyCount, 2, 9)) return null;
  if (
    typeof value.chartRevisionId !== 'string' || value.chartRevisionId.length < 1 ||
    typeof value.checksum !== 'string' || !finiteNumber(value.overallDifficulty, 0, 10) ||
    !finiteNumber(value.hpDrainRate, 0, 10) || !finiteNumber(value.durationMs, 1, 86_400_000) ||
    (value.checksumAlgorithm !== 'md5' && value.checksumAlgorithm !== 'sha256') ||
    !Array.isArray(value.notes) || value.notes.length === 0 || value.notes.length > MAX_NOTES ||
    !Array.isArray(value.timingPoints) || value.timingPoints.length > MAX_TIMING_POINTS
  ) return null;
  const notes: CanonicalNote[] = [];
  for (const rawNote of value.notes) {
    if (!isRecord(rawNote) || !integer(rawNote.lane, 0, value.keyCount - 1) || !finiteNumber(rawNote.timeMs, 0, 86_400_000)) return null;
    if (rawNote.endTimeMs !== undefined && !finiteNumber(rawNote.endTimeMs, rawNote.timeMs + 1, 86_400_000)) return null;
    notes.push({ lane: rawNote.lane, timeMs: rawNote.timeMs, ...(rawNote.endTimeMs === undefined ? {} : { endTimeMs: rawNote.endTimeMs }) });
  }
  const timingPoints: CanonicalTimingPoint[] = [];
  for (const rawPoint of value.timingPoints) {
    if (!isRecord(rawPoint) || !finiteNumber(rawPoint.timeMs, -86_400_000, 86_400_000) || !finiteNumber(rawPoint.beatLength, 0.001, 86_400_000) || typeof rawPoint.uninherited !== 'boolean' || !finiteNumber(rawPoint.svMultiplier, -100, 100)) return null;
    timingPoints.push({ timeMs: rawPoint.timeMs, beatLength: rawPoint.beatLength, uninherited: rawPoint.uninherited, svMultiplier: rawPoint.svMultiplier });
  }
  return {
    chartRevisionId: value.chartRevisionId,
    checksum: value.checksum,
    checksumAlgorithm: value.checksumAlgorithm,
    keyCount: value.keyCount,
    mode: 3,
    overallDifficulty: value.overallDifficulty,
    hpDrainRate: value.hpDrainRate,
    durationMs: value.durationMs,
    notes,
    timingPoints,
  };
}

function judgementWindow(od: number, min: number, mid: number, max: number, multiplier: number): number {
  const range = od > 5 ? mid + (max - mid) * ((od - 5) / 5) : od < 5 ? mid + (mid - min) * ((od - 5) / 5) : mid;
  return Math.floor(range / multiplier) + 0.5;
}

type Judgement = 'marvelous' | 'perfect' | 'great' | 'good' | 'bad' | 'miss';

export function verifyReplayAgainstChart(input: ReplayUploadInput, chart: CanonicalChart): VerifiedReplayResult | null {
  if (input.chartRevisionId !== chart.chartRevisionId || input.keyCount !== chart.keyCount || input.checksumAlgorithm !== chart.checksumAlgorithm || input.checksum.toLowerCase() !== chart.checksum.toLowerCase()) return null;
  const mods = normalizeMods(input.mods, chart.keyCount);
  if (!mods) return null;
  const windowMultiplier = mods.includes('HR') ? 1.4 : mods.includes('EZ') ? 1 / 1.4 : 1;
  const windows: Array<{ type: Judgement; ms: number }> = [
    { type: 'marvelous', ms: judgementWindow(chart.overallDifficulty, 22.4, 19.4, 13.9, windowMultiplier) },
    { type: 'perfect', ms: judgementWindow(chart.overallDifficulty, 64, 49, 34, windowMultiplier) },
    { type: 'great', ms: judgementWindow(chart.overallDifficulty, 97, 82, 67, windowMultiplier) },
    { type: 'good', ms: judgementWindow(chart.overallDifficulty, 127, 112, 97, windowMultiplier) },
    { type: 'bad', ms: judgementWindow(chart.overallDifficulty, 151, 136, 121, windowMultiplier) },
    { type: 'miss', ms: judgementWindow(chart.overallDifficulty, 188, 173, 158, windowMultiplier) },
  ];
  const missWindow = windows[windows.length - 1].ms;
  const usesTailTicks = input.holdRulesVersion === 2;
  const tailTickIntervalMs = input.holdTickIntervalMs;
  const badWindow = windows.find((window) => window.type === 'bad')?.ms || missWindow;
  const notes = chart.notes.map((note) => ({
    ...note,
    headDone: false,
    headMissed: false,
    headHit: false,
    engaged: false,
    tailRequiresRepress: false,
    tailDone: note.endTimeMs === undefined,
    graceUntil: undefined as number | undefined,
    nextTailTickTime: usesTailTicks && note.endTimeMs !== undefined ? note.timeMs + badWindow + 0.000001 : undefined as number | undefined,
    tailTickEndTime: usesTailTicks && note.endTimeMs !== undefined ? note.endTimeMs - badWindow : undefined as number | undefined,
    tailMissRunActive: false,
  }));
  const counts: Record<Judgement, number> = { marvelous: 0, perfect: 0, great: 0, good: 0, bad: 0, miss: 0 };
  const columnJudgements = Array.from({ length: chart.keyCount }, (_, column) => ({ column, marvelousCount: 0, perfectCount: 0, greatCount: 0, goodCount: 0, badCount: 0, missCount: 0 }));
  let combo = 0;
  let maxCombo = 0;
  let hp = 100;
  let failed = false;
  let comboPortion = 0;
  let previousKeys = new Array(chart.keyCount).fill(false);
  let currentTime = 0;
  const totalJudgements = chart.notes.reduce((sum, note) => sum + (note.endTimeMs === undefined ? 1 : 2), 0);
  const maxComboPortion = Array.from({ length: totalJudgements }, (_, index) => COMBO_BASE_SCORE.marvelous * getComboMultiplier(index + 1)).reduce((sum, value) => sum + value, 0) || 1;

  const apply = (type: Judgement, lane: number) => {
    counts[type]++;
    const column = columnJudgements[lane];
    if (type === 'marvelous') column.marvelousCount++;
    else if (type === 'perfect') column.perfectCount++;
    else if (type === 'great') column.greatCount++;
    else if (type === 'good') column.goodCount++;
    else if (type === 'bad') column.badCount++;
    else column.missCount++;
    if (type === 'miss') combo = 0;
    else { combo++; maxCombo = Math.max(maxCombo, combo); }
    const hpDelta = type === 'marvelous' ? 3 : type === 'perfect' ? 2 : type === 'great' ? 1 : type === 'good' ? 0.2 : type === 'bad' ? -3 : -10;
    hp = Math.max(0, Math.min(100, hp + hpDelta * getHpDrainMultiplier(chart.hpDrainRate, mods)));
    if (hp <= 0 && !mods.includes('NF')) failed = true;
    comboPortion += getComboScoreChange(type, combo);
  };

  const accuracy = () => {
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    if (total === 0) return 100;
    return computeAccuracyPercent({
      marvelousCount: counts.marvelous,
      perfectCount: counts.perfect,
      greatCount: counts.great,
      goodCount: counts.good,
      badCount: counts.bad,
      missCount: counts.miss,
    });
  };
  const score = () => computeTotalScore({
    currentComboPortion: comboPortion,
    maxComboPortion: usesTailTicks ? computeMaxComboPortion(Object.values(counts).reduce((sum, value) => sum + value, 0)) : maxComboPortion,
    accuracyPercent: accuracy(),
    judgedCount: Object.values(counts).reduce((sum, value) => sum + value, 0),
    totalJudgements: usesTailTicks ? Object.values(counts).reduce((sum, value) => sum + value, 0) : totalJudgements,
    modMultiplier: computeModMultiplier(mods),
  });
  const resolve = (error: number): Judgement => windows.find((window) => Math.abs(error) <= window.ms)?.type || 'miss';

  const advanceTailTicks = (time: number, keys: readonly boolean[]) => {
    if (!usesTailTicks || tailTickIntervalMs === undefined) return;
    for (const note of notes) {
      if (note.nextTailTickTime === undefined || note.tailTickEndTime === undefined) continue;
      if (!note.headHit && !note.engaged && !note.tailRequiresRepress && note.timeMs <= time && keys[note.lane]) {
        note.tailRequiresRepress = true;
      }
      while (note.nextTailTickTime < note.tailTickEndTime && note.nextTailTickTime <= time) {
        if (keys[note.lane] && !note.tailRequiresRepress) {
          note.tailMissRunActive = false;
        } else if (!note.tailMissRunActive) {
          note.tailMissRunActive = true;
          apply('miss', note.lane);
        }
        note.nextTailTickTime += tailTickIntervalMs;
      }
    }
  };

  const autoMiss = (time: number, keys: readonly boolean[]) => {
    for (const note of notes) {
      if (!note.headDone && time - note.timeMs > missWindow) {
        note.headDone = true;
        note.headMissed = true;
        apply('miss', note.lane);
      }
      if (note.endTimeMs === undefined || note.tailDone) continue;
      if (usesTailTicks) {
        if (time - note.endTimeMs > missWindow) {
          note.tailDone = true;
          apply('miss', note.lane);
        }
        continue;
      }
      if (note.graceUntil !== undefined && time > note.graceUntil) {
        note.graceUntil = undefined;
        note.tailDone = true;
        apply('miss', note.lane);
      } else if (!note.engaged && note.headMissed && time - note.endTimeMs > missWindow) {
        note.tailDone = true;
        apply('miss', note.lane);
      } else if (note.engaged && note.graceUntil === undefined && time - note.endTimeMs > missWindow) {
        note.tailDone = true;
        apply('miss', note.lane);
      }
    }
  };
  const press = (lane: number, time: number) => {
    const grace = notes.find((note) => note.lane === lane && note.engaged && !note.tailDone && note.graceUntil !== undefined);
    if (grace && time <= (grace.graceUntil as number)) { grace.graceUntil = undefined; return; }
    const note = notes.find((candidate) => candidate.lane === lane && (!candidate.headDone || (candidate.endTimeMs !== undefined && candidate.headMissed && !candidate.engaged && !candidate.tailDone)));
    if (!note) return;
    if (!note.headDone) {
      const judgement = resolve(time - note.timeMs);
      if (time - note.timeMs < -missWindow) return;
      note.headDone = true;
      if (judgement === 'miss') {
        note.headMissed = true;
        apply(judgement, lane);
        if (note.endTimeMs !== undefined) {
          note.engaged = true;
          note.tailRequiresRepress = false;
        }
      } else {
        apply(judgement, lane);
        if (note.endTimeMs !== undefined) {
          note.engaged = true;
          note.headHit = true;
          note.tailRequiresRepress = false;
        }
      }
    } else if (note.endTimeMs !== undefined && note.headMissed && !note.engaged && time - note.endTimeMs <= missWindow) {
      note.engaged = true;
      note.tailRequiresRepress = false;
    }
  };
  const release = (lane: number, time: number) => {
    const note = notes.find((candidate) => candidate.lane === lane && !candidate.tailDone &&
      (usesTailTicks ? (candidate.headHit || candidate.engaged) : candidate.engaged));
    if (!note || note.endTimeMs === undefined) return;
    const error = time - note.endTimeMs;
    if (usesTailTicks) {
      if (error < -missWindow) return;
      note.tailDone = true;
      apply(resolve(error), lane);
      return;
    }
    if (error < -missWindow) { note.graceUntil = time + missWindow; return; }
    note.tailDone = true;
    note.graceUntil = undefined;
    apply(resolve(error), lane);
  };

  for (const frame of input.replayFrames) {
    if (frame.time - currentTime > 60_000) return null;
    currentTime = frame.time;
    if (currentTime > chart.durationMs + missWindow + 5_000) return null;
    advanceTailTicks(currentTime - 0.000001, previousKeys);
    autoMiss(currentTime, previousKeys);
    for (let lane = 0; lane < chart.keyCount; lane++) {
      if (!previousKeys[lane] && frame.keysPressed[lane]) press(lane, currentTime);
      else if (previousKeys[lane] && !frame.keysPressed[lane]) release(lane, currentTime);
    }
    advanceTailTicks(currentTime, frame.keysPressed);
    previousKeys = [...frame.keysPressed];
  }
  advanceTailTicks(Math.max(currentTime, chart.durationMs), previousKeys);
  autoMiss(Math.max(currentTime, chart.durationMs), previousKeys);
  if (notes.some((note) => !note.headDone || !note.tailDone)) return null;

  const finalAccuracy = accuracy();
  const finalScore = score();
  const finalGrade = computeGrade(finalAccuracy, {
    marvelousCount: counts.marvelous,
    perfectCount: counts.perfect,
    greatCount: counts.great,
    goodCount: counts.good,
    badCount: counts.bad,
    missCount: counts.miss,
  }, failed);
  if (input.score !== finalScore || Math.abs(input.accuracy - finalAccuracy) > 0.01 || input.maxCombo !== maxCombo || input.grade !== finalGrade || input.isFailed !== failed) return null;
  const scoreState: Record<string, unknown> = {
    score: finalScore, combo, maxCombo, hp, perfectCount: counts.perfect, marvelousCount: counts.marvelous,
    greatCount: counts.great, goodCount: counts.good, badCount: counts.bad, missCount: counts.miss,
    accuracy: finalAccuracy, completed: true, failed, unstableRate: null, hitErrorSampleCount: 0,
    columnJudgements, isAutoplay: false,
  };
  return { score: finalScore, accuracy: finalAccuracy, maxCombo, grade: finalGrade, isFailed: failed, scoreState };
}

export interface MirrorChartExpectation {
  sourceChartId: number;
  filename: string;
  checksum: string;
  keyCount: number;
  chartRevisionId: string;
}

interface ZipDataInfo {
  compressedSize?: number;
  uncompressedSize?: number;
}

type ZipEntryStream = {
  on(event: 'data', listener: (chunk: Uint8Array) => void): ZipEntryStream;
  on(event: 'error' | 'end', listener: (error?: unknown) => void): ZipEntryStream;
  pause(): ZipEntryStream;
  resume(): ZipEntryStream;
};

type ZipObjectWithStream = JSZip.JSZipObject & {
  internalStream?: (type: string) => ZipEntryStream;
};

function zipInfo(file: JSZip.JSZipObject): ZipDataInfo {
  const data = (file as unknown as { _data?: ZipDataInfo })._data;
  return data || {};
}

async function extractArchiveEntry(
  entry: JSZip.JSZipObject,
  budget: { totalBytes: number },
): Promise<Uint8Array> {
  const internalStream = (entry as ZipObjectWithStream).internalStream;
  if (!internalStream) throw new Error('Mirror archive streaming is unavailable');

  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let failed = false;
    const stream = internalStream.call(entry, 'uint8array');
    stream
      .on('data', (chunk) => {
        if (failed) return;
        try {
          if (chunk.byteLength > MAX_ARCHIVE_ENTRY_BYTES || budget.totalBytes + chunk.byteLength > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
            throw new Error('Mirror archive expands beyond the limit');
          }
          budget.totalBytes += chunk.byteLength;
          chunks.push(chunk);
        } catch (error) {
          failed = true;
          stream.pause();
          reject(error);
        }
      })
      .on('error', (error) => {
        if (failed) return;
        failed = true;
        reject(error instanceof Error ? error : new Error('Failed to extract mirror archive entry'));
      })
      .on('end', () => {
        if (failed) return;
        const totalBytes = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
        const result = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.byteLength;
        }
        resolve(result);
      })
      .resume();
  });
}

function approvedMirrorUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && MIRROR_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

async function fetchArchive(url: string): Promise<Uint8Array> {
  if (!approvedMirrorUrl(url)) throw new Error('Unapproved mirror');
  const controller = new AbortController();
  const totalTimer = setTimeout(() => controller.abort(), MIRROR_TOTAL_TIMEOUT_MS);
  try {
    let currentUrl = url;
    for (let redirect = 0; redirect <= 2; redirect++) {
      const response = await withTimeout(
        fetch(currentUrl, { redirect: 'manual', signal: controller.signal, headers: { Accept: 'application/octet-stream' } }),
        MIRROR_CONNECT_TIMEOUT_MS,
        () => controller.abort(),
      );
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || !approvedMirrorUrl(new URL(location, currentUrl).toString())) throw new Error('Mirror redirect is not allowed');
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }
      if (!response.ok || !response.body) throw new Error(`Mirror returned ${response.status}`);
      const advertisedLength = Number(response.headers.get('content-length') || 0);
      if (advertisedLength > MAX_ARCHIVE_BYTES) throw new Error('Mirror archive is too large');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const part = await withTimeout(reader.read(), MIRROR_READ_TIMEOUT_MS, () => controller.abort());
        if (part.done) break;
        if (!part.value) continue;
        size += part.value.byteLength;
        if (size > MAX_ARCHIVE_BYTES) {
          await reader.cancel();
          throw new Error('Mirror archive is too large');
        }
        chunks.push(part.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return bytes;
    }
    throw new Error('Too many mirror redirects');
  } finally {
    clearTimeout(totalTimer);
  }
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, onTimeout: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new Error('Mirror request timed out'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function decodeUtf8(bytes: Uint8Array): string {
  if (bytes.byteLength > MAX_OSU_TEXT_BYTES) throw new Error('osu! chart text is too large');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function parseCanonicalOsu(content: string, chartRevisionId: string, checksum: string, checksumAlgorithm: ChecksumAlgorithm): CanonicalChart {
  if (new TextEncoder().encode(content).byteLength > MAX_OSU_TEXT_BYTES) throw new Error('osu! chart text is too large');
  let section = '';
  let mode = -1;
  let keyCount = 4;
  let od = 8;
  let hp = 8;
  const notes: CanonicalNote[] = [];
  const timingPoints: CanonicalTimingPoint[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;
    if (line.startsWith('[') && line.endsWith(']')) { section = line.slice(1, -1).toLowerCase(); continue; }
    if (section === 'general' && /^mode\s*:/i.test(line)) mode = Number(line.slice(line.indexOf(':') + 1).trim());
    if (section === 'difficulty') {
      const separator = line.indexOf(':');
      if (separator >= 0) {
        const key = line.slice(0, separator).trim().toLowerCase();
        const value = Number(line.slice(separator + 1).trim());
        if (key === 'circlesize') keyCount = value;
        else if (key === 'overalldifficulty') od = value;
        else if (key === 'hpdrainrate') hp = value;
      }
    }
    if (section === 'timingpoints') {
      const parts = line.split(',');
      const timeMs = Number(parts[0]);
      const beatLength = Number(parts[1]);
      if (!finiteNumber(timeMs, -86_400_000, 86_400_000) || !finiteNumber(beatLength, -86_400_000, 86_400_000) || beatLength === 0) throw new Error('Invalid timing point');
      const uninherited = parts.length < 7 || parts[6].trim() !== '0';
      timingPoints.push({ timeMs, beatLength: Math.abs(beatLength), uninherited, svMultiplier: uninherited ? 1 : 100 / Math.abs(beatLength) });
      if (timingPoints.length > MAX_TIMING_POINTS) throw new Error('Too many timing points');
    }
    if (section === 'hitobjects') {
      const parts = line.split(',');
      const x = Number(parts[0]);
      const timeMs = Number(parts[2]);
      const type = Number(parts[3]);
      if (!integer(x, 0, 512) || !finiteNumber(timeMs, 0, 86_400_000) || !Number.isInteger(type)) throw new Error('Invalid hit object');
      const objectKeyCount = Number.isInteger(keyCount) ? keyCount : 4;
      const lane = Math.min(objectKeyCount - 1, Math.floor(x / (512 / objectKeyCount)));
      if ((type & 128) !== 0) {
        const endTimeMs = parseHoldTailTime((parts[5] || '').split(':', 1)[0], timeMs, 86_400_000);
        if (endTimeMs === null) throw new Error('Invalid hold note');
        notes.push({ lane, timeMs, endTimeMs });
      } else {
        notes.push({ lane, timeMs });
      }
      if (notes.length > MAX_NOTES) throw new Error('Too many notes');
    }
  }
  if (mode !== 3 || !integer(keyCount, 2, 9) || !finiteNumber(od, 0, 10) || !finiteNumber(hp, 0, 10) || notes.length === 0) throw new Error('Chart is not a playable mania chart');
  notes.sort((left, right) => left.timeMs - right.timeMs || left.lane - right.lane);
  const maxTimeMs = notes.reduce((max, note) => Math.max(max, note.endTimeMs || note.timeMs), 0);
  return { chartRevisionId, checksum, checksumAlgorithm, keyCount, mode: 3, overallDifficulty: od, hpDrainRate: hp, durationMs: Math.min(86_400_000, maxTimeMs + 3_000), notes, timingPoints };
}

export async function verifyMirrorArchive(sourceSetId: number, expectations: readonly MirrorChartExpectation[]): Promise<CanonicalChart[]> {
  const sources = [`https://catboy.best/d/${sourceSetId}`, `https://osudl.org/s/${sourceSetId}`];
  let bytes: Uint8Array | null = null;
  for (const source of sources) {
    try { bytes = await fetchArchive(source); break; } catch (error) {
      if (source === sources[sources.length - 1]) throw error;
    }
  }
  if (!bytes) throw new Error('Mirror archive unavailable');
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files);
  if (entries.length > MAX_ARCHIVE_ENTRIES) throw new Error('Mirror archive has too many entries');
  const extractionBudget = { totalBytes: 0 };
  const extracted = new Map<string, Uint8Array>();
  for (const entry of entries) {
    const info = zipInfo(entry);
    const size = info.uncompressedSize || 0;
    const compressed = info.compressedSize || 0;
    if (size > MAX_ARCHIVE_ENTRY_BYTES || compressed > MAX_ARCHIVE_BYTES) throw new Error('Mirror archive entry is too large');
    if (entry.dir) continue;

    // Count bytes as JSZip produces them so deceptive size headers cannot
    // allocate an unbounded entry before the aggregate limit is enforced.
    const content = await extractArchiveEntry(entry, extractionBudget);
    if (content.byteLength > MAX_ARCHIVE_ENTRY_BYTES) throw new Error('Mirror archive entry is too large');
    if (entry.name.toLowerCase().endsWith('.osu')) {
      if (content.byteLength > MAX_OSU_TEXT_BYTES) throw new Error('osu! chart text is too large');
      extracted.set(entry.name.split('/').pop()?.toLowerCase() || entry.name.toLowerCase(), content);
    }
  }
  const result: CanonicalChart[] = [];
  for (const expectation of expectations) {
    const expectedName = expectation.filename.split('/').pop()?.toLowerCase() || expectation.filename.toLowerCase();
    const bytesForChart = extracted.get(expectedName) || [...extracted.entries()].find(([name]) => name === `${expectation.sourceChartId}.osu`.toLowerCase())?.[1];
    if (!bytesForChart) throw new Error('Expected chart file is missing from mirror archive');
    const digest = crypto.createHash(expectation.checksum.length === 64 ? 'sha256' : 'md5').update(bytesForChart).digest('hex');
    if (digest.toLowerCase() !== expectation.checksum.toLowerCase()) throw new Error('Mirror chart checksum verification failed');
    const chart = parseCanonicalOsu(decodeUtf8(bytesForChart), expectation.chartRevisionId, digest, digest.length === 64 ? 'sha256' : 'md5');
    if (chart.keyCount !== expectation.keyCount || chart.mode !== 3) throw new Error('Mirror chart metadata verification failed');
    result.push(chart);
  }
  return result;
}
