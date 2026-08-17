import type { Beatmap, HitObject } from '../types';

export const CHART_STAR_RATING_VERSION = 1;

const MAX_STAR_RATING = 20;
const MIN_ACTIVE_DURATION_MS = 1000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundRating(value: number): number {
  return Math.round(clamp(value, 0, MAX_STAR_RATING) * 100) / 100;
}

function validEndTime(note: HitObject): number {
  return typeof note.endTime === 'number' && Number.isFinite(note.endTime) && note.endTime > note.time
    ? note.endTime
    : note.time;
}

export function calculateChartStarRating(
  map: Pick<Beatmap, 'notes' | 'keyCount' | 'duration'>,
): number {
  const notes = map.notes
    .filter((note) => Number.isFinite(note.time) && note.time >= 0 && Number.isInteger(note.column))
    .map((note) => ({ note, endTime: validEndTime(note) }))
    .sort((a, b) => a.note.time - b.note.time || a.note.column - b.note.column);

  if (notes.length === 0) return 0;

  const firstTime = notes[0].note.time;
  let lastTime = firstTime;
  for (const { endTime } of notes) {
    if (endTime > lastTime) lastTime = endTime;
  }
  const declaredDurationMs = Number.isFinite(map.duration) && map.duration > 0 ? map.duration * 1000 : 0;
  const activeDurationMs = Math.max(MIN_ACTIVE_DURATION_MS, lastTime - firstTime, declaredDurationMs);
  const activeSeconds = activeDurationMs / 1000;
  const keyCount = clamp(Number.isInteger(map.keyCount) ? map.keyCount : 4, 2, 9);

  const chordSizes: number[] = [];
  const columnLastTime = new Map<number, number>();
  let chordObjects = 0;
  let holdCount = 0;
  let holdDurationMs = 0;
  let jackCount = 0;
  let shortIntervals = 0;
  let intervalCount = 0;
  let intervalSum = 0;
  let left = 0;

  for (let index = 0; index < notes.length; index++) {
    const { note, endTime } = notes[index];
    if (index === 0 || note.time !== notes[index - 1].note.time) {
      let chordSize = 1;
      while (index + chordSize < notes.length && notes[index + chordSize].note.time === note.time) chordSize++;
      chordSizes.push(chordSize);
    }

    while (left < index && note.time - notes[left].note.time > 500) left++;
    const windowCount = index - left + 1;
    if (windowCount >= 3) shortIntervals++;

    const previousColumnTime = columnLastTime.get(note.column);
    if (previousColumnTime !== undefined) {
      const columnInterval = note.time - previousColumnTime;
      if (columnInterval <= 180) jackCount++;
    }
    columnLastTime.set(note.column, note.time);

    if (endTime > note.time) {
      holdCount++;
      holdDurationMs += endTime - note.time;
    }

    if (index > 0 && note.time !== notes[index - 1].note.time) {
      const interval = note.time - notes[index - 1].note.time;
      if (interval > 0) {
        intervalCount++;
        intervalSum += interval;
      }
    }
  }

  for (const chordSize of chordSizes) {
    if (chordSize > 1) chordObjects += chordSize - 1;
  }

  const objectDensity = notes.length / activeSeconds;
  const eventDensity = chordSizes.length / activeSeconds;
  const averageInterval = intervalCount > 0 ? intervalSum / intervalCount : activeDurationMs;
  const burstDensity = shortIntervals / activeSeconds;
  const chordRate = chordObjects / notes.length;
  const jackRate = jackCount / Math.max(1, notes.length - keyCount);
  const holdRate = holdCount / notes.length;
  const holdOccupancy = holdDurationMs / activeDurationMs;
  const speedTerm = clamp(120 / Math.max(60, averageInterval), 0, 2.5);
  const laneFactor = 1 + (keyCount - 4) * 0.035;

  const rawDifficulty = (
    Math.pow(objectDensity, 0.72) * 0.18
    + Math.pow(eventDensity, 0.72) * 0.24
    + burstDensity * 0.045
    + speedTerm * 0.9
    + chordRate * 4.2
    + jackRate * 3.1
    + holdRate * 1.4
    + holdOccupancy * 1.2
  ) * laneFactor;

  return roundRating(Math.pow(Math.max(0, rawDifficulty), 0.78));
}
