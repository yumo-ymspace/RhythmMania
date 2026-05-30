/**
 * @license
 * SPDX-License-Identifier: GPL-3.0-only
 */


export interface AudioEngineLike {
  stop: () => void;
  reset: () => void;
}

/**
 * Halts active game rendering, stops audio context outputs,
 * and clears hardware context references upon quitting Gameplay mode.
 */
export function executeTeardown(
  audioEngine: AudioEngineLike,
  rafId: number | null,
  globalKeydownHandler?: ((e: KeyboardEvent) => void) | null,
  globalKeyupHandler?: ((e: KeyboardEvent) => void) | null,
  globalOffsetHandler?: ((e: KeyboardEvent) => void) | null
) {
  // 1. Terminate ongoing requestAnimationFrame render triggers
  if (rafId) {
    cancelAnimationFrame(rafId);
    console.log("PlayZone Teardown: Canvas animation frame loop halted.");
  }

  // 2. Shut down and reset audio hardware layers/sound buffers
  try {
    audioEngine.stop();
    audioEngine.reset();
    console.log("PlayZone Teardown: Audio hardware buffers halted.");
  } catch (err) {
    console.warn("PlayZone Teardown Warning: Failed stopping audio source buffers cleanly:", err);
  }

  // 3. Systematically unbind global window listeners to prevent interference/poisoning
  if (globalKeydownHandler) {
    window.removeEventListener('keydown', globalKeydownHandler);
  }
  if (globalKeyupHandler) {
    window.removeEventListener('keyup', globalKeyupHandler);
  }
  if (globalOffsetHandler) {
    window.removeEventListener('keydown', globalOffsetHandler);
  }
  console.log("PlayZone Teardown: Key listeners successfully flushed.");

  // 4. Note: We do NOT call AssetLifecycleManager.clearAll() or storageManager.lruMediaCache.clearAll() here.
  // The LRU Media Cache (capacity: 3) automatically manages the lifecycle of dynamic Blob URLs 
  // and revokes them when they are evicted from the cache. Revoking them prematurely on teardown
  // would break active/cached references and cause decoding failures when starting subsequent plays.
  console.log("PlayZone Teardown: Cleanup completed (cache preserved for smooth navigation).");
}
