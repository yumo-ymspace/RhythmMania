export const INTRO_SKIP_THRESHOLD_MS = 4000;
export const INTRO_SKIP_LEAD_IN_MS = 2000;
export const INTRO_SKIP_WINDOW_END_OFFSET_MS = 400;
export const INTRO_SKIP_HARD_CUTOFF_MS = 200;

export function isIntroSkippable(firstNoteTimeMs: number, thresholdMs: number = INTRO_SKIP_THRESHOLD_MS): boolean {
  if (!Number.isFinite(firstNoteTimeMs)) return false;
  if (firstNoteTimeMs <= 0) return false;
  return firstNoteTimeMs > thresholdMs;
}

export function computeSkipTargetMs(firstNoteTimeMs: number, leadInMs: number = INTRO_SKIP_LEAD_IN_MS): number {
  if (!Number.isFinite(firstNoteTimeMs)) return 0;
  return Math.max(0, firstNoteTimeMs - leadInMs);
}

export function isSkipWindowActive(
  songTimeMs: number,
  firstNoteTimeMs: number,
  hasSkipped: boolean,
  thresholdMs: number = INTRO_SKIP_THRESHOLD_MS,
): boolean {
  if (hasSkipped) return false;
  if (!isIntroSkippable(firstNoteTimeMs, thresholdMs)) return false;
  if (!Number.isFinite(songTimeMs)) return false;
  return songTimeMs < firstNoteTimeMs - INTRO_SKIP_WINDOW_END_OFFSET_MS;
}

export function canPerformSkip(
  songTimeMs: number,
  firstNoteTimeMs: number,
  hasSkipped: boolean,
  thresholdMs: number = INTRO_SKIP_THRESHOLD_MS,
): boolean {
  if (!isSkipWindowActive(songTimeMs, firstNoteTimeMs, hasSkipped, thresholdMs)) return false;
  return songTimeMs < firstNoteTimeMs - INTRO_SKIP_HARD_CUTOFF_MS;
}
