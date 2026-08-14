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

import type { PlayHistoryRecord, ReplayFrame, ScoreState, UploadStatus } from '../types';
import { withCsrfHeaders } from './csrfClient';
import { sanitizeSettings } from './securityLimits';
import { DEFAULT_SETTINGS } from '../components/settings/defaultSettings';
import { sanitizeGameplayMods } from './modifiers';

const MAX_REMOTE_FRAMES = 100_000;
const MAX_REMOTE_MODS = 16;
const VALID_UPLOAD_STATUSES = new Set<UploadStatus>(['local_only', 'pending', 'uploaded', 'failed']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown, min = -Infinity, max = Infinity): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function normalizeFrames(value: unknown, keyCount: number): ReplayFrame[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_REMOTE_FRAMES) return null;
  let previousTime = -1;
  const frames: ReplayFrame[] = [];
  for (const raw of value) {
    if (!isRecord(raw) || !finite(raw.time, 0, 86_400_000) || raw.time < previousTime || !Array.isArray(raw.keysPressed) || raw.keysPressed.length !== keyCount || !raw.keysPressed.every((key) => typeof key === 'boolean')) return null;
    frames.push({ time: raw.time, keysPressed: [...raw.keysPressed] });
    previousTime = raw.time;
  }
  return frames;
}

function normalizeScoreState(value: unknown, keyCount: number): ScoreState | null {
  if (!isRecord(value)) return null;
  const integerFields = ['score', 'combo', 'maxCombo', 'perfectCount', 'marvelousCount', 'greatCount', 'goodCount', 'badCount', 'missCount'];
  if (!integerFields.every((field) => integer(value[field], 0, 2_147_483_647)) || !finite(value.hp, 0, 100) || !finite(value.accuracy, 0, 100)) return null;
  if (typeof value.completed !== 'boolean' || typeof value.failed !== 'boolean' || !Array.isArray(value.columnJudgements) || value.columnJudgements.length !== keyCount) return null;
  const columnJudgements = value.columnJudgements.map((raw, column) => {
    if (!isRecord(raw) || raw.column !== column) return null;
    const count = (field: string) => integer(raw[field], 0, 2_147_483_647) ? Number(raw[field]) : null;
    const marvelousCount = count('marvelousCount');
    const perfectCount = count('perfectCount');
    const greatCount = count('greatCount');
    const goodCount = count('goodCount');
    const badCount = count('badCount');
    const missCount = count('missCount');
    if (marvelousCount === null || perfectCount === null || greatCount === null || goodCount === null || badCount === null || missCount === null) return null;
    return {
      column,
      marvelousCount,
      perfectCount,
      greatCount,
      goodCount,
      badCount,
      missCount,
    };
  });
  if (columnJudgements.some((column) => column === null)) return null;
  const number = (field: string) => typeof value[field] === 'number' ? value[field] as number : null;
  const score = number('score');
  const combo = number('combo');
  const maxCombo = number('maxCombo');
  const hp = number('hp');
  const perfectCount = number('perfectCount');
  const marvelousCount = number('marvelousCount');
  const greatCount = number('greatCount');
  const goodCount = number('goodCount');
  const badCount = number('badCount');
  const missCount = number('missCount');
  const accuracy = number('accuracy');
  if (score === null || combo === null || maxCombo === null || hp === null || perfectCount === null || marvelousCount === null || greatCount === null || goodCount === null || badCount === null || missCount === null || accuracy === null) return null;
  return {
    score, combo, maxCombo, hp, perfectCount, marvelousCount, greatCount, goodCount, badCount, missCount, accuracy,
    completed: value.completed,
    failed: value.failed,
    unstableRate: value.unstableRate === null ? null : finite(value.unstableRate, 0, 10_000) ? value.unstableRate : null,
    hitErrorSampleCount: integer(value.hitErrorSampleCount, 0, 1_000_000) ? value.hitErrorSampleCount : 0,
    columnJudgements: columnJudgements as ScoreState['columnJudgements'],
    ...(typeof value.recordId === 'string' ? { recordId: value.recordId } : {}),
    ...(typeof value.isAutoplay === 'boolean' ? { isAutoplay: value.isAutoplay } : {}),
  };
}

