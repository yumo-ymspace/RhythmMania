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

import type { GameSettings } from '../../types';

export const DEFAULT_SETTINGS: GameSettings = Object.freeze({
  scrollSpeed: 21,
  audioOffset: 0,
  visualOffset: 0,
  hitsoundVolume: 0.60,
  musicVolume: 0.75,
  keyMode: 4,
  bindings: {
    2: ['f', 'j'],
    3: ['f', ' ', 'j'],
    4: ['d', 'f', 'j', 'k'],
    5: ['d', 'f', ' ', 'j', 'k'],
    6: ['s', 'd', 'f', 'j', 'k', 'l'],
    7: ['s', 'd', 'f', ' ', 'j', 'k', 'l'],
    8: ['a', 's', 'd', 'f', 'j', 'k', 'l', ';']
  },
  upsurfaceNoteMode: false,
  videoOpacity: 1.0,
  backgroundDim: 0.60,
  disableVideo: false,
  videoOffset: 0,
  disableParticles: false,
  limitDprToOne: false,
  skinId: 'custom',
  squareRenderStyle: 'rhythmmania',
  rhythmplusColor: '#ffff00',
  rhythmmaniaNoteColor: '#00b0ff',
  rhythmmaniaReceptorColor: '#00b0ff',
  circleNoteColor: '#00b0ff',
  circleReceptorColor: '#00b0ff',
  noteOpacity: 1.0,
  receptorOpacity: 1.0,
  judgementOpacity: 1.0,
  judgementSize: 1.0,
  laneSeparatorOpacity: 0.30,
  circleSize: 1.0,
  noteSizeMultiplier: 1.0,
  playfieldStyle: 'square',
  customSkinColors: ['#2e6b9e', '#eceff1', '#d32f2f', '#00b0ff', '#eab308'],
  playfieldWidthPercent: 40,
  progressBarTop: false,
  selectedMods: [],
  bindPause: 'escape',
  bindRetry: 'r',
  renderEngine: 'canvas',
  enableMapSV: true,
} as GameSettings);

/** True when a setting's value differs from its default. */
export function isAtDefault(id: keyof GameSettings, value: unknown, defaults = DEFAULT_SETTINGS): boolean {
  const dv = (defaults as any)[id];
  if (Array.isArray(dv) && Array.isArray(value)) {
    if (dv.length !== value.length) return false;
    return dv.every((v, i) => v === value[i]);
  }
  if (dv !== null && typeof dv === 'object' && value !== null && typeof value === 'object') {
    return JSON.stringify(dv) === JSON.stringify(value);
  }
  return dv === value;
}
