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

const BASE_MODIFIERS = new Set(['NF', 'EZ', 'HR', 'HT', 'DT', 'HD', 'AT']);

export function sanitizeGameplayMods(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const mods: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const mod = raw.toUpperCase();
    if (!BASE_MODIFIERS.has(mod) && !/^K[2-9]$/.test(mod)) continue;
    if (mods.includes(mod)) continue;
    if ((mod === 'EZ' && mods.includes('HR')) || (mod === 'HR' && mods.includes('EZ'))) continue;
    if ((mod === 'HT' && mods.includes('DT')) || (mod === 'DT' && mods.includes('HT'))) continue;
    if (/^K[2-9]$/.test(mod) && mods.some((item) => /^K[2-9]$/.test(item))) continue;
    mods.push(mod);
  }
  return mods;
}