function normalizeRemoteRecord(value: unknown): PlayHistoryRecord | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value.id)) return null;
  if (!integer(value.keyCount, 2, 9) || !integer(value.score, 0, 2_147_483_647) || !finite(value.accuracy, 0, 100) || !integer(value.maxCombo, 0, 2_147_483_647) || typeof value.grade !== 'string' || !['SS', 'S', 'A', 'B', 'C', 'D', 'F'].includes(value.grade) || typeof value.isFailed !== 'boolean') return null;
  const scoreState = normalizeScoreState(value.scoreState, value.keyCount);
  const replayFrames = normalizeFrames(value.replayFrames, value.keyCount);
  if (!scoreState || !replayFrames || typeof value.timestamp !== 'number' || !Number.isFinite(value.timestamp) || typeof value.beatmapId !== 'string' || value.beatmapId.length > 256 || typeof value.beatmapTitle !== 'string' || typeof value.beatmapArtist !== 'string' || typeof value.beatmapDifficulty !== 'string') return null;
  const mods = Array.isArray(value.mods) && value.mods.length <= MAX_REMOTE_MODS
    ? sanitizeGameplayMods(value.mods)
    : null;
  if (!mods) return null;
  const uploadStatus = VALID_UPLOAD_STATUSES.has(value.uploadStatus as UploadStatus) ? value.uploadStatus as UploadStatus : 'uploaded';
  const replaySource = value.replaySource === 'guest-local' || value.replaySource === 'account-local' || value.replaySource === 'server-remote' || value.replaySource === 'imported' ? value.replaySource : 'server-remote';
  return {
    id: value.id,
    timestamp: value.timestamp,
    beatmapId: value.beatmapId,
    beatmapTitle: value.beatmapTitle,
    beatmapArtist: value.beatmapArtist,
    keyCount: value.keyCount,
    score: value.score,
    accuracy: value.accuracy,
    maxCombo: value.maxCombo,
    grade: value.grade,
    isFailed: value.isFailed,
    scoreState,
    replayFrames,
    recordedSettings: sanitizeSettings(value.recordedSettings, DEFAULT_SETTINGS),
    mods,
    schemaVersion: value.schemaVersion === 2 ? 2 : undefined,
    replaySource,
    catalogSetId: typeof value.catalogSetId === 'string' ? value.catalogSetId : null,
    catalogMapId: typeof value.catalogMapId === 'string' ? value.catalogMapId : null,
    chartRevisionId: typeof value.chartRevisionId === 'string' ? value.chartRevisionId : null,
    checksum: typeof value.checksum === 'string' ? value.checksum : undefined,
    checksumAlgorithm: value.checksumAlgorithm === 'sha256' ? 'sha256' : value.checksumAlgorithm === 'md5' ? 'md5' : undefined,
    beatmapHash: typeof value.beatmapHash === 'string' ? value.beatmapHash : undefined,
    holdRulesVersion: value.holdRulesVersion === 2 ? 2 : 1,
    holdTickIntervalMs: integer(value.holdTickIntervalMs, 10, 100) ? value.holdTickIntervalMs : undefined,
    uploadEligibility: value.uploadEligibility === 'eligible' ? 'eligible' : 'ineligible_no_replay_frames',
    uploadStatus,
    isServerCatalogMap: value.isServerCatalogMap === true,
  };
}

function jsonResponse(value: unknown): value is { success: boolean; data?: unknown; error?: unknown } {
  return isRecord(value) && typeof value.success === 'boolean';
}

function isAbortError(value: unknown): boolean {
  return value instanceof Error && value.name === 'AbortError';
}

