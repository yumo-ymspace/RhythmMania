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

/*
 * osu!lazer-standardised osu!mania score/accuracy/grade helpers.
 * Source: ppy/osu ManiaScoreProcessor + ScoreProcessor (standardised mode).
 */

import type { JudgementType, ScoreState } from '../types';

/** Accuracy base scores (ManiaScoreProcessor.GetBaseScoreForResult). */
export const ACCURACY_BASE_SCORE: Record<JudgementType, number> = {
  marvelous: 305, // HitResult.Perfect
  perfect: 300,   // HitResult.Great
  great: 200,     // HitResult.Good
  good: 100,      // HitResult.Ok
  bad: 50,        // HitResult.Meh
  miss: 0,
};

/** Combo-portion base (Perfect contributes 300, not 305). */
export const COMBO_BASE_SCORE: Record<JudgementType, number> = {
  marvelous: 300,
  perfect: 300,
  great: 200,
  good: 100,
  bad: 50,
  miss: 0,
};

export const MAX_ACCURACY_BASE = ACCURACY_BASE_SCORE.marvelous;
export const COMBO_LOG_BASE = 4;
export const COMBO_LOG_CAP = Math.log(400) / Math.log(COMBO_LOG_BASE);

export const MOD_SCORE_MULTIPLIERS: Record<string, number> = {
  NF: 0.5,
  EZ: 0.8,
  HT: 0.5,
  HR: 1.1,
  HD: 1.15,
  DT: 1.25,
  K2: 0.9,
  K3: 0.9,
  K4: 0.9,
  K5: 0.9,
  K6: 0.9,
  K7: 0.9,
  K8: 0.9,
  K9: 0.9,
};

export function getHpDrainMultiplier(hpDrainRate: number, mods: readonly string[] = []): number {
  const baseMultiplier = hpDrainRate > 5 ? 0.8 : 1.2;
  if (mods.some((mod) => mod.toUpperCase() === 'EZ')) return baseMultiplier * 0.5;
  if (mods.some((mod) => mod.toUpperCase() === 'HR')) return baseMultiplier * 1.4;
  return baseMultiplier;
}

export interface JudgementCounts {
  marvelousCount: number;
  perfectCount: number;
  greatCount: number;
  goodCount: number;
  badCount: number;
  missCount: number;
}

export function getComboMultiplier(comboAfterJudgement: number): number {
  if (comboAfterJudgement <= 0) return 0.5;
  const logVal = Math.log(comboAfterJudgement) / Math.log(COMBO_LOG_BASE);
  return Math.min(Math.max(0.5, logVal), COMBO_LOG_CAP);
}

export function getComboScoreChange(type: JudgementType, comboAfterJudgement: number): number {
  return COMBO_BASE_SCORE[type] * getComboMultiplier(comboAfterJudgement);
}

/** Maximum combo portion for an FC of all Marvelous (Perfect) judgements. */
export function computeMaxComboPortion(totalJudgements: number): number {
  const n = Math.max(0, totalJudgements | 0);
  let sum = 0;
  for (let i = 1; i <= n; i++) {
    sum += COMBO_BASE_SCORE.marvelous * getComboMultiplier(i);
  }
  return sum > 0 ? sum : 1;
}

export function countTotalHits(counts: JudgementCounts): number {
  return (
    counts.marvelousCount +
    counts.perfectCount +
    counts.greatCount +
    counts.goodCount +
    counts.badCount +
    counts.missCount
  );
}

/** Accuracy as 0–100, using lazer mania weights (max 305 per hit). */
export function computeAccuracyPercent(counts: JudgementCounts): number {
  const totalHits = countTotalHits(counts);
  if (totalHits <= 0) return 100;
  const weightedSum =
    counts.marvelousCount * ACCURACY_BASE_SCORE.marvelous +
    counts.perfectCount * ACCURACY_BASE_SCORE.perfect +
    counts.greatCount * ACCURACY_BASE_SCORE.great +
    counts.goodCount * ACCURACY_BASE_SCORE.good +
    counts.badCount * ACCURACY_BASE_SCORE.bad;
  return (weightedSum / (totalHits * MAX_ACCURACY_BASE)) * 100;
}

