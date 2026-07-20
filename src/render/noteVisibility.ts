/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 */

import { HitObject } from '../types';
import { PlayfieldVisualSettings, VisibleNote, ColumnLayout } from './types';
import { getScrollYPosition, getHiddenOpacityForY } from './playfieldLayout';
import { isCircleSkinMode } from './skinTheme';

export function getVisibleNotes(
  notes: HitObject[],
  settings: PlayfieldVisualSettings,
  columns: ColumnLayout[],
  height: number,
  receptorY: number,
  visualTime: number,
  speedFactor: number
): VisibleNote[] {
  const visible: VisibleNote[] = [];
  const paddingLimit = 100; // Safe cushion to ensure holds / note animations don't pop off screen edge prematurely
  const up = settings.upsurfaceNoteMode;
  const isHD = settings.selectedMods?.includes('HD') || false;
  const isCircle = isCircleSkinMode(settings);
  const noteOpacityVal = settings.noteOpacity ?? 1.0;

  notes.forEach((n) => {
    // 1. Determine if hold bodies are drawn or active
    const isHoldBodyActive = n.type === 'hold' && n.endTime && (!n.isHit || !n.isReleased) && !n.isMissed && !n.isHoldFailed;
    
    // 2. Note head/head receptor visibilities
    const shouldDrawHead = (n.type === 'normal' && !n.isHit && !n.isMissed) || (n.type === 'hold' && !n.isHit && !n.isMissed && !n.isHoldFailed);
    const shouldDrawEnd = n.type === 'hold' && n.endTime && !n.isReleased && !n.isMissed && !n.isHoldFailed;

    if (!isHoldBodyActive && !shouldDrawHead && !shouldDrawEnd) {
      return;
    }

    const colW = columns[n.column]?.width || 50;

    // Head Y / End Y
    const y = getScrollYPosition(n.time, visualTime, receptorY, speedFactor, up);
    const endY = n.endTime ? getScrollYPosition(n.endTime, visualTime, receptorY, speedFactor, up) : undefined;

    // Check visibility within playfield boundaries
    let isVisible = false;
    if (shouldDrawHead) {
      isVisible = y >= -paddingLimit && y <= height + paddingLimit;
    } else if (shouldDrawEnd && endY !== undefined) {
      isVisible = endY >= -paddingLimit && endY <= height + paddingLimit;
    } else if (isHoldBodyActive && endY !== undefined) {
      const minY = Math.min(y, endY);
      const maxY = Math.max(y, endY);
      isVisible = maxY >= -paddingLimit && minY <= height + paddingLimit;
    }

    if (!isVisible) {
      return;
    }

    // HD Fade Opacity
    const opacity = getHiddenOpacityForY(y, height, receptorY, up, isHD) * noteOpacityVal;
    const endOpacity = endY !== undefined ? getHiddenOpacityForY(endY, height, receptorY, up, isHD) * noteOpacityVal : undefined;

    // Style keys for texture binding / recycling
    let styleKey = 'normal';
    if (n.type === 'hold') {
      styleKey = 'hold';
    }

    visible.push({
      id: n.id,
      column: n.column,
      type: n.type,
      time: n.time,
      endTime: n.endTime,
      isHit: n.isHit,
      isReleased: n.isReleased,
      isMissed: n.isMissed,
      isHoldFailed: n.isHoldFailed,
      releaseGraceUntil: n.releaseGraceUntil,
      y,
      endY,
      opacity,
      endOpacity,
      styleKey
    });
  });

  return visible;
}
