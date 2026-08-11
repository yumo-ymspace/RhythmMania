/*
 * Visible-note selection is intentionally conservative. The input is normally
 * parser-sorted, but an imported/replayed map may not be, so the fallback sort
 * is kept at the boundary instead of making renderers defend themselves.
 */

import { HitObject } from '../types';
import { PlayfieldVisualSettings, VisibleNote } from './types';
import { getScrollYPosition, getHiddenOpacityForY } from './playfieldLayout';
import { ScrollModel } from './scrollVelocity';
import { isHoldBodyAnchored } from './noteState';

export function getVisibleNotes(
  notes: HitObject[],
  settings: PlayfieldVisualSettings,
  height: number,
  receptorY: number,
  visualTime: number,
  speedFactor: number,
  scrollModel?: ScrollModel | null,
): VisibleNote[] {
  const visible: VisibleNote[] = [];
  const paddingLimit = 100;
  const up = settings.upsurfaceNoteMode;
  const isHD = settings.selectedMods?.includes('HD') || false;
  const noteOpacityVal = settings.noteOpacity ?? 1.0;
  const orderedNotes = notes.every((note, index) => index === 0 || note.time >= notes[index - 1].time)
    ? notes
    : [...notes].sort((a, b) => a.time - b.time);

  // Evaluate every note against its actual SV-projected position. A global
  // time window is not safe when timing points change scroll direction or
  // speed, because a note outside that window can still be on screen.
  for (const n of orderedNotes) {

    // Hold body stays visible after a head miss so the player can still catch
    // the middle/tail. A missed head itself is never grounded at the receptor.
    const isHoldBodyActive = n.type === 'hold' && !!n.endTime && !n.isReleased && !n.isHoldFailed;
    const isHoldBodyGrounded = isHoldBodyActive && isHoldBodyAnchored({
      type: n.type,
      isHit: n.isHit,
      isMissed: n.isMissed,
      isReleased: n.isReleased,
      isHoldFailed: n.isHoldFailed,
    });
    const shouldDrawHead = (n.type === 'normal' && !n.isHit && !n.isMissed) ||
      (n.type === 'hold' && !n.isHit && !n.isMissed && !n.isHoldFailed);
    const shouldDrawEnd = n.type === 'hold' && !!n.endTime && !n.isReleased && !n.isHoldFailed;

    if (!isHoldBodyActive && !shouldDrawHead && !shouldDrawEnd) continue;

    const y = getScrollYPosition(n.time, visualTime, receptorY, speedFactor, up, scrollModel);
    const endY = n.endTime !== undefined
      ? getScrollYPosition(n.endTime, visualTime, receptorY, speedFactor, up, scrollModel)
      : undefined;
    const bodyStartY = isHoldBodyGrounded ? receptorY : y;

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
    if (!isVisible) continue;

    const opacity = getHiddenOpacityForY(bodyStartY, height, receptorY, up, isHD) * noteOpacityVal;
    const endOpacity = endY !== undefined
      ? getHiddenOpacityForY(endY, height, receptorY, up, isHD) * noteOpacityVal
      : undefined;

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
      styleKey: n.type === 'hold' ? 'hold' : 'normal',
    });
  }

  return visible;
}
