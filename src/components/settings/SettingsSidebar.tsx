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

import React from 'react';
import { Settings } from 'lucide-react';
import { SECTIONS, SectionId } from './settingsRegistry';
import type { GameSettings } from '../../types';
import metadata from '../../../metadata.json';

interface SettingsSidebarProps {
  activeSection: SectionId;
  onSelect: (id: SectionId) => void;
  onRestoreAll: () => void;
  settings: GameSettings;
}

export default function SettingsSidebar({ activeSection, onSelect, onRestoreAll, settings }: SettingsSidebarProps) {
  return (
    <div className="w-full md:w-[240px] flex-none border-r border-[var(--settings-border)]/5 bg-black/20 flex flex-col h-[200px] md:h-auto shrink-0 md:shrink">
      <div className="p-6 pb-4">
        <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-slate-400" />
          Settings
        </h1>
      </div>
      
      <div className="flex-1 overflow-y-auto px-3 flex flex-col gap-1 pb-4">
        {SECTIONS.filter((s) => !s.showWhen || s.showWhen(settings)).map((s) => {
          const Icon = s.icon;
          const isActive = s.id === activeSection;
          
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                isActive 
                  ? 'bg-white/5 border-l-2 border-[var(--skin-accent)] text-slate-100' 
                  : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-200 border-l-2 border-transparent'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-[var(--skin-accent)]' : 'text-slate-500'}`} />
              <span className="text-sm font-medium">{s.label}</span>
            </button>
          );
        })}
      </div>
      
      <div className="p-4 border-t border-[var(--settings-border)]/5">
        <button
          onClick={onRestoreAll}
          className="w-full py-2 px-4 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors text-sm font-medium mb-3"
        >
          Restore defaults
        </button>
        <div className="text-xs text-center text-slate-600 font-mono">{metadata.version}</div>
      </div>
    </div>
  );
}
