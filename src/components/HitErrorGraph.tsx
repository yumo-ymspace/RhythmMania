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

import React, { useMemo } from 'react';

interface HitErrorGraphProps {
  /** Signed millisecond errors (negative = early, positive = late). Session-only samples. */
  errors: number[];
  unstableRate?: number | null;
}

const BIN_COUNT = 41;

/** Tier color bands matching the judgement pill palette (approximate windows). */
function binColor(center: number): string {
  const a = Math.abs(center);
  if (a <= 21) return '#22d3ee';   // marvelous-ish
  if (a <= 45) return '#0d9488';   // perfect-ish
  if (a <= 90) return '#16a34a';   // great-ish
  if (a <= 130) return '#d97706';  // good-ish
  return '#7e22ce';                // bad-ish
}

export default function HitErrorGraph({ errors, unstableRate }: HitErrorGraphProps) {
  const model = useMemo(() => {
    const finite = errors.filter(e => Number.isFinite(e));
    if (finite.length < 2) return null;

    let min = 0;
    let max = 0;
    let sum = 0;
    let earlySum = 0;
    let earlyCount = 0;
    let lateSum = 0;
    let lateCount = 0;
    for (const e of finite) {
      if (e < min) min = e;
      if (e > max) max = e;
      sum += e;
      if (e < 0) { earlySum += e; earlyCount++; }
      else if (e > 0) { lateSum += e; lateCount++; }
    }

    const maxAbs = Math.min(300, Math.max(50, Math.ceil(Math.max(-min, max) / 10) * 10));
    const binWidth = (maxAbs * 2) / BIN_COUNT;
    const bins = new Array<number>(BIN_COUNT).fill(0);
    for (const e of finite) {
      let idx = Math.floor((e + maxAbs) / binWidth);
      if (idx < 0) idx = 0;
      if (idx >= BIN_COUNT) idx = BIN_COUNT - 1;
      bins[idx]++;
    }
    const maxCount = Math.max(1, ...bins);

    return {
      bins,
      maxCount,
      maxAbs,
      binWidth,
      mean: sum / finite.length,
      earlyAvg: earlyCount > 0 ? earlySum / earlyCount : null,
      lateAvg: lateCount > 0 ? lateSum / lateCount : null,
      sampleCount: finite.length,
    };
  }, [errors]);

  if (!model) return null;

  const W = 600;
  const H = 130;
  const plotTop = 8;
  const plotBottom = 104;
  const plotH = plotBottom - plotTop;
  const barW = W / BIN_COUNT;
  const meanX = ((model.mean + model.maxAbs) / (model.maxAbs * 2)) * W;

  const fmtSigned = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`;

  return (
    <div className="w-full max-w-5xl mt-4 bg-black/75 backdrop-blur-md border-y border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)] px-6 lg:px-12 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 mb-3">
        <span className="text-zinc-500 font-sans font-black text-[11px] uppercase tracking-widest">
          Hit Error Distribution
        </span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono uppercase tracking-wider">
          <span className="text-slate-400">
            Mean <span className="text-white font-bold">{fmtSigned(model.mean)}ms</span>
          </span>
          {model.earlyAvg !== null && (
            <span className="text-slate-400">
              Early <span className="text-sky-300 font-bold">{fmtSigned(model.earlyAvg)}ms</span>
            </span>
          )}
          {model.lateAvg !== null && (
            <span className="text-slate-400">
              Late <span className="text-rose-300 font-bold">{fmtSigned(model.lateAvg)}ms</span>
            </span>
          )}
          {unstableRate != null && Number.isFinite(unstableRate) && (
            <span className="text-slate-400">
              UR <span className="text-amber-300 font-bold">{unstableRate.toFixed(1)}</span>
            </span>
          )}
          <span className="text-slate-600">{model.sampleCount} samples</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28 select-none" preserveAspectRatio="none" aria-hidden="true">
        {model.bins.map((count, i) => {
          if (count === 0) return null;
          const center = -model.maxAbs + (i + 0.5) * model.binWidth;
          const barH = (count / model.maxCount) * plotH;
          return (
            <rect
              key={i}
              x={i * barW + 0.5}
              y={plotBottom - barH}
              width={Math.max(1, barW - 1)}
              height={barH}
              fill={binColor(center)}
              opacity={0.85}
            />
          );
        })}
        {/* Zero line */}
        <line x1={W / 2} y1={plotTop} x2={W / 2} y2={plotBottom} stroke="#e2e8f0" strokeWidth="1" opacity="0.5" />
        {/* Mean marker */}
        <line x1={meanX} y1={plotTop} x2={meanX} y2={plotBottom} stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.9" />
        {/* Axis labels */}
        <text x={2} y={H - 6} fill="#64748b" fontSize="10" fontFamily="monospace">-{model.maxAbs}ms</text>
        <text x={W / 2} y={H - 6} fill="#64748b" fontSize="10" fontFamily="monospace" textAnchor="middle">0</text>
        <text x={W - 2} y={H - 6} fill="#64748b" fontSize="10" fontFamily="monospace" textAnchor="end">+{model.maxAbs}ms</text>
      </svg>
    </div>
  );
}
