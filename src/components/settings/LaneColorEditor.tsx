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

import { useState } from 'react';
import type { GameSettings } from '../../types';

const KEY_COUNTS = [2, 3, 4, 5, 6, 7, 8, 9];
const FALLBACK_COLORS = ['#00b0ff', '#00b0ff', '#00b0ff', '#00b0ff', '#00b0ff', '#00b0ff', '#00b0ff', '#00b0ff', '#00b0ff'];

export default function LaneColorEditor({
  settings,
  update,
}: {
  settings: GameSettings;
  update: (patch: Partial<GameSettings>) => void;
}) {
  const [keyCount, setKeyCount] = useState(4);
  const settingKey = 'receptorColorsByKeyCount';
  const palettes = settings[settingKey] || {};
  const colors = Array.from({ length: keyCount }, (_, index) => palettes[keyCount]?.[index] || FALLBACK_COLORS[index]);

  const setColors = (next: string[]) => update({ [settingKey]: { ...palettes, [keyCount]: next } } as Partial<GameSettings>);

  return (
    <div className="w-full space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap gap-1">
        {KEY_COUNTS.map(count => (
          <button key={count} onClick={() => setKeyCount(count)} className={`rounded px-2 py-1 text-[10px] font-black ${keyCount === count ? 'bg-skin-accent text-slate-950' : 'bg-white/5 text-slate-400 hover:text-white'}`}>{count}K</button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        {colors.map((color, index) => (
          <label key={index} className="min-w-0 flex-1">
            <span className="mb-1 block text-center font-mono text-[8px] text-slate-500">{index + 1}</span>
            <input aria-label={`${keyCount}K lane ${index + 1} color`} type="color" value={color} onChange={event => setColors(colors.map((value, i) => i === index ? event.target.value : value))} className="h-8 w-full cursor-pointer rounded border-0 bg-transparent p-0" />
          </label>
        ))}
      </div>
      <button onClick={() => setColors(colors.map(() => colors[0]))} className="w-full rounded-lg border border-white/10 bg-white/5 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-300 transition hover:bg-white/10">
        Link all button colours to lane 1
      </button>
    </div>
  );
}
