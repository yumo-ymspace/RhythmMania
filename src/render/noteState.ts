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

import type { VisibleNote } from './types';

export function isHoldBodyAnchored(note: Pick<VisibleNote, 'type' | 'isHit' | 'isMissed' | 'isReleased' | 'isHoldFailed' | 'isEndPassed' | 'earlyReleaseTime' | 'tailResumedTime'>): boolean {
  return note.type === 'hold' && note.isHit && !note.isMissed && !note.isReleased && !note.isHoldFailed &&
    !note.isEndPassed &&
    (note.earlyReleaseTime === undefined || note.tailResumedTime !== undefined);
}
