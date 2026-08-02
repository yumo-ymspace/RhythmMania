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

import { PlayHistoryRecord, UploadStatus } from '../types';

export async function uploadReplayRecord(
  record: PlayHistoryRecord
): Promise<{ success: boolean; uploadStatus: UploadStatus; error?: string }> {
  try {
    const res = await fetch('/api/replays/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ record }),
    });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        success: false,
        uploadStatus: 'failed',
        error: 'API endpoint returned non-JSON response',
      };
    }

    const json = await res.json();
    if (res.ok && json.success) {
      return {
        success: true,
        uploadStatus: 'uploaded',
      };
    } else {
      return {
        success: false,
        uploadStatus: 'failed',
        error: json.error || 'Upload failed',
      };
    }
  } catch (e: any) {
    console.warn('Network error while uploading replay:', e);
    return {
      success: false,
      uploadStatus: 'failed',
      error: e?.message || 'Network error',
    };
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

export async function fetchLeaderboardReplays(
  chartRevisionId: string
): Promise<{ success: boolean; replays: LeaderboardReplayItem[]; error?: string }> {
  try {
    const params = new URLSearchParams();
    params.set('chartRevisionId', chartRevisionId);

    const res = await fetch(`/api/replays/list?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        success: false,
        replays: [],
        error: 'Server returned non-JSON response',
      };
    }

    const json = await res.json();
    if (res.ok && json.success) {
      return {
        success: true,
        replays: json.data?.replays || [],
      };
    } else {
      return {
        success: false,
        replays: [],
        error: json.error || 'Failed to load leaderboard replays',
      };
    }
  } catch (e: any) {
    console.warn('Error fetching leaderboard replays:', e);
    return {
      success: false,
      replays: [],
      error: e?.message || 'Network error',
    };
  }
}

export async function fetchReplayDetail(
  replayId: string
): Promise<{ success: boolean; record?: PlayHistoryRecord; error?: string }> {
  try {
    const res = await fetch(`/api/replays/get?id=${encodeURIComponent(replayId)}`, {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        success: false,
        error: 'Server returned non-JSON response',
      };
    }

    const json = await res.json();
    if (res.ok && json.success && json.data?.record) {
      return {
        success: true,
        record: json.data.record as PlayHistoryRecord,
      };
    } else {
      return {
        success: false,
        error: json.error || 'Failed to fetch replay detail',
      };
    }
  } catch (e: any) {
    console.warn('Error fetching replay detail:', e);
    return {
      success: false,
      error: e?.message || 'Network error',
    };
  }
}
