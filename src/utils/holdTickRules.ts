import type { HitObject } from '../types';

export const LEGACY_HOLD_RULES_VERSION = 1;
export const HOLD_TICK_RULES_VERSION = 2;
export const DEFAULT_HOLD_TICK_INTERVAL_MS = 50;
export const MIN_HOLD_TICK_INTERVAL_MS = 10;
export const MAX_HOLD_TICK_INTERVAL_MS = 100;
export const TICK_BOUNDARY_EPSILON_MS = 0.000001;

export interface HoldTailInterval {
  startTime: number;
  endTime: number;
}

export function resolveHoldTickInterval(value: unknown): number {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isInteger(parsed) &&
    parsed >= MIN_HOLD_TICK_INTERVAL_MS && parsed <= MAX_HOLD_TICK_INTERVAL_MS
    ? parsed
    : DEFAULT_HOLD_TICK_INTERVAL_MS;
}

export const holdTickIntervalMs = resolveHoldTickInterval(import.meta.env.VITE_HOLD_TICK_INTERVAL_MS);

export function initializeHoldTailTicks(note: HitObject, badWindowMs: number, intervalMs: number): void {
  if (note.type !== 'hold' || note.endTime === undefined) return;
  // Ticks are strictly outside each endpoint's Bad window. The fractional
  // offset keeps an exact endpoint timestamp out of the middle-note range.
  note.tailTickStartTime = note.time + badWindowMs + TICK_BOUNDARY_EPSILON_MS;
  note.nextTailTickTime = note.tailTickStartTime;
  note.tailTickEndTime = note.endTime - badWindowMs;
  note.tailTickIntervalMs = intervalMs;
  note.tailMissRunActive = false;
  note.tailRequiresRepress = false;
  note.clearedTailIntervals = [];
  note.missedTailIntervals = [];
}

function appendTailInterval(
  intervals: Array<{ startTime: number; endTime: number }>,
  startTime: number,
  endTime: number,
): void {
  const previous = intervals[intervals.length - 1];
  if (previous && startTime <= previous.endTime + 0.001) {
    previous.endTime = Math.max(previous.endTime, endTime);
  } else {
    intervals.push({ startTime, endTime });
  }
}

export function markHoldStartHit(note: HitObject): void {
  if (note.type !== 'hold' || note.endTime === undefined) return;
  note.isHeadHit = true;
  note.tailRequiresRepress = false;
}

export function markHoldReleaseHit(note: HitObject): void {
  if (note.type !== 'hold' || note.endTime === undefined || !note.isReleased || note.releaseTime === undefined) return;
  note.isReleaseHit = true;
}

export function markHoldTailResumed(note: HitObject, timeMs: number): void {
  if (note.type !== 'hold' || note.endTime === undefined || !Number.isFinite(timeMs)) return;
  note.earlyReleaseTime = undefined;
  note.releaseZoneArmedTime = undefined;
  note.tailResumedTime = Math.max(note.time, timeMs);
}

export function markHoldEarlyRelease(note: HitObject, timeMs: number): void {
  if (note.type !== 'hold' || note.endTime === undefined || !Number.isFinite(timeMs)) return;
  note.earlyReleaseTime = Math.max(note.time, timeMs);
  note.releaseZoneArmedTime = undefined;
  note.tailResumedTime = undefined;
}

export function markHoldReleaseZonePressed(note: HitObject, timeMs: number): void {
  if (note.type !== 'hold' || note.endTime === undefined || !Number.isFinite(timeMs)) return;
  note.releaseZoneArmedTime = Math.max(note.time, timeMs);
}

export function markHoldTailEngaged(note: HitObject, timeMs: number): void {
  if (note.type !== 'hold' || note.endTime === undefined || !Number.isFinite(timeMs)) return;
  note.tailEngagedTime = Math.max(note.time, timeMs);
  note.tailRequiresRepress = false;
  note.tailMissRunActive = false;
}

export function advanceHoldTailTicks(
  notes: HitObject[],
  throughTime: number,
  keysPressed: readonly boolean[],
  onFirstMissInRun: (note: HitObject) => void,
): void {
  for (const note of notes) {
    if (note.type !== 'hold' || note.nextTailTickTime === undefined || note.tailTickEndTime === undefined || note.tailTickIntervalMs === undefined) continue;
    if (!note.isReleased) note.isReleaseHit = false;
    if (
      !note.isHeadHit &&
      note.tailEngagedTime === undefined &&
      !note.tailRequiresRepress &&
      note.time <= throughTime &&
      keysPressed[note.column]
    ) {
      note.tailRequiresRepress = true;
    }
    while (note.nextTailTickTime < note.tailTickEndTime && note.nextTailTickTime <= throughTime) {
      const tickTime = note.nextTailTickTime;
      const tickEndTime = Math.min(tickTime + note.tailTickIntervalMs, note.tailTickEndTime);
      if (keysPressed[note.column] && !note.tailRequiresRepress) {
        appendTailInterval(note.clearedTailIntervals ||= [], tickTime, tickEndTime);
        note.tailMissRunActive = false;
      } else {
        appendTailInterval(note.missedTailIntervals ||= [], tickTime, tickEndTime);
        if (!note.tailMissRunActive) {
          note.tailMissRunActive = true;
          onFirstMissInRun(note);
        }
      }
      note.nextTailTickTime += note.tailTickIntervalMs;
    }
  }
}
