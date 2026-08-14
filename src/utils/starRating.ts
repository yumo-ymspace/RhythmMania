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

import type { Beatmap } from '../types';

const NAMED_RATINGS: Array<[RegExp, number]> = [
  [/easy|beginner/, 1.5],
  [/doubtful/, 2.33],
  [/normal/, 2.1],
  [/hard|hyper/, 3.65],
  [/insane|another/, 4.8],
  [/expert|black/, 5.85],
  [/extra|deluge/, 6.4],
  [/master|zenith/, 7.5],
];

/** Resolve the same deterministic display rating everywhere in the app. */
export function resolveStarRating(map: Pick<Beatmap, 'id' | 'difficulty'> & { starRating?: unknown }): number {
  const explicit = Number(map.starRating);
  if (Number.isFinite(explicit)) return Math.max(0, Math.round(explicit * 100) / 100);

  const difficulty = String(map.difficulty || '').toLowerCase();
  const named = NAMED_RATINGS.find(([pattern]) => pattern.test(difficulty));
  if (named) return named[1];

  const hash = String(map.id || '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return Math.round((1 + (hash % 75) / 10) * 100) / 100;
}
