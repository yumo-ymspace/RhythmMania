/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GameSettings } from '../types';
import { GameplayMediaRegistry } from './mediaRegistry';

export class VideoSyncController {
  private getAudioTimeMs: () => number;
  private videoStartTimeMs: number; // Parsed from .osu (e.g., -1500)
  private getSettings: () => GameSettings;
  
  private lastSyncTime: number = 0;
  private syncIntervalMs: number = 180; // Run PLL checks roughly 5.5 times per second
  
  // Configuration deadbands
  private readonly DEADBAND_FINE_MS = 60;        // Under 60ms: Smooth native playback
  private readonly DEADBAND_CATASTROPHIC_MS = 900; // Over 900ms: Hard seek to re-align single-shot

  constructor(
    getAudioTimeMs: () => number,
    videoStartTimeMs: number,
    getSettings: () => GameSettings
  ) {
    this.getAudioTimeMs = getAudioTimeMs;
    this.videoStartTimeMs = videoStartTimeMs;
    this.getSettings = getSettings;
  }

  /**
   * Evaluates drift and adjusts the video playhead or playbackRate.
   * Automatic throttling prevents hardware decoder queue exhaustion.
   */
  public update() {
    const videoEl = GameplayMediaRegistry.getVideo();
    if (!videoEl) return;

    const now = performance.now();
    if (now - this.lastSyncTime < this.syncIntervalMs) return; // Throttled check
    this.lastSyncTime = now;

    if (videoEl.seeking) return;

    const audioTimeSec = this.getAudioTimeMs() / 1000;
    const settings = this.getSettings();
    
    // Target position: audio time - (parsed videoStartTime offset) - (user-customizable adjustment offset)
    const userOffsetSec = (settings.videoOffset || 0) / 1000;
    const targetVideoTimeSec = audioTimeSec - (this.videoStartTimeMs / 1000) - userOffsetSec;
    
    // Ignore updates & pause if target time is negative (video hasn't started yet)
    if (targetVideoTimeSec < 0) {
      if (videoEl.currentTime > 0) {
        videoEl.currentTime = 0;
      }
      if (!videoEl.paused) {
        try { videoEl.pause(); } catch (e) {}
      }
      return;
    }

    if (videoEl.paused && audioTimeSec > 0) {
      videoEl.play().catch(() => {});
    }

    const currentVideoTimeSec = videoEl.currentTime;
    const driftSec = targetVideoTimeSec - currentVideoTimeSec;
    const driftMs = Math.abs(driftSec) * 1000;

    // Phase Locked Loop Decision Logic
    if (driftMs >= this.DEADBAND_CATASTROPHIC_MS) {
      // Catastrophic drift: Force a single discrete seek
      videoEl.currentTime = targetVideoTimeSec;
      videoEl.playbackRate = 1.0;
    } else if (driftMs > this.DEADBAND_FINE_MS) {
      // Proportional controller: Adjust playback rate gently to close the gap
      // Map drift driftSec to a maximum adjustment of +/- 0.15 of the normal speed 
      const pAdjustment = (driftSec / 1.0) * 0.25; // Proportional gain term
      const targetRate = 1.0 + Math.min(Math.max(pAdjustment, -0.15), 0.15); // clamp rate [0.85x, 1.15x]
      
      videoEl.playbackRate = targetRate;
    } else {
      // Fine Align: within acceptable bounds, run at design 1.0x native rate
      if (videoEl.playbackRate !== 1.0) {
        videoEl.playbackRate = 1.0;
      }
    }
  }

  public setVideoStartTimeMs(val: number) {
    this.videoStartTimeMs = val;
  }
}
