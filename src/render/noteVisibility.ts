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

import { HitObject } from '../types';
import { PlayfieldVisualSettings, VisibleNote, ColumnLayout } from './types';
import { getScrollYPosition, getHiddenOpacityForY } from './playfieldLayout';
import { isCircleSkinMode } from './skinTheme';
import { ScrollModel } from './scrollVelocity';

export function getVisibleNotes(
  notes: HitObject[],
  settings: PlayfieldVisualSettings,
  columns: ColumnLayout[],
  height: number,
  receptorY: number,
  visualTime: number,
  speedFactor: number,
  scrollModel?: ScrollModel | null
): VisibleNote[] {
  const visible: VisibleNote[] = [];
  const paddingLimit = 100; // Safe cushion to ensure holds / note animations don't pop off screen edge prematurely
  const up = settings.upsurfaceNoteMode;
  const isHD = settings.selectedMods?.includes('HD') || false;
  const isCircle = isCircleSkinMode(settings);
  const noteOpacityVal = settings.noteOpacity ?? 1.0;

  notes.forEach((n) => {
// 1. Hold body stays visible after a head miss so the player can still catch middle/tail
    const isHoldBodyActive = n.type === 'hold' && !!n.endTime && !n.isReleased && !n.isHoldFailed;
    // Ground body to receptor only while actively engaged (held). A missed head does NOT
    // ground the body — the LN keeps its fixed length and scrolls off the bottom; only
    // the head judgement is invalidated, the tail/release remains salvageable.
    const isHoldBodyGrounded =
      n.type === 'hold' &&
      !n.isReleased &&
      !n.isHoldFailed &&
      !!n.isHit &&
      !n.isMissed;
    
    // 2. Note head/head receptor visibilities (head hides after miss; end stays until release/fail)
    const shouldDrawHead = (n.type === 'normal' && !n.isHit && !n.isMissed) || (n.type === 'hold' && !n.isHit && !n.isMissed && !n.isHoldFailed);
    const shouldDrawEnd = n.type === 'hold' && !!n.endTime && !n.isReleased && !n.isHoldFailed;

    if (!isHoldBodyActive && !shouldDrawHead && !shouldDrawEnd) {
      return;
    }

    const colW = columns[n.column]?.width || 50;

    // Head Y / End Y
    const y = getScrollYPosition(n.time, visualTime, receptorY, speedFactor, up, scrollModel);
    const endY = n.endTime ? getScrollYPosition(n.endTime, visualTime, receptorY, speedFactor, up, scrollModel) : undefined;

    const bodyStartY = isHoldBodyGrounded ? receptorY : y;

    // Check visibility within playfield boundaries.
    // Active hold bodies must use the full span (receptor→tail); tail-only checks cull long LNs
    // while the end is still above/below the playfield, causing the body to flicker out.
    let isVisible = false;
    if (isHoldBodyActive && endY !== undefined) {
      const minY = Math.min(bodyStartY, endY);
      const maxY = Math.max(bodyStartY, endY);
      isVisible = maxY >= -paddingLimit && minY <= height + paddingLimit;
    } else if (shouldDrawHead) {
      isVisible = y >= -paddingLimit && y <= height + paddingLimit;
    } else if (shouldDrawEnd && endY !== undefined) {
      isVisible = endY >= -paddingLimit && endY <= height + paddingLimit;
    }

    if (!isVisible) {
      return;
    }

    // HD Fade Opacity — held LN head is past the receptor; fade from receptor / tail instead
    const opacity = getHiddenOpacityForY(bodyStartY, height, receptorY, up, isHD) * noteOpacityVal;
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
