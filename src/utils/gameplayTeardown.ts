/**
 * @license
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { AssetLifecycleManager } from './assetLifecycle';
import { storageManager } from './storageManager';

export interface AudioEngineLike {
  stop: () => void;
  reset: () => void;
}

export function executeTeardown(
  audioEngine: AudioEngineLike,
  rafId: number | null,
  keydown?: ((e: KeyboardEvent) => void) | null,
  keyup?: ((e: KeyboardEvent) => void) | null,
  offset?: ((e: KeyboardEvent) => void) | null
) {
  if (rafId) cancelAnimationFrame(rafId);
  try {
    audioEngine.stop();
    audioEngine.reset();
  } catch (err) {
    console.warn("Failed reset audio during teardown:", err instanceof Error ? err.message : String(err));
  }

  if (keydown) window.removeEventListener('keydown', keydown);
  if (keyup) window.removeEventListener('keyup', keyup);
  if (offset) window.removeEventListener('keydown', offset);

  // Clear LRU Media urls because AssetLifecycleManager is going to revoke all blobs
  try {
    storageManager.lruMediaCache.clearAll();
  } catch (err) {
    console.warn("Failed to clear media cache during teardown:", err);
  }

  AssetLifecycleManager.clearAll();
}
