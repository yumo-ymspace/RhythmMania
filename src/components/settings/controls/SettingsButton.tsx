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

interface SettingsButtonProps {
  label: string;
  onClick: () => void;
  danger?: boolean;
  id?: string;
}

export default function SettingsButton({ label, onClick, danger, id }: SettingsButtonProps) {
  return (
    <button
      id={id}
      onClick={onClick}
      className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
        danger
          ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20'
          : 'bg-slate-700/50 text-slate-200 hover:bg-slate-700 border border-slate-600/50'
      }`}
    >
      {label}
    </button>
  );
}
