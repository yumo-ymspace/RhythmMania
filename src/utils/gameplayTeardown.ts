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

export interface AudioEngineLike {
  stop: () => void;
  reset: () => void;
}

export interface TeardownOptions {
  timers?: Array<ReturnType<typeof setTimeout> | number>;
  video?: HTMLVideoElement | null;
  videoSync?: { destroy: () => void } | null;
}

export function executeTeardown(
  audioEngine: AudioEngineLike,
  rafId: number | null,
  keydown?: ((e: KeyboardEvent) => void) | null,
  keyup?: ((e: KeyboardEvent) => void) | null,
  offset?: ((e: KeyboardEvent) => void) | null,
  options: TeardownOptions = {}
) {
  if (rafId !== null) cancelAnimationFrame(rafId);
  for (const timer of options.timers || []) clearTimeout(timer);
  try { options.videoSync?.destroy(); } catch (_e) {}
  try { options.video?.pause(); } catch (_e) {}
  try {
    audioEngine.stop();
    audioEngine.reset();
  } catch (err) {
    console.warn("Failed reset audio during teardown:", err instanceof Error ? err.message : String(err));
  }

  if (keydown) window.removeEventListener('keydown', keydown);
  if (keyup) window.removeEventListener('keyup', keyup);
  if (offset) window.removeEventListener('keydown', offset);
}
