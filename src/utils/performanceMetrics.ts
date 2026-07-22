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

import { ColumnJudgementCounts, JudgementType } from '../types';

/**
 * Initializes one ColumnJudgementCounts object for each key/column (0 to keyCount - 1).
 */
export function initializeColumnJudgements(keyCount: number): ColumnJudgementCounts[] {
  const count = Math.max(1, Math.min(10, Math.floor(keyCount || 4)));
  const result: ColumnJudgementCounts[] = [];
  for (let col = 0; col < count; col++) {
    result.push({
      column: col,
      marvelousCount: 0,
      perfectCount: 0,
      greatCount: 0,
      goodCount: 0,
      badCount: 0,
      missCount: 0,
    });
  }
  return result;
}

/**
 * Increments the specified judgement count for a column in a columnJudgements array.
 * Mutates the array in-place or creates missing entries as needed.
 */
export function incrementColumnJudgement(
  columnJudgements: ColumnJudgementCounts[],
  column: number,
  judgement: JudgementType
): void {
  if (column < 0) return;

  let entry = columnJudgements.find(c => c.column === column);
  if (!entry) {
    entry = {
      column,
      marvelousCount: 0,
      perfectCount: 0,
      greatCount: 0,
      goodCount: 0,
      badCount: 0,
      missCount: 0,
    };
    columnJudgements.push(entry);
    columnJudgements.sort((a, b) => a.column - b.column);
  }

  switch (judgement) {
    case 'marvelous':
      entry.marvelousCount++;
      break;
    case 'perfect':
      entry.perfectCount++;
      break;
    case 'great':
      entry.greatCount++;
      break;
    case 'good':
      entry.goodCount++;
      break;
    case 'bad':
      entry.badCount++;
      break;
    case 'miss':
      entry.missCount++;
      break;
  }
}

/**
 * Calculates Unstable Rate (UR) as population standard deviation of finite signed millisecond errors times 10:
 * mean = sum(errors) / count
 * UR = sqrt(sum((error - mean)^2) / count) * 10
 * Returns null if errors length < 2 or count of finite numeric errors < 2.
 */
export function calculateUnstableRate(errors: number[]): number | null {
  if (!Array.isArray(errors)) return null;

  let sum = 0;
  let count = 0;
  for (let i = 0; i < errors.length; i++) {
    const err = errors[i];
    if (typeof err === 'number' && Number.isFinite(err)) {
      sum += err;
      count++;
    }
  }

  if (count < 2) return null;

  const mean = sum / count;
  let varianceSum = 0;
  for (let i = 0; i < errors.length; i++) {
    const err = errors[i];
    if (typeof err === 'number' && Number.isFinite(err)) {
      const diff = err - mean;
      varianceSum += diff * diff;
    }
  }

  const populationVariance = varianceSum / count;
  const stdDev = Math.sqrt(populationVariance);
  const ur = stdDev * 10;

  if (!Number.isFinite(ur) || ur < 0) return null;
  return ur;
}
