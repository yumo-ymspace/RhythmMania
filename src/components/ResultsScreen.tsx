/**
 * @license
 * SPDX-License-Identifier: GPL-3.0-only
 */

import React from 'react';
import { RotateCcw, ChevronLeft, Award, Flame, BarChart2, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
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
    combo,
    maxCombo,
    accuracy,
    marvelousCount,
    perfectCount,
    greatCount,
    goodCount,
    badCount,
    missCount
  } = scoreState;

  // Grade calculator following competitive standards:
  // SS: 100% accuracy
  // S: >= 95% accuracy
  // A: >= 90% accuracy
  // B: >= 80% accuracy
  // C: >= 70% accuracy
  // D: < 70% accuracy
  const getGrade = (acc: number): { char: string; color: string; bg: string; border: string; desc: string } => {
    if (acc >= 100) return { char: 'SS', color: 'text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.5)]', bg: 'bg-cyan-950/20', border: 'border-cyan-500/30', desc: 'absolute mastery' };
    if (acc >= 95) return { char: 'S', color: 'text-amber-400 shadow-[0_0_20px_rgba(250,204,21,0.5)]', bg: 'bg-amber-950/20', border: 'border-amber-500/30', desc: 'outstanding precision' };
    if (acc >= 90) return { char: 'A', color: 'text-green-400', bg: 'bg-green-950/10', border: 'border-green-500/20', desc: 'excellent performance' };
    if (acc >= 80) return { char: 'B', color: 'text-blue-400', bg: 'bg-blue-950/10', border: 'border-blue-500/20', desc: 'steady rhythm' };
    if (acc >= 70) return { char: 'C', color: 'text-pink-400', bg: 'bg-pink-950/10', border: 'border-pink-500/20', desc: 'room to improve' };
    return { char: 'D', color: 'text-rose-500', bg: 'bg-rose-950/10', border: 'border-rose-500/20', desc: 'practice makes perfect' };
  };

  const grade = getGrade(accuracy);

  // Stats
  const hitCategories = [
    { name: 'MARVELOUS', count: marvelousCount, color: '#22d3ee', wt: 320 },
    { name: 'PERFECT', count: perfectCount, color: '#facc15', wt: 300 },
    { name: 'GREAT', count: greatCount, color: '#4ade80', wt: 200 },
    { name: 'GOOD', count: goodCount, color: '#3b82f6', wt: 100 },
    { name: 'BAD', count: badCount, color: '#ec4899', wt: 55 },
    { name: 'MISS', count: missCount, color: '#ef4444', wt: 0 },
  ];

  const totalHits = hitCategories.reduce((acc, cat) => acc + cat.count, 0);

  return (
    <div id="results-screen-container" className="flex flex-col gap-4 w-full max-w-5xl mx-auto h-full p-2 lg:p-4 animate-fade-in text-slate-100 pb-12">
      
      {/* HEADER: EXIT CONTROLS */}
      <div className="flex justify-between items-center bg-[#0a0a0c] border border-white/10 p-3 rounded">
        <div className="flex items-center gap-3">
          <span className="p-2 bg-white/5 rounded border border-white/10">
            <ShieldCheck className="h-4.5 w-4.5 text-cyan-400" />
          </span>
          <div>
            <span className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">MATCH ANALYSIS MATRIX</span>
            <h2 className="text-base font-black font-sans leading-none mt-0.5 tracking-tighter uppercase italic text-slate-100">Performance Summary</h2>
          </div>
        </div>

        <button
          id="results-exit-btn"
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 font-sans text-[11px] font-bold uppercase tracking-widest rounded border border-white/10 transition cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" /> CHOOSER MENU
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* LEFT COLUMN: HERO SCORE AND GRADE CARD */}
        <div className="md:col-span-4 flex flex-col gap-4">
          
          {/* VISUAL RANK CARD */}
          <div className={`p-6 rounded border ${grade.border} ${grade.bg} text-center flex flex-col items-center justify-center relative overflow-hidden h-[260px]`}>
            <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest absolute top-4">PERFORMANCE RANK</span>
            
            <div className="my-auto flex flex-col items-center">
              <span className={`text-7xl font-black italic tracking-tighter filter drop-shadow-[0_0_20px_rgba(34,211,238,0.35)] ${grade.color}`}>
                {grade.char}
              </span>
              <span className="text-[10px] text-slate-400 font-sans tracking-wide mt-1 capitalize uppercase font-bold">
                // {grade.desc}
              </span>
            </div>

            <div className="absolute bottom-4 flex gap-1.5 items-center justify-center font-mono text-[9px] text-slate-500 uppercase tracking-widest">
              <Award className="h-4 w-4 text-cyan-400 animate-pulse" />
              <span>Certified Rank</span>
            </div>
          </div>

          {/* CRITICAL STATS BLOCK */}
          <div className="bg-[#0a0a0d]/80 border border-white/10 p-4 rounded flex flex-col gap-3">
            <div className="flex justify-between items-center border-b border-white/5 pb-2">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Final Score</span>
              <span className="font-mono text-lg font-black text-slate-100">{score.toLocaleString()}</span>
            </div>
            
            <div className="flex justify-between items-center border-b border-white/5 pb-2">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Accuracy Ratio</span>
              <span className="font-mono text-lg font-black text-cyan-400">{accuracy.toFixed(2)}%</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Max Combo Link</span>
              <div className="flex items-center gap-1 font-mono text-lg font-black text-amber-400">
                <Flame className="h-4 w-4 text-amber-500 fill-current animate-pulse" />
                <span>{maxCombo}x</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: DETAILED ANALYSIS PLOTS */}
        <div className="md:col-span-8 bg-[#0a0a0d] border border-white/10 p-5 rounded flex flex-col gap-4">
          
          <div className="flex items-center gap-2 border-b border-white/5 pb-3">
            <BarChart2 className="h-4.5 w-4.5 text-cyan-500" />
            <span className="font-bold text-[10px] text-slate-400 uppercase tracking-widest">Precision Judgement Telemetry</span>
          </div>

          {/* DYNAMIC HITS HORIZONTAL CHOP GRAPHS */}
          <div className="flex flex-col gap-3 flex-1 justify-center">
            {hitCategories.map((cat) => {
              const ratio = totalHits > 0 ? (cat.count / totalHits) : 0;
              const ratioPercent = (ratio * 100).toFixed(1);

              return (
                <div key={cat.name} className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-[11px] font-mono">
                    <div className="flex items-center gap-2 font-black tracking-wider uppercase" style={{ color: cat.color }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                      <span>{cat.name}</span>
                    </div>
                    
                    <div className="flex items-center gap-3 text-slate-500">
                      <span>{cat.count} hits</span>
                      <span className="font-black text-slate-350 w-12 text-right">{ratioPercent}%</span>
                    </div>
                  </div>

                  {/* CUSTOM TIMELINE ROW GRAPH BAR */}
                  <div className="w-full bg-[#050505] h-1.5 rounded-full overflow-hidden border border-white/5">
                    <div 
                      className="h-full rounded-full transition-all duration-500"
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

          {/* ACTION CLICKS BAR */}
          <div className="mt-2 pt-4 border-t border-white/5 flex flex-col sm:flex-row gap-3">
            <button
              id="results-retry-btn"
              onClick={onRetry}
              className="flex-1 py-3 bg-gradient-to-r from-cyan-400 to-indigo-500 hover:brightness-110 text-black font-sans font-black text-xs rounded uppercase tracking-[0.2em] italic shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:scale-[1.01] active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <RotateCcw className="h-4 w-4" /> RETRY TRACK
            </button>
            <button
              id="results-select-btn"
              onClick={onBack}
              className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-slate-350 hover:text-white font-sans font-black text-xs rounded border border-white/10 uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              SELECT OTHER MUSIC
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
