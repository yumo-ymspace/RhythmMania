/**
 * @license
 * SPDX-License-Identifier: GPL-3.0-only
 */

import React from 'react';
import { RotateCcw, ChevronLeft, Award, Flame, BarChart2, ShieldCheck } from 'lucide-react';
import { Beatmap, ScoreState } from '../types';

interface ResultsScreenProps {
  scoreState: ScoreState;
  beatmap: Beatmap;
  onRetry: () => void;
  onBack: () => void;
}

export default function ResultsScreen({
  scoreState,
  beatmap,
  onRetry,
  onBack
}: ResultsScreenProps) {
  const {
    score,
    maxCombo,
    accuracy,
    marvelousCount,
    perfectCount,
    greatCount,
    goodCount,
    badCount,
    missCount
  } = scoreState;

  const getGrade = (acc: number): { char: string; color: string; glow: string; bg: string; border: string; desc: string } => {
    if (scoreState.failed) return { char: 'FAIL', color: 'text-rose-500', glow: 'shadow-[0_0_20px_rgba(239,68,68,0.25)] border-rose-500/20', bg: 'bg-rose-950/10', border: 'border-rose-500/20', desc: 'track failed' };
    if (acc >= 100) return { char: 'SS', color: 'text-cyan-400', glow: 'shadow-[0_0_35px_rgba(34,211,238,0.4)] border-cyan-500/25', bg: 'bg-cyan-950/10', border: 'border-cyan-500/30', desc: 'absolute perfection' };
    if (acc >= 95) return { char: 'S', color: 'text-amber-450', glow: 'shadow-[0_0_35px_rgba(245,158,11,0.3)] border-amber-500/25', bg: 'bg-amber-950/10', border: 'border-amber-500/30', desc: 'superb execution' };
    if (acc >= 90) return { char: 'A', color: 'text-emerald-400', glow: 'shadow-[0_0_25px_rgba(16,185,129,0.2)] border-emerald-500/20', bg: 'bg-emerald-950/10', border: 'border-emerald-500/20', desc: 'excellent pacing' };
    if (acc >= 80) return { char: 'B', color: 'text-indigo-400', glow: 'shadow-[0_0_20px_rgba(99,102,241,0.2)] border-indigo-500/20', bg: 'bg-indigo-950/10', border: 'border-indigo-500/20', desc: 'solid progression' };
    if (acc >= 70) return { char: 'C', color: 'text-pink-400', glow: 'shadow-[0_0_20px_rgba(236,72,153,0.2)] border-pink-500/20', bg: 'bg-pink-950/10', border: 'border-pink-500/20', desc: 'respectable timing' };
    return { char: 'D', color: 'text-rose-500', glow: 'shadow-[0_0_20px_rgba(239,68,68,0.2)] border-rose-500/20', bg: 'bg-rose-950/10', border: 'border-rose-500/20', desc: 'practice makes perfect' };
  };

  const grade = getGrade(accuracy);

  const hitCategories = [
    { name: 'MARVELOUS', count: marvelousCount, color: '#22d3ee', glow: 'shadow-[0_0_15px_rgba(34,211,238,0.3)]' },
    { name: 'PERFECT', count: perfectCount, color: '#facc15', glow: 'shadow-[0_0_15px_rgba(250,204,21,0.3)]' },
    { name: 'GREAT', count: greatCount, color: '#4ade80', glow: 'shadow-[0_0_15px_rgba(74,222,128,0.2)]' },
    { name: 'GOOD', count: goodCount, color: '#3b82f6', glow: 'shadow-[0_0_15px_rgba(59,130,246,0.2)]' },
    { name: 'BAD', count: badCount, color: '#ec4899', glow: 'shadow-[0_0_15px_rgba(236,72,153,0.2)]' },
    { name: 'MISS', count: missCount, color: '#ef4444', glow: 'shadow-[0_0_15px_rgba(239,68,68,0.2)]' },
  ];

  const totalHits = hitCategories.reduce((acc, cat) => acc + cat.count, 0);

  return (
    <div id="results-screen-container" className="flex flex-col gap-6 w-full max-w-5xl mx-auto h-full p-2 lg:p-4 text-slate-100 pb-12">
      
      {/* HEADER CONTROLS BAR */}
      <div className="flex justify-between items-center bg-[#08080C]/90 border border-white/5 p-4 rounded-2xl shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-3.5">
          <span className="p-3 bg-cyan-400/5 rounded-xl border border-cyan-400/10 text-cyan-400">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <span className="text-[9px] text-slate-505 font-mono tracking-widest uppercase">MATCH OUTCOME DECK</span>
            <h2 className="text-base font-black font-sans leading-none mt-1 tracking-wider uppercase italic text-white flex items-center gap-1.5">
              Performance Summary
            </h2>
          </div>
        </div>

        <button
          id="results-exit-btn"
          onClick={onBack}
          className="flex items-center gap-1.5 px-5 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 font-sans text-[11px] font-black uppercase tracking-wider rounded-xl border border-white/5 transitioncursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" /> Selector Menu
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* LEFT COLUMN: CRITICAL SCORE METRICS & PERFORMANCE BADGE */}
        <div className="md:col-span-5 flex flex-col gap-6">
          
          {/* VISUAL CRITICAL RANK BOARD */}
          <div className={`p-8 rounded-2xl border ${grade.border} ${grade.bg} ${grade.glow} text-center flex flex-col items-center justify-center relative overflow-hidden aspect-video md:aspect-[4/3] backdrop-blur-md`}>
            <span className="text-[9px] text-slate-500 font-extrabold uppercase tracking-widest absolute top-5">// STAGE PERFORMANCE STAMP</span>
            
            <div className="my-auto flex flex-col items-center">
              <span className={`text-8xl font-black italic tracking-tighter animate-pulse select-none leading-none ${grade.color}`}>
                {grade.char}
              </span>
              <span className="text-[10px] text-slate-300 font-mono tracking-widest mt-3.5 uppercase font-extrabold">
                {grade.desc}
              </span>
            </div>

            <div className="absolute bottom-5 flex gap-2 items-center justify-center font-mono text-[9px] text-slate-550 uppercase tracking-wider">
              <Award className="h-3.5 w-3.5 text-cyan-400 animate-bounce" />
              <span>Timing Matrix Validated</span>
            </div>
          </div>

          {/* SUMMARY BOX */}
          <div className="bg-[#08080C]/90 border border-white/5 p-5 rounded-2xl shadow-xl flex flex-col gap-3.5 backdrop-blur-md">
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <span className="text-xs text-slate-400 font-extrabold uppercase tracking-widest">Final High Score</span>
              <span className="font-mono text-xl font-extrabold text-white">{score.toLocaleString()}</span>
            </div>
            
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <span className="text-xs text-slate-400 font-extrabold uppercase tracking-widest">Accuracy Percentage</span>
              <span className="font-mono text-xl font-extrabold text-cyan-400">{accuracy.toFixed(2)}%</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 font-extrabold uppercase tracking-widest">Streak Max Combo</span>
              <div className="flex items-center gap-1 font-mono text-xl font-extrabold text-amber-400">
                <Flame className="h-4.5 w-4.5 text-amber-550 fill-current animate-pulse" />
                <span>{maxCombo}x</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: PRECISION TELEMETRY */}
        <div className="md:col-span-7 bg-[#08080C]/90 border border-white/5 p-6 rounded-2xl shadow-xl flex flex-col gap-6 backdrop-blur-md">
          
          <div className="flex items-center gap-2.5 border-b border-white/5 pb-4">
            <BarChart2 className="h-4.5 w-4.5 text-cyan-400" />
            <span className="font-extrabold text-[10px] text-slate-400 uppercase tracking-wider">Chronological Hit Distribution</span>
          </div>

          {/* GRID METRICS */}
          <div className="flex flex-col gap-4.5 flex-1 justify-center">
            {hitCategories.map((cat) => {
              const ratio = totalHits > 0 ? (cat.count / totalHits) : 0;
              const ratioPercent = (ratio * 100).toFixed(1);

              return (
                <div key={cat.name} className="flex flex-col gap-2">
                  <div className="flex justify-between text-[11px] font-mono">
                    <div className="flex items-center gap-2 font-black tracking-wider uppercase" style={{ color: cat.color }}>
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color, boxShadow: `0 0 10px ${cat.color}` }} />
                      <span>{cat.name}</span>
                    </div>
                    
                    <div className="flex items-center gap-3 text-slate-500">
                      <span>{cat.count} hits</span>
                      <span className="font-black text-slate-300 w-12 text-right">{ratioPercent}%</span>
                    </div>
                  </div>

                  <div className="w-full bg-[#050510] h-2 rounded-full overflow-hidden border border-white/5">
                    <div 
                      className={`h-full rounded-full transition-all duration-500`}
                      style={{ 
                        backgroundColor: cat.color,
                        width: `${ratio * 100}%`
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* ACTION BUTTON PACK */}
          <div className="mt-2 pt-4 border-t border-white/5 flex flex-col sm:flex-row gap-4">
            <button
              id="results-retry-btn"
              onClick={onRetry}
              className="flex-1 py-4 bg-gradient-to-r from-cyan-400 to-indigo-500 hover:brightness-110 text-black font-sans font-black text-xs rounded-xl uppercase tracking-[0.25em] italic shadow-[0_0_20px_rgba(34,211,238,0.25)] hover:shadow-[0_0_25px_rgba(34,211,238,0.45)] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <RotateCcw className="h-4.5 w-4.5" /> Retry Track
            </button>
            <button
              id="results-select-btn"
              onClick={onBack}
              className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-sans font-black text-xs rounded-xl border border-white/5 uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              Select different Song
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
