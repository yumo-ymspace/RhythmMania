import type { VisibleNote } from './types';

export function isHoldBodyAnchored(note: Pick<VisibleNote, 'type' | 'isHit' | 'isMissed' | 'isReleased' | 'isHoldFailed' | 'isEndPassed' | 'earlyReleaseTime' | 'tailResumedTime'>): boolean {
  return note.type === 'hold' && note.isHit && !note.isMissed && !note.isReleased && !note.isHoldFailed &&
    !note.isEndPassed &&
    (note.earlyReleaseTime === undefined || note.tailResumedTime !== undefined);
}
