/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AssetLifecycleManager } from './assetLifecycle';

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

  // 4. Revoke and de-allocate local media URL blobs to avoid memory leaks
  AssetLifecycleManager.clearAll();
  console.log("PlayZone Teardown: Memory media blobs cleaned up.");
}
