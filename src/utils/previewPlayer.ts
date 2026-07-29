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

/**
 * Lightweight HTMLAudio-based song preview for the Song Select screen.
 * Intentionally independent of the gameplay AudioEngine so previews never
 * disturb the Web Audio gameplay clock.
 */

class PreviewPlayer {
  private audio: HTMLAudioElement | null = null;
  private src: string | null = null;
  private trackId: string | null = null;
  private previewStartSec = 0;
  private targetVolume = 0;
  private fadeTimer: number | null = null;

  private clearFade(): void {
    if (this.fadeTimer !== null) {
      window.clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  private fadeTo(target: number, durationMs: number, onDone?: () => void): void {
    this.clearFade();
    const a = this.audio;
    if (!a) { onDone?.(); return; }
    const start = a.volume;
    const steps = Math.max(1, Math.round(durationMs / 50));
    let i = 0;
    this.fadeTimer = window.setInterval(() => {
      i++;
      const t = Math.min(1, i / steps);
      if (this.audio) {
        this.audio.volume = Math.max(0, Math.min(1, start + (target - start) * t));
      }
      if (i >= steps) {
        this.clearFade();
        onDone?.();
      }
    }, 50);
  }

  private releaseElement(a: HTMLAudioElement): void {
    try { a.pause(); } catch { /* noop */ }
    a.removeAttribute('src');
    try { a.load(); } catch { /* noop */ }
  }

  /** Start (or continue) previewing a track. Safe to call repeatedly with the same src/trackId. */
  public play(src: string, previewTimeMs: number, volume: number, trackId?: string): void {
    if (!src) return;
    this.targetVolume = volume;

    if (this.audio && this.src === src) {
      this.fadeTo(volume, 200);
      this.audio.play().catch(() => { /* autoplay blocked */ });
      return;
    }

    if (this.audio) {
      this.releaseElement(this.audio);
      this.audio = null;
      this.src = null;
      this.trackId = null;
    }
    this.clearFade();

    const a = new Audio();
    a.preload = 'auto';
    a.volume = 0;
    this.audio = a;
    this.src = src;
    this.trackId = trackId ?? null;

    const begin = () => {
      if (this.audio !== a) return;
      let start = Math.max(0, previewTimeMs / 1000);
      const dur = a.duration;
      if (Number.isFinite(dur) && dur > 0) {
        if (start <= 0 || start >= dur - 1) start = dur * 0.4;
      } else if (!Number.isFinite(start)) {
        start = 0;
      }
      this.previewStartSec = start;
      try { a.currentTime = start; } catch { /* noop */ }
      a.play()
        .then(() => { if (this.audio === a) this.fadeTo(this.targetVolume, 600); })
        .catch(() => { /* autoplay blocked */ });
    };

    a.addEventListener('loadedmetadata', begin, { once: true });
    a.addEventListener('ended', () => {
      if (this.audio !== a) return;
      try { a.currentTime = this.previewStartSec; } catch { /* noop */ }
      a.play().catch(() => { /* noop */ });
    });
    a.addEventListener('error', () => {
      if (this.audio !== a) return;
      this.releaseElement(a);
      this.audio = null;
      this.src = null;
      this.trackId = null;
    });
    a.src = src;
    if (a.readyState >= 1) begin();
  }

  public setVolume(volume: number): void {
    this.targetVolume = volume;
    if (this.audio && !this.audio.paused) this.fadeTo(volume, 150);
  }

  /** Fade out and release the current preview. */
  public stop(): void {
    const a = this.audio;
    if (!a) return;
    this.fadeTo(0, 300, () => {
      this.releaseElement(a);
      if (this.audio === a) {
        this.audio = null;
        this.src = null;
        this.trackId = null;
      }
    });
  }
}

export const previewPlayer = new PreviewPlayer();
