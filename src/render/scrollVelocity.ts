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

import { TimingControlPoint } from '../types';

export interface MultiplierSegment {
  timeMs: number;
  multiplier: number;
  cumulativeScroll: number; // S(timeMs) in ms-multiplier units
}

export interface ScrollModel {
  segments: MultiplierSegment[];
  baseBeatLength: number;
  sliderMultiplier: number;
  isEnabled: boolean;
}

/**
 * Calculates dominant uninherited beat length as fallback when not pre-calculated
 */
function calculateDominantBeatLength(timingPoints: TimingControlPoint[]): number {
  const uninherited = timingPoints.filter(
    tp => tp.uninherited && tp.beatLength > 0 && isFinite(tp.beatLength)
  );
  if (uninherited.length === 0) return 500;
  if (uninherited.length === 1) return uninherited[0].beatLength;

  const bpmDurations: { beatLength: number; duration: number }[] = [];
  for (let i = 0; i < uninherited.length; i++) {
    const current = uninherited[i];
    const nextTime = (i + 1 < uninherited.length) ? uninherited[i + 1].timeMs : current.timeMs + 10000;
    const duration = nextTime - current.timeMs;
    if (duration > 0) {
      const existing = bpmDurations.find(item => Math.abs(item.beatLength - current.beatLength) < 0.1);
      if (existing) {
        existing.duration += duration;
      } else {
        bpmDurations.push({ beatLength: current.beatLength, duration });
      }
    }
  }
  if (bpmDurations.length === 0) return uninherited[0].beatLength;
  bpmDurations.sort((a, b) => b.duration - a.duration);
  return bpmDurations[0].beatLength;
}

/**
 * Creates a ScrollModel from a beatmap-like object
 */
export function createScrollModel(beatmapLike: { timingPoints?: TimingControlPoint[]; sliderMultiplier?: number; baseBeatLength?: number }, isEnabled: boolean = true): ScrollModel {
  const timingPoints: TimingControlPoint[] = beatmapLike.timingPoints || [];
  const sliderMultiplier: number = beatmapLike.sliderMultiplier !== undefined ? beatmapLike.sliderMultiplier : 1.4;

  let baseBeatLength: number = beatmapLike.baseBeatLength || 0;
  if (baseBeatLength <= 0) {
    baseBeatLength = calculateDominantBeatLength(timingPoints);
  }

  // Sort and filter timing points safely
  const sortedPoints = [...timingPoints].sort((a, b) => {
    if (a.timeMs !== b.timeMs) {
      return a.timeMs - b.timeMs;
    }
    if (a.uninherited !== b.uninherited) {
      return a.uninherited ? -1 : 1;
    }
    return 0;
  });

  const pointsByTime = new Map<number, TimingControlPoint[]>();
  for (const tp of sortedPoints) {
    if (!pointsByTime.has(tp.timeMs)) {
      pointsByTime.set(tp.timeMs, []);
    }
    pointsByTime.get(tp.timeMs)!.push(tp);
  }

  const uniqueTimes = Array.from(pointsByTime.keys()).sort((a, b) => a - b);

  const segments: MultiplierSegment[] = [];
  let currentBeatLength = baseBeatLength;
  let currentSv = 1.0;

  const resolvedMultipliers = new Map<number, number>();

  // osu!mania sequential scroll: Multiplier = ScrollSpeed * baseBeatLength / beatLength.
  // SliderMultiplier cancels out for mania (DrawableManiaRuleset sets Velocity=1 after
  // folding SM into BaseBeatLength). Uninherited red lines reset ScrollSpeed to 1x.
  // Negative multipliers reverse scroll; zero freezes notes in place.
  for (const t of uniqueTimes) {
    const points = pointsByTime.get(t)!;
    for (const tp of points) {
      if (tp.uninherited) {
        if (tp.beatLength !== 0 && isFinite(tp.beatLength)) {
          currentBeatLength = tp.beatLength;
        }
        currentSv = 1.0;
      } else {
        currentSv = tp.svMultiplier;
      }
    }
    const safeBeatLength = (currentBeatLength !== 0 && isFinite(currentBeatLength))
      ? currentBeatLength
      : baseBeatLength;
    let mult = currentSv * (baseBeatLength / safeBeatLength);
    if (isNaN(mult) || !isFinite(mult)) {
      mult = 1.0;
    } else {
      mult = Math.max(-1000, Math.min(1000, mult));
    }
    resolvedMultipliers.set(t, mult);
  }

  if (uniqueTimes.length > 0) {
    const t0 = uniqueTimes[0];
    const mult0 = resolvedMultipliers.get(t0)!;
    segments.push({
      timeMs: t0,
      multiplier: mult0,
      cumulativeScroll: 0
    });

    for (let i = 1; i < uniqueTimes.length; i++) {
      const prevSeg = segments[i - 1];
      const tCurrent = uniqueTimes[i];
      const duration = tCurrent - prevSeg.timeMs;
      const nextAccum = prevSeg.cumulativeScroll + duration * prevSeg.multiplier;
      const multCurrent = resolvedMultipliers.get(tCurrent)!;

      segments.push({
        timeMs: tCurrent,
        multiplier: multCurrent,
        cumulativeScroll: nextAccum
      });
    }
  }

  return {
    segments,
    baseBeatLength,
    sliderMultiplier,
    isEnabled
  };
}

/**
 * Gets the precomputed S(t) cumulative scroll position at a given time
 */
export function getScrollPosition(model: ScrollModel, timeMs: number): number {
  if (!model.isEnabled || model.segments.length === 0) {
    return timeMs;
  }

  const segments = model.segments;
  const first = segments[0];
  if (timeMs < first.timeMs) {
    return first.cumulativeScroll + (timeMs - first.timeMs) * first.multiplier;
  }

  const last = segments[segments.length - 1];
  if (timeMs >= last.timeMs) {
    return last.cumulativeScroll + (timeMs - last.timeMs) * last.multiplier;
  }

  let low = 0;
  let high = segments.length - 2;
  let ans = 0;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (segments[mid].timeMs <= timeMs) {
      ans = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const seg = segments[ans];
  return seg.cumulativeScroll + (timeMs - seg.timeMs) * seg.multiplier;
}

/**
 * Gets scroll delta between two times
 */
export function getScrollDelta(model: ScrollModel, fromMs: number, toMs: number): number {
  return getScrollPosition(model, toMs) - getScrollPosition(model, fromMs);
}
