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

import { GameSettings } from '../types';

export class VideoSyncController {
  private videoEl: HTMLVideoElement;
  private getAudioTimeMs: () => number;
  private videoStartTimeMs: number; // Parsed from map text (e.g., -1500)
  private getSettings: () => GameSettings;
  private getAudioPlaybackRate: () => number;
  
  private lastSyncTime: number = 0;
  private syncIntervalMs: number = 180; // Run PLL checks roughly 5.5 times per second
  
  // Configuration deadbands
  private readonly DEADBAND_FINE_MS = 60;        // Under 60ms: Smooth native playback
  private readonly DEADBAND_CATASTROPHIC_MS = 900; // Over 900ms: Hard seek to re-align single-shot

  constructor(
    video: HTMLVideoElement,
    getAudioTimeMs: () => number,
    videoStartTimeMs: number,
    getSettings: () => GameSettings,
    getAudioPlaybackRate: () => number
  ) {
    this.videoEl = video;
    this.getAudioTimeMs = getAudioTimeMs;
    this.videoStartTimeMs = videoStartTimeMs;
    this.getSettings = getSettings;
    this.getAudioPlaybackRate = getAudioPlaybackRate;
  }

  /**
   * Evaluates drift and adjusts the video playhead or playbackRate.
   * Automatic throttling prevents hardware decoder queue exhaustion.
   */
  public update() {
    const now = performance.now();
    if (now - this.lastSyncTime < this.syncIntervalMs) return; // Throttled check
    this.lastSyncTime = now;

    if (this.videoEl.seeking) return;

    const audioTimeSec = this.getAudioTimeMs() / 1000;
    
    const settings = this.getSettings();
    const baseRate = this.getAudioPlaybackRate();

    // Target position: audio time - (parsed videoStartTime offset) - (user-customizable adjustment offset)
    const userOffsetSec = (settings.videoOffset || 0) / 1000;
    const targetVideoTimeSec = audioTimeSec - (this.videoStartTimeMs / 1000) - userOffsetSec;
    
    // Ignore updates & pause if target time is negative (video hasn't started yet)
    if (targetVideoTimeSec < 0) {
      if (this.videoEl.currentTime > 0) {
        this.videoEl.currentTime = 0;
      }
      if (!this.videoEl.paused) {
        try { this.videoEl.pause(); } catch (e) {}
      }
      return;
    }

    if (this.videoEl.paused && audioTimeSec > 0) {
      this.videoEl.play().catch(() => {});
    }

    const currentVideoTimeSec = this.videoEl.currentTime;
    const driftSec = targetVideoTimeSec - currentVideoTimeSec;
    const driftMs = Math.abs(driftSec) * 1000;

    // Phase Locked Loop Decision Logic
    if (driftMs >= this.DEADBAND_CATASTROPHIC_MS) {
      // Catastrophic drift: Force a single discrete seek
      this.videoEl.currentTime = targetVideoTimeSec;
      this.videoEl.playbackRate = baseRate;
    } else if (driftMs > this.DEADBAND_FINE_MS) {
      // Proportional controller: Adjust playback rate gently to close the gap
      // Map drift driftSec to a maximum adjustment of +/- 0.15 of the base speed 
      const pAdjustment = (driftSec / 1.0) * 0.25; // Proportional gain term
      const targetRate = baseRate + Math.min(Math.max(pAdjustment, -0.15 * baseRate), 0.15 * baseRate); // clamp rate +/- 15% of base rate
      
      this.videoEl.playbackRate = targetRate;
    } else {
      // Fine Align: within acceptable bounds, run at design base rate
      if (this.videoEl.playbackRate !== baseRate) {
        this.videoEl.playbackRate = baseRate;
      }
    }
  }

  public setVideoStartTimeMs(val: number) {
    this.videoStartTimeMs = val;
  }
}
