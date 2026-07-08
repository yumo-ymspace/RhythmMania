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

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Play, 
  Trash2, 
  Database, 
  Award, 
  Calendar, 
  Search, 
  Sliders, 
  Music,
  ChevronRight,
  Sparkles,
  Trophy,
  Flame,
  Clock,
  ArrowRight,
  Info
} from 'lucide-react';
import { PlayHistoryRecord, Beatmap } from '../types';

interface PersonalHistoryScreenProps {
  history: PlayHistoryRecord[];
  allBeatmaps: Beatmap[];
  onWatchReplay: (record: PlayHistoryRecord) => void;
  onViewResult?: (record: PlayHistoryRecord) => void;
  onClearHistory: () => void;
  onDeleteRecord: (id: string) => void;
  historyLimit: number;
  onSetHistoryLimit: (limit: number) => void;
}

export default function PersonalHistoryScreen({
  history,
  allBeatmaps,
  onWatchReplay,
  onViewResult,
  onClearHistory,
  onDeleteRecord,
  historyLimit,
  onSetHistoryLimit
}: PersonalHistoryScreenProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [randomBg, setRandomBg] = useState('');

  useEffect(() => {
    const bgs = ['Arushii.jpg', 'Ferineon.jpg', 'Kourihase.png', 'MPDisplay.png', 'nikio.png'];
    const chosen = bgs[Math.floor(Math.random() * bgs.length)];
    setRandomBg(`/backgrounds/${chosen}`);
  }, []);

  const resolvedRecords = useMemo(() => {
    return history.map(rec => {
      const matchedMap = allBeatmaps.find(b => b.id === rec.beatmapId);
      const diffName = matchedMap?.difficulty || `${rec.keyCount}K Standard`;
      const stars = matchedMap ? (Number(matchedMap.difficulty) * 0.5 + 2) : 4.50;
      
      return {
        ...rec,
        bgUrl: matchedMap?.bgUrl,
        difficultyName: diffName,
        starRating: stars,
        bpm: matchedMap?.bpm || 120,
        creator: matchedMap?.creator || 'Unknown'
      };
    }).sort((a, b) => b.timestamp - a.timestamp); // Newest attempts first
  }, [history, allBeatmaps]);

  // Selected active record object
  const selectedRecord = useMemo(() => {
    if (!selectedRecordId) return null;
    return resolvedRecords.find(r => r.id === selectedRecordId) || null;
  }, [resolvedRecords, selectedRecordId]);

  const currentBgUrl = selectedRecord?.bgUrl || randomBg;

  // Search filtering on song titles, artists, difficulties, grades, or mods
  const filteredHistory = useMemo(() => {
    if (!searchTerm) return resolvedRecords;
    const query = searchTerm.toLowerCase();
    return resolvedRecords.filter(rec => {
      const modsText = rec.mods && rec.mods.length > 0 ? rec.mods.join(' ') : 'no mods';
      return rec.beatmapTitle.toLowerCase().includes(query) ||
             rec.beatmapArtist.toLowerCase().includes(query) ||
             rec.difficultyName.toLowerCase().includes(query) ||
             rec.grade.toLowerCase().includes(query) ||
             modsText.toLowerCase().includes(query);
    });
  }, [resolvedRecords, searchTerm]);

  // Handle deleted items to safely clear selection if active
  const handleDeleteRecord = (id: string) => {
    if (selectedRecordId === id) {
      setSelectedRecordId(null);
    }
    onDeleteRecord(id);
  };

  const formatDate = (timestamp: number) => {
    try {
      const d = new Date(timestamp);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return 'Unknown Date';
    }
  };

  const getRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const secs = Math.floor(diff / 1000);
    const mins = Math.floor(secs / 60);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (secs < 60) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const getGradeStyle = (grade: string) => {
    switch(grade) {
      case 'SS': return { text: 'text-amber-400', border: 'border-amber-400/30', bg: 'bg-amber-400/10', glow: 'shadow-[0_0_15px_rgba(250,204,21,0.25)]' };
      case 'S': return { text: 'text-pink-400', border: 'border-pink-400/30', bg: 'bg-pink-400/10', glow: 'shadow-[0_0_15px_rgba(244,114,182,0.25)]' };
      case 'A': return { text: 'text-cyan-400', border: 'border-cyan-400/30', bg: 'bg-cyan-400/10', glow: 'shadow-[0_0_15px_rgba(34,211,238,0.25)]' };
      case 'B': return { text: 'text-emerald-400', border: 'border-emerald-400/30', bg: 'bg-emerald-400/10', glow: 'shadow-[0_0_15px_rgba(52,211,153,0.25)]' };
      case 'C': return { text: 'text-indigo-400', border: 'border-indigo-400/30', bg: 'bg-indigo-400/10', glow: 'shadow-[0_0_15px_rgba(129,140,248,0.25)]' };
      default: return { text: 'text-slate-400', border: 'border-slate-400/30', bg: 'bg-slate-400/10', glow: '' };
    }
  };

  return (
    <div id="personal-history-view-container" className="relative w-full h-[calc(100vh_-_64px)] text-slate-100 font-sans select-none overflow-hidden flex flex-col bg-transparent animate-fade-in">
      
      {/* Dynamic Background Image with soft dark gradient and blur */}
      <div 
        className="absolute inset-0 bg-cover bg-center transition-all duration-700 ease-in-out scale-105 pointer-events-none z-0"
        style={{ 
          backgroundImage: `linear-gradient(rgba(10, 8, 16, 0.72), rgba(6, 6, 12, 0.88)), url(${currentBgUrl})`,
          filter: 'blur(4px)'
        }}
      />
      
      {/* WARNING NOTICE LINE */}
      <div className="bg-indigo-500/10 border-b border-indigo-500/20 px-4 py-2 flex items-center justify-center text-center backdrop-blur-sm shrink-0 relative z-10">
        <p className="text-[11px] font-sans text-indigo-300 tracking-wide">
          <strong className="text-indigo-400 font-extrabold uppercase tracking-widest mr-1.5">Archives:</strong>
          Performance logs, hit grades, and replay telemetry are cached safely inside your local client sandbox.
        </p>
      </div>

      {/* REPLAYSELECT BIG MAIN HEADER ROW */}
      <div className="w-full max-w-none px-4 lg:px-10 pt-2 pb-1.5 flex justify-between items-center gap-4 z-10 relative select-none border-b border-white/[0.03] bg-zinc-950/80 backdrop-blur-sm shrink-0">
        <div className="flex flex-col text-left shrink-0 bg-[#09090d] border border-white/10 px-5 py-2 rounded-xl shadow-lg">
          <h1 className="text-xl md:text-2xl font-black tracking-[0.2em] text-skin-accent leading-none font-sans uppercase">
            REPLAY SELECT
          </h1>
        </div>

        {/* LOG POLICY RETENTION CONTROLS & WIPE CONTROLS IN HEADER */}
        <div className="flex items-center gap-3">
          {/* Log policy select */}
          <div className="flex items-center gap-2 bg-black/40 border border-white/5 px-3 py-1.5 rounded-xl text-xs text-slate-400">
            <Sliders className="h-3.5 w-3.5 text-skin-accent" />
            <span className="uppercase text-[9px] tracking-wider font-extrabold text-zinc-500">Log policy:</span>
            <select
              value={historyLimit}
              onChange={(e) => onSetHistoryLimit(Number(e.target.value))}
              className="bg-zinc-950 text-slate-200 outline-none border-none py-0.5 px-1 rounded hover:text-white font-extrabold cursor-pointer text-[11px]"
            >
              <option value="10">Keep 10 runs</option>
              <option value="25">Keep 25 runs</option>
              <option value="50">Keep 50 runs</option>
              <option value="100">Keep 100 runs</option>
              <option value="9999">Unlimited</option>
            </select>
          </div>

          {/* Wipe logs */}
          {history.length > 0 && (
            <div className="relative">
              {showConfirmClear ? (
                <div className="flex items-center gap-1 bg-rose-950/40 border border-rose-500/20 rounded-xl p-0.5 animate-scale-in">
                  <span className="text-[9px] font-extrabold text-rose-400 uppercase tracking-widest px-2">Erase all?</span>
                  <button
                    onClick={() => {
                      onClearHistory();
                      setSelectedRecordId(null);
                      setShowConfirmClear(false);
                    }}
                    className="bg-rose-600 hover:bg-rose-500 text-white font-sans text-[9px] font-extrabold px-2 py-1 rounded-lg uppercase tracking-wide cursor-pointer"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setShowConfirmClear(false)}
                    className="bg-white/5 hover:bg-white/10 text-slate-300 font-sans text-[9px] font-extrabold px-2 py-1 rounded-lg uppercase tracking-wide cursor-pointer"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowConfirmClear(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-sans text-[10px] font-extrabold uppercase tracking-wider rounded-xl border border-rose-500/15 transition-all cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Wipe Logs
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* CORE WORKSPACE GRID - SPLIT LAYOUT LIKE SONG SELECT */}
      {resolvedRecords.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-24 gap-4 opacity-75 bg-[#0c0c12]/80 backdrop-blur-md p-12 rounded-2xl border border-white/10 shadow-2xl h-[400px] my-auto max-w-2xl mx-auto w-full z-10">
          <span className="p-4 bg-skin-accent-dim text-skin-accent rounded-full border border-skin-accent/20 shadow animate-pulse">
            <Database className="h-8 w-8" />
          </span>
          <h3 className="text-sm font-sans font-black text-white tracking-widest uppercase">
            No replay history found
          </h3>
          <p className="text-[10px] text-slate-500 font-mono max-w-xs leading-relaxed uppercase">
            Once you play and complete some maps, your replays and performance archives will show up here!
          </p>
        </div>
      ) : (
        <div className="flex-1 w-full max-w-none px-4 lg:px-10 min-h-0 p-2 lg:p-4 grid grid-cols-1 lg:grid-cols-12 gap-6 z-10 relative overflow-hidden">
          
          {/* =======================================================
              LEFT COLUMN: DETAILED INFO OF SELECTED REPLAY OR FALLBACK
              ======================================================= */}
          <div className="lg:col-span-5 flex flex-col gap-4 text-left h-full overflow-y-auto pr-1 pb-[72px]">
            {selectedRecord ? (
              <div className="flex flex-col gap-5 bg-[#0c0c12] p-5 rounded-2xl border border-white/10 shadow-2xl relative z-10">
                
                {/* Cover art background overlay */}
                {selectedRecord.bgUrl && (
                  <div 
                    className="absolute inset-x-0 -top-12 -bottom-12 bg-cover bg-center opacity-[0.045] pointer-events-none scale-105 blur-md"
                    style={{ backgroundImage: `url(${selectedRecord.bgUrl})` }}
                  />
                )}

                <div className="space-y-4 relative z-10">
                  {/* Badge Header */}
                  <div>
                    <span className="px-3.5 py-1 bg-skin-accent-dim text-skin-accent text-[9px] tracking-widest uppercase font-mono font-black border border-skin-accent/25 rounded-full inline-block">
                      SELECTED REPLAY INFO
                    </span>
                    <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight font-sans leading-tight mt-2 break-words">
                      {selectedRecord.beatmapTitle}
                    </h1>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                      {selectedRecord.beatmapArtist}
                    </p>
                  </div>

                  {/* Meta stats pills */}
                  <div className="flex flex-wrap gap-2 text-[10px] font-mono uppercase text-slate-400">
                    <span className="px-2 py-1 bg-white/5 border border-white/10 rounded">
                      {selectedRecord.keyCount}K Mode
                    </span>
                    <span className="px-2 py-1 bg-white/5 border border-white/10 rounded">
                      ★ {selectedRecord.starRating.toFixed(2)}
                    </span>
                    <span className="px-2 py-1 bg-pink-500/10 border border-pink-500/20 text-pink-400 rounded">
                      {selectedRecord.mods && selectedRecord.mods.length > 0 ? selectedRecord.mods.join(', ') : 'No Mods'}
                    </span>
                  </div>

                  {/* Playback timestamp and Grade */}
                  {(() => {
                    const style = getGradeStyle(selectedRecord.grade);
                    return (
                      <div className="flex items-center justify-between bg-black/30 border border-white/5 p-4 rounded-xl">
                        <div className="flex flex-col text-left">
                          <span className="text-[10px] text-slate-500 uppercase font-mono">Date Played</span>
                          <span className="text-xs text-slate-300 font-bold font-sans">{formatDate(selectedRecord.timestamp)}</span>
                          <span className="text-[9px] text-slate-500 font-mono mt-0.5 uppercase">({getRelativeTime(selectedRecord.timestamp)})</span>
                        </div>
                        <div className={`w-14 h-14 rounded-xl border flex items-center justify-center font-serif italic text-3xl font-black shrink-0 ${style.text} ${style.bg} ${style.border} ${style.glow}`}>
                          {selectedRecord.grade}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Scoring stats row */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-black/40 border border-white/5 p-2 rounded-xl text-center">
                      <span className="text-[8px] text-slate-500 font-mono uppercase">Score</span>
                      <span className="block text-sm font-sans font-black text-white mt-0.5">{selectedRecord.score.toLocaleString()}</span>
                    </div>
                    <div className="bg-black/40 border border-white/5 p-2 rounded-xl text-center">
                      <span className="text-[8px] text-slate-500 font-mono uppercase">Accuracy</span>
                      <span className="block text-sm font-sans font-black text-skin-accent mt-0.5">{selectedRecord.accuracy.toFixed(2)}%</span>
                    </div>
                    <div className="bg-black/40 border border-white/5 p-2 rounded-xl text-center">
                      <span className="text-[8px] text-slate-500 font-mono uppercase">Max Combo</span>
                      <span className="block text-sm font-sans font-black text-amber-400 mt-0.5">{selectedRecord.maxCombo}x</span>
                    </div>
                  </div>

                  {/* Judgements Breakdown counts */}
                  {selectedRecord.scoreState && (
                    <div className="bg-black/20 border border-white/5 p-3.5 rounded-xl space-y-2">
                      <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block font-black border-b border-white/5 pb-1">Judgements Breakdown:</span>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex justify-between items-center bg-black/20 px-2 py-1 rounded">
                          <span className="text-[#34d399] font-mono text-[10px] uppercase font-black">Marvelous</span>
                          <span className="font-sans font-bold text-slate-200">{selectedRecord.scoreState.marvelousCount || 0}</span>
                        </div>
                        <div className="flex justify-between items-center bg-black/20 px-2 py-1 rounded">
                          <span className="text-yellow-400 font-mono text-[10px] uppercase font-black">Perfect</span>
                          <span className="font-sans font-bold text-slate-200">{selectedRecord.scoreState.perfectCount || 0}</span>
                        </div>
                        <div className="flex justify-between items-center bg-black/20 px-2 py-1 rounded">
                          <span className="text-green-500 font-mono text-[10px] uppercase font-black">Great</span>
                          <span className="font-sans font-bold text-slate-200">{selectedRecord.scoreState.greatCount || 0}</span>
                        </div>
                        <div className="flex justify-between items-center bg-black/20 px-2 py-1 rounded">
                          <span className="text-blue-400 font-mono text-[10px] uppercase font-black">Good</span>
                          <span className="font-sans font-bold text-slate-200">{selectedRecord.scoreState.goodCount || 0}</span>
                        </div>
                        <div className="flex justify-between items-center bg-black/20 px-2 py-1 rounded">
                          <span className="text-purple-400 font-mono text-[10px] uppercase font-black">Bad</span>
                          <span className="font-sans font-bold text-slate-200">{selectedRecord.scoreState.badCount || 0}</span>
                        </div>
                        <div className="flex justify-between items-center bg-black/20 px-2 py-1 rounded">
                          <span className="text-red-500 font-mono text-[10px] uppercase font-black">Miss</span>
                          <span className="font-sans font-bold text-slate-200">{selectedRecord.scoreState.missCount || 0}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* WATCH REPLAY ACTION BUTTON */}
                  <button
                    onClick={() => onWatchReplay(selectedRecord)}
                    className="w-full py-4 bg-skin-accent hover:brightness-110 active:scale-95 text-slate-950 font-sans font-black text-base uppercase tracking-widest rounded-xl shadow-lg shadow-skin-accent/20 flex items-center justify-center gap-2 transform transition hover:scale-[1.01] duration-150 cursor-pointer select-none border border-white/10"
                  >
                    <Play className="h-4 w-4 fill-current text-slate-950" />
                    <span>Watch Replay</span>
                  </button>

                  {/* Secondary buttons */}
                  {onViewResult && (
                    <button
                      onClick={() => onViewResult(selectedRecord)}
                      className="w-full py-2.5 bg-white/5 hover:bg-white/10 active:scale-98 text-slate-200 font-sans font-extrabold text-xs uppercase tracking-widest rounded-xl border border-white/10 transition-all cursor-pointer"
                    >
                      View Detailed Results
                    </button>
                  )}

                  <button
                    onClick={() => handleDeleteRecord(selectedRecord.id)}
                    className="w-full py-2 bg-red-955/20 hover:bg-red-955/40 border border-red-500/15 hover:border-red-500/35 text-red-400 font-mono text-[9px] uppercase font-black tracking-widest rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer mt-0.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete Record</span>
                  </button>

                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-24 gap-4 opacity-75 bg-black/80 backdrop-blur-md p-6 rounded-2xl border border-white/10 shadow-2xl relative z-10 h-full">
                <span className="p-4 bg-skin-accent-dim text-skin-accent rounded-full border border-skin-accent/20 shadow animate-pulse">
                  <Clock className="h-8 w-8" />
                </span>
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-xs font-sans font-black text-white tracking-widest uppercase">
                    No replays selected
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono max-w-xs leading-relaxed uppercase">
                    Select a replay record from the list on the right to view detailed performance metrics and launch the telemetry playback!
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* =======================================================
              RIGHT COLUMN: SEARCH AND COMPREHENSIVE LIST OF SEPARATE ATTEMPTS
              ======================================================= */}
          <div className="lg:col-span-7 flex flex-col gap-3 h-full min-h-0 -mr-4 lg:-mr-10">
            
            {/* SEARCH INTERFACE MATCHING SONG SELECT */}
            <div className="px-4 lg:px-6 relative flex-shrink-0">
              <Search className="absolute left-7 top-2.5 h-4 w-4 text-slate-400" />
              <input 
                id="replay-search-input"
                type="text"
                placeholder="Search replay name, difficulty, grade, or mods..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-6 py-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl font-sans text-xs text-white placeholder-slate-500 focus:outline-none focus:border-skin-accent/50 focus:ring-1 focus:ring-skin-accent/30 transition-all shadow-lg"
              />
              <span className="absolute right-7 top-2 px-2 py-0.5 bg-[#1b1c24] border border-white/10 text-[9px] font-mono text-slate-400 font-bold rounded">
                {filteredHistory.length} attempts
              </span>
            </div>

            {/* SCROLL LIST OF INDIVIDUAL UNCOLLAPSED PLAYED SONGS */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden py-1 flex flex-col gap-1.5 relative z-10 min-h-0 pb-[72px]">
              {filteredHistory.length > 0 ? (
                filteredHistory.map((rec) => {
                  const isSelected = selectedRecordId === rec.id;
                  const modsText = rec.mods && rec.mods.length > 0 ? rec.mods.join(', ') : 'No Mods';
                  const songName = `${rec.beatmapArtist} - ${rec.beatmapTitle}`;
                  const boxTitle = `${songName} [${rec.difficultyName}] • ${formatDate(rec.timestamp)} • ${modsText}`;
                  const style = getGradeStyle(rec.grade);

                  return (
                    <div key={rec.id} className="flex flex-col gap-0 transition-all pl-8">
                      
                      <div 
                        onClick={() => setSelectedRecordId(rec.id)}
                        className={`group transition-all duration-300 relative border-l border-t border-b cursor-pointer select-none overflow-hidden rounded-l-xl ${
                          isSelected 
                            ? 'border-skin-accent shadow-skin-accent-glow bg-skin-accent-dim/15 ml-[-20px]'
                            : 'border-white/[0.03] bg-[#0c0c12]/80 backdrop-blur-md hover:bg-[#12121a]/95 hover:border-white/10'
                        } border-r-0`}
                      >
                        {/* Cover image bg layer matching Song Select card texture */}
                        {rec.bgUrl && (
                          <div 
                            className="absolute inset-0 bg-cover bg-center opacity-[0.03] pointer-events-none scale-102 blur-sm"
                            style={{ backgroundImage: `url(${rec.bgUrl})` }}
                          />
                        )}

                        <div className="flex items-center justify-between p-4 py-3 relative z-10">
                          <div className="flex flex-col text-left overflow-hidden min-w-0 pr-2 flex-1">
                            
                            {/* COMPOSITE TITLE BOX HEADER MANDATED */}
                            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-400 group-hover:text-skin-accent transition-colors truncate" title={boxTitle}>
                              {songName} [{rec.difficultyName}]
                            </div>

                            <h4 className="font-extrabold font-sans text-base lg:text-lg text-white tracking-tight truncate leading-tight mt-1">
                              Played {getRelativeTime(rec.timestamp)} • <span className="text-pink-500 font-mono font-black">{modsText}</span>
                            </h4>

                            <div className="flex items-center gap-2.5 mt-1 text-[10px] font-mono text-slate-500 flex-wrap">
                              <span className="text-slate-300 font-bold">{rec.score.toLocaleString()} PTS</span>
                              <span>•</span>
                              <span className="text-skin-accent">{rec.accuracy.toFixed(2)}% ACC</span>
                              <span>•</span>
                              <span className="text-amber-400">{rec.maxCombo}x COMBO</span>
                            </div>

                          </div>

                          {/* Right elements: keyCount indicator and big high-impact Grade badge */}
                          <div className="flex items-center gap-3 shrink-0 select-none">
                            <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[9px] font-mono font-black text-slate-400">
                              {rec.keyCount}K
                            </span>
                            <div className={`w-10 h-10 rounded-lg border flex items-center justify-center font-serif italic text-lg font-black shrink-0 ${style.text} ${style.bg} ${style.border} ${style.glow}`}>
                              {rec.grade}
                            </div>
                          </div>

                        </div>
                      </div>

                    </div>
                  );
                })
              ) : (
                <div className="bg-[#0c0c12] border border-white/10 p-8 rounded-xl flex flex-col items-center justify-center text-center text-slate-500 shadow-xl">
                  <Info className="h-6 w-6 mb-2 text-slate-600" />
                  <p className="text-[11px] font-sans font-black tracking-widest uppercase">No replay matches discovered</p>
                  <p className="text-[9px] text-slate-600 font-mono max-w-xs mt-1 uppercase">Adjust search query criteria to find cached performance files</p>
                </div>
              )}
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
