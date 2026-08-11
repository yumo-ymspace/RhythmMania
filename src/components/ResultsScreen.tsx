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
import { RotateCcw, ChevronLeft, Video, ArrowLeft, Trash2, Download } from 'lucide-react';
import { Beatmap, ScoreState, PlayHistoryRecord } from '../types';
import { sanitizeCssUrl } from '../utils/securityLimits';
import { downloadReplayExport } from '../utils/replayTransfer';
import { computeGradeFromScoreState } from '../utils/scoreCalculator';
import HitErrorGraph from './HitErrorGraph';
import { resolveStarRating } from '../utils/starRating';

interface ResultsScreenProps {
  scoreState: ScoreState;
  beatmap: Beatmap;
  playHistory?: PlayHistoryRecord[];
  currentMods?: string[];
  hitErrors?: number[] | null;
  onRetry: () => void;
  onWatchReplay?: (record: PlayHistoryRecord) => Promise<{ success: boolean; error?: string }> | void;
  onBack: () => void;
  onBackToHistory?: () => void;
  onDeleteRecord?: (id: string) => void;
}

export default function ResultsScreen({
  scoreState,
  beatmap,
  playHistory = [],
  currentMods,
  hitErrors,
  onRetry,
  onWatchReplay,
  onBack,
  onBackToHistory,
  onDeleteRecord
}: ResultsScreenProps) {
  // 1. Gather play runs for this beatmap
  const mapRecords = useMemo(() => {
    const baseId = beatmap.id.includes('_converted_')
      ? beatmap.id.split('_converted_')[0]
      : beatmap.id;
    return playHistory
      .filter(r =>
        !r.isFailed && (
          r.beatmapId === beatmap.id ||
          (baseId && r.beatmapId === baseId) ||
          (beatmap.catalogMapId && r.catalogMapId === beatmap.catalogMapId) ||
          (beatmap.beatmapHash && r.beatmapHash === beatmap.beatmapHash)
        )
      )
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [playHistory, beatmap.id, beatmap.catalogMapId, beatmap.beatmapHash]);

  // 2. Local selection state for inspecting runs
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);

  // 3. Resolve active run or fallback to raw scoreState
  const activeRecord = useMemo(() => {
    if (selectedRecordId) {
      return mapRecords.find(r => r.id === selectedRecordId) || null;
    }
    if (scoreState.recordId) {
      const matchById = mapRecords.find(r => r.id === scoreState.recordId);
      if (matchById) return matchById;
    }
    return null;
  }, [selectedRecordId, mapRecords, scoreState]);

  const activeScoreState = activeRecord ? activeRecord.scoreState : scoreState;
  const activeMods = activeRecord ? activeRecord.mods : (currentMods || undefined);

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

  // Grade color themes & classes
  const getGradeTheme = (acc: number) => {
    const gradeChar = computeGradeFromScoreState(activeScoreState);
    if (gradeChar === 'F') {
      return {
        char: 'F',
        textColor: 'text-rose-500',
        borderColor: 'border-rose-500/50',
        glowBg: 'rgba(239, 68, 68, 0.15)',
        glowShadow: 'shadow-[0_0_25px_rgba(239,68,68,0.4)]',
        ringColor: '#ef4444'
      };
    }
    if (gradeChar === 'SS') {
      return {
        char: 'SS',
        textColor: 'text-zinc-100',
        borderColor: 'border-zinc-200/50',
        glowBg: 'rgba(250, 250, 250, 0.15)',
        glowShadow: 'shadow-[0_0_25px_rgba(255,255,255,0.4)]',
        ringColor: '#f4f4f5'
      };
    }
    if (gradeChar === 'S') {
      return {
        char: 'S',
        textColor: 'text-yellow-400',
        borderColor: 'border-yellow-400/50',
        glowBg: 'rgba(250, 204, 21, 0.15)',
        glowShadow: 'shadow-[0_0_30px_rgba(250,204,21,0.55)]',
        ringColor: '#facc15'
      };
    }
    if (gradeChar === 'A') {
      return {
        char: 'A',
        textColor: 'text-emerald-400',
        borderColor: 'border-emerald-400/50',
        glowBg: 'rgba(52, 211, 153, 0.15)',
        glowShadow: 'shadow-[0_0_25px_rgba(52,211,153,0.4)]',
        ringColor: '#34d399'
      };
    }
    if (gradeChar === 'B') {
      return {
        char: 'B',
        textColor: 'text-indigo-400',
        borderColor: 'border-indigo-400/50',
        glowBg: 'rgba(129, 140, 248, 0.15)',
        glowShadow: 'shadow-[0_0_25px_rgba(129,140,248,0.4)]',
        ringColor: '#818cf8'
      };
    }
    if (gradeChar === 'C') {
      return {
        char: 'C',
        textColor: 'text-pink-400',
        borderColor: 'border-pink-400/50',
        glowBg: 'rgba(244, 114, 182, 0.15)',
        glowShadow: 'shadow-[0_0_25px_rgba(244,114,182,0.4)]',
        ringColor: '#f472b6'
      };
    }
    return {
      char: 'D',
      textColor: 'text-rose-500',
      borderColor: 'border-rose-500/50',
      glowBg: 'rgba(244, 63, 94, 0.15)',
      glowShadow: 'shadow-[0_0_25px_rgba(244,63,94,0.4)]',
      ringColor: '#f43f5e'
    };
  };

  const grade = getGradeTheme(accuracy);

  // Check if this run is the all-time high score
  const isNewRecord = useMemo(() => {
    if (activeScoreState.isAutoplay || (activeMods && activeMods.includes('AT'))) return false;
    if (mapRecords.length <= 1) return true;
    const maxPastScore = Math.max(...mapRecords.map(r => r.id === activeRecord?.id ? 0 : r.score));
    return score >= maxPastScore;
  }, [mapRecords, activeRecord, score, activeScoreState.isAutoplay, activeMods]);

  const formatDate = (timestamp: number) => {
    try {
      const d = new Date(timestamp);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return 'Unknown';
    }
  };

  const currentBg = beatmap.bgUrl || '/backgrounds/nikio.webp';

  return (
    <div id="results-screen-container" className="relative flex flex-col h-full w-full text-slate-100 overflow-hidden bg-zinc-950 select-none">
      
      {/* 1. FULL VIEWPORT BACKGROUND COVER IMAGE */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-45 scale-102 blur-[2px] transition-all duration-700 ease-in-out"
          style={{ backgroundImage: `url("${sanitizeCssUrl(currentBg)}")` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/70 to-zinc-900/80" />
        <div className="absolute inset-0 bg-black/50" />
      </div>

      {/* 2. TOP BAR HEADER */}
      <header className="h-16 w-full bg-black/80 backdrop-blur-md border-b border-white/10 px-6 lg:px-10 flex items-center justify-between z-20 relative shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          {onBackToHistory && (
            <button 
              onClick={onBackToHistory}
              className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl text-white flex items-center gap-1.5 transition-all cursor-pointer border border-white/10 font-bold text-xs uppercase tracking-wider"
              title="Back to Performance History"
            >
              <ChevronLeft className="w-4 h-4 text-skin-accent" />
              <span>History</span>
            </button>
          )}

          <div className="flex flex-col text-left min-w-0">
            <h2 className="text-sm md:text-base font-black text-white font-sans truncate tracking-tight leading-tight">
              {beatmap.title}
            </h2>
            <p className="text-[11px] text-slate-400 font-semibold tracking-wider uppercase mt-0.5 truncate">
               {beatmap.artist} • <span className="text-rose-400 font-extrabold">★ {resolveStarRating(beatmap).toFixed(2)}</span>
            </p>
          </div>
        </div>

        {/* Play log inspector dropdown if there are other runs */}
        <div className="flex items-center gap-3">
          {mapRecords.length > 1 && (
            <div className="flex items-center gap-2 bg-zinc-900/90 border border-white/10 px-3 py-1.5 rounded-xl text-xs">
              <span className="text-[9px] font-mono text-zinc-500 uppercase font-black">Compare:</span>
              <select
                value={selectedRecordId || ''}
                onChange={(e) => setSelectedRecordId(e.target.value || null)}
                className="bg-zinc-950 text-slate-200 outline-none border-none py-0.5 px-2 rounded font-bold cursor-pointer text-[11px]"
              >
                {mapRecords.map((run, idx) => (
                  <option key={run.id} value={run.id}>
                    Run #{idx + 1} ({run.accuracy.toFixed(1)}% - {formatDate(run.timestamp)})
                  </option>
                ))}
              </select>
            </div>
          )}

          <span className="px-3.5 py-1.5 bg-skin-accent-dim text-skin-accent text-[10px] tracking-widest font-mono font-black border border-skin-accent/25 rounded-full shadow-lg">
            {beatmap.keyCount}K MODE
          </span>
        </div>
      </header>

      {/* 3. VERTICALLY CENTERED HORIZONTAL SCORE BAR CONTAINER */}
      <div className="flex-1 w-full flex flex-col justify-start md:justify-center items-center z-10 px-4 overflow-y-auto py-6">
        
        <div className="w-full max-w-5xl py-8 md:py-10 bg-black/75 backdrop-blur-md border-y border-white/10 relative shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center w-full px-6 lg:px-12">
            
            {/* LEFT SECTION: CIRCULAR GRADE AND ACCURACY */}
            <div className="md:col-span-4 flex flex-col items-center justify-center relative">
              <div className={`relative w-40 h-40 md:w-48 md:h-48 rounded-full border-4 ${grade.borderColor} ${grade.glowShadow} flex flex-col items-center justify-center transition-all duration-500`}
                   style={{ backgroundColor: grade.glowBg }}>
                
                {/* Subtle radial inner glow */}
                <div className="absolute inset-2 rounded-full opacity-45 bg-radial from-white via-transparent to-transparent blur-sm" />
                
                {/* Big typography Grade character with RhythmMania logo font */}
                <span className={`font-sans font-black tracking-tight text-7xl md:text-8xl leading-none uppercase ${grade.textColor} select-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] z-10`}>
                  {grade.char}
                </span>

                {/* Accuracy percentage read-out positioned cleanly below grade */}
                <span className="text-white/90 text-sm md:text-base font-sans font-black tracking-wider mt-1 drop-shadow z-10 uppercase">
                  {accuracy.toFixed(2)}%
                </span>
              </div>
            </div>

            {/* CENTER SECTION: DETAILED SCORE AND COMBO READOUT */}
            <div className="md:col-span-4 flex flex-col items-center md:items-start text-center md:text-left gap-2.5">
              
              <div className="flex items-center gap-3">
                <span className="text-zinc-500 font-sans font-black text-sm uppercase tracking-widest">
                  Score
                </span>
                
                {(activeScoreState.isAutoplay || (activeMods && activeMods.includes('AT'))) ? (
                  <span className="px-3 py-1 bg-sky-500/20 text-sky-400 font-sans font-black text-[9px] uppercase tracking-wider rounded-lg border border-sky-500/40 shadow-[0_0_15px_rgba(56,189,248,0.25)] flex items-center gap-1">
                    <span>UNRANKED (AUTOPLAY)</span>
                  </span>
                ) : isNewRecord ? (
                  <span className="px-3 py-1 bg-amber-500 text-slate-950 font-sans font-black text-[9px] uppercase tracking-wider rounded-lg shadow-[0_0_15px_rgba(245,158,11,0.5)] animate-pulse border border-white/25">
                    New Record
                  </span>
                ) : null}
              </div>

              {/* Giant clean spacing numeric readout */}
              <h1 className="text-5xl md:text-6xl font-black text-white tracking-normal font-sans leading-none">
                {score.toLocaleString()}
              </h1>

              {/* Max Combo underneath */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-400 font-sans font-bold text-sm uppercase tracking-wide mt-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Max Combo:</span>
                  <span className="text-white font-black">{maxCombo.toLocaleString()}</span>
                </div>
              </div>

              {/* Active mods sub-pills row */}
              {activeMods && activeMods.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {activeMods.map(m => (
                    <span key={m} className="bg-pink-500/15 border border-pink-500/30 px-2.5 py-0.5 rounded text-[8px] uppercase tracking-widest font-mono text-pink-400 font-black">
                      {m}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-2">
                  <span className="bg-zinc-800/60 border border-white/5 px-2.5 py-0.5 rounded text-[8px] uppercase tracking-widest font-mono text-zinc-500 font-black">
                    No Mods
                  </span>
                </div>
              )}
            </div>

            {/* RIGHT SECTION: JUDGEMENT COUNT VERTICAL ROW BADGES */}
            <div className="md:col-span-4 flex flex-col gap-2 max-w-xs w-full mx-auto md:mx-0">
              
              {/* Marvelous pill */}
              <div className="flex items-center justify-between bg-zinc-950/40 p-1.5 rounded-2xl border border-white/[0.02]">
                <div className="bg-cyan-400 text-slate-950 px-3.5 py-1 text-[10px] font-black uppercase rounded-xl tracking-wider shadow-sm min-w-[90px] text-center">
                  Marvelous
                </div>
                <span className="font-mono text-sm md:text-base font-extrabold text-white pr-3">
                  {marvelousCount}
                </span>
              </div>

              {/* Perfect pill */}
              <div className="flex items-center justify-between bg-zinc-950/40 p-1.5 rounded-2xl border border-white/[0.02]">
                <div className="bg-teal-600 text-white px-3.5 py-1 text-[10px] font-black uppercase rounded-xl tracking-wider shadow-sm min-w-[90px] text-center">
                  Perfect
                </div>
                <span className="font-mono text-sm md:text-base font-extrabold text-white pr-3">
                  {perfectCount}
                </span>
              </div>

              {/* Great pill */}
              <div className="flex items-center justify-between bg-zinc-950/40 p-1.5 rounded-2xl border border-white/[0.02]">
                <div className="bg-green-600 text-white px-3.5 py-1 text-[10px] font-black uppercase rounded-xl tracking-wider shadow-sm min-w-[90px] text-center">
                  Great
                </div>
                <span className="font-mono text-sm md:text-base font-extrabold text-white pr-3">
                  {greatCount}
                </span>
              </div>

              {/* Good pill */}
              <div className="flex items-center justify-between bg-zinc-950/40 p-1.5 rounded-2xl border border-white/[0.02]">
                <div className="bg-amber-600 text-white px-3.5 py-1 text-[10px] font-black uppercase rounded-xl tracking-wider shadow-sm min-w-[90px] text-center">
                  Good
                </div>
                <span className="font-mono text-sm md:text-base font-extrabold text-white pr-3">
                  {goodCount}
                </span>
              </div>

              {/* Bad pill */}
              <div className="flex items-center justify-between bg-zinc-950/40 p-1.5 rounded-2xl border border-white/[0.02]">
                <div className="bg-purple-700 text-white px-3.5 py-1 text-[10px] font-black uppercase rounded-xl tracking-wider shadow-sm min-w-[90px] text-center">
                  Bad
                </div>
                <span className="font-mono text-sm md:text-base font-extrabold text-white pr-3">
                  {badCount}
                </span>
              </div>

              {/* Miss pill */}
              <div className="flex items-center justify-between bg-zinc-950/40 p-1.5 rounded-2xl border border-white/[0.02]">
                <div className="bg-red-800 text-white px-3.5 py-1 text-[10px] font-black uppercase rounded-xl tracking-wider shadow-sm min-w-[90px] text-center">
                  Miss
                </div>
                <span className="font-mono text-sm md:text-base font-extrabold text-white pr-3">
                  {missCount}
                </span>
              </div>

            </div>

          </div>

        </div>

        {/* Session-only hit error distribution for the run just played (or watched replay);
            hidden while inspecting an older run from the selector. */}
        {hitErrors && hitErrors.length >= 2 && (!activeRecord || activeRecord.id === scoreState.recordId) && (
          <HitErrorGraph errors={hitErrors} unstableRate={activeScoreState.unstableRate} />
        )}

        {/* 4. Sleek control buttons arranged neatly underneath the horizontal bar */}
        <div className="flex flex-row items-center justify-center gap-4 mt-8 w-full max-w-3xl px-4">
          
          <button
            id="results-retry-btn"
            onClick={onRetry}
            className="flex-1 min-w-[120px] md:min-w-[140px] py-3.5 px-4 md:px-6 bg-zinc-900/90 hover:bg-zinc-800 border border-white/10 hover:border-white/20 text-white font-sans font-black text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all outline-none cursor-pointer shadow-lg transform hover:scale-[1.01]"
          >
            <RotateCcw className="h-4 w-4 text-skin-accent" />
            <span className="whitespace-nowrap">Retry Song</span>
          </button>
          
          {replayError && <p role="alert" className="mt-3 text-center text-xs font-mono text-rose-300">{replayError}</p>}

          {onWatchReplay && activeRecord && activeRecord.replayFrames && activeRecord.replayFrames.length > 0 && (
            <button
              id="results-watch-replay-btn"
              onClick={async () => {
                setReplayError(null);
                const result = await onWatchReplay(activeRecord);
                if (result && !result.success) setReplayError(result.error || 'Replay playback could not be started.');
              }}
              className="flex-1 min-w-[120px] md:min-w-[140px] py-3.5 px-4 md:px-6 bg-cyan-600/20 hover:bg-cyan-500/30 border border-cyan-500/30 text-cyan-400 font-sans font-black text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all outline-none cursor-pointer shadow-lg transform hover:scale-[1.01]"
            >
              <Video className="h-4 w-4" />
              <span className="whitespace-nowrap">Watch Replay</span>
            </button>
          )}

          {activeRecord && (
            <button
              id="results-export-btn"
              title="Export this run as a replay file"
              onClick={() => downloadReplayExport([activeRecord], `${activeRecord.beatmapArtist} - ${activeRecord.beatmapTitle}`)}
              className="py-3.5 px-4 bg-zinc-900/90 hover:bg-zinc-800 border border-white/10 hover:border-white/20 text-slate-300 rounded-2xl flex items-center justify-center active:scale-95 transition-all outline-none cursor-pointer shadow-lg transform hover:scale-[1.01]"
            >
              <Download className="h-4 w-4" />
            </button>
          )}

          {onDeleteRecord && (
            <button
              id="results-delete-btn"
              disabled={!activeRecord}
              onClick={() => {
                if (!activeRecord) return;
                if (!showConfirmDelete) {
                  setShowConfirmDelete(true);
                  // Auto cancel after 3 seconds
                  setTimeout(() => setShowConfirmDelete(false), 3000);
                } else {
                  onDeleteRecord(activeRecord.id);
                  setSelectedRecordId(null);
                  setShowConfirmDelete(false);
                }
              }}
              className={`flex-1 min-w-[120px] md:min-w-[140px] py-3.5 px-4 md:px-6 font-sans font-black text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all outline-none cursor-pointer shadow-lg transform hover:scale-[1.01] disabled:opacity-30 disabled:pointer-events-none transition-all duration-300 ${
                showConfirmDelete 
                  ? 'bg-rose-600 hover:bg-rose-700 text-white border border-rose-400 shadow-rose-500/20' 
                  : 'bg-rose-950/20 hover:bg-rose-900/30 border border-rose-500/30 text-rose-400'
              }`}
              title="Delete this play record from your history"
            >
              <Trash2 className="h-4 w-4" />
              <span className="whitespace-nowrap">{showConfirmDelete ? 'Confirm?' : 'Delete Run'}</span>
            </button>
          )}

          <button
            id="results-select-btn"
            onClick={onBack}
            className="flex-1 min-w-[120px] md:min-w-[140px] py-3.5 px-4 md:px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-sans font-black text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(99,102,241,0.3)] active:scale-95 transition-all outline-none cursor-pointer border border-indigo-400/20 transform hover:scale-[1.01]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="whitespace-nowrap">Back</span>
          </button>
          
        </div>

      </div>
      
    </div>
  );
}
