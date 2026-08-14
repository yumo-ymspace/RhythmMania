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

/**
 * Normalize the millisecond timestamp stored at the start of an osu! hold
 * object's extra field. Some exporters write harmless fractional values.
 */
export function parseHoldTailTime(rawValue: unknown, headTime: number, maxTime: number): number | null {
  if (typeof rawValue !== 'string' || rawValue.trim() === '') return null;

  const parsed = Number(rawValue.trim());
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maxTime) return null;

  const normalized = Math.round(parsed);
  if (!Number.isSafeInteger(normalized) || normalized <= headTime || normalized > maxTime) return null;
  return normalized;
}
