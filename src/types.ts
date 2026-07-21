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

  // standard specific properties
  x?: number; // 0-512
  y?: number; // 0-384
  objType?: number; // raw hitobject type bitmask
  sliderPoints?: Array<{ x: number; y: number }>;
  sliderLength?: number;
  slidesCount?: number;
}

export interface TimingControlPoint {
  timeMs: number;
  beatLength: number;
  uninherited: boolean;
  svMultiplier: number;
}

export interface BeatmapMetadata {
  title: string;
  artist: string;
  bpm: number;
  creator: string;
  difficulty: string;
  keyCount: number;
  duration: number; // in seconds
  audioUrl?: string;
  videoUrl?: string;
  videoStartTime?: number; // storyboard video start offset (in milliseconds)
  bgUrl?: string;
  id: string;
  mode?: number; // 0 for standard, 3 for mania
}

export interface Beatmap extends BeatmapMetadata {
  notes: HitObject[];
  hpDrainRate: number; // 0-10
  overallDifficulty: number; // 0-10 (affects judgement window)
  timingPoints: TimingControlPoint[];
  sliderMultiplier: number;
  baseBeatLength?: number;
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
  recordId?: string;
}

export interface ReplayFrame {
  time: number;
  keysPressed: boolean[];
}

export interface PlayHistoryRecord {
  id: string;
  timestamp: number;
  beatmapId: string;
  beatmapTitle: string;
  beatmapArtist: string;
  keyCount: number;
  score: number;
  accuracy: number;
  maxCombo: number;
  grade: string;
  isFailed: boolean;
  scoreState: ScoreState;
  replayFrames: ReplayFrame[];
  recordedSettings?: Partial<GameSettings>;
  mods?: string[];
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
  disableParticles?: boolean; // completely disable particle visual burst generator
  limitDprToOne?: boolean; // cap canvas device pixel ratio to 1x to save GPU rendering cost
  skinId?: string; // custom mania / rhythm skin identifier ('neon' | 'classic-bar' | 'circles' | 'cyberpunk' | 'emerald' | 'minimalist' | 'custom' | 'glassy-spheres' | 'hollow-rings')
  customSkinColors?: string[]; // user parsed custom colors: [blueKeyColor, whiteKeyColor, accentKeyColor, cyanKeyColor, holdNoteColor]
  customSkinName?: string;
  squareRenderStyle?: 'rhythmmania' | 'rhythmplus';
  rhythmplusColor?: string; // color for RhythmPlus style
  rhythmmaniaNoteColor?: string; // color for RhythmMania style notes
  rhythmmaniaReceptorColor?: string; // color for RhythmMania style receptors
  circleNoteColor?: string; // color for Circle style notes
  circleReceptorColor?: string; // color for Circle style receptors
  noteOpacity?: number; // 0.1 to 1.0 (opacity for note visuals)
  receptorOpacity?: number; // 0.1 to 1.0 (opacity for landline keys receptors)
  circleSize?: number; // scale multiplier for circle skin notes (0.5 to 1.5)
  noteSizeMultiplier?: number; // separate multiplier for falling notes
  playfieldStyle?: 'square' | 'circle';
  judgementOpacity?: number; // 0.0 to 1.0 (opacity for judgement text)
  judgementSize?: number; // 0.5 to 1.5 (font size scaling multiplier)
  laneSeparatorOpacity?: number; // 0.0 to 1.0 (opacity for lane divider lines)
  progressBarTop?: boolean; // progress bar position setting (top vs bottom)
  playfieldWidthPercent?: number; // width of lanes as percent of screen width (33 to 50)
  selectedMods?: string[]; // list of active gameplay modifiers (e.g., 'NF', 'HD', 'HR', 'DT')
  bindPause?: string; // gameplay pause/resume keybind
  bindRetry?: string; // gameplay quick retry keybind
  renderEngine?: 'canvas' | 'pixi';
  enableMapSV?: boolean;
}

export type GameScreen = 'menu' | 'select' | 'play' | 'results' | 'settings' | 'calibrate' | 'history';

declare global {
  const __APP_VERSION__: string;
  const __BUILD_TIME__: string;
}
