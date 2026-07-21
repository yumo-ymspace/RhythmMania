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
import type { GameSettings } from '../../types';
import { DEFAULT_SETTINGS } from './defaultSettings';
import BindingMatrix from './BindingMatrix';
import SectionSkinPreview from './SectionSkinPreview';

export type SectionId =
  | 'general' | 'graphics' | 'gameplay' | 'audio' | 'skin' | 'input' | 'maintenance';

export interface SectionDef {
  id: SectionId;
  label: string;
  description: string;
  icon: string;   // Lucide icon name resolved by SettingsSidebar
}

export const SECTIONS: SectionDef[] = [
  { id: 'general',     label: 'General',     description: 'Account-agnostic preferences for the client.', icon: 'SlidersHorizontal' },
  { id: 'graphics',    label: 'Graphics',    description: 'Rendering, video, particles, and pixel ratio.',     icon: 'Monitor' },
  { id: 'gameplay',    label: 'Gameplay',    description: 'Scroll speed, scroll direction, and timing.',      icon: 'Gamepad2' },
  { id: 'audio',       label: 'Audio',       description: 'Volumes and the universal audio offset.',          icon: 'Volume2' },
  { id: 'skin',        label: 'Skin',        description: 'Receptor shape, note style, and custom palette.',  icon: 'Palette' },
  { id: 'input',       label: 'Input',       description: 'Keyboard bindings per key count.',                 icon: 'Keyboard' },
  { id: 'maintenance', label: 'Maintenance', description: 'Reset to defaults and other global actions.',      icon: 'Wrench' },
];

export type Control =
  | { kind: 'slider';    min: number; max: number; step: number; suffix?: string; format?: (v: number) => string }
  | { kind: 'toggle' }
  | { kind: 'select';    options: { value: string; label: string }[] }
  | { kind: 'button';    label: string; action: 'openWizard' | 'restoreAll' | 'openSkin' }
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
  id: string;                     // stable id, also keyof GameSettings for value rows
  section: SectionId;
  label: string;
  description: string;
  control: Control;
  defaultValue: unknown;
  keywords?: string[];            // extra terms matched by search
  showWhen?: (s: GameSettings) => boolean;
}

// Reusable option lists
const SKIN_OPTIONS = [
  { value: 'neon',           label: 'Neon Cyber' },
  { value: 'classic-bar',    label: 'DDR Retro Bar' },
  { value: 'cyberpunk',      label: 'Vaporwave Neon' },
  { value: 'emerald',        label: 'Acid Emerald' },
  { value: 'minimalist',     label: 'Monochrome' },
  { value: 'circles',        label: 'Circular Mode' },
  { value: 'glassy-spheres', label: 'Glassy 3D Spheres' },
  { value: 'hollow-rings',   label: 'Hollow Rings' },
  { value: 'custom',         label: 'Custom Skin' },
];

const NOTE_STYLE_OPTIONS = [
  { value: 'rounded', label: 'Rounded rectangle' },
  { value: 'square',  label: 'Sharp square' },
  { value: 'circle',  label: 'Classic circle' },
  { value: 'pill',    label: 'Elastic pill' },
];

const RECEPTOR_STYLE_OPTIONS = [
  { value: 'tactile',     label: 'Tactile glass' },
  { value: 'square',      label: 'Sharp square' },
  { value: 'minimal',     label: 'Piano segment' },
  { value: 'translucent', label: 'Transparent glow' },
];

const CIRCLE_RENDER_OPTIONS = [
  { value: 'circles',        label: 'Classic' },
  { value: 'glassy-spheres', label: 'Glassy 3D' },
  { value: 'hollow-rings',   label: 'Hollow rings' },
];

