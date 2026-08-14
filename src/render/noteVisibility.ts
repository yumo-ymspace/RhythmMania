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
import { HOLD_TICK_RULES_VERSION } from '../utils/holdTickRules';

function mergeTailIntervals(
  intervals: Array<{ startTime: number; endTime: number }>,
): Array<{ startTime: number; endTime: number }> {
  const merged: Array<{ startTime: number; endTime: number }> = [];
  const ordered = [...intervals]
    .filter(interval => Number.isFinite(interval.startTime) && Number.isFinite(interval.endTime) && interval.endTime > interval.startTime)
    .sort((left, right) => left.startTime - right.startTime);
  for (const interval of ordered) {
    const previous = merged[merged.length - 1];
    if (previous && interval.startTime <= previous.endTime + 0.001) {
      previous.endTime = Math.max(previous.endTime, interval.endTime);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

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

    // Hold geometry is timeline-driven. Judgement state may change its color or
    // anchoring, but it must not consume the note before it scrolls off-screen.
    const usesTailTicks = n.holdRulesVersion === HOLD_TICK_RULES_VERSION;
    const isHoldBodyActive = n.type === 'hold' && n.endTime !== undefined;
    const isEndPassed = isHoldBodyActive && n.endTime !== undefined && visualTime > n.endTime;
    const isHoldBodyGrounded = isHoldBodyActive && isHoldBodyAnchored({
      type: n.type,
      isHit: n.isHit,
      isMissed: n.isMissed,
      isReleased: n.isReleased,
      isHoldFailed: n.isHoldFailed,
      isEndPassed,
      earlyReleaseTime: n.earlyReleaseTime,
      tailResumedTime: n.tailResumedTime,
    });
    const shouldDrawHead = (n.type === 'normal' && !n.isHit && !n.isMissed) ||
      (n.type === 'hold' && (n.isMissed || (!n.isHit && !n.isHoldFailed)));
    const shouldDrawEnd = n.type === 'hold' && n.endTime !== undefined && (!usesTailTicks || !n.isReleaseHit);

    if (!isHoldBodyActive && !shouldDrawHead && !shouldDrawEnd) continue;

    const y = getScrollYPosition(n.time, visualTime, receptorY, speedFactor, up, scrollModel);
    const endY = n.endTime !== undefined
      ? getScrollYPosition(n.endTime, visualTime, receptorY, speedFactor, up, scrollModel)
      : undefined;
    const bodyStartY = isHoldBodyGrounded && !usesTailTicks
      ? receptorY
      : y;
    const hitSegmentStartY = n.type === 'hold' && n.isHoldFailed && n.isReleased &&
      n.hitTime !== undefined && n.releaseTime !== undefined && n.releaseTime > n.hitTime
      ? getScrollYPosition(n.hitTime, visualTime, receptorY, speedFactor, up, scrollModel)
      : undefined;
    const hitSegmentEndY = hitSegmentStartY !== undefined && n.releaseTime !== undefined
      ? getScrollYPosition(n.releaseTime, visualTime, receptorY, speedFactor, up, scrollModel)
      : undefined;

    let isVisible = false;
    if (isHoldBodyActive && endY !== undefined) {
      const minY = Math.min(bodyStartY, endY);
      const maxY = Math.max(bodyStartY, endY);
      isVisible = maxY >= -paddingLimit && minY <= height + paddingLimit;
      if (!isVisible && shouldDrawHead) {
        isVisible = y >= -paddingLimit && y <= height + paddingLimit;
      }
      if (!isVisible && shouldDrawEnd) {
        isVisible = endY >= -paddingLimit && endY <= height + paddingLimit;
      }
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

    const tailEngaged = n.isHeadHit || n.tailEngagedTime !== undefined;
    const engagementTime = n.isHeadHit
      ? n.hitTime ?? n.time
      : n.tailEngagedTime ?? n.time;
    const isLateTailStart = tailEngaged && !n.isHeadHit;
    const isEarlyReleased = n.earlyReleaseTime !== undefined && n.tailResumedTime === undefined;
    const frontierTime = tailEngaged
      ? Math.max(n.time, engagementTime, visualTime)
      : n.time;
    const bodyStartTime = isEarlyReleased
      ? Math.max(n.time, n.earlyReleaseTime ?? n.time)
      : isLateTailStart
      ? n.time
      : tailEngaged
        ? frontierTime
        : n.time;
    const judgedBodyEndTime = n.isReleaseHit && n.releaseTime !== undefined
      ? Math.min(n.endTime ?? n.releaseTime, Math.max(n.time, n.releaseTime))
      : n.endTime;
    // Entering the endpoint window arms a later release judgement, but does
    // not consume the tail. The endpoint remains an unhit note until that
    // release is actually judged successfully.
    const bodyEndTime = judgedBodyEndTime;
    const endpointTailStartTime = usesTailTicks && !n.isReleaseHit && n.tailTickEndTime !== undefined
      ? Math.max(bodyStartTime, n.tailTickEndTime)
      : undefined;
    const baseBodyEndTime = endpointTailStartTime !== undefined
      ? Math.min(bodyEndTime ?? endpointTailStartTime, endpointTailStartTime)
      : bodyEndTime;
    const visualMissedIntervals = usesTailTicks
      ? mergeTailIntervals(n.missedTailIntervals || [])
      : [];

    // When a late-start player begins holding immediately after a missed run,
    // bridge only that small visual handoff gap. This keeps the missed run as
    // one solid tail without hiding a genuinely cleared interval.
    const trailingMiss = visualMissedIntervals[visualMissedIntervals.length - 1];
    const hasClearedAfterEngagement = isLateTailStart
      ? (n.clearedTailIntervals || []).some(interval =>
        interval.startTime < frontierTime && interval.endTime > engagementTime)
      : false;
    const hasClearedGap = trailingMiss && tailEngaged
      ? (n.clearedTailIntervals || []).some(interval =>
        interval.startTime < frontierTime && interval.endTime > trailingMiss.endTime)
      : false;
    if (
      trailingMiss &&
      tailEngaged &&
      !isEarlyReleased &&
      bodyEndTime !== undefined &&
      bodyStartTime <= bodyEndTime &&
      n.tailTickIntervalMs !== undefined &&
      frontierTime > trailingMiss.endTime &&
      (isLateTailStart || frontierTime - trailingMiss.endTime <= n.tailTickIntervalMs + 0.001) &&
      !hasClearedGap
    ) {
      trailingMiss.endTime = frontierTime;
    }

    const tailSegments = usesTailTicks && n.tailTickStartTime !== undefined && n.tailTickEndTime !== undefined
      ? (() => {
        const segments: Array<{ startY: number; endY: number }> = [];
        // Once the head is hit, consume the unmissed tail from the moving
        // receptor edge. This keeps the remaining body continuous instead of
        // making each successful tick look like a detached visual chunk.
        if (isLateTailStart) {
          const visualPrefixEndTime = isEarlyReleased
            ? Math.max(engagementTime, n.earlyReleaseTime ?? engagementTime)
            : hasClearedAfterEngagement ? engagementTime : frontierTime;
          const prefixEndTime = baseBodyEndTime === undefined
            ? visualPrefixEndTime
            : Math.min(baseBodyEndTime, visualPrefixEndTime);
          if (prefixEndTime > n.time) {
            const clearedIntervals = isEarlyReleased
              ? mergeTailIntervals(n.clearedTailIntervals || [])
              : [];
            let prefixCursor = n.time;
            for (const cleared of clearedIntervals) {
              const clearedStart = Math.max(prefixCursor, cleared.startTime);
              const clearedEnd = Math.min(prefixEndTime, cleared.endTime);
              if (clearedEnd <= n.time || clearedStart >= clearedEnd) continue;
              if (clearedStart > prefixCursor) {
                segments.push({
                  startY: getScrollYPosition(prefixCursor, visualTime, receptorY, speedFactor, up, scrollModel),
                  endY: getScrollYPosition(clearedStart, visualTime, receptorY, speedFactor, up, scrollModel),
                });
              }
              prefixCursor = Math.max(prefixCursor, clearedEnd);
            }
            if (prefixCursor < prefixEndTime) {
              segments.push({
                startY: getScrollYPosition(prefixCursor, visualTime, receptorY, speedFactor, up, scrollModel),
                endY: getScrollYPosition(prefixEndTime, visualTime, receptorY, speedFactor, up, scrollModel),
              });
            }
          }
          if (baseBodyEndTime !== undefined && frontierTime < baseBodyEndTime) {
            segments.push({
              startY: getScrollYPosition(frontierTime, visualTime, receptorY, speedFactor, up, scrollModel),
              endY: getScrollYPosition(baseBodyEndTime, visualTime, receptorY, speedFactor, up, scrollModel),
            });
          }
          return segments;
        }

        let cursor = bodyStartTime;
        // Successful intervals are already consumed by the moving start edge
        // once the head is engaged. Subtracting them again would create a
        // visible gap at every tick. Missed intervals remain explicit holes so
        // their unhit texture can stay on-screen until it scrolls away.
        const consumedIntervals = mergeTailIntervals([
          ...(tailEngaged ? [] : (n.clearedTailIntervals || [])),
          ...visualMissedIntervals,
        ]);
        for (const consumed of consumedIntervals) {
          const consumedStart = Math.max(bodyStartTime, consumed.startTime);
          const consumedEnd = baseBodyEndTime === undefined
            ? consumed.endTime
            : Math.min(baseBodyEndTime, consumed.endTime);
          if (consumedEnd <= bodyStartTime || consumedStart >= consumedEnd) continue;
          if (consumedStart > cursor) {
            segments.push({
              startY: getScrollYPosition(cursor, visualTime, receptorY, speedFactor, up, scrollModel),
              endY: getScrollYPosition(consumedStart, visualTime, receptorY, speedFactor, up, scrollModel),
            });
          }
          cursor = Math.max(cursor, consumedEnd);
        }
        if (baseBodyEndTime !== undefined && cursor < baseBodyEndTime) {
          segments.push({
            startY: getScrollYPosition(cursor, visualTime, receptorY, speedFactor, up, scrollModel),
            endY: getScrollYPosition(baseBodyEndTime, visualTime, receptorY, speedFactor, up, scrollModel),
          });
        }
        return segments;
      })()
      : undefined;
    const missedTailSegments = usesTailTicks
      ? visualMissedIntervals.map(segment => ({
        startY: getScrollYPosition(segment.startTime, visualTime, receptorY, speedFactor, up, scrollModel),
        endY: getScrollYPosition(segment.endTime, visualTime, receptorY, speedFactor, up, scrollModel),
      }))
      : undefined;
    const endpointTailSegment = endpointTailStartTime !== undefined && bodyEndTime !== undefined && endpointTailStartTime < bodyEndTime
      ? {
        startY: getScrollYPosition(endpointTailStartTime, visualTime, receptorY, speedFactor, up, scrollModel),
        endY: getScrollYPosition(bodyEndTime, visualTime, receptorY, speedFactor, up, scrollModel),
      }
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
      isReleaseMissed: n.isReleaseMissed,
      isReleaseHit: n.isReleaseHit,
      isEndPassed,
      earlyReleaseTime: n.earlyReleaseTime,
      tailResumedTime: n.tailResumedTime,
      releaseZoneArmedTime: n.releaseZoneArmedTime,
      holdRulesVersion: n.holdRulesVersion,
      releaseTime: n.releaseTime,
      releaseGraceUntil: n.releaseGraceUntil,
      y,
      bodyStartY,
      hitSegmentStartY,
      hitSegmentEndY,
      endY,
      opacity,
      endOpacity,
      tailSegments,
      missedTailSegments,
      endpointTailSegment,
      styleKey: n.type === 'hold' ? 'hold' : 'normal',
    });
  }

  return visible;
}
