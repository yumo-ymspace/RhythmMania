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

interface ColorSwatchRowProps {
  keys: { index: number; label: string; desc: string }[];
  value: string[];
  onChange: (next: string[]) => void;
}

export default function ColorSwatchRow({ keys, value, onChange }: ColorSwatchRowProps) {
  const handleColorChange = (index: number, newColor: string) => {
    const next = [...value];
    next[index] = newColor;
    onChange(next);
  };

  return (
    <div className="flex flex-wrap gap-3 max-w-[200px] justify-end">
      {keys.map((k) => (
        <div key={k.index} className="flex flex-col items-center gap-1.5 group">
          <div 
            className="w-7 h-7 rounded border border-white/20 shadow-sm overflow-hidden flex items-center justify-center relative cursor-pointer"
            title={k.desc}
          >
            <input 
              type="color" 
              className="absolute inset-[-10px] w-12 h-12 cursor-pointer opacity-0"
              value={value[k.index] || '#ffffff'}
              onChange={(e) => handleColorChange(k.index, e.target.value)}
            />
            <div className="w-full h-full pointer-events-none" style={{ backgroundColor: value[k.index] || '#ffffff' }} />
          </div>
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider group-hover:text-slate-300">
            {k.label}
          </span>
        </div>
      ))}
    </div>
  );
}
