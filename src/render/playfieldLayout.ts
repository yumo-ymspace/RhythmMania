/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 */

import { getColumnStyles, ColumnStyle } from '../components/GameplayCanvas';
import { PlayfieldVisualSettings, ColumnLayout } from './types';

export function calculateColumnsLayout(
  keyCount: number,
  width: number,
  settings: PlayfieldVisualSettings,
  activeColumns: boolean[],
  laneGlows: number[]
) {
  let totalWeight = 0;
  for (let i = 0; i < keyCount; i++) {
    let weight = 1.0;
    if (keyCount === 5 && i === 2) weight = 1.35;
    else if (keyCount === 7 && i === 3) weight = 1.35;
    else if (keyCount === 8 && i === 0) weight = 1.4;
    totalWeight += weight;
  }
  const baseWidth = width / totalWeight;
  const colStyles = getColumnStyles(keyCount, baseWidth, settings.skinId, settings.customSkinColors);

  const columns = [];
  let accumulatedX = 0;
  for (let i = 0; i < keyCount; i++) {
    columns.push({
      x: accumulatedX,
      width: colStyles[i].width,
      color: colStyles[i].color,
      pressed: activeColumns[i] || false,
      glow: laneGlows[i] || 0
    });
    accumulatedX += colStyles[i].width;
  }
  return columns;
}

export function updateColumnsLayout(
  existingColumns: ColumnLayout[],
  keyCount: number,
  width: number,
  settings: PlayfieldVisualSettings,
  activeColumns: boolean[],
  laneGlows: number[]
): ColumnLayout[] {
  let totalWeight = 0;
  for (let i = 0; i < keyCount; i++) {
    let weight = 1.0;
    if (keyCount === 5 && i === 2) weight = 1.35;
    else if (keyCount === 7 && i === 3) weight = 1.35;
    else if (keyCount === 8 && i === 0) weight = 1.4;
    totalWeight += weight;
  }
  const baseWidth = width / totalWeight;
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
  upsurfaceNoteMode: boolean
): number {
  if (upsurfaceNoteMode) {
    return receptorY + (timeMs - visualTime) * speedFactor;
  } else {
    return receptorY - (timeMs - visualTime) * speedFactor;
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
