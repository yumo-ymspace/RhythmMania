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

import { assertSafeAssetUrl } from '../utils/securityLimits';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicBuffer: AudioBuffer | null = null;
  private hitsoundBuffer: AudioBuffer | null = null;
  private beatmapHitsoundBuffers = new Map<string, AudioBuffer>();
  
  // Volume controls
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  // Synchronization variables
  private startTime: number = 0; // audioContext.currentTime when absolute playback started
  private pauseTime: number = 0; // elapsed time in seconds when paused
  private isPlaying: boolean = false;
  private audioOffsetMs: number = 0; // Calibration offset
  private lastAudioTime: number = 0;
  private lastSystemTime: number = 0;
  private remainingStartDelayMs: number = 0;
  public playbackRate: number = 1.0; // Playback rate scaling coefficient (DT/HT support)
  /** When true, judgement clock subtracts measured output path latency (off by default — user audioOffset already calibrates) */
  public compensateOutputLatency: boolean = false;
  private cachedOutputLatencyMs: number = 0;
  private lastLatencySampleMs: number = 0;

  // Procedural backup synthesizer tracker
  private synthInterval: any = null;
  private proceduralBpm: number = 120;
  private proceduralTimeStart: number = 0;

  constructor() {
    // Lazy initialize to bypass auto-play restrictions on script load
  }

  public init() {
    if (this.ctx) return;
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      // Prefer interactive latency for tight hit feedback
      try {
        this.ctx = new AudioCtxClass({ latencyHint: 'interactive' });
      } catch (_e) {
        this.ctx = new AudioCtxClass();
      }
      
      this.masterGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();

      this.masterGain.connect(this.ctx.destination);
      this.musicGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      
      this.refreshOutputLatencyCache();
      this.createProceduralHitsound();
    } catch (e) {
      console.error('Failed to initialize Web Audio Context:', e instanceof Error ? e.message : String(e));
    }
  }

  private refreshOutputLatencyCache() {
    if (!this.ctx) {
      this.cachedOutputLatencyMs = 0;
      return;
    }
    const base = (this.ctx.baseLatency ?? 0) * 1000;
    // outputLatency is not on all browsers; fall back to base only
    const out = ((this.ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0) * 1000;
    this.cachedOutputLatencyMs = Math.max(0, Math.min(120, base + out));
    this.lastLatencySampleMs = performance.now();
  }

  public getOutputLatencyMs(): number {
    if (!this.ctx) return 0;
    // Re-sample occasionally — Bluetooth / device switches can change latency
    if (performance.now() - this.lastLatencySampleMs > 2000) {
      this.refreshOutputLatencyCache();
    }
    return this.cachedOutputLatencyMs;
  }

  private async ensureRunning(): Promise<void> {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (_e) {}
    }
    this.refreshOutputLatencyCache();
  }

  public setVolumes(musicVolume: number, sfxVolume: number, masterVolume = 1) {
    this.init();
    if (this.musicGain && this.sfxGain && this.masterGain) {
      this.masterGain.gain.setValueAtTime(masterVolume, this.ctx!.currentTime);
      this.musicGain.gain.setValueAtTime(musicVolume, this.ctx!.currentTime);
      this.sfxGain.gain.setValueAtTime(sfxVolume, this.ctx!.currentTime);
    }
  }

  public setOffset(offsetMs: number) {
    this.audioOffsetMs = offsetMs;
  }

  private createProceduralHitsound() {
    if (!this.ctx) return;
    // Generate a sharp, clean sound (synthesized drum rimshot/woodblock)
    const sampleRate = this.ctx.sampleRate;
    const duration = 0.08; // 80ms
    const numSamples = sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, numSamples, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      // Exponential decay pulse with frequency sweep
      const freq = 1200 * Math.exp(-t * 40);
      const val = Math.sin(2 * Math.PI * freq * t);
      const envelope = Math.exp(-t * 28);
      data[i] = val * envelope * 0.7;
    }
    this.hitsoundBuffer = buffer;
  }

  /**
   * Play the low-latency hitsound immediately
   */
  public playHitsound() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    
    // Ensure context is running (user interactions unlock it)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    if (this.hitsoundBuffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = this.hitsoundBuffer;
      source.connect(this.sfxGain);
      // Tiny schedule ahead reduces under-run clicks on some devices
      const when = this.ctx.currentTime + 0.003;
      source.start(when);
    } else {
      // Fallback synthesizer hitsound if buffer failed to create
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const t0 = this.ctx.currentTime + 0.003;
      osc.frequency.setValueAtTime(800, t0);
      osc.frequency.exponentialRampToValueAtTime(150, t0 + 0.05);
      
      gain.gain.setValueAtTime(0.4, t0);
      gain.gain.exponentialRampToValueAtTime(0.01, t0 + 0.06);
      
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t0);
      osc.stop(t0 + 0.06);
    }

  }

  public async loadBeatmapHitsounds(urls: Record<string, string>): Promise<void> {
    this.init();
    if (!this.ctx) return;
    this.beatmapHitsoundBuffers.clear();
    const entries = Object.entries(urls);
    await Promise.all(entries.map(async ([key, url]) => {
      try {
        const response = await fetch(url, { referrerPolicy: 'no-referrer' });
        if (!response.ok) return;
        const buffer = await this.ctx!.decodeAudioData(await response.arrayBuffer());
        this.beatmapHitsoundBuffers.set(key, buffer);
      } catch (error) {
        console.warn('Could not decode beatmap hitsound:', key, error instanceof Error ? error.message : String(error));
      }
    }));
  }

  public playBeatmapHitsound(hitSound = 0, customFilename?: string): void {
    const sampleKey = (customFilename || '').replace(/\.[^/.]+$/, '') || (
      hitSound & 8 ? 'normal-hitclap' :
      hitSound & 4 ? 'normal-hitfinish' :
      hitSound & 2 ? 'normal-hitwhistle' :
      'normal-hitnormal'
    );
    const buffer = this.beatmapHitsoundBuffers.get(sampleKey);
    if (!buffer) {
      this.playHitsound();
      return;
    }
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.sfxGain);
    source.start(this.ctx.currentTime + 0.003);
  }

  /**
   * Pre-load real track audio buffer from a URL, falls back to synthesized if failed
   */
  public async loadTrack(url: string, onProgress?: (p: number) => void): Promise<boolean> {
    this.init();
    if (!this.ctx) return false;

    // Use a try-catch for fetching
    try {
      if (!url || url.startsWith('syn:')) {
        throw new Error('Procedural Synth map requested');
      }

      assertSafeAssetUrl(url, 'AudioEngine loadTrack');

      onProgress?.(10);
      const isBlob = url.startsWith('blob:');
      const res = await fetch(url, isBlob ? undefined : { referrerPolicy: 'no-referrer' });
      if (!res.ok) throw new Error('CORS or Network error loading file');
      onProgress?.(40);
      
      const arrayBuf = await res.arrayBuffer();
      onProgress?.(70);
      
      this.musicBuffer = await this.ctx.decodeAudioData(arrayBuf);
      onProgress?.(100);
      return true;
    } catch (err) {
      console.warn('Could not load original audio track, creating beautiful backup synth tracker:', err instanceof Error ? err.message : String(err));
      this.musicBuffer = null;
      onProgress?.(100);
      return false; // Tells gameplay to fall back on the beautiful internal sequencer
    }
  }

  /**
   * Check if currently running in procedural backup synthesis mode
   */
  public isUsingFallback(): boolean {
    return this.musicBuffer === null;
  }

  /**
   * Pre-load file from standard Blob/File object (e.g. from Drag & Drop)
   */
  public async loadTrackFromFile(file: File): Promise<boolean> {
    this.init();
    if (!this.ctx) return false;
    try {
      const arrayBuf = await file.arrayBuffer();
      this.musicBuffer = await this.ctx.decodeAudioData(arrayBuf);
      return true;
    } catch (e) {
      console.error('Failed to parse dropped audio file:', e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  /**
   * Start song playback with offset adjustment.
   * Awaits AudioContext resume so startTime is armed on a running clock.
   */
  public play(bpm: number = 120, offsetMs: number = 0, startDelayMs: number = 0) {
    void this.playAsync(bpm, offsetMs, startDelayMs);
  }

  public async playAsync(bpm: number = 120, offsetMs: number = 0, startDelayMs: number = 0): Promise<void> {
    await this.ensureRunning();
    if (!this.ctx || this.isPlaying) return;

    this.proceduralBpm = bpm;
    this.audioOffsetMs = offsetMs;
    this.isPlaying = true;
    
    if (startDelayMs > 0) {
      this.remainingStartDelayMs = startDelayMs;
    } else if (this.pauseTime === 0 && startDelayMs === 0) {
      this.remainingStartDelayMs = 0;
    }
    
    const audioContextTime = this.ctx.currentTime;
    
    if (this.musicBuffer) {
      // Real Audio Buffer mode
      this.startTime = audioContextTime + (this.remainingStartDelayMs / 1000) / this.playbackRate;
      this.musicSource = this.ctx.createBufferSource();
      this.musicSource.buffer = this.musicBuffer;
      this.musicSource.connect(this.musicGain!);
      this.musicSource.playbackRate.value = this.playbackRate;
      
      // Start node at the previous paused position (in buffer seconds)
      this.musicSource.start(this.startTime, this.pauseTime);
    } else {
      // Procedural fallback drum & melody sequencer mode
      // Synchronized to timing clock ticks
      this.startTime = audioContextTime + (this.remainingStartDelayMs / 1000) / this.playbackRate;
      this.proceduralTimeStart = this.startTime - (this.pauseTime / this.playbackRate);
      this.startBackupSynthSequencer();
    }

    // Set high-precision clock baseline values
    this.lastAudioTime = this.ctx.currentTime;
    this.lastSystemTime = performance.now();
    this.refreshOutputLatencyCache();
  }

  public pause() {
    if (!this.isPlaying || !this.ctx) return;
    this.isPlaying = false;
    
    const audioContextTime = this.ctx.currentTime;
    
    if (audioContextTime < this.startTime) {
      // Paused during the lead-in delay period!
      this.remainingStartDelayMs = (this.startTime - audioContextTime) * this.playbackRate * 1000;
      // pauseTime remains unchanged
    } else {
      // Paused after the audio had already started playing!
      this.remainingStartDelayMs = 0;
      this.pauseTime += (audioContextTime - this.startTime) * this.playbackRate;
    }
    
    if (this.musicSource) {
      try {
        this.musicSource.stop();
      } catch (e) {}
      this.musicSource = null;
    }
    
    this.stopBackupSynthSequencer();
  }

  public setPlaybackRate(rate: number) {
    if (this.playbackRate === rate) return;
    
    // If playing, we need to precisely track elapsed time at the old rate before switching
    if (this.isPlaying && this.ctx) {
      const audioContextTime = this.ctx.currentTime;
      this.pauseTime += (audioContextTime - this.startTime) * this.playbackRate;
      this.startTime = audioContextTime; // Reset baseline for the new rate
      this.lastAudioTime = this.ctx.currentTime;
      this.lastSystemTime = performance.now();
    }
    
    this.playbackRate = rate;
    
    if (this.musicSource) {
      this.musicSource.playbackRate.value = rate;
    }
  }

  public seekTo(timeSeconds: number) {
    this.pauseTime = timeSeconds;
    this.remainingStartDelayMs = 0; // Seek cancels any remaining lead-in start delay!
    
    if (this.isPlaying && this.ctx) {
      // Stop current playback to restart it from the new seek point
      if (this.musicSource) {
        try {
          this.musicSource.stop();
        } catch (e) {}
        this.musicSource = null;
      }
      this.stopBackupSynthSequencer();
      
      const audioContextTime = this.ctx.currentTime;
      this.startTime = audioContextTime;
      this.lastAudioTime = audioContextTime;
      this.lastSystemTime = performance.now();
      
      if (this.musicBuffer) {
        this.musicSource = this.ctx.createBufferSource();
        this.musicSource.buffer = this.musicBuffer;
        this.musicSource.connect(this.musicGain!);
        this.musicSource.playbackRate.value = this.playbackRate;
        this.musicSource.start(this.startTime, this.pauseTime);
      } else {
        this.proceduralTimeStart = audioContextTime - (this.pauseTime / this.playbackRate);
        this.startBackupSynthSequencer();
      }
    }
  }

  public stop() {
    this.pause();
    this.pauseTime = 0;
    this.remainingStartDelayMs = 0;
  }

  public reset() {
    this.stop();
    this.musicBuffer = null;
    this.startTime = 0;
    this.pauseTime = 0;
    this.remainingStartDelayMs = 0;
    this.isPlaying = false;
    this.lastAudioTime = 0;
    this.lastSystemTime = 0;
  }

  public seek(posMs: number) {
    const isAlreadyPlaying = this.isPlaying;
    this.stop();
    this.pauseTime = Math.max(0, posMs / 1000);
    if (isAlreadyPlaying) {
      this.play(this.proceduralBpm, this.audioOffsetMs);
    }
  }

  /**
   * Returns current song playback elapsed time in milliseconds.
   * Master judgement clock: buffer timeline + optional output-latency compensation + user offset.
   */
  public getCurrentTimeMs(): number {
    if (!this.isPlaying || !this.ctx) {
      if (this.remainingStartDelayMs > 0) {
        return -this.remainingStartDelayMs;
      }
      return this.pauseTime * 1000;
    }
    
    const now = performance.now();
    const currentAudioTime = this.ctx.currentTime;
    
    // Smooth Web Audio step increments by checking when currentTime updates
    if (currentAudioTime !== this.lastAudioTime) {
      this.lastAudioTime = currentAudioTime;
      this.lastSystemTime = now;
    }
    
    // Linear interpolation based on high-resolution system clock since last block update
    const elapsedSinceLastUpdate = (now - this.lastSystemTime) / 1000;
    
    // Tight caps: absorb short audio-thread stalls without racing ahead at song start
    const isStartupSec = (currentAudioTime - this.startTime) < 0.75;
    const maxInterpolation = isStartupSec ? 0.064 : 0.02;
    const interpolatedAudioTime = this.lastAudioTime + Math.min(elapsedSinceLastUpdate, maxInterpolation);
    
    const currentSegmentElapsed = (interpolatedAudioTime - this.startTime) * this.playbackRate;
    const rawElapsedMs = (this.pauseTime + currentSegmentElapsed) * 1000;
    
    const latencyComp = this.compensateOutputLatency ? this.getOutputLatencyMs() : 0;
    return rawElapsedMs - this.audioOffsetMs - latencyComp;
  }

  /**
   * Generates rhythmic soundscape backing audio when native MP3 path fails or is offline
   */
  private startBackupSynthSequencer() {
    if (this.synthInterval) clearInterval(this.synthInterval);
    if (!this.ctx) return;

    const tickMs = 60000 / this.proceduralBpm / 2; // Eighth notes
    let tickCount = 0;

    // Reschedule in real-time
    this.synthInterval = setInterval(() => {
      if (!this.isPlaying || !this.ctx || !this.musicGain) return;
      
      const currentTimeMs = this.getCurrentTimeMs();
      if (currentTimeMs < 0) return; // Wait for the lead-in delay to expire!
      
      const beatProgress = (currentTimeMs / 1000) * (this.proceduralBpm / 60);
      const index = Math.floor(beatProgress * 2);

      if (index > tickCount) {
        tickCount = index;
        const subBeat = tickCount % 8;
        
        // Schedule synth notes on the audioContext clock thread to ensure jitterless rhythm
        const lookaheadSc = 0.02; // 20ms audio scheduling lookahead
        const schedTime = this.ctx.currentTime + lookaheadSc;

        // Metronome bass kick
        if (subBeat === 0 || subBeat === 4) {
          this.triggerKickDrum(schedTime);
        }
        
        // Hi hat
        if (subBeat === 2 || subBeat === 6) {
          this.triggerHiHat(schedTime);
        }
        
        // Simple melodic arp synth chord pattern (8th notes) based on current beat
        const notes = [261.63, 293.66, 329.63, 392.00, 440.00]; // Pentatonic: C4, D4, E4, G4, A4
        const noteFreq = notes[subBeat % notes.length];
        this.triggerMelodySynth(noteFreq, schedTime);
      }
    }, 20);
  }

  private stopBackupSynthSequencer() {
    if (this.synthInterval) {
      clearInterval(this.synthInterval);
      this.synthInterval = null;
    }
  }

  private triggerKickDrum(time: number) {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.frequency.setValueAtTime(120, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.15);
    
    gain.gain.setValueAtTime(0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.17);
    
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + 0.18);
  }

  private triggerHiHat(time: number) {
    if (!this.ctx || !this.musicGain) return;
    // Direct white noise blockhihat simulation
    const bufferSize = this.ctx.sampleRate * 0.04; // 40ms hi-hat duration
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7000, time);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.035);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    
    noise.start(time);
    noise.stop(time + 0.04);
  }

  private triggerMelodySynth(freq: number, time: number) {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);
    
    // Add minor lowpass envelope for that EDM "pluck" sound
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, time);
    filter.frequency.exponentialRampToValueAtTime(300, time + 0.12);
    
    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    
    osc.start(time);
    osc.stop(time + 0.16);
  }
}

// Single instance representing standard audio lifecycle
export const mainAudio = new AudioEngine();
