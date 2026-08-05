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

import { getColumnStyles } from '../components/GameplayCanvas';
import { PlayfieldVisualSettings, ColumnLayout } from './types';
import { ScrollModel, getScrollDelta } from './scrollVelocity';

export function updateColumnsLayout(
  existingColumns: ColumnLayout[],
  keyCount: number,
  width: number,
  settings: PlayfieldVisualSettings,
  activeColumns: boolean[],
  laneGlows: number[]
): ColumnLayout[] {
  const baseWidth = width / keyCount;
  const colStyles = getColumnStyles(keyCount, baseWidth, settings.skinId, settings.customSkinColors);

  while (existingColumns.length < keyCount) {
    existingColumns.push({
      x: 0,
      width: 0,
      color: '',
      pressed: false,
      glow: 0
    });
  }
  while (existingColumns.length > keyCount) {
    existingColumns.pop();
  }

  let accumulatedX = 0;
  for (let i = 0; i < keyCount; i++) {
    const col = existingColumns[i];
    col.x = accumulatedX;
    col.width = colStyles[i].width;
    col.color = colStyles[i].color;
    col.pressed = activeColumns[i] || false;
    col.glow = laneGlows[i] || 0;
    accumulatedX += colStyles[i].width;
  }
  return existingColumns;
}

export function calculateScrollSpeedFactor(
  height: number,
  receptorY: number,
  settings: PlayfieldVisualSettings
): number {
  const travelDistance = settings.upsurfaceNoteMode ? (height - receptorY) : receptorY;
  const scrollTimeMs = Math.max(80, 1100 - (settings.scrollSpeed ?? 18) * 25);
  return travelDistance / scrollTimeMs;
}

export function getScrollYPosition(
  timeMs: number,
  visualTime: number,
  receptorY: number,
  speedFactor: number,
  upsurfaceNoteMode: boolean,
  scrollModel?: ScrollModel | null
): number {
  const delta = (scrollModel && scrollModel.isEnabled)
    ? getScrollDelta(scrollModel, visualTime, timeMs)
    : (timeMs - visualTime);

  if (upsurfaceNoteMode) {
    return receptorY + delta * speedFactor;
  } else {
    return receptorY - delta * speedFactor;
  }
}

export function getHiddenOpacityForY(
  y: number,
  height: number,
  receptorY: number,
  upsurfaceNoteMode: boolean,
  isHD: boolean
): number {
  if (!isHD) return 1.0;
  const distancePercent = upsurfaceNoteMode
    ? (height - y) / (height - receptorY)
    : y / receptorY;

  if (distancePercent < 0.35) {
    return 1.0;
  } else if (distancePercent < 0.70) {
    const fadeFactor = 1 - (distancePercent - 0.35) / 0.35;
    return Math.max(0, fadeFactor);
  } else {
    return 0.0;
  }
}
