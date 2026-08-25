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

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { GameSettings } from '../../types';
import SettingsSidebar from './SettingsSidebar';
import SettingsSearchBar from './SettingsSearchBar';
import SettingsPane from './SettingsPane';
import OffsetWizardModal from './OffsetWizardModal';
import ConfirmModal from './controls/ConfirmModal';
import { SectionId, SECTIONS, ROWS } from './settingsRegistry';
import {
  BABYLON_PLAYFIELD_WIDTH_MAX,
  BABYLON_PLAYFIELD_WIDTH_MIN,
  isAtDefault,
  DEFAULT_SETTINGS,
} from './defaultSettings';
import * as LucideIcons from 'lucide-react';
import metadata from '../../../metadata.json';
import SettingsToggle from './controls/SettingsToggle';
import SettingsSlider from './controls/SettingsSlider';
import SettingsSelect from './controls/SettingsSelect';
import SettingsButton from './controls/SettingsButton';

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  settings: GameSettings;
  updateSettings: (patch: Partial<GameSettings>) => void;
}

export default function SettingsDrawer({ open, onClose, settings, updateSettings }: SettingsDrawerProps) {
  const [activeSection, setActiveSection] = useState<SectionId>('general');
  const [query, setQuery] = useState('');
  const [shaking, setShaking] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (shaking) {
      const t = setTimeout(() => setShaking(false), 250);
      return () => clearTimeout(t);
    }
  }, [shaking]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirmOpen && !wizardOpen) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, confirmOpen, wizardOpen]);

  const resetRow = (id: string) => {
    // If it's a complex object like bindings, we need to deep copy from DEFAULT_SETTINGS
    const dv = id in DEFAULT_SETTINGS ? DEFAULT_SETTINGS[id as keyof GameSettings] : undefined;
    let val = dv;
    if (dv && typeof dv === 'object') {
      val = JSON.parse(JSON.stringify(dv));
    }
    updateSettings({ [id]: val });
  };

  const handleRestoreRequest = () => {
    setConfirmOpen(true);
  };

  const restoreAll = () => {
    updateSettings({
      ...DEFAULT_SETTINGS,
      customSkinName: undefined,
      videoOffset: 0,
      disableVideo: false,
      disableParticles: false,
      limitDprToOne: false,
    });
  };

  if (isMobile) {
    const sectionDef = SECTIONS.find(s => s.id === activeSection);
    const rows = ROWS.filter(r => r.section === activeSection).filter(r => {
      if (r.showWhen && !r.showWhen(settings)) return false;
      return true;
    });

    return (
      <>
        <AnimatePresence>
          {open && (
            <motion.div
              key="mobile-settings"
              className="fixed inset-0 z-50 bg-gradient-to-b from-[#242532]/98 to-[#181923]/98 flex flex-col font-sans select-none overflow-hidden"
              initial={{ x: '100vw' }}
              animate={{ x: 0 }}
              exit={{ x: '100vw' }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
            >
              {/* Header */}
              <div className="flex-none px-4 py-4 border-b border-white/5 flex items-center gap-3 bg-[#0a0a0f]/90 backdrop-blur-md">
                <button
                  onClick={onClose}
                  className="p-2 -ml-1 rounded-xl bg-white/5 border border-white/10 text-slate-350 active:scale-95 transition"
                >
                  <LucideIcons.ChevronLeft className="w-5 h-5" />
                </button>
                <h1 className="text-lg font-black uppercase tracking-wider text-white">Settings</h1>
              </div>

              {/* Category selector */}
              <div className="flex-none bg-slate-950/40 border-b border-white/5 flex flex-wrap gap-2 px-4 py-3 justify-center">
                {SECTIONS.filter(s => s.id !== 'input' && (!s.showWhen || s.showWhen(settings))).map((s) => {
                  const Icon = s.icon;
                  const isActive = s.id === activeSection;

                  return (
                    <button
                      key={s.id}
                      onClick={() => setActiveSection(s.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-black tracking-wider uppercase font-sans transition-all duration-200 shrink-0 ${
                        isActive 
                          ? 'bg-pink-500/10 border-pink-500/30 text-pink-500 shadow-[0_0_12px_rgba(236,72,153,0.12)]' 
                          : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{s.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Active Section with scrollable content */}
              <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-5 pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))]">
                {sectionDef && (
                  <div className="mb-2">
                    <h2 className="text-xl font-sans font-black text-white uppercase tracking-wider">{sectionDef.label}</h2>
                    <p className="text-xs text-slate-400 font-mono mt-1 uppercase tracking-wide leading-relaxed">{sectionDef.description}</p>
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  {rows.map((row) => {
                    const currentValue = settings[row.id as keyof GameSettings];
                    const isChanged = !isAtDefault(row.id, currentValue);

                    let controlNode = null;
                    if (row.control.kind === 'toggle') {
                      controlNode = (
                        <div className="scale-95 origin-right">
                          <SettingsToggle
                            id={`setting-mobile-${row.id}`}
                            checked={Boolean(currentValue)}
                            onChange={(v) => updateSettings({ [row.id]: v })}
                          />
                        </div>
                      );
                    } else if (row.control.kind === 'slider') {
                      const sliderMin = row.id === 'playfieldWidthPercent' && settings.renderEngine === 'babylon'
                        ? BABYLON_PLAYFIELD_WIDTH_MIN
                        : (row.id === 'noteSizeMultiplier' || row.id === 'receptorSizeMultiplier')
                          ? 0.60
                        : row.control.min;
                      const sliderMax = row.id === 'playfieldWidthPercent' && settings.renderEngine === 'babylon'
                        ? BABYLON_PLAYFIELD_WIDTH_MAX
                        : (row.id === 'noteSizeMultiplier' || row.id === 'receptorSizeMultiplier')
                          ? 1.00
                        : row.control.max;
                      controlNode = (
                        <div className="w-full">
                          <SettingsSlider
                            id={`setting-mobile-${row.id}`}
                            value={Number(currentValue)}
                            min={sliderMin}
                            max={sliderMax}
                            step={row.control.step}
                            format={row.control.format}
                            suffix={row.control.suffix}
                            onChange={(v) => updateSettings({ [row.id]: v })}
                          />
                        </div>
                      );
                    } else if (row.control.kind === 'select') {
                      controlNode = (
                        <div className="relative">
                          <SettingsSelect
                            id={`setting-mobile-${row.id}`}
                            value={String(currentValue)}
                            options={row.control.options}
                            onChange={(v) => updateSettings({ [row.id]: v })}
                          />
                        </div>
                      );
                    } else if (row.control.kind === 'button') {
                      const action = row.control.action;
                      controlNode = (
                        <SettingsButton
                          id={`setting-mobile-${row.id}`}
                          label={row.control.label}
                          danger={action === 'restoreAll'}
                          onClick={() => {
                            if (action === 'openWizard') setWizardOpen(true);
                            if (action === 'restoreAll') handleRestoreRequest();
                          }}
                        />
                      );
                    } else if (row.control.kind === 'custom') {
                      controlNode = row.control.render({
                        settings,
                        update: updateSettings,
                        resetRow,
                        isChanged,
                        openWizard: () => setWizardOpen(true),
                      });
                    }

                     const isCustomOrComplex = row.id === 'bindings' || row.control.kind === 'color-grid';
                    const isVertical = isCustomOrComplex || row.control.kind === 'slider';

                    return (
                      <div
                        key={row.id}
                        className={`relative bg-[#111119]/80 border border-white/5 p-4 rounded-xl flex ${
                          isVertical ? 'flex-col gap-4' : 'flex-row items-center justify-between gap-4'
                        } text-left`}
                      >
                        {isChanged && (
                          <div
                            onClick={() => resetRow(row.id)}
                            className="absolute left-0 top-3 bottom-3 w-[3px] bg-amber-500 rounded-r shadow-[0_0_8px_rgba(234,179,8,0.6)] cursor-pointer"
                            title="Reset to default"
                          />
                        )}
                        
                        <label htmlFor={`setting-mobile-${row.id}`} className={`flex flex-col justify-center min-w-0 flex-1 cursor-pointer ${isChanged ? 'pl-2' : ''}`}>
                          <span className="text-sm font-sans font-extrabold text-white leading-tight uppercase tracking-wider">
                            {row.label}
                          </span>
                          {(!isCustomOrComplex || row.control.kind === 'slider') && (
                            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed font-mono uppercase">
                              {row.description}
                            </p>
                          )}
                        </label>

                        <div className={`${isVertical ? 'w-full' : 'shrink-0'}`}>
                          {controlNode}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Restore Defaults & Version Sticky Footer */}
              <div className="absolute bottom-0 inset-x-0 p-4 pb-[max(1.5rem,calc(0.75rem+env(safe-area-inset-bottom,0px)))] bg-gradient-to-t from-[#181923] via-[#181923]/95 to-transparent border-t border-white/5 flex flex-col items-center">
                <button
                  onClick={handleRestoreRequest}
                  className="w-full py-3.5 bg-red-650 hover:bg-red-750 active:scale-95 text-white font-sans font-black text-xs uppercase tracking-widest rounded-xl transition shadow-lg"
                >
                  Restore defaults
                </button>
                <div className="text-[10px] text-slate-600 font-mono mt-2 uppercase tracking-widest">
                  VERSION {metadata.version}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <ConfirmModal
          isOpen={confirmOpen}
          message="Reset every setting to its default value?"
          onConfirm={() => {
            restoreAll();
            setConfirmOpen(false);
          }}
          onCancel={() => setConfirmOpen(false)}
        />

        {wizardOpen && (
          <OffsetWizardModal
            initial={settings.audioOffset}
            onApply={(v) => {
              updateSettings({ audioOffset: v });
              setWizardOpen(false);
            }}
            onClose={() => setWizardOpen(false)}
          />
        )}

      </>
    );
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div 
              key="backdrop"
              className="fixed inset-0 z-40 backdrop-blur-sm"
              style={{
                backgroundColor: `rgba(0, 0, 0, ${settings.backgroundDim !== undefined ? settings.backgroundDim : 0.60})`
              }}
              onClick={onClose} 
              aria-hidden 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
            <motion.aside 
              key="drawer"
              className="settings-shell fixed inset-y-0 left-0 z-50 w-full md:w-[860px] md:max-w-[90vw] flex flex-col md:flex-row"
              initial={{ x: '-100%', opacity: 0.6 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '-100%', opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <SettingsSidebar 
                activeSection={activeSection} 
                onSelect={setActiveSection}
                onRestoreAll={handleRestoreRequest} 
                settings={settings}
              />
              <div className="flex-1 flex flex-col min-w-0">
                <SettingsSearchBar 
                  value={query} 
                  onChange={setQuery} 
                  onClose={onClose}
                  shaking={shaking} 
                />
                <SettingsPane 
                  activeSection={activeSection} 
                  query={query}
                  settings={settings} 
                  update={updateSettings}
                  resetRow={resetRow}
                  onNoResults={() => setShaking(true)}
                  openWizard={() => setWizardOpen(true)} 
                  restoreAll={handleRestoreRequest}
                  isAtDefault={isAtDefault}
                />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <ConfirmModal 
        isOpen={confirmOpen}
        message="Reset every setting to its default value?"
        onConfirm={restoreAll}
        onCancel={() => setConfirmOpen(false)}
      />

      {wizardOpen && (
        <OffsetWizardModal
          initial={settings.audioOffset}
          onApply={(v) => { updateSettings({ audioOffset: v }); setWizardOpen(false); }}
          onClose={() => setWizardOpen(false)}
        />
      )}
      
    </>
  );
}