export async function uploadReplayRecord(record: PlayHistoryRecord): Promise<{ success: boolean; uploadStatus: UploadStatus; error?: string }> {
  try {
    const res = await fetch('/api/replays/upload', {
      method: 'POST',
       headers: withCsrfHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
      credentials: 'include',
      body: JSON.stringify({ record }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return { success: false, uploadStatus: 'failed', error: 'API endpoint returned non-JSON response' };
    const raw: unknown = await res.json();
    if (!jsonResponse(raw)) return { success: false, uploadStatus: 'failed', error: 'Malformed upload response' };
    const data = isRecord(raw.data) ? raw.data : null;
    const status = data && VALID_UPLOAD_STATUSES.has(data.uploadStatus as UploadStatus) ? data.uploadStatus as UploadStatus : null;
    if (res.ok && raw.success && status) return { success: true, uploadStatus: status };
    return { success: false, uploadStatus: 'failed', error: typeof raw.error === 'string' ? raw.error : 'Upload failed' };
  } catch (error: unknown) {
    console.warn('Network error while uploading replay:', error);
    return { success: false, uploadStatus: 'failed', error: error instanceof Error ? error.message : 'Network error' };
  }
}

export interface LeaderboardReplayItem {
  id: string;
  score: number;
  accuracy: number;
  maxCombo: number;
  grade: string;
  mods: string[];
  createdAt: string;
  catalogSetId: string;
  catalogMapId: string;
  chartRevisionId: string;
  beatmapHash: string;
  userId: string | null;
  username: string;
  avatarUrl: string | null;
  beatmapTitle: string;
  beatmapArtist: string;
  beatmapDifficulty: string;
  isOwn: boolean;
}

function normalizeLeaderboardItem(value: unknown): LeaderboardReplayItem | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !integer(value.score, 0, 2_147_483_647) || !finite(value.accuracy, 0, 100) || !integer(value.maxCombo, 0, 2_147_483_647) || typeof value.grade !== 'string' || !Array.isArray(value.mods) || !value.mods.every((mod) => typeof mod === 'string') || typeof value.createdAt !== 'string' || typeof value.catalogSetId !== 'string' || typeof value.catalogMapId !== 'string' || typeof value.chartRevisionId !== 'string' || typeof value.beatmapHash !== 'string' || (value.userId !== null && typeof value.userId !== 'string') || typeof value.username !== 'string' || (value.avatarUrl !== null && typeof value.avatarUrl !== 'string') || typeof value.beatmapTitle !== 'string' || typeof value.beatmapArtist !== 'string' || typeof value.beatmapDifficulty !== 'string' || typeof value.isOwn !== 'boolean') return null;
  return {
    id: value.id, score: value.score, accuracy: value.accuracy, maxCombo: value.maxCombo,
    grade: value.grade, mods: [...value.mods], createdAt: value.createdAt, catalogSetId: value.catalogSetId,
    catalogMapId: value.catalogMapId, chartRevisionId: value.chartRevisionId, beatmapHash: value.beatmapHash,
    userId: value.userId, username: value.username, avatarUrl: value.avatarUrl,
    beatmapTitle: value.beatmapTitle, beatmapArtist: value.beatmapArtist, beatmapDifficulty: value.beatmapDifficulty, isOwn: value.isOwn,
  };
}

export async function fetchLeaderboardReplays(chartRevisionId: string, signal?: AbortSignal): Promise<{ success: boolean; replays: LeaderboardReplayItem[]; error?: string }> {
  try {
    const params = new URLSearchParams({ chartRevisionId });
    const res = await fetch(`/api/replays/list?${params.toString()}`, { headers: { Accept: 'application/json' }, credentials: 'include', signal });
    if (!res.headers.get('content-type')?.includes('application/json')) return { success: false, replays: [], error: 'Server returned non-JSON response' };
    const raw: unknown = await res.json();
    if (!jsonResponse(raw) || !res.ok || !raw.success || !isRecord(raw.data) || !Array.isArray(raw.data.replays) || raw.data.replays.length > 50) return { success: false, replays: [], error: jsonResponse(raw) && typeof raw.error === 'string' ? raw.error : 'Failed to load leaderboard replays' };
    const replays = raw.data.replays.map(normalizeLeaderboardItem);
    if (replays.some((replay) => replay === null)) return { success: false, replays: [], error: 'Malformed leaderboard response' };
    return { success: true, replays: replays as LeaderboardReplayItem[] };
  } catch (error: unknown) {
    if (signal?.aborted || isAbortError(error)) {
      return { success: false, replays: [], error: 'Request cancelled' };
    }
    console.warn('Error fetching leaderboard replays:', error);
    return { success: false, replays: [], error: error instanceof Error ? error.message : 'Network error' };
  }
}

export async function fetchReplayDetail(replayId: string, signal?: AbortSignal, purpose: 'view' | 'download' = 'view'): Promise<{ success: boolean; record?: PlayHistoryRecord; canDownload?: boolean; error?: string }> {
  try {
    const params = new URLSearchParams({ id: replayId, purpose });
    const res = await fetch(`/api/replays/get?${params.toString()}`, { headers: { Accept: 'application/json' }, credentials: 'include', signal });
    if (!res.headers.get('content-type')?.includes('application/json')) return { success: false, error: 'Server returned non-JSON response' };
    const raw: unknown = await res.json();
    if (!jsonResponse(raw) || !res.ok || !raw.success || !isRecord(raw.data)) return { success: false, error: jsonResponse(raw) && typeof raw.error === 'string' ? raw.error : 'Failed to fetch replay detail' };
    const record = normalizeRemoteRecord(raw.data.record);
    if (!record) return { success: false, error: 'Malformed replay detail response' };
    const access = isRecord(raw.data.access) ? raw.data.access : {};
    return { success: true, record, canDownload: access.canDownload === true };
  } catch (error: unknown) {
    if (signal?.aborted || isAbortError(error)) {
      return { success: false, error: 'Request cancelled' };
    }
    console.warn('Error fetching replay detail:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}
