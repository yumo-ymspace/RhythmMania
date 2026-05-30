/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type NoteType = 'normal' | 'hold';

export interface HitObject {
  id: string;
  time: number; // in milliseconds
  column: number;
  type: NoteType;
  endTime?: number; // for hold notes (in milliseconds)
  
  // Gameplay state trackers
  hitTime?: number;    // timestamp when hit
  releaseTime?: number; // timestamp when released (for hold notes)
  isHit: boolean;
  isReleased: boolean;
  isMissed: boolean;
  isHoldFailed: boolean; // if released early
  releaseGraceUntil?: number; // For brief key-bounces / re-keying
}

export interface BeatmapMetadata {
  title: string;
  artist: string;
  bpm: number;
  creator: string;
  difficulty: string;
  stars: number;
  keyCount: number;
  duration: number; // in seconds
  audioUrl?: string;
  videoUrl?: string;
  videoStartTime?: number; // storyboard video start offset (in milliseconds)
  bgUrl?: string;
  id: string;
}

export interface Beatmap extends BeatmapMetadata {
  notes: HitObject[];
  hpDrainRate: number; // 0-10
  overallDifficulty: number; // 0-10 (affects judgement window)
}

export type JudgementType = 'marvelous' | 'perfect' | 'great' | 'good' | 'bad' | 'miss';

export interface JudgementWindow {
  type: JudgementType;
  name: string;
  windowMs: number;
  baseScore: number;
  hpDelta: number;
  color: string;
  glowColor: string;
}

export interface ScoreState {
  score: number;
  combo: number;
  maxCombo: number;
  hp: number; // 0 to 100
  perfectCount: number;
  marvelousCount: number;
  greatCount: number;
  goodCount: number;
  badCount: number;
  missCount: number;
  accuracy: number;
  completed: boolean;
  failed: boolean;
}

export interface ReplayFrame {
  time: number;
  keysPressed: boolean[];
}

export interface KeyBindings {
  [keys: number]: string[]; // maps column counts (4, 5, 6, 7) to key arrays (e.g. ['d', 'f', 'j', 'k'])
}

export interface GameSettings {
  scrollSpeed: number; // multiplier or speed factor (e.g., 20)
  audioOffset: number; // in milliseconds (positive means audio is delayed)
  visualOffset: number; // in milliseconds (positive means visual notes are delayed)
  hitsoundVolume: number; // 0 to 1
  musicVolume: number; // 0 to 1
  keyMode: number; // 4, 5, 6, 7
  bindings: KeyBindings;
  upsurfaceNoteMode: boolean; // whether notes scroll upwards rather than downwards
  videoOpacity: number; // background video opacity (0 to 1)
  backgroundDim: number; // solid-black lane background shielding opacity (0 to 1)
  disableVideo?: boolean; // whether background video playback is completely disabled
  videoOffset?: number; // manual user adjuster for video playback delay (milliseconds)
}

export type GameScreen = 'menu' | 'select' | 'play' | 'results' | 'settings' | 'calibrate';

declare global {
  const __APP_VERSION__: string;
  const __BUILD_TIME__: string;
}
