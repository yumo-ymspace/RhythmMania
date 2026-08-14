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

import type { ReplayFrame } from '../types';

export interface ReplayCursor {
  nextIndex: number;
  lastTime: number;
}

export function normalizeReplayFrames(frames: ReplayFrame[] | null | undefined, keyCount: number): ReplayFrame[] {
  if (!frames || frames.length === 0) return [];
  const count = Math.max(1, Math.floor(keyCount));
  return frames
    .map((frame, originalIndex) => ({
      frame: {
        time: Number.isFinite(frame.time) ? frame.time : 0,
        keysPressed: Array.from(
          { length: count },
          (_, column) => Array.isArray(frame.keysPressed) && frame.keysPressed[column] === true
        ),
      },
      originalIndex,
    }))
    .sort((a, b) => a.frame.time - b.frame.time || a.originalIndex - b.originalIndex)
    .map(entry => entry.frame);
}

export function createReplayCursor(): ReplayCursor {
  return { nextIndex: 0, lastTime: Number.NEGATIVE_INFINITY };
}

export function resetReplayCursor(cursor: ReplayCursor, frames: ReplayFrame[], time = Number.NEGATIVE_INFINITY): void {
  cursor.nextIndex = upperBoundReplayFrame(frames, time);
  cursor.lastTime = time;
}

export function consumeReplayFrames(
  frames: ReplayFrame[],
  cursor: ReplayCursor,
  time: number,
  onFrame: (frame: ReplayFrame) => void,
): void {
  while (cursor.nextIndex < frames.length) {
    const frame = frames[cursor.nextIndex];
    if (frame.time > time) break;
    cursor.nextIndex++;
    onFrame(frame);
  }
  cursor.lastTime = time;
}

export function upperBoundReplayFrame(frames: ReplayFrame[], time: number): number {
  let low = 0;
  let high = frames.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (frames[middle].time <= time) low = middle + 1;
    else high = middle;
  }
  return low;
}