export function computeModMultiplier(mods: string[] | undefined | null): number {
  if (!mods || mods.length === 0) return 1;
  let mult = 1;
  for (const modId of mods) {
    const factor = MOD_SCORE_MULTIPLIERS[modId];
    if (typeof factor === 'number') mult *= factor;
  }
  return mult;
}

/**
 * Lazer ManiaScoreProcessor.ComputeTotalScore:
 *   150000 * comboProgress
 * + 850000 * Accuracy^(2 + 2*Accuracy) * accuracyProgress
 * then * modMultiplier, rounded. Lazer keeps full precision internally;
 * callers should only format accuracy for display.
 */
export function computeTotalScore(params: {
  currentComboPortion: number;
  maxComboPortion: number;
  accuracyPercent: number;
  judgedCount: number;
  totalJudgements: number;
  modMultiplier?: number;
}): number {
  const maxCombo = params.maxComboPortion > 0 ? params.maxComboPortion : 1;
  const totalJ = Math.max(1, params.totalJudgements);
  const comboProgress = Math.min(1, Math.max(0, params.currentComboPortion / maxCombo));
  const accuracyProgress = Math.min(1, Math.max(0, params.judgedCount / totalJ));
  const accuracyRatio = Math.min(1, Math.max(0, params.accuracyPercent / 100));
  const withoutMods =
    150000 * comboProgress +
    850000 * Math.pow(accuracyRatio, 2 + 2 * accuracyRatio) * accuracyProgress;
  const mult = params.modMultiplier ?? 1;
  return Math.max(0, Math.round(withoutMods * mult));
}

/**
 * Lazer mania rank rules:
 * - F on fail
 * - SS (X) when accuracy is 100%, or rank would be S with only Great/Perfect
 *   (RM: perfect/marvelous only — no great/good/bad/miss)
 * - else S/A/B/C/D by accuracy cutoffs 95/90/80/70
 */
export function computeGrade(
  accuracyPercent: number,
  counts: JudgementCounts,
  failed?: boolean
): string {
  if (failed) return 'F';

  const imperfect = counts.greatCount + counts.goodCount + counts.badCount + counts.missCount;
  const onlyMaxTiers =
    imperfect === 0 && counts.marvelousCount + counts.perfectCount > 0;

  if (accuracyPercent >= 100 || onlyMaxTiers) {
    // onlyMaxTiers with all-perfect (osu Great) yields ~98.36% → S upgraded to X
    if (onlyMaxTiers || accuracyPercent >= 100) return 'SS';
  }

  if (accuracyPercent >= 95) return 'S';
  if (accuracyPercent >= 90) return 'A';
  if (accuracyPercent >= 80) return 'B';
  if (accuracyPercent >= 70) return 'C';
  return 'D';
}

export function computeGradeFromScoreState(scoreState: Pick<
  ScoreState,
  | 'accuracy'
  | 'failed'
  | 'marvelousCount'
  | 'perfectCount'
  | 'greatCount'
  | 'goodCount'
  | 'badCount'
  | 'missCount'
>): string {
  return computeGrade(
    scoreState.accuracy,
    {
      marvelousCount: scoreState.marvelousCount,
      perfectCount: scoreState.perfectCount,
      greatCount: scoreState.greatCount,
      goodCount: scoreState.goodCount,
      badCount: scoreState.badCount,
      missCount: scoreState.missCount,
    },
    scoreState.failed
  );
}

export function countMapJudgements(notes: Array<{ type?: string }> | undefined | null): number {
  if (!notes || notes.length === 0) return 1;
  return Math.max(
    1,
    notes.reduce((sum, note) => sum + (note.type === 'hold' ? 2 : 1), 0)
  );
}
