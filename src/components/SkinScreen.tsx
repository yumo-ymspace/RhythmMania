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

import React, { useState } from 'react';
import { ArrowLeft, Check, Paintbrush, RotateCcw, Search, X } from 'lucide-react';
import type { GameSettings } from '../types';
import { isAtDefault, DEFAULT_SETTINGS } from './settings/defaultSettings';
import SettingsSlider from './settings/controls/SettingsSlider';
import LaneColorEditor from './settings/LaneColorEditor';

type SkinStyleId = 'rhythmmania' | 'rhythmmania-3d' | 'rhythmplus' | 'rhythmplus-dynamic' | 'circle';

type SkinStyle = {
  id: SkinStyleId;
  label: string;
  description: string;
  previewImage: string;
};

const SKIN_STYLES: SkinStyle[] = [
  {
    id: 'rhythmmania',
    label: 'RhythmMania Style Rectangular',
    description: 'Glowing rectangular notes with a full-height lane treatment.',
    previewImage: '/skin/rhythmmania-style-rectangular.png',
  },
  {
    id: 'rhythmmania-3d',
    label: 'RhythmMania 3D Style Rectangular',
    description: 'A converging Babylon.js runway with glowing rectangular notes.',
    previewImage: '/skin/rhythmmania-3d-style-rectangular.png',
  },
  {
    id: 'rhythmplus',
    label: 'RhythmPlus Classic Style Rectangular',
    description: 'Slim classic bars with a clean, compact playfield read.',
    previewImage: '/skin/rhythmplus-classic-style-rectangular.png',
  },
  {
    id: 'rhythmplus-dynamic',
    label: 'RhythmPlus Dynamic Style Rectangular',
    description: 'Tall hold blocks and bright timing bars for a more active read.',
    previewImage: '/skin/rhythmplus-dynamic-style-rectangular.png',
  },
  {
    id: 'circle',
    label: 'Circular Style',
    description: 'Round notes and receptors with a soft arcade glow.',
    previewImage: '/skin/circular-style.png',
  },
];

const SKIN_MENU_BACKGROUNDS = [
  '/backgrounds/- Y u m i J i-.webp',
  '/backgrounds/Arushii.webp',
  '/backgrounds/Ferineon.webp',
  '/backgrounds/MPDisplay.webp',
  '/backgrounds/PEALEERD_TAK.webp',
  '/backgrounds/Porukana.webp',
  '/backgrounds/RedcXca.webp',
  '/backgrounds/Sm0llBanana.webp',
  '/backgrounds/THICC Jeff.webp',
  '/backgrounds/Triantafyllia.webp',
  '/backgrounds/YellowX21.webp',
  '/backgrounds/mimile1606.webp',
  '/backgrounds/nikio.webp',
  '/backgrounds/serr.webp',
  '/backgrounds/soncak.webp',
  '/backgrounds/wxyz.webp',
];

const getSelectedStyle = (settings: GameSettings): SkinStyleId => {
  if (settings.renderEngine === 'babylon' || settings.skinId === 'rhythmmania-3d') return 'rhythmmania-3d';
  if (settings.playfieldStyle === 'circle') return 'circle';
  return settings.squareRenderStyle === 'rhythmplus-dynamic'
    ? 'rhythmplus-dynamic'
    : settings.squareRenderStyle === 'rhythmplus' ? 'rhythmplus' : 'rhythmmania';
};

const styleSettings = (style: SkinStyleId): Partial<GameSettings> => ({
  skinId: style === 'rhythmmania-3d' ? 'rhythmmania-3d' : 'custom',
  renderEngine: style === 'rhythmmania-3d' ? 'babylon' : 'canvas',
  playfieldStyle: style === 'circle' ? 'circle' : 'square',
  squareRenderStyle: style === 'rhythmplus-dynamic'
    ? 'rhythmplus-dynamic'
    : style === 'rhythmplus' ? 'rhythmplus' : 'rhythmmania',
});

function SkinPreview({ styleId, compact = false }: { styleId: SkinStyleId; compact?: boolean }) {
  const style = SKIN_STYLES.find((candidate) => candidate.id === styleId) || SKIN_STYLES[0];
  return (
    <div className={`relative overflow-hidden border border-white/[0.09] bg-[#11141b] shadow-[0_14px_35px_rgba(0,0,0,0.28)] ${compact ? 'h-14 rounded-md' : 'h-[min(36vh,220px)] min-h-[155px] rounded-lg'}`}>
      <img
        src={style.previewImage}
        alt={`${style.label} preview`}
        draggable={false}
        className="block h-full w-full object-contain"
      />
    </div>
  );
}

