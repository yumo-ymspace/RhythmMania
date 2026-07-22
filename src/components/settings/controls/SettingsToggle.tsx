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

interface SettingsToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  id?: string;
}

export default function SettingsToggle({ checked, onChange, id }: SettingsToggleProps) {
  return (
    <label className="relative inline-flex items-center cursor-pointer select-none h-5 w-9 shrink-0">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <span
        className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--skin-accent)] ${
          checked ? 'bg-[var(--skin-accent)]' : 'bg-slate-700'
        }`}
      >
        <span
          className={`block mt-0.5 ml-0.5 bg-white w-4 h-4 rounded-full transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </span>
    </label>
  );
}
