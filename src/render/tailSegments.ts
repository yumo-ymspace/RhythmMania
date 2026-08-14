export interface VisibleTailSegment {
  startY: number;
  endY: number;
}

/** Merge touching tail geometry so a missed run cannot flicker as tick-sized blocks. */
export function mergeVisibleTailSegments(segments: VisibleTailSegment[]): VisibleTailSegment[] {
  const ordered = segments
    .filter(segment => Number.isFinite(segment.startY) && Number.isFinite(segment.endY))
    .map(segment => ({ ...segment }))
    .sort((left, right) => Math.min(left.startY, left.endY) - Math.min(right.startY, right.endY));
  const merged: VisibleTailSegment[] = [];

  for (const segment of ordered) {
    const previous = merged[merged.length - 1];
    if (!previous) {
      merged.push(segment);
      continue;
    }

    const previousMax = Math.max(previous.startY, previous.endY);
    const nextMin = Math.min(segment.startY, segment.endY);
    if (nextMin <= previousMax + 0.5) {
      previous.startY = Math.min(previous.startY, previous.endY, segment.startY, segment.endY);
      previous.endY = Math.max(previous.startY, previous.endY, segment.startY, segment.endY);
    } else {
      merged.push(segment);
    }
  }

  return merged;
}