function SkinSetting({
  id,
  label,
  description,
  settings,
  updateSettings,
  children,
}: {
  id: keyof GameSettings;
  label: string;
  description: string;
  settings: GameSettings;
  updateSettings: (patch: Partial<GameSettings>) => void;
  children: React.ReactNode;
}) {
  const changed = !isAtDefault(id, settings[id], DEFAULT_SETTINGS);

  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#111119]/75 p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-slate-100">{label}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
        </div>
        {changed && (
          <button
            type="button"
            onClick={() => {
              const value = DEFAULT_SETTINGS[id];
              updateSettings({ [id]: Array.isArray(value) ? [...value] : value } as Partial<GameSettings>);
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
            title="Reset to default"
            aria-label={`Reset ${label} to default`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex min-h-8 items-center justify-end">{children}</div>
    </div>
  );
}

export default function SkinScreen({
  settings,
  updateSettings,
  onBack,
}: {
  settings: GameSettings;
  updateSettings: (patch: Partial<GameSettings>) => void;
  onBack: () => void;
}) {
  const selectedStyle = getSelectedStyle(settings);
  const selectedSkin = SKIN_STYLES.find((skin) => skin.id === selectedStyle) || SKIN_STYLES[0];
  const sizeMax = selectedStyle === 'circle' ? 1.5 : selectedStyle === 'rhythmmania-3d' ? 1.2 : (selectedStyle === 'rhythmplus' || selectedStyle === 'rhythmplus-dynamic') ? 1.1 : 1.05;
  const [backgroundImage] = useState(() => SKIN_MENU_BACKGROUNDS[Math.floor(Math.random() * SKIN_MENU_BACKGROUNDS.length)]);
  const [skinSettingsQuery, setSkinSettingsQuery] = useState('');
  const normalizedSettingsQuery = skinSettingsQuery.trim().toLowerCase();
  const matchesSkinSetting = (label: string, description: string) =>
    !normalizedSettingsQuery || `${label} ${description}`.toLowerCase().includes(normalizedSettingsQuery);
  const hasVisibleSkinSetting = matchesSkinSetting('Lane colors', 'Set each lane color for every supported key count.')
    || matchesSkinSetting('Note size', 'Scale falling notes up or down.')
    || (selectedStyle === 'circle' && matchesSkinSetting('Circle size', 'Scale circular notes and receptors.'))
    || matchesSkinSetting('Receptor size', 'Scale receptors relative to each lane width.')
    || matchesSkinSetting('Note opacity', 'Set the opacity of falling notes.')
    || matchesSkinSetting('Receptor opacity', 'Set the opacity of landline receptors.')
    || matchesSkinSetting('Judgement text opacity', 'Set the visibility of PERFECT, GREAT, and other judgements.')
    || matchesSkinSetting('Judgement text size', 'Scale judgement text up or down.')
    || matchesSkinSetting('Judgement text position', 'Move judgement text vertically on the playfield.')
    || matchesSkinSetting('Lane separator opacity', 'Set the visibility of lane divider lines.');

  const applyStyle = (style: SkinStyleId) => updateSettings(styleSettings(style));
  const updateNumber = (id: keyof GameSettings) => (value: number) => updateSettings({ [id]: value } as Partial<GameSettings>);
  const resetSkinSettings = () => updateSettings({
    ...styleSettings('rhythmmania'),
    receptorColorsByKeyCount: JSON.parse(JSON.stringify(DEFAULT_SETTINGS.receptorColorsByKeyCount)),
    noteSizeMultiplier: DEFAULT_SETTINGS.noteSizeMultiplier,
    circleSize: DEFAULT_SETTINGS.circleSize,
    receptorSizeMultiplier: DEFAULT_SETTINGS.receptorSizeMultiplier,
    noteOpacity: DEFAULT_SETTINGS.noteOpacity,
    receptorOpacity: DEFAULT_SETTINGS.receptorOpacity,
    judgementOpacity: DEFAULT_SETTINGS.judgementOpacity,
    judgementSize: DEFAULT_SETTINGS.judgementSize,
    judgementPositionY: DEFAULT_SETTINGS.judgementPositionY,
    laneSeparatorOpacity: DEFAULT_SETTINGS.laneSeparatorOpacity,
  });

  return (
    <section className="relative h-full min-h-0 overflow-hidden bg-[#17142b] text-white" aria-labelledby="skin-assets-title">
      <div className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-35" style={{ backgroundImage: `url("${backgroundImage}")` }} aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(18,12,46,0.92),rgba(27,18,47,0.74)_48%,rgba(7,10,18,0.94))]" aria-hidden="true" />

      <div className="relative mx-auto grid h-full min-h-0 w-full max-w-[1280px] grid-rows-[auto_minmax(0,1fr)] gap-4 px-4 py-4 sm:px-6 sm:py-5 lg:grid-cols-[minmax(0,0.82fr)_minmax(420px,1.18fr)] lg:grid-rows-1 lg:gap-5">
        <div className="flex min-h-0 flex-col overflow-hidden">
          <div className="mb-4 flex shrink-0 items-center justify-between gap-4">
            <button type="button" onClick={onBack} className="group flex min-h-10 items-center gap-2 rounded-lg px-1 text-sm font-medium text-white/65 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70">
              <ArrowLeft className="h-5 w-5 transition-transform duration-150 group-hover:-translate-x-0.5" />
              <span>Back</span>
            </button>
            <div className="flex items-center gap-2 text-right">
              <Paintbrush className="hidden h-5 w-5 text-cyan-200 sm:block" />
              <h1 id="skin-assets-title" className="text-xl font-semibold tracking-[-0.03em] text-white sm:text-2xl">Skin Assets</h1>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs">
              <span className="font-bold uppercase tracking-[0.16em] text-white/45">Currently Equipped</span>
              <span className="truncate font-medium text-cyan-100">{selectedSkin.label}</span>
            </div>
            <SkinPreview styleId={selectedStyle} />

            <div className="mt-4 flex shrink-0 items-end justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold tracking-[-0.02em] text-white">Choose a skin type</h2>
              </div>
              <span className="hidden text-[10px] font-bold uppercase tracking-[0.16em] text-white/35 sm:block">{SKIN_STYLES.length} skins</span>
            </div>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {SKIN_STYLES.map((skin) => {
                    const isSelected = skin.id === selectedStyle;
                    return (
                      <button key={skin.id} type="button" aria-pressed={isSelected} onClick={() => applyStyle(skin.id)} className={`group min-w-0 rounded-lg text-left transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/80 ${isSelected ? 'text-white' : 'text-white/55'}`}>
                        <div className={`relative rounded-lg p-1 transition-colors ${isSelected ? 'bg-white' : 'bg-white/[0.08] group-hover:bg-white/[0.22]'}`}>
                          <SkinPreview styleId={skin.id} compact />
                          {isSelected && <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg" aria-label="Selected"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>}
                        </div>
                        <span className="mt-1.5 block line-clamp-2 px-0.5 text-center text-[10px] font-medium leading-4 sm:text-xs">{skin.label}</span>
                      </button>
                    );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto overscroll-contain pr-1">
          <div className="rounded-lg border border-white/[0.08] bg-[#0d0e16]/70 p-3 sm:p-4">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Skin settings</h2>
              <p className="mt-1 text-xs text-white/45">Tune the selected playfield without leaving the skin menu.</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1 sm:w-52 sm:flex-none">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" aria-hidden="true" />
                <label htmlFor="skin-settings-search" className="sr-only">Search skin settings</label>
                <input
                  id="skin-settings-search"
                  type="search"
                  value={skinSettingsQuery}
                  onChange={(event) => setSkinSettingsQuery(event.target.value)}
                  placeholder="Search settings..."
                  className="h-9 w-full rounded-md border border-white/[0.1] bg-black/25 pl-8 pr-8 text-xs text-white outline-none transition placeholder:text-white/30 focus:border-cyan-200/60 focus:ring-2 focus:ring-cyan-200/15"
                />
                {skinSettingsQuery && (
                  <button
                    type="button"
                    onClick={() => setSkinSettingsQuery('')}
                    className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70"
                    aria-label="Clear skin settings search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <button type="button" onClick={resetSkinSettings} className="shrink-0 rounded-md border border-white/10 px-2.5 py-1.5 text-[10px] font-bold text-white/55 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70">
                Reset skin
              </button>
            </div>
          </div>

          <div className="grid gap-2.5 lg:grid-cols-2">
            {matchesSkinSetting('Lane colors', 'Set each lane color for every supported key count.') && <SkinSetting id="receptorColorsByKeyCount" label="Lane colors" description="Set each lane color for every supported key count." settings={settings} updateSettings={updateSettings}>
              <LaneColorEditor settings={settings} update={updateSettings} />
            </SkinSetting>}

            {matchesSkinSetting('Note size', 'Scale falling notes up or down.') && <SkinSetting id="noteSizeMultiplier" label="Note size" description="Scale falling notes up or down." settings={settings} updateSettings={updateSettings}>
              <SettingsSlider id="skin-note-size" value={Number(settings.noteSizeMultiplier ?? 1)} min={0.85} max={sizeMax} step={0.01} format={(value) => `${Math.round(value * 100)}%`} onChange={updateNumber('noteSizeMultiplier')} />
            </SkinSetting>}

            {selectedStyle === 'circle' && matchesSkinSetting('Circle size', 'Scale circular notes and receptors.') && (
              <SkinSetting id="circleSize" label="Circle size" description="Scale circular notes and receptors." settings={settings} updateSettings={updateSettings}>
                <SettingsSlider id="skin-circle-size" value={Number(settings.circleSize ?? 1)} min={0.5} max={1.5} step={0.05} format={(value) => `${Math.round(value * 100)}%`} onChange={updateNumber('circleSize')} />
              </SkinSetting>
            )}

            {matchesSkinSetting('Receptor size', 'Scale receptors relative to each lane width.') && <SkinSetting id="receptorSizeMultiplier" label="Receptor size" description="Scale receptors relative to each lane width." settings={settings} updateSettings={updateSettings}>
              <SettingsSlider id="skin-receptor-size" value={Number(settings.receptorSizeMultiplier ?? 1)} min={0.85} max={sizeMax} step={0.01} format={(value) => `${Math.round(value * 100)}%`} onChange={updateNumber('receptorSizeMultiplier')} />
            </SkinSetting>}

            {matchesSkinSetting('Note opacity', 'Set the opacity of falling notes.') && <SkinSetting id="noteOpacity" label="Note opacity" description="Set the opacity of falling notes." settings={settings} updateSettings={updateSettings}>
              <SettingsSlider id="skin-note-opacity" value={Number(settings.noteOpacity ?? 1)} min={0.1} max={1} step={0.05} format={(value) => `${Math.round(value * 100)}%`} onChange={updateNumber('noteOpacity')} />
            </SkinSetting>}

            {matchesSkinSetting('Receptor opacity', 'Set the opacity of landline receptors.') && <SkinSetting id="receptorOpacity" label="Receptor opacity" description="Set the opacity of landline receptors." settings={settings} updateSettings={updateSettings}>
              <SettingsSlider id="skin-receptor-opacity" value={Number(settings.receptorOpacity ?? 1)} min={0.1} max={1} step={0.05} format={(value) => `${Math.round(value * 100)}%`} onChange={updateNumber('receptorOpacity')} />
            </SkinSetting>}

            {matchesSkinSetting('Judgement text opacity', 'Set the visibility of PERFECT, GREAT, and other judgements.') && <SkinSetting id="judgementOpacity" label="Judgement text opacity" description="Set the visibility of PERFECT, GREAT, and other judgements." settings={settings} updateSettings={updateSettings}>
              <SettingsSlider id="skin-judgement-opacity" value={Number(settings.judgementOpacity ?? 1)} min={0} max={1} step={0.05} format={(value) => `${Math.round(value * 100)}%`} onChange={updateNumber('judgementOpacity')} />
            </SkinSetting>}

            {matchesSkinSetting('Judgement text size', 'Scale judgement text up or down.') && <SkinSetting id="judgementSize" label="Judgement text size" description="Scale judgement text up or down." settings={settings} updateSettings={updateSettings}>
              <SettingsSlider id="skin-judgement-size" value={Number(settings.judgementSize ?? 1)} min={0.5} max={1.5} step={0.05} format={(value) => `${Math.round(value * 100)}%`} onChange={updateNumber('judgementSize')} />
            </SkinSetting>}

            {matchesSkinSetting('Judgement text position', 'Move judgement text vertically on the playfield.') && <SkinSetting id="judgementPositionY" label="Judgement text position" description="Move judgement text vertically on the playfield." settings={settings} updateSettings={updateSettings}>
              <SettingsSlider id="skin-judgement-position" value={Number(settings.judgementPositionY ?? 50)} min={20} max={85} step={1} suffix="%" onChange={updateNumber('judgementPositionY')} />
            </SkinSetting>}

            {matchesSkinSetting('Lane separator opacity', 'Set the visibility of lane divider lines.') && <SkinSetting id="laneSeparatorOpacity" label="Lane separator opacity" description="Set the visibility of lane divider lines." settings={settings} updateSettings={updateSettings}>
              <SettingsSlider id="skin-lane-opacity" value={Number(settings.laneSeparatorOpacity ?? 0.3)} min={0} max={1} step={0.05} format={(value) => `${Math.round(value * 100)}%`} onChange={updateNumber('laneSeparatorOpacity')} />
            </SkinSetting>}
          </div>
          {normalizedSettingsQuery && !hasVisibleSkinSetting && (
            <div className="mt-3 rounded-lg border border-dashed border-white/[0.12] bg-black/20 px-4 py-6 text-center text-xs text-white/50">
              No skin settings match &ldquo;{skinSettingsQuery}&rdquo;.
            </div>
          )}
          </div>
        </div>
      </div>
    </section>
  );
}
