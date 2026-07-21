/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 */

import { GameSettings, HitObject, JudgementWindow } from '../types';

export interface ColumnLayout {
  x: number;
  width: number;
  color: string;
  pressed: boolean;
  glow: number;
}

export interface VisibleNote {
  id: string;
  column: number;
  type: 'normal' | 'hold';
  time: number;
  endTime?: number;
  isHit: boolean;
  isReleased: boolean;
  isMissed: boolean;
  isHoldFailed: boolean;
  releaseGraceUntil?: number;
  y: number;
  endY?: number;
  opacity: number;
  endOpacity?: number;
  styleKey: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
}

export interface HitErrorTick {
  id: string;
  error: number;
  timestamp: number;
  color: string;
}

export interface PlayfieldVisualSettings {
  upsurfaceNoteMode: boolean;
  scrollSpeed: number;
  audioOffset: number;
  visualOffset: number;
  skinId?: string;
  customSkinColors?: string[];
  squareRenderStyle?: 'rhythmmania' | 'rhythmplus';
  rhythmplusColor?: string;
  rhythmmaniaNoteColor?: string;
  rhythmmaniaReceptorColor?: string;
  circleNoteColor?: string;
  circleReceptorColor?: string;
  noteOpacity?: number;
  receptorOpacity?: number;
  circleSize?: number;
  noteSizeMultiplier?: number;
  playfieldStyle?: 'square' | 'circle';
  laneSeparatorOpacity?: number;
  selectedMods?: string[];
  backgroundDim?: number;
  disableParticles?: boolean;
  enableMapSV?: boolean;
}

export interface PlayfieldFrame {
  width: number;
  height: number;
  timeMs: number;
  receptorY: number;
  columns: ColumnLayout[];
  notes: VisibleNote[];
  particles: Particle[];
  hitErrorTicks: HitErrorTick[];
  hitErrorAvgMs: number | null;
  shake: number;
  settingsSlice: PlayfieldVisualSettings;
  showKeyLabels: boolean;
  keyLabels: string[];
  isFocusMode: boolean;
  isMobile: boolean;
}

export interface ResolvedSkin {
  isCircleMode: boolean;
  colors: {
    blue: string;
    white: string;
    accent: string;
    cyan: string;
  };
  customHoldColor: string;
}

export interface InitOpts {
  settings: GameSettings;
  keyCount: number;
}

export interface IPlayfieldRenderer {
  init(canvas: HTMLCanvasElement, opts: InitOpts): Promise<void>;
  resize(width: number, height: number, dpr: number): void;
  render(frame: PlayfieldFrame): void;
  destroy(): void;
}
