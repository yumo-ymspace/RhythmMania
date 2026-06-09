/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 *
 * This source code is licensed under the PolyForm Perimeter License 1.0.0.
 * You may modify and use this file for non-competing purposes, provided 
 * that open and explicit attribution is maintained.
 *
 * For the full license terms, see the LICENSE file in the root directory
 * from: https://github.com/yumo-ymspace/RhythmMania
 */

import React, { useState } from 'react';
import { 
  Play, 
  Trash2, 
  Database, 
  Award, 
  Info, 
  Trash, 
  Flame, 
  Calendar, 
  Search, 
  Sliders, 
  ShieldAlert,
  ChevronRight
} from 'lucide-react';
import { PlayHistoryRecord, Beatmap } from '../types';

interface PersonalHistoryScreenProps {
  history: PlayHistoryRecord[];
  allBeatmaps: Beatmap[];
  onWatchReplay: (record: PlayHistoryRecord) => void;
  onClearHistory: () => void;
  onDeleteRecord: (id: string) => void;
  historyLimit: number;
  onSetHistoryLimit: (limit: number) => void;
}

export default function PersonalHistoryScreen({
  history,
  allBeatmaps,
  onWatchReplay,
  onClearHistory,
  onDeleteRecord,
  historyLimit,
  onSetHistoryLimit
}: PersonalHistoryScreenProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  const maxScore = history.length > 0 ? Math.max(...history.map(r => r.score)) : 0;

  // Filter history records by search term
  const filteredHistory = history.filter(record => {
    const titleMatch = record.beatmapTitle.toLowerCase().includes(searchTerm.toLowerCase());
    const artistMatch = record.beatmapArtist.toLowerCase().includes(searchTerm.toLowerCase());
    const gradeMatch = record.grade.toLowerCase().includes(searchTerm.toLowerCase());
    return titleMatch || artistMatch || gradeMatch;
  });

  const getRankBadgeProps = (grade: string) => {
    switch (grade.toUpperCase()) {
      case 'SS':
        return { bg: 'bg-cyan-500/10 border-cyan-400/30 text-cyan-400', shadow: 'shadow-[0_0_12px_rgba(34,211,238,0.2)]' };
      case 'S':
        return { bg: 'bg-amber-500/10 border-amber-400/30 text-amber-400', shadow: 'shadow-[0_0_12px_rgba(245,158,11,0.2)]' };
      case 'A':
        return { bg: 'bg-emerald-500/10 border-emerald-400/30 text-emerald-400', shadow: 'sky-glow' };
      case 'B':
        return { bg: 'bg-indigo-500/10 border-indigo-400/30 text-indigo-400', shadow: '' };
      case 'C':
        return { bg: 'bg-pink-500/10 border-pink-400/30 text-pink-400', shadow: '' };
      case 'D':
        return { bg: 'bg-slate-500/10 border-slate-400/30 text-slate-300', shadow: '' };
      case 'FAIL':
        return { bg: 'bg-rose-500/10 border-rose-400/30 text-rose-400 line-through', shadow: 'shadow-[0_0_12px_rgba(244,63,94,0.15)]' };
      default:
        return { bg: 'bg-slate-800 border-slate-700 text-slate-400', shadow: '' };
    }
  };

  const handleReplayClick = (record: PlayHistoryRecord) => {
    // Check if the beatmap actually exists in the client system catalog
    const mapExists = allBeatmaps.some(b => b.id === record.beatmapId);
    if (!mapExists) {
      alert(`⚠️ Unable to replay: The beatmap "${record.beatmapTitle}" is not currently in your local inventory. Please download or import it to watch the replay.`);
      return;
    }
    onWatchReplay(record);
  };

  const formatDate = (timestamp: number) => {
    try {
      const d = new Date(timestamp);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return 'Unknown Date';
    }
  };

  return (
    <div id="personal-history-view-container" className="flex flex-col gap-6 w-full max-w-6xl mx-auto h-full p-2 lg:p-4 text-slate-100 pb-16 animate-fade-in">
      
      {/* SECTION HEADER BLOCK */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-[#08080C]/90 border border-white/5 p-5 rounded-2xl shadow-xl gap-4 backdrop-blur-md">
        <div className="flex items-center gap-3.5">
          <span className="p-3.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-400/20">
            <Award className="h-5 w-5" />
          </span>
          <div>
            <span className="text-[9px] text-slate-500 font-mono tracking-widest uppercase">// PERFORMANCE STATION</span>
            <h2 className="text-lg font-black font-sans leading-none mt-1 tracking-wider uppercase italic text-white flex items-center gap-1.5">
              Personal Performance History
            </h2>
          </div>
        </div>

        {/* CONTROLS AREA */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* LIMIT OPTIONS */}
          <div className="flex items-center gap-2 bg-black/40 border border-white/5 px-3 py-2 rounded-xl text-xs text-slate-400">
            <Sliders className="h-3.5 w-3.5 text-indigo-400" />
            <span className="font-sans font-medium uppercase text-[10px] tracking-wider text-slate-505">Max plays kept:</span>
            <select
              value={historyLimit}
              onChange={(e) => onSetHistoryLimit(Number(e.target.value))}
              className="bg-[#08080C] text-slate-200 outline-none border-none py-0.5 px-1 rounded hover:text-white font-black cursor-pointer"
            >
              <option value="10">10 plays</option>
              <option value="25">25 plays</option>
              <option value="50">50 plays</option>
              <option value="100">100 plays</option>
              <option value="9999">Unlimited</option>
            </select>
          </div>

          {/* CLEAR OPTION */}
          {history.length > 0 && (
            <div className="relative">
              {showConfirmClear ? (
                <div className="flex items-center gap-1.5 bg-rose-950/30 border border-rose-500/20 rounded-xl p-1 animate-scale-in">
                  <span className="text-[10px] font-extrabold text-rose-400 uppercase tracking-wider px-2">Clear all?</span>
                  <button
                    onClick={() => {
                      onClearHistory();
                      setShowConfirmClear(false);
                    }}
                    className="bg-rose-600 hover:bg-rose-500 text-white font-sans text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider cursor-pointer"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setShowConfirmClear(false)}
                    className="bg-white/5 hover:bg-white/10 text-slate-300 font-sans text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider cursor-pointer"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowConfirmClear(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-sans text-[10px] font-black uppercase tracking-wider rounded-xl border border-rose-500/15 transition-all cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Wipe Saved Runs
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: HISTORY DATABASE */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
            <input 
              id="history-search-input"
              type="text"
              placeholder="Search historical records by song title, artist, or ranking grade..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-black/40 border border-white/5 rounded-xl font-sans text-xs text-white placeholder-slate-500/80 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30 transition-all"
            />
          </div>

          <div className="space-y-3.5">
            {filteredHistory.length > 0 ? (
              filteredHistory.map((record) => {
                const badge = getRankBadgeProps(record.grade);
                return (
                  <div
                    key={record.id}
                    className="group flex flex-col sm:flex-row justify-between items-start sm:items-center bg-[#08080C]/80 hover:bg-[#0A0A10]/95 border border-white/5 hover:border-indigo-500/15 p-4 rounded-xl shadow-md transition-all gap-4"
                  >
                    <div className="flex items-start gap-4">
                      {/* RANK GRADE CHARACTER BADGE */}
                      <span className={`w-14 h-14 shrink-0 flex items-center justify-center rounded-xl border ${badge.bg} ${badge.shadow} font-serif font-black text-xl italic select-none`}>
                        {record.grade}
                      </span>

                      <div>
                        {/* SONG TITLE & ARTIST */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-sans font-extrabold text-sm text-slate-100 group-hover:text-indigo-300 transition-colors">
                            {record.beatmapTitle}
                          </h4>
                          <span className="px-1.5 py-0.5 bg-white/5 border border-white/5 text-[9px] text-slate-400 font-mono rounded tracking-widest uppercase">
                            {record.keyCount}K
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 font-medium leading-none mt-1">
                          {record.beatmapArtist}
                        </p>

                        {/* PLAY METADATA FOOTER */}
                        <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-2.5 font-mono flex-wrap">
                          <span className="flex items-center gap-1 text-slate-400">
                            <Calendar className="h-3 w-3 text-slate-550" />
                            {formatDate(record.timestamp)}
                          </span>
                          <span>•</span>
                          <span>
                            COMBO: <strong className="text-slate-350">{record.maxCombo}x</strong>
                          </span>
                          <span>•</span>
                          <span>
                            SCORE: <strong className="text-indigo-400">{record.score.toLocaleString()}</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* CONTROL TRIGGERS */}
                    <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                      {/* REPLAY TRIGGER */}
                      <button
                        onClick={() => handleReplayClick(record)}
                        className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-500 hover:brightness-110 text-slate-950 hover:text-slate-950 font-sans text-[10px] font-black uppercase tracking-wider rounded-lg transition-all shadow-indigo-500/10 cursor-pointer flex-1 sm:flex-initial"
                        title="Render and play this performance replay file"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" /> Watch Replay
                      </button>

                      {/* TRASH DISPOSAL */}
                      <button
                        onClick={() => onDeleteRecord(record.id)}
                        className="p-2 bg-white/5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-white/5 hover:border-rose-500/20 rounded-lg transition-all cursor-pointer"
                        title="Delete this score entry"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-4 bg-[#08080C]/50 border border-white/5 rounded-2xl text-center">
                <Database className="h-10 w-10 text-slate-500 mb-3" />
                <h4 className="text-sm font-bold text-slate-300">No performances logged</h4>
                <p className="text-xs text-slate-500 max-w-sm mt-1 mx-auto leading-relaxed">
                  {searchTerm ? "No local play records match the active filters." : "Performances successfully finished or failed will automatically log here, capturing live key replays."}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: ANALYTICS INFO CARD */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-[#08080C]/90 border border-white/5 p-5 rounded-2xl shadow-md backdrop-blur-md flex flex-col gap-4">
            <h3 className="text-xs font-black font-sans tracking-wide uppercase text-indigo-400 flex items-center gap-1.5">
              <Info className="h-4 w-4" /> Storage Diagnostics
            </h3>
            
            <p className="text-xs text-slate-400 leading-relaxed">
              Every score registered encodes precise sub-millisecond timeline events (press coordinates, hold constraints, releases). This allows accurate, frame-perfect game state re-construction.
            </p>

            <div className="border-t border-white/5 pt-4 space-y-3 font-sans text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-medium">Plays Recorded</span>
                <span className="font-extrabold text-white text-sm">{history.length}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-medium font-sans">High Scores</span>
                <span className="font-bold text-cyan-400 flex items-center gap-1 leading-none">
                  <Flame className="h-3.5 w-3.5 stroke-[2.5]" />
                  {history.filter(r => r.grade === 'SS' || r.grade === 'S').length}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-medium font-sans">Highest Score</span>
                <span className="font-extrabold text-indigo-400">
                  {history.length > 0 ? maxScore.toLocaleString() : "Play a beatmap first"}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-medium">Persistence Engine</span>
                <span className="font-mono text-[10px] text-slate-500 bg-white/5 px-2 py-0.5 border border-white/5 rounded">
                  LocalState API
                </span>
              </div>
            </div>

            <div className="mt-2 text-[10px] text-slate-500 bg-indigo-500/5 border border-indigo-500/10 p-3 rounded-xl flex gap-2.5 items-start">
              <ShieldAlert className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed font-sans">
                <strong>Safety Notice:</strong> Clearing browser memory or wiping local storage will erase performance records and encoded replay timelines.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
