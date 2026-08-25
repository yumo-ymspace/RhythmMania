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

import type { ReactNode } from 'react';
import {
  Gamepad2,
  Keyboard,
  Monitor,
  SlidersHorizontal,
  Volume2,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { GameSettings } from '../../types';
import {
  DEFAULT_SETTINGS,
  PLAYFIELD_WIDTH_MAX,
  PLAYFIELD_WIDTH_MIN,
  SCROLL_SPEED_MAX,
  SCROLL_SPEED_MIN,
} from './defaultSettings';
import BindingMatrix from './BindingMatrix';

export type SectionId =
  | 'general' | 'graphics' | 'gameplay' | 'audio' | 'input' | 'maintenance';

export interface SectionDef {
  id: SectionId;
  label: string;
  description: string;
  icon: LucideIcon;
  showWhen?: (s: GameSettings) => boolean;
}

export const SECTIONS: SectionDef[] = [
  { id: 'general',     label: 'General',     description: 'Account-agnostic preferences for the client.', icon: SlidersHorizontal },
  { id: 'graphics',    label: 'Graphics',    description: 'Display, video, particles, and pixel ratio.',        icon: Monitor },
  { id: 'gameplay',    label: 'Gameplay',    description: 'Scroll speed, scroll direction, and timing.',      icon: Gamepad2 },
  { id: 'audio',       label: 'Audio',       description: 'Volumes and the universal audio offset.',          icon: Volume2 },
  { id: 'input',       label: 'Input',       description: 'Keyboard bindings per key count.',                 icon: Keyboard },
  { id: 'maintenance', label: 'Maintenance', description: 'Reset to defaults and other global actions.',      icon: Wrench },
];

export type Control =
  | { kind: 'slider';    min: number; max: number; step: number; suffix?: string; format?: (v: number) => string }
  | { kind: 'toggle' }
  | { kind: 'select';    options: { value: string; label: string }[] }
  | { kind: 'button';    label: string; action: 'openWizard' | 'restoreAll' }
  | { kind: 'color-grid';keys: { index: number; label: string; desc: string }[] }
  | { kind: 'custom';    render: (api: RowApi) => ReactNode };

export interface RowApi {
  settings: GameSettings;
  update: (patch: Partial<GameSettings>) => void;
  resetRow: (id: string) => void;
  isChanged: boolean;
  openWizard: () => void;
}

export interface RowDef {
  id: string;
  section: SectionId;
  label: string;
  description: string;
  control: Control;
  defaultValue: unknown;
  keywords?: string[];            // extra terms matched by search
  showWhen?: (s: GameSettings) => boolean;
}

const pct  = (v: number) => `${Math.round(v * 100)}%`;
const num  = (v: number, s?: string) => `${v}${s ?? ''}`;
const ms   = (v: number) => `${v}ms`;

export const ROWS: RowDef[] = [
  // ── GENERAL ───────────────────────────────────────────────────────────
  {
    id: 'progressBarTop', section: 'general', label: 'Progress bar position',
    description: 'Show the song progress bar at the top of the screen instead of the bottom.',
    control: { kind: 'select', options: [
      { value: 'false', label: 'Bottom' },
      { value: 'true',  label: 'Top' },
    ]},
    defaultValue: DEFAULT_SETTINGS.progressBarTop,
    keywords: ['progress', 'bar', 'song'],
  },
  {
    id: 'enableSongPreview', section: 'general', label: 'Song preview audio',
    description: 'Play a preview of the song when selecting it on the Song Select screen.',
    control: { kind: 'toggle' },
    defaultValue: DEFAULT_SETTINGS.enableSongPreview,
    keywords: ['preview', 'song', 'select', 'music', 'listen'],
  },

  // ── GRAPHICS ──────────────────────────────────────────────────────────
  {
    id: 'playfieldWidthPercent', section: 'graphics', label: 'Playfield width',
    description: 'How wide the lanes are, as a percentage of the screen width.',
    control: { kind: 'slider', min: PLAYFIELD_WIDTH_MIN, max: PLAYFIELD_WIDTH_MAX, step: 1, suffix: '%' },
    defaultValue: DEFAULT_SETTINGS.playfieldWidthPercent,
  },
  {
    id: 'backgroundDim', section: 'graphics', label: 'Gameplay Background Dim',
    description: 'How much to dim the background while playing.',
    control: { kind: 'slider', min: 0, max: 1, step: 0.05, format: pct },
    defaultValue: DEFAULT_SETTINGS.backgroundDim,
    keywords: ['gameplay', 'background', 'dim', 'play', 'shield', 'darken', 'opacity'],
  },
  {
    id: 'menuBackgroundDim', section: 'graphics', label: 'Menus Background Dim',
    description: 'How much to darken the background picture across the menus and selection screens.',
    control: { kind: 'slider', min: 0, max: 1, step: 0.05, format: pct },
    defaultValue: DEFAULT_SETTINGS.menuBackgroundDim,
    keywords: ['menu', 'menus', 'background', 'song', 'select', 'replay', 'history', 'artwork', 'dim', 'darken', 'brightness', 'opacity'],
  },
  {
    id: 'disableVideo', section: 'graphics', label: 'Disable background video',
    description: 'Enable or disable the beatmap background video entirely.',
    control: { kind: 'toggle' },
    defaultValue: DEFAULT_SETTINGS.disableVideo,
  },
  {
    id: 'videoOffset', section: 'graphics', label: 'Video offset',
    description: 'Shift the video forward (+) or backward (-) in milliseconds.',
    control: { kind: 'slider', min: -500, max: 500, step: 10, format: ms },
    defaultValue: DEFAULT_SETTINGS.videoOffset,
    showWhen: (s) => !s.disableVideo,
  },
  {
    id: 'disableParticles', section: 'graphics', label: 'Disable hit particles',
    description: 'Completely turn off burst effects on hits to save GPU performance.',
    control: { kind: 'toggle' },
    defaultValue: DEFAULT_SETTINGS.disableParticles,
  },
  {
    id: 'disableLaneShake', section: 'graphics', label: 'Disable lane shake',
    description: 'Turn off lane vibration when hitting marvelous judgements.',
    control: { kind: 'toggle' },
    defaultValue: DEFAULT_SETTINGS.disableLaneShake,
    keywords: ['shake', 'vibration', 'marvelous', 'lane', 'screen'],
  },
  {
    id: 'showFpsCounter', section: 'graphics', label: 'Show FPS counter',
    description: 'Display a small frames-per-second readout in the corner during gameplay.',
    control: { kind: 'toggle' },
    defaultValue: DEFAULT_SETTINGS.showFpsCounter,
    keywords: ['fps', 'frames', 'performance', 'counter'],
  },
  {
    id: 'babylonFloor', section: 'graphics', label: 'Runway floor',
    description: 'Show the dark matte runway floor beneath the lanes.',
    control: { kind: 'toggle' },
    defaultValue: DEFAULT_SETTINGS.babylonFloor,
    showWhen: (s) => s.renderEngine === 'babylon',
    keywords: ['babylon', 'floor', 'runway', 'matte', '3d'],
  },
  // ── GAMEPLAY ──────────────────────────────────────────────────────────
  {
    id: 'scrollSpeed', section: 'gameplay', label: 'Scroll speed',
    description: 'How fast notes travel down the lanes. Higher = faster.',
    control: { kind: 'slider', min: SCROLL_SPEED_MIN, max: SCROLL_SPEED_MAX, step: 1, format: num },
    defaultValue: DEFAULT_SETTINGS.scrollSpeed,
  },
  {
    id: 'upsurfaceNoteMode', section: 'gameplay', label: 'Scroll direction',
    description: 'If on, notes move up from below instead of falling from above. Disabled when Babylon.js 3D is the active renderer.',
    control: { kind: 'select', options: [
      { value: 'false', label: 'Down (default)' },
      { value: 'true',  label: 'Up' },
    ]},
    defaultValue: DEFAULT_SETTINGS.upsurfaceNoteMode,
    showWhen: (s) => s.renderEngine !== 'babylon',
  },
  {
    id: 'visualOffset', section: 'gameplay', label: 'Visual offset',
    description: 'Shift visual notes forward (+) or backward (-) in milliseconds.',
    control: { kind: 'slider', min: -300, max: 300, step: 5, format: ms },
    defaultValue: DEFAULT_SETTINGS.visualOffset,
  },
  {
    id: 'enableMapSV', section: 'gameplay', label: 'Map scroll velocity (SV)',
    description: 'Apply beatmap SV/BPM scroll changes. Off = constant scroll speed.',
    control: { kind: 'toggle' },
    defaultValue: DEFAULT_SETTINGS.enableMapSV,
    keywords: ['sv', 'scroll', 'velocity', 'bpm', 'speed'],
  },

  // ── AUDIO ─────────────────────────────────────────────────────────────
  {
    id: 'musicVolume', section: 'audio', label: 'Music volume',
    description: 'Volume of the playing track before the master volume.',
    control: { kind: 'slider', min: 0, max: 1, step: 0.05, format: pct },
    defaultValue: DEFAULT_SETTINGS.musicVolume,
  },
  {
    id: 'previewVolume', section: 'audio', label: 'Song preview volume',
    description: 'Volume multiplier for Song Select previews. Default is 70% of music volume.',
    control: { kind: 'slider', min: 0, max: 1, step: 0.05, format: pct },
    defaultValue: DEFAULT_SETTINGS.previewVolume,
  },
  {
    id: 'masterVolume', section: 'audio', label: 'Master volume',
    description: 'Overall volume applied to music and hitsounds during gameplay.',
    control: { kind: 'slider', min: 0, max: 1, step: 0.05, format: pct },
    defaultValue: DEFAULT_SETTINGS.masterVolume,
  },
  {
    id: 'hitsoundVolume', section: 'audio', label: 'Hitsound volume',
    description: 'Volume of the system hitsounds on note hits.',
    control: { kind: 'slider', min: 0, max: 1, step: 0.05, format: pct },
    defaultValue: DEFAULT_SETTINGS.hitsoundVolume,
  },
  {
    id: 'audioOffset', section: 'audio', label: 'Universal audio offset',
    description: 'Milliseconds added to every beatmap. Use the wizard to find your value.',
    control: { kind: 'slider', min: -300, max: 300, step: 5, format: ms },
    defaultValue: DEFAULT_SETTINGS.audioOffset,
  },
  {
    id: 'offsetWizard', section: 'audio', label: 'Offset wizard',
    description: 'Tap along with a metronome to measure your audio latency.',
    control: { kind: 'button', label: 'Open wizard', action: 'openWizard' },
    defaultValue: null,
  },

  // ── INPUT ─────────────────────────────────────────────────────────────
  {
    id: 'bindings', section: 'input', label: '',
    description: '',
    control: { kind: 'custom', render: (api) => <BindingMatrix {...api} /> },
    defaultValue: DEFAULT_SETTINGS.bindings,
  },

  // ── MAINTENANCE ───────────────────────────────────────────────────────
  {
    id: 'restoreDefaults', section: 'maintenance', label: 'Restore all defaults',
    description: 'Reset every setting on this page to its default value.',
    control: { kind: 'button', label: 'Restore', action: 'restoreAll' },
    defaultValue: null,
  },
];
