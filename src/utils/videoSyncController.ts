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

export function computeTargetVideoTimeSec(
  audioTimeMs: number,
  videoStartTimeMs: number,
  videoOffsetMs: number
): number {
  return audioTimeMs / 1000 - videoStartTimeMs / 1000 - (videoOffsetMs || 0) / 1000;
}

export class VideoSyncController {
  private videoEl: HTMLVideoElement;
  private getAudioTimeMs: () => number;
  private videoStartTimeMs: number;
  private getSettings: () => GameSettings;
  private getAudioPlaybackRate: () => number;
  
  private lastSyncTime: number = 0;
  private integralErrorSec: number = 0;
  private seekCooldownUntil: number = 0;
  private lastUpdateWallMs: number = 0;

  // Tight PLL deadbands (ms)
  private readonly DEADBAND_FINE_MS = 16;
  private readonly DEADBAND_SOFT_SEEK_MS = 70;
  private readonly DEADBAND_CATASTROPHIC_MS = 200;
  private readonly LOCKED_POLL_MS = 100;
  private readonly DRIFT_POLL_MS = 0;
  private readonly SEEK_COOLDOWN_MS = 150;
  private readonly KP = 0.55;
  private readonly KI = 0.08;
  private readonly MAX_RATE_CORR_FRAC = 0.05;

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

  public getTargetVideoTimeSec(audioTimeMs?: number): number {
    const settings = this.getSettings();
    const t = audioTimeMs ?? this.getAudioTimeMs();
    return computeTargetVideoTimeSec(t, this.videoStartTimeMs, settings.videoOffset || 0);
  }

  /**
   * Hard-align video to the audio master clock (transport edges, seek, resume).
   */
  public snapToAudio(playIfReady: boolean = true): void {
    if (!this.videoEl) return;
    const baseRate = this.getAudioPlaybackRate();
    const target = this.getTargetVideoTimeSec();
    this.integralErrorSec = 0;
    this.seekCooldownUntil = performance.now() + this.SEEK_COOLDOWN_MS;

    if (target < 0) {
      try {
        if (this.videoEl.currentTime > 0.001) this.videoEl.currentTime = 0;
        if (!this.videoEl.paused) this.videoEl.pause();
      } catch (_e) {}
      this.videoEl.playbackRate = baseRate;
      return;
    }

    try {
      const driftMs = Math.abs(this.videoEl.currentTime - target) * 1000;
      if (driftMs > 12 || this.videoEl.seeking) {
        if (typeof this.videoEl.fastSeek === 'function') {
          try { this.videoEl.fastSeek(target); } catch (_e) {
            this.videoEl.currentTime = target;
          }
        } else {
          this.videoEl.currentTime = target;
        }
      }
      this.videoEl.playbackRate = baseRate;
      if (playIfReady && this.videoEl.paused && this.videoEl.readyState >= 2) {
        this.videoEl.play().catch(() => {});
      }
    } catch (_e) {}
  }

  /**
   * Continuous PI phase-lock: rate nudge for small drift, soft/hard seek for larger.
   */
  public update() {
    const now = performance.now();
    const dtSec = this.lastUpdateWallMs > 0
      ? Math.min(0.25, (now - this.lastUpdateWallMs) / 1000)
      : 0.016;
    this.lastUpdateWallMs = now;

    if (this.videoEl.seeking) return;
    if (this.videoEl.readyState < 2) return;

    const baseRate = this.getAudioPlaybackRate();
    const targetVideoTimeSec = this.getTargetVideoTimeSec();

    if (targetVideoTimeSec < 0) {
      if (this.videoEl.currentTime > 0.001) {
        try { this.videoEl.currentTime = 0; } catch (_e) {}
      }
      if (!this.videoEl.paused) {
        try { this.videoEl.pause(); } catch (_e) {}
      }
      this.videoEl.playbackRate = baseRate;
      this.integralErrorSec = 0;
      return;
    }

    if (this.videoEl.paused) {
      this.videoEl.play().catch(() => {});
    }

    const currentVideoTimeSec = this.videoEl.currentTime;
    const driftSec = targetVideoTimeSec - currentVideoTimeSec;
    const driftMs = Math.abs(driftSec) * 1000;

    const pollMs = driftMs > this.DEADBAND_FINE_MS ? this.DRIFT_POLL_MS : this.LOCKED_POLL_MS;
    if (now - this.lastSyncTime < pollMs) return;
    this.lastSyncTime = now;

    const inSeekCooldown = now < this.seekCooldownUntil;

    if (!inSeekCooldown && driftMs >= this.DEADBAND_CATASTROPHIC_MS) {
      this.seekTo(targetVideoTimeSec, baseRate);
      return;
    }

    if (!inSeekCooldown && driftMs >= this.DEADBAND_SOFT_SEEK_MS) {
      this.seekTo(targetVideoTimeSec, baseRate);
      return;
    }

    if (driftMs > this.DEADBAND_FINE_MS) {
      this.integralErrorSec += driftSec * dtSec;
      this.integralErrorSec = Math.max(-0.08, Math.min(0.08, this.integralErrorSec));
      const p = driftSec * this.KP;
      const i = this.integralErrorSec * this.KI;
      const corr = Math.max(
        -this.MAX_RATE_CORR_FRAC * baseRate,
        Math.min(this.MAX_RATE_CORR_FRAC * baseRate, p + i)
      );
      this.videoEl.playbackRate = baseRate + corr;
    } else {
      this.integralErrorSec *= 0.85;
      if (Math.abs(this.videoEl.playbackRate - baseRate) > 0.0005) {
        this.videoEl.playbackRate = baseRate;
      }
    }
  }

  private seekTo(targetSec: number, baseRate: number) {
    try {
      if (typeof this.videoEl.fastSeek === 'function') {
        try { this.videoEl.fastSeek(targetSec); } catch (_e) {
          this.videoEl.currentTime = targetSec;
        }
      } else {
        this.videoEl.currentTime = targetSec;
      }
    } catch (_e) {}
    this.videoEl.playbackRate = baseRate;
    this.integralErrorSec = 0;
    this.seekCooldownUntil = performance.now() + this.SEEK_COOLDOWN_MS;
  }

  public setVideoStartTimeMs(val: number) {
    this.videoStartTimeMs = val;
  }

  public reset() {
    this.integralErrorSec = 0;
    this.lastSyncTime = 0;
    this.lastUpdateWallMs = 0;
    this.seekCooldownUntil = 0;
  }
}
