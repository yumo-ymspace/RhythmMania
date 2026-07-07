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
import type { GameSettings } from '../../types';

interface BindingMatrixProps {
  settings: GameSettings;
  update: (patch: Partial<GameSettings>) => void;
}

export default function BindingMatrix({ settings, update }: BindingMatrixProps) {
  const [activeRebind, setActiveRebind] = useState<{ keyCount: number; colIndex: number } | null>(null);

  useEffect(() => {
    if (!activeRebind) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      const pressedKey = e.key.toLowerCase();
      
      if (pressedKey === 'escape' || pressedKey === 'tab') {
        setActiveRebind(null);
        return;
      }

      const bindingsCopy = JSON.parse(JSON.stringify(settings.bindings));
      const keyLimit = activeRebind.keyCount;
      const targetCol = activeRebind.colIndex;

      if (bindingsCopy[keyLimit]) {
        bindingsCopy[keyLimit][targetCol] = pressedKey;
        update({ bindings: bindingsCopy });
      }

      setActiveRebind(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeRebind, settings.bindings, update]);

  return (
    <div className="flex flex-col gap-4 mt-2 mb-4">
      {[2, 3, 4, 5, 6, 7, 8].map((num) => {
        const columns = settings.bindings[num as keyof typeof settings.bindings] || [];
        return (
          <div key={num} className="flex flex-col gap-1.5">
            <span className="text-xs text-slate-500 font-medium">{num} Keys</span>
            <div className="flex gap-2 flex-wrap">
              {columns.map((colKey, idx) => {
                const isRebindingNow = activeRebind?.keyCount === num && activeRebind?.colIndex === idx;
                return (
                  <button
                    key={idx}
                    onClick={() => setActiveRebind({ keyCount: num, colIndex: idx })}
                    className={`w-12 h-10 font-mono text-xs font-bold rounded-md transition-colors flex items-center justify-center cursor-pointer border focus:outline-none focus:ring-2 focus:ring-[var(--skin-accent)] ${
                      isRebindingNow 
                        ? 'bg-[var(--skin-accent)]/20 text-[var(--skin-accent)] border-[var(--skin-accent)]/50 animate-pulse' 
                        : 'bg-slate-800/80 border-slate-700/50 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    {isRebindingNow ? '?' : colKey === ' ' ? 'SPC' : colKey.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
