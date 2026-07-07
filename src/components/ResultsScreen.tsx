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

import React, { useState, useMemo } from 'react';
import { RotateCcw, ChevronLeft, User, Play, Calendar, Trophy, Percent, Flame, Video } from 'lucide-react';
import { Beatmap, ScoreState, PlayHistoryRecord } from '../types';

interface ResultsScreenProps {
  scoreState: ScoreState;
  beatmap: Beatmap;
  playHistory?: PlayHistoryRecord[];
  onRetry: () => void;
  onWatchReplay?: (record: PlayHistoryRecord) => void;
  onBack: () => void;
  onBackToHistory?: () => void;
}

export default function ResultsScreen({
  scoreState,
  beatmap,
  playHistory = [],
  onRetry,
  onWatchReplay,
  onBack,
  onBackToHistory
}: ResultsScreenProps) {
  // 1. Gather all logged play runs for this specific beatmap
  const mapRecords = useMemo(() => {
    return playHistory
      .filter(r => r.beatmapId === beatmap.id && !r.isFailed)
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [playHistory, beatmap.id]);

  // 2. Local selection state for the active run being inspected
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);

  // 3. Resolve active run or fallback to raw scoreState from props
  const activeRecord = useMemo(() => {
    if (selectedRecordId) {
      return mapRecords.find(r => r.id === selectedRecordId) || null;
    }
    // Match by score or fallback to most recent
    const matching = mapRecords.find(r => r.score === scoreState.score && Math.abs(r.accuracy - scoreState.accuracy) < 0.05);
    return matching || mapRecords[0] || null;
  }, [selectedRecordId, mapRecords, scoreState]);

  // Active stats to render
  const activeScoreState = activeRecord ? activeRecord.scoreState : scoreState;
  const activeMods = activeRecord ? activeRecord.mods : undefined;

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
  } = activeScoreState;

  const getGrade = (acc: number): { char: string; color: string; ringColor: string } => {
    if (activeScoreState.failed) return { char: 'F', color: 'text-rose-500', ringColor: '#ef4444' };
    if (acc >= 100) return { char: 'SS', color: 'text-zinc-100 drop-shadow-[0_0_15px_rgba(255,255,255,0.8)]', ringColor: '#f4f4f5' };
    if (acc >= 95) return { char: 'S', color: 'text-cyan-300 drop-shadow-[0_0_15px_rgba(103,232,249,0.8)]', ringColor: '#67e8f9' };
    if (acc >= 90) return { char: 'A', color: 'text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.6)]', ringColor: '#34d399' };
    if (acc >= 80) return { char: 'B', color: 'text-indigo-400 drop-shadow-[0_0_15px_rgba(129,140,248,0.6)]', ringColor: '#818cf8' };
    if (acc >= 70) return { char: 'C', color: 'text-pink-400 drop-shadow-[0_0_15px_rgba(244,114,182,0.6)]', ringColor: '#f472b6' };
    return { char: 'D', color: 'text-rose-500 drop-shadow-[0_0_15px_rgba(244,63,94,0.6)]', ringColor: '#f43f5e' };
  };

  const grade = getGrade(accuracy);
  const totalHits = marvelousCount + perfectCount + greatCount + goodCount + badCount + missCount;

  // Find historical rank of activeRecord compared to all plays of this song difficulty
  const activePlayRank = useMemo(() => {
    if (mapRecords.length === 0 || !activeRecord) return 1;
    const sorted = [...mapRecords].sort((a, b) => b.score - a.score);
    const index = sorted.findIndex(r => r.id === activeRecord.id);
    return index !== -1 ? index + 1 : 1;
  }, [mapRecords, activeRecord]);

  const formatDate = (timestamp: number) => {
    try {
      const d = new Date(timestamp);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return 'Unknown';
    }
  };

  const getMiniGradeStyle = (grd: string) => {
    switch (grd) {
      case 'SS': return 'text-zinc-100 bg-white/5 border-white/20';
      case 'S': return 'text-cyan-300 bg-cyan-400/5 border-cyan-400/25';
      case 'A': return 'text-emerald-400 bg-emerald-400/5 border-emerald-400/25';
      case 'B': return 'text-indigo-400 bg-indigo-400/5 border-indigo-400/25';
      case 'C': return 'text-pink-400 bg-pink-400/5 border-pink-400/25';
      default: return 'text-rose-500 bg-rose-500/5 border-rose-500/25';
    }
  };

  return (
    <div id="results-screen-container" className="relative flex flex-col items-center justify-center h-full w-full text-slate-100 overflow-hidden bg-zinc-950 select-none">
      
      {/* Background Cover Blur */}
      {beatmap.bgUrl && (
        <>
          <div 
            className="absolute inset-0 z-0 opacity-15 scale-105 pointer-events-none"
            style={{
              backgroundImage: `url(${beatmap.bgUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'blur(35px)',
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-zinc-950/60 z-0 pointer-events-none" />
        </>
      )}

      {/* Main Container - Left details, right stats card */}
      <div className="relative z-10 w-full h-full flex flex-col md:flex-row items-stretch overflow-hidden">
        
        {/* LEFT COLUMN: SCROLLABLE LIST OF ALL PERFORMANCE RECORDS */}
        <div className="md:w-[400px] md:max-w-[400px] flex flex-col bg-[#141419]/90 border-r border-white/5 p-6 backdrop-blur-xl shrink-0 overflow-hidden h-[300px] md:h-auto z-10 shadow-xl">
          <div className="flex items-center justify-between border-b border-white/5 pb-2.5 mb-4 shrink-0">
            <div>
              <span className="text-[9px] text-slate-500 font-mono tracking-widest uppercase block">// PERFORMANCES DATABASE</span>
              <h3 className="text-sm font-black text-white tracking-wide uppercase flex items-center gap-1.5 mt-0.5">
                <Trophy className="h-4 w-4 text-amber-400" />
                Records ({mapRecords.length})
              </h3>
            </div>
            <span className="text-[10px] text-slate-400 font-semibold bg-white/5 border border-white/5 px-2 py-0.5 rounded-full font-mono">
              {beatmap.keyCount}K Mode
            </span>
          </div>

          {/* Performances list scrollable box */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {mapRecords.length > 0 ? (
              mapRecords.map((run, index) => {
                const isActive = activeRecord?.id === run.id;
                const dateStr = formatDate(run.timestamp);
                const gStyle = getMiniGradeStyle(run.grade);

                return (
                  <div
                    key={run.id}
                    onClick={() => setSelectedRecordId(run.id)}
                    className={`p-3 rounded-2xl border transition-all duration-150 flex items-center justify-between gap-3 relative overflow-hidden group cursor-pointer ${
                      isActive 
                        ? 'bg-gradient-to-r from-cyan-500/10 to-indigo-500/5 border-cyan-500/40 shadow-lg shadow-cyan-500/5'
                        : 'bg-white/[0.02] border-white/[0.04] hover:bg-white/[0.04] hover:border-white/10'
                    }`}
                  >
                    {/* Active highlight side line */}
                    {isActive && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-400" />
                    )}

                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Performance rank badge */}
                      <span className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center font-bold text-xs border font-serif italic ${gStyle}`}>
                        {run.grade}
                      </span>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-white truncate max-w-[130px]">
                            {run.score.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            #{index + 1}
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                          <Calendar className="h-2.5 w-2.5" />
                          {dateStr}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right flex flex-col font-mono text-[10px] hidden sm:flex">
                        <span className="text-cyan-400 font-extrabold">{run.accuracy.toFixed(2)}%</span>
                        <span className="text-slate-500 text-[9px]">{run.maxCombo}x combo</span>
                      </div>

                      {onWatchReplay && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onWatchReplay(run);
                          }}
                          className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/10 hover:border-cyan-500/20 active:scale-90 transition-all cursor-pointer"
                          title="Watch Replay Replay"
                        >
                          <Play className="h-3 w-3 fill-current" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Trophy className="h-8 w-8 text-zinc-600 mb-2" />
                <span className="text-xs text-slate-400 font-bold">No runs logged yet</span>
                <span className="text-[10px] text-zinc-600 max-w-[200px] mt-1">
                  Fully complete this song difficulty level to see your logs here.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* CENTER / RIGHT COLUMN: DYNAMIC OSU STATS CARD */}
        <div className="flex-1 flex flex-col bg-[#1C1C22]/95 border-l border-white/5 shadow-[0_25px_60px_rgba(0,0,0,0.65)] backdrop-blur-2xl px-6 py-6 items-center text-center overflow-y-auto scrollbar-none justify-between">
          
          {/* Header row with rank index */}
          <div className="w-full flex justify-between items-center shrink-0 py-1 border-b border-white/5 mb-4 relative gap-3">
            <div className="flex items-center gap-3">
              {onBackToHistory && (
                <button 
                  onClick={onBackToHistory}
                  className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-white flex items-center gap-1.5 transition-all z-20 cursor-pointer border border-white/5 shadow-md"
                  title="Back to History"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="text-[11px] font-bold uppercase tracking-wider hidden sm:block">History</span>
                </button>
              )}
              <span className="text-[10px] font-black text-indigo-400 tracking-wider font-mono">
                // STATS INSPECTING
              </span>
            </div>

            <div className="flex items-center gap-1 bg-white/5 border border-white/5 px-2.5 py-1 rounded-full text-[10px] text-zinc-300 font-bold shadow ml-auto">
              <User className="h-3 w-3 text-cyan-400" />
              <span>Player</span>
              {mapRecords.length > 0 && activeRecord && (
                <span className="text-cyan-300 font-mono text-[9px] border-l border-white/10 pl-1.5 ml-1.5">
                  Rank #{activePlayRank} / {mapRecords.length}
                </span>
              )}
            </div>
          </div>

          {/* Beatmap details */}
          <div className="w-full text-center shrink-0 mb-4 mt-2">
            <h2 className="text-lg md:text-xl font-black text-white font-sans max-w-full truncate">
              {beatmap.title}
            </h2>
            <div className="flex items-center justify-center gap-1.5 text-xs text-zinc-400 font-bold mt-0.5">
              <span>{beatmap.artist}</span>
              <span className="text-zinc-600">•</span>
              {!isNaN(Number(beatmap.difficulty)) && (
                <span className="text-rose-400 font-black flex items-center gap-0.5">
                  ★ {(Number(beatmap.difficulty) * 0.5 + 2).toFixed(2)}
                </span>
              )}
            </div>
          </div>

          {/* Huge Dynamic Grade Ring */}
          <div className="relative w-44 h-44 md:w-52 md:h-52 flex items-center justify-center mb-4 shrink-0">
            <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full -rotate-90 drop-shadow-[0_0_15px_rgba(0,0,0,0.6)]">
               <circle 
                 cx="50" cy="50" r="45" 
                 fill="none" 
                 stroke="rgba(255,255,255,0.03)" 
                 strokeWidth="6" 
               />
               <circle 
                 cx="50" cy="50" r="45" 
                 fill="none" 
                 stroke={grade.ringColor}
                 strokeWidth="6" 
                 strokeDasharray="283"
                 strokeDashoffset={283 - (283 * Math.max(accuracy, 100)) / 100}
                 strokeLinecap="round"
                 className="transition-all duration-[1200ms] ease-out"
               />
            </svg>
            
            <div className="flex flex-col items-center justify-center absolute">
              <span className={`text-[70px] md:text-[85px] leading-none font-black italic tracking-tighter ${grade.color} select-none drop-shadow-2xl`}>
                {grade.char}
              </span>
            </div>
          </div>

          {/* Huge numerical score readout */}
          <div className="mb-4 shrink-0">
            <span className="text-[36px] md:text-[44px] leading-none font-extralight tracking-widest text-white drop-shadow">
              {score.toLocaleString()}
            </span>
            
            {/* Display active mods list if available */}
            {activeMods && activeMods.length > 0 && (
              <div className="flex justify-center gap-1.5 mt-2">
                {activeMods.map(m => (
                  <span key={m} className="bg-amber-400/10 border border-amber-400/25 px-2 py-0.5 rounded text-[8px] uppercase tracking-widest font-mono text-amber-300 font-black shadow-md">
                    {m}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Metrics summary widget panel */}
          <div className="w-full flex flex-col gap-4 border-t border-white/5 pt-4">
            
            {/* 3 Columns details */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-white/[0.01] border border-white/[0.04] p-2.5 rounded-2xl flex flex-col items-center">
                <div className="flex items-center gap-1 text-[9px] uppercase font-bold text-zinc-500 tracking-wider">
                  <Percent className="h-3 w-3 text-cyan-400 shrink-0" />
                  Accuracy
                </div>
                <div className="text-base md:text-lg font-black text-cyan-400 mt-1">{accuracy.toFixed(2)}%</div>
              </div>

              <div className="bg-white/[0.01] border border-white/[0.04] p-2.5 rounded-2xl flex flex-col items-center">
                <div className="flex items-center gap-1 text-[9px] uppercase font-bold text-zinc-500 tracking-wider">
                  <Flame className="h-3 w-3 text-amber-400 shrink-0" />
                  Max Combo
                </div>
                <div className="text-base md:text-lg font-black text-amber-400 mt-1">{maxCombo}x</div>
              </div>

              <div className="bg-white/[0.01] border border-white/[0.04] p-2.5 rounded-2xl flex flex-col items-center">
                <div className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider">Total Hits</div>
                <div className="text-base md:text-lg font-black text-zinc-300 mt-1">{totalHits}</div>
              </div>
            </div>

            {/* Judgements Breakdown Grid */}
            <div className="grid grid-cols-3 gap-3">
               <div className="flex flex-col items-center border border-white/5 rounded-2xl py-2.5 bg-black/35 group hover:border-[#22d3ee]/10 transition-all">
                 <span className="text-[9px] uppercase font-extrabold text-[#22d3ee] tracking-wider mb-0.5" style={{textShadow: "0 0 5px rgba(34,211,238,0.2)"}}>Marvelous</span>
                 <span className="text-white font-mono text-xs md:text-sm font-bold">{marvelousCount}</span>
               </div>
               <div className="flex flex-col items-center border border-white/5 rounded-2xl py-2.5 bg-black/35 group hover:border-[#facc15]/10 transition-all">
                 <span className="text-[9px] uppercase font-extrabold text-[#facc15] tracking-wider mb-0.5" style={{textShadow: "0 0 5px rgba(250,204,21,0.2)"}}>Perfect</span>
                 <span className="text-white font-mono text-xs md:text-sm font-bold">{perfectCount}</span>
               </div>
               <div className="flex flex-col items-center border border-white/5 rounded-2xl py-2.5 bg-black/35 group hover:border-[#4ade80]/10 transition-all">
                 <span className="text-[9px] uppercase font-bold text-[#4ade80] tracking-wider mb-0.5">Great</span>
                 <span className="text-white font-mono text-xs md:text-sm font-bold">{greatCount}</span>
               </div>
               <div className="flex flex-col items-center border border-white/5 rounded-2xl py-2.5 bg-black/35 group hover:border-[#3b82f6]/10 transition-all">
                 <span className="text-[9px] uppercase font-bold text-[#3b82f6] tracking-wider mb-0.5">Good</span>
                 <span className="text-white font-mono text-xs md:text-sm font-bold">{goodCount}</span>
               </div>
               <div className="flex flex-col items-center border border-white/5 rounded-2xl py-2.5 bg-black/35 group hover:border-[#ec4899]/10 transition-all">
                 <span className="text-[9px] uppercase font-bold text-[#ec4899] tracking-wider mb-0.5">Bad</span>
                 <span className="text-white font-mono text-xs md:text-sm font-bold">{badCount}</span>
               </div>
               <div className="flex flex-col items-center border border-white/5 rounded-2xl py-2.5 bg-black/35 group hover:border-[#ef4444]/10 transition-all">
                 <span className="text-[9px] uppercase font-bold text-[#ef4444] tracking-wider mb-0.5">Miss</span>
                 <span className="text-white font-mono text-xs md:text-sm font-bold">{missCount}</span>
               </div>
            </div>

          </div>

          {/* Action bottom dashboard block */}
          <div className="flex flex-row gap-3 w-full mt-4 shrink-0">
            <button
              id="results-retry-btn"
              onClick={onRetry}
              className="flex-1 py-3 px-4 bg-zinc-850 hover:bg-zinc-800 border border-white/10 text-white font-sans font-bold text-xs rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all outline-none cursor-pointer shadow-md"
            >
              <RotateCcw className="h-4 w-4" /> Retry Song
            </button>
            
            {onWatchReplay && activeRecord && activeRecord.replayFrames && activeRecord.replayFrames.length > 0 && (
              <button
                id="results-watch-replay-btn"
                onClick={() => onWatchReplay(activeRecord)}
                className="flex-1 py-3 px-4 bg-cyan-600/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-400 font-sans font-bold text-xs rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all outline-none cursor-pointer shadow-md"
              >
                <Video className="h-4 w-4" /> Watch Replay
              </button>
            )}

            <button
              id="results-select-btn"
              onClick={onBack}
              className="flex-1 py-3 px-4 bg-indigo-500 hover:bg-indigo-400 text-white font-sans font-bold text-xs rounded-2xl flex items-center justify-center gap-2 shadow-[0_4px_25px_rgba(99,102,241,0.35)] active:scale-95 transition-all outline-none cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
          </div>

        </div>

      </div>
      
    </div>
  );
}