const CUSTOM_PALETTE_KEYS = [
  { index: 0, label: 'Side keys',  desc: 'Outer lanes' },
  { index: 1, label: 'Main keys',  desc: 'Standard lanes' },
  { index: 2, label: 'Center key', desc: 'Middle column' },
  { index: 3, label: 'Special key',desc: '8K unique lane' },
  { index: 4, label: 'Hold trail', desc: 'Hold note body' },
];

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

  // ── GRAPHICS ──────────────────────────────────────────────────────────
  {
    id: 'playfieldWidthPercent', section: 'graphics', label: 'Playfield width',
    description: 'How wide the lanes are, as a percentage of the screen width.',
    control: { kind: 'slider', min: 20, max: 50, step: 1, suffix: '%' },
    defaultValue: DEFAULT_SETTINGS.playfieldWidthPercent,
  },
  {
    id: 'backgroundDim', section: 'graphics', label: 'Background dim',
    description: 'How much to dim the background while playing.',
    control: { kind: 'slider', min: 0, max: 1, step: 0.05, format: pct },
    defaultValue: DEFAULT_SETTINGS.backgroundDim,
  },
  {
    id: 'disableVideo', section: 'graphics', label: 'Disable background video',
    description: 'Enable or disable the beatmap background video entirely.',
    control: { kind: 'toggle' },
    defaultValue: DEFAULT_SETTINGS.disableVideo,
  },
  {
    id: 'videoOpacity', section: 'graphics', label: 'Video opacity',
    description: 'Opacity of the background video, when enabled.',
    control: { kind: 'slider', min: 0, max: 1, step: 0.05, format: pct },
    defaultValue: DEFAULT_SETTINGS.videoOpacity,
    showWhen: (s) => !s.disableVideo,
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
    id: 'limitDprToOne', section: 'graphics', label: 'Cap pixel ratio',
    description: 'Limit the canvas to 1× device pixels. Big perf win on HiDPI displays.',
    control: { kind: 'toggle' },
    defaultValue: DEFAULT_SETTINGS.limitDprToOne,
  },
  {
    id: 'renderEngine', section: 'graphics', label: 'Rendering engine',
    description: 'Choose the gameplay rendering engine. PixiJS v8 offers high-performance WebGL rendering.',
    control: { kind: 'select', options: [
      { value: 'canvas', label: 'Canvas 2D' },
      { value: 'pixi',  label: 'PixiJS v8' },
    ]},
    defaultValue: DEFAULT_SETTINGS.renderEngine || 'canvas',
    keywords: ['renderer', 'engine', 'pixi', 'canvas', 'graphics', 'webgl'],
  },

  // ── GAMEPLAY ──────────────────────────────────────────────────────────
  {
    id: 'scrollSpeed', section: 'gameplay', label: 'Scroll speed',
    description: 'How fast notes travel down the lanes. Higher = faster.',
    control: { kind: 'slider', min: 5, max: 80, step: 1, format: num },
    defaultValue: DEFAULT_SETTINGS.scrollSpeed,
  },
  {
    id: 'upsurfaceNoteMode', section: 'gameplay', label: 'Scroll direction',
    description: 'If on, notes move up from below instead of falling from above.',
    control: { kind: 'select', options: [
      { value: 'false', label: 'Down (default)' },
      { value: 'true',  label: 'Up' },
    ]},
    defaultValue: DEFAULT_SETTINGS.upsurfaceNoteMode,
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
    description: 'Master volume for the playing track.',
    control: { kind: 'slider', min: 0, max: 1, step: 0.05, format: pct },
    defaultValue: DEFAULT_SETTINGS.musicVolume,
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

  // ── SKIN ──────────────────────────────────────────────────────────────
  {
    id: 'skinPreview', section: 'skin', label: 'Live preview',
    description: 'A miniature playfield that reflects the current skin settings.',
    control: { kind: 'custom', render: (api) => <SectionSkinPreview {...api} /> },
    defaultValue: null,
  },
  {
    id: 'playfieldStyle', section: 'skin', label: 'Skin',
    description: 'Pick the shape of the notes and receptors.',
    control: { kind: 'select', options: [
      { value: 'square',  label: 'Rectangular' },
      { value: 'circle',  label: 'Circular' },
    ]},
    defaultValue: DEFAULT_SETTINGS.playfieldStyle,
  },
  {
    id: 'squareRenderStyle', section: 'skin', label: 'Note and Receptor Style',
    description: 'Visual treatment for rectangular playfields.',
    control: { kind: 'select', options: [
      { value: 'rhythmmania', label: 'RhythmMania Style' },
      { value: 'rhythmplus', label: 'RhythmPlus Style' },
    ] },
    defaultValue: DEFAULT_SETTINGS.squareRenderStyle,
    showWhen: (s) => s.playfieldStyle === 'square',
  },
  {
    id: 'rhythmmaniaNoteColor', section: 'skin', label: 'RhythmMania Note Color',
    description: 'Color of the notes when using RhythmMania style.',
    control: { kind: 'custom', render: (api) => (
      <input 
        type="color" 
        value={api.settings.rhythmmaniaNoteColor || '#00b0ff'}
        onChange={(e) => api.update({ rhythmmaniaNoteColor: e.target.value })}
        className="w-10 h-10 rounded cursor-pointer bg-slate-800 border-none outline-none focus:ring-2 focus:ring-cyan-500"
      />
    )},
    defaultValue: DEFAULT_SETTINGS.rhythmmaniaNoteColor,
    showWhen: (s) => s.playfieldStyle === 'square' && s.squareRenderStyle === 'rhythmmania',
  },
  {
    id: 'rhythmmaniaReceptorColor', section: 'skin', label: 'RhythmMania Receptor Color',
    description: 'Color of the receptors when using RhythmMania style.',
    control: { kind: 'custom', render: (api) => (
      <input 
        type="color" 
        value={api.settings.rhythmmaniaReceptorColor || '#00b0ff'}
        onChange={(e) => api.update({ rhythmmaniaReceptorColor: e.target.value })}
        className="w-10 h-10 rounded cursor-pointer bg-slate-800 border-none outline-none focus:ring-2 focus:ring-cyan-500"
      />
    )},
    defaultValue: DEFAULT_SETTINGS.rhythmmaniaReceptorColor,
    showWhen: (s) => s.playfieldStyle === 'square' && s.squareRenderStyle === 'rhythmmania',
  },
  {
    id: 'rhythmplusColor', section: 'skin', label: 'RhythmPlus Note Color',
    description: 'Color of the notes when using RhythmPlus style.',
    control: { kind: 'custom', render: (api) => (
      <input 
        type="color" 
        value={api.settings.rhythmplusColor || '#ffff00'}
        onChange={(e) => api.update({ rhythmplusColor: e.target.value })}
        className="w-10 h-10 rounded cursor-pointer bg-slate-800 border-none outline-none focus:ring-2 focus:ring-cyan-500"
      />
    )},
    defaultValue: DEFAULT_SETTINGS.rhythmplusColor,
    showWhen: (s) => s.playfieldStyle === 'square' && s.squareRenderStyle === 'rhythmplus',
  },
  {
    id: 'circleNoteColor', section: 'skin', label: 'Circle Note Color',
    description: 'Color of the notes when using Circle style.',
    control: { kind: 'custom', render: (api) => (
      <input 
        type="color" 
        value={api.settings.circleNoteColor || '#00b0ff'}
        onChange={(e) => api.update({ circleNoteColor: e.target.value })}
        className="w-10 h-10 rounded cursor-pointer bg-slate-800 border-none outline-none focus:ring-2 focus:ring-cyan-500"
      />
    )},
    defaultValue: DEFAULT_SETTINGS.circleNoteColor,
    showWhen: (s) => s.playfieldStyle === 'circle',
  },
  {
    id: 'circleReceptorColor', section: 'skin', label: 'Circle Receptor Color',
    description: 'Color of the receptors when using Circle style.',
    control: { kind: 'custom', render: (api) => (
      <input 
        type="color" 
        value={api.settings.circleReceptorColor || '#00b0ff'}
        onChange={(e) => api.update({ circleReceptorColor: e.target.value })}
        className="w-10 h-10 rounded cursor-pointer bg-slate-800 border-none outline-none focus:ring-2 focus:ring-cyan-500"
      />
    )},
    defaultValue: DEFAULT_SETTINGS.circleReceptorColor,
    showWhen: (s) => s.playfieldStyle === 'circle',
  },
  {
    id: 'circleSize', section: 'skin', label: 'Receptor size',
    description: 'Scale circular receptors up or down.',
    control: { kind: 'slider', min: 0.5, max: 1.5, step: 0.05, format: pct },
    defaultValue: DEFAULT_SETTINGS.circleSize,
    showWhen: (s) => s.playfieldStyle === 'circle',
  },
  {
    id: 'noteSizeMultiplier', section: 'skin', label: 'Note size',
    description: 'Scale falling notes up or down.',
    control: { kind: 'slider', min: 0.5, max: 1.5, step: 0.05, format: pct },
    defaultValue: DEFAULT_SETTINGS.noteSizeMultiplier,
    showWhen: (s) => s.playfieldStyle === 'circle',
  },
  {
    id: 'noteOpacity', section: 'skin', label: 'Note opacity',
    description: 'Opacity of the falling notes.',
    control: { kind: 'slider', min: 0.1, max: 1, step: 0.05, format: pct },
    defaultValue: DEFAULT_SETTINGS.noteOpacity,
  },
  {
    id: 'receptorOpacity', section: 'skin', label: 'Receptor opacity',
    description: 'Opacity of the receptors.',
    control: { kind: 'slider', min: 0.1, max: 1, step: 0.05, format: pct },
    defaultValue: DEFAULT_SETTINGS.receptorOpacity,
  },
  {
    id: 'judgementOpacity', section: 'skin', label: 'Judgement text opacity',
    description: 'How visible the “PERFECT”, “GREAT” etc. text is.',
    control: { kind: 'slider', min: 0, max: 1, step: 0.05, format: pct },
    defaultValue: DEFAULT_SETTINGS.judgementOpacity,
  },
  {
    id: 'judgementSize', section: 'skin', label: 'Judgement text size',
    description: 'Scale the judgement text up or down.',
    control: { kind: 'slider', min: 0.5, max: 1.5, step: 0.05, format: pct },
    defaultValue: DEFAULT_SETTINGS.judgementSize,
  },
  {
    id: 'laneSeparatorOpacity', section: 'skin', label: 'Lane separator opacity',
    description: 'How visible the lane divider lines are.',
    control: { kind: 'slider', min: 0, max: 1, step: 0.05, format: pct },
    defaultValue: DEFAULT_SETTINGS.laneSeparatorOpacity,
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
