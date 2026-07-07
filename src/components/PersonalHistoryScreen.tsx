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
  ArrowRight
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
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  
  // Track selected song
  const [selectedSongKey, setSelectedSongKey] = useState<string | null>(null);
  // Track selected difficulty under active song
  const [selectedDifficultyId, setSelectedDifficultyId] = useState<string | null>(null);

  // Group history records by unique song
  const playedSongs = useMemo(() => {
    const map = new Map<string, {
      songKey: string;
      title: string;
      artist: string;
      bgUrl?: string;
      records: PlayHistoryRecord[];
    }>();

    // Filter to only successful, solid game logs (not failed)
    history.forEach((record) => {
      if (record.isFailed) return;
      
      const title = record.beatmapTitle || 'Untitled';
      const artist = record.beatmapArtist || 'Unknown';
      const songKey = `${artist.toLowerCase().trim()} - ${title.toLowerCase().trim()}`;

      // Retrieve actual beatmap reference if available for art backgrounds
      const matchedMap = allBeatmaps.find(b => b.id === record.beatmapId);
      const bgUrl = matchedMap?.bgUrl;

      let group = map.get(songKey);
      if (!group) {
        group = {
          songKey,
          title,
          artist,
          bgUrl,
          records: []
        };
        map.set(songKey, group);
      }
      group.records.push(record);
    });

    // Sort song items by their latest play date (newest first)
    return Array.from(map.values()).sort((a, b) => {
      const latestA = Math.max(...a.records.map(r => r.timestamp));
      const latestB = Math.max(...b.records.map(r => r.timestamp));
      return latestB - latestA;
    });
  }, [history, allBeatmaps]);

  // Search filtering on song titles/artists
  const filteredSongs = useMemo(() => {
    if (!searchTerm) return playedSongs;
    return playedSongs.filter(s => 
      s.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
      s.artist.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [playedSongs, searchTerm]);

  // Auto-select first song if none selected or selection becomes invalid
  useEffect(() => {
    if (filteredSongs.length > 0) {
      if (!selectedSongKey || !filteredSongs.some(s => s.songKey === selectedSongKey)) {
        setSelectedSongKey(filteredSongs[0].songKey);
      }
    } else {
      setSelectedSongKey(null);
    }
  }, [filteredSongs, selectedSongKey]);

  // Selected song group representation
  const selectedSong = useMemo(() => {
    return playedSongs.find(s => s.songKey === selectedSongKey) || null;
  }, [playedSongs, selectedSongKey]);

  // Extract unique played map difficulties matching this song card
  const difficulties = useMemo(() => {
    if (!selectedSong) return [];
    
    const diffMap = new Map<string, {
      beatmapId: string;
      difficultyName: string;
      keyCount: number;
      starRating: number;
      records: PlayHistoryRecord[];
    }>();

    selectedSong.records.forEach(r => {
      const bm = allBeatmaps.find(b => b.id === r.beatmapId);
      const diffName = bm?.difficulty || `${r.keyCount}K Standard`;
      const stars = bm ? (Number(bm.difficulty) * 0.5 + 2) : 4.50;

      let diffGroup = diffMap.get(r.beatmapId);
      if (!diffGroup) {
        diffGroup = {
          beatmapId: r.beatmapId,
          difficultyName: diffName,
          keyCount: r.keyCount,
          starRating: stars,
          records: []
        };
        diffMap.set(r.beatmapId, diffGroup);
      }
      diffGroup.records.push(r);
    });

    // Sort difficulty settings (key count, star rating descending)
    return Array.from(diffMap.values()).sort((a, b) => b.starRating - a.starRating);
  }, [selectedSong, allBeatmaps]);

  // Automatically default active difficulty when song swaps
  useEffect(() => {
    if (difficulties.length > 0) {
      // Keep selected is still there, else update to first
      if (!selectedDifficultyId || !difficulties.some(d => d.beatmapId === selectedDifficultyId)) {
        setSelectedDifficultyId(difficulties[0].beatmapId);
      }
    } else {
      setSelectedDifficultyId(null);
    }
  }, [difficulties, selectedDifficultyId]);

  // Find active difficulty object
  const activeDifficulty = useMemo(() => {
    if (!selectedDifficultyId) return null;
    return difficulties.find(d => d.beatmapId === selectedDifficultyId) || null;
  }, [difficulties, selectedDifficultyId]);

  // High score calculations
  const bestRecord = useMemo(() => {
    if (!activeDifficulty || activeDifficulty.records.length === 0) return null;
    return [...activeDifficulty.records].sort((a, b) => b.score - a.score)[0];
  }, [activeDifficulty]);

  // Latest record (passed to trigger results view)
  const latestRecord = useMemo(() => {
    if (!activeDifficulty || activeDifficulty.records.length === 0) return null;
    return [...activeDifficulty.records].sort((a, b) => b.timestamp - a.timestamp)[0];
  }, [activeDifficulty]);

  const formatDate = (timestamp: number) => {
    try {
      const d = new Date(timestamp);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return 'Unknown Date';
    }
  };

  return (
    <div id="personal-history-view-container" className="flex flex-col w-full h-full text-slate-100 animate-fade-in select-none bg-zinc-950 overflow-hidden">
      
      {/* WARNING NOTICE LINE */}
      <div className="bg-indigo-500/10 border-b border-indigo-500/20 px-4 py-2 flex items-center justify-center text-center backdrop-blur-sm shrink-0">
        <p className="text-[11px] font-sans text-indigo-300 tracking-wide">
          <strong className="text-indigo-400 font-extrabold uppercase tracking-widest mr-1.5">Note:</strong>
          Performance results, hit grades, and replay telemetry are cached safely inside your local client sandbox.
        </p>
      </div>

      {/* HEADER SECTION PANEL */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-[#08080C] border-b border-white/5 p-4 md:px-8 gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <span className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-400/20 shrink-0">
            <Award className="h-5 w-5" />
          </span>
          <div>
            <span className="text-[9px] text-zinc-500 font-mono tracking-widest uppercase block">// ARCHIVES CHANNEL</span>
            <h2 className="text-base font-black font-sans leading-none mt-1 tracking-wider uppercase italic text-white">
              Played Songs History
            </h2>
          </div>
        </div>

        {/* SYSTEM RETENTION CONTROLS */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* LIMIT PICKER */}
          <div className="flex items-center gap-2 bg-black/40 border border-white/5 px-3 py-1.5 rounded-xl text-xs text-slate-400">
            <Sliders className="h-3.5 w-3.5 text-indigo-400" />
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

          {/* RESET DATABASE */}
          {history.length > 0 && (
            <div className="relative">
              {showConfirmClear ? (
                <div className="flex items-center gap-1 bg-rose-950/40 border border-rose-500/20 rounded-xl p-0.5 animate-scale-in">
                  <span className="text-[9px] font-extrabold text-rose-400 uppercase tracking-widest px-2">Erase all?</span>
                  <button
                    onClick={() => {
                      onClearHistory();
                      setSelectedSongKey(null);
                      setSelectedDifficultyId(null);
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

      {/* CORE WORKSPACE GRID */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 items-stretch bg-zinc-950 overflow-hidden">
        
        {/* LEFT COMPONENT: SONG SELECTOR STREAM */}
        <div className="lg:col-span-4 xl:col-span-3 flex flex-col bg-[#0c0c12] border-r border-white/5 shrink-0 overflow-y-auto scrollbar-none h-full p-4 md:p-6 gap-4">
          
          {/* SEARCH BAR ELEMENT */}
          <div className="relative shrink-0">
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-zinc-500" />
            <input 
              id="history-search-input"
              type="text"
              placeholder="Search played song catalogs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-black/40 border border-white/5 rounded-xl font-sans text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/25 transition-all"
            />
          </div>

          {/* CLEAN SONGS LIST CONTAINER */}
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1 select-none scrollbar-thin scrollbar-thumb-white/5">
            {filteredSongs.length > 0 ? (
              filteredSongs.map((song) => {
                const isSelected = selectedSongKey === song.songKey;

                return (
                  <div
                    key={song.songKey}
                    onClick={() => {
                      setSelectedSongKey(song.songKey);
                      setSelectedDifficultyId(null); // Reset diff on change
                    }}
                    className={`p-3 rounded-xl flex items-center justify-between gap-3 border transition-all relative overflow-hidden backdrop-blur-md cursor-pointer ${
                      isSelected
                        ? 'bg-gradient-to-r from-indigo-500/10 to-[#14141d]/90 border-indigo-500/40 shadow-md'
                        : 'bg-[#08080C]/80 border-white/[0.02] hover:border-white/10 hover:bg-[#0c0c14]/95 opacity-90'
                    }`}
                  >
                    {/* Subtle covert bg thumbnail tint */}
                    {song.bgUrl && (
                      <div 
                        className="absolute inset-0 bg-cover bg-center opacity-[0.03] pointer-events-none scale-102 blur-sm"
                        style={{ backgroundImage: `url(${song.bgUrl})` }}
                      />
                    )}

                    <div className="flex items-center gap-3 min-w-0 pointer-events-none">
                      {/* Info labels */}
                      <div className="min-w-0">
                        <span className="text-[8px] text-zinc-500 font-black uppercase font-mono tracking-wider block truncate">
                          {song.artist}
                        </span>
                        <h4 className="font-extrabold font-sans text-xs text-white tracking-tight truncate max-w-[210px] -mt-0.5">
                          {song.title}
                        </h4>
                        
                        <div className="flex gap-2 items-center text-[9px] text-slate-500 mt-1 font-mono leading-none">
                          <span className="font-bold px-1.5 py-0.5 border rounded uppercase tracking-wide text-[8px] bg-indigo-500/5 text-indigo-300 border-indigo-500/10">
                            {song.records.length} {song.records.length === 1 ? 'play' : 'plays'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <ChevronRight className={`h-4 w-4 transition-all ${isSelected ? 'text-indigo-400 translate-x-0.5' : 'text-zinc-600'}`} />
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-20 px-4 bg-[#08080C]/40 border border-white/5 rounded-2xl text-center">
                <Database className="h-9 w-9 text-zinc-600 mb-2" />
                <h4 className="text-xs font-bold text-slate-400">No played tracks found</h4>
                <p className="text-[10px] text-zinc-600 max-w-xs mt-1 leading-relaxed font-sans">
                  {searchTerm ? "No local play records match the search keywords." : "Finished runs are fully cached right after gameplay completion."}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: DIFFICULTY DROPDOWN & RESULTS ENTRY SCREEN */}
        <div className="lg:col-span-8 xl:col-span-9 flex flex-col p-4 md:p-8 overflow-y-auto scrollbar-none h-full bg-[#050508]">
          
          {selectedSong ? (
            <div className="bg-[#0e0e14]/90 border border-white/5 p-6 md:p-8 rounded-3xl shadow-2xl flex flex-col gap-5 max-w-4xl w-full mx-auto justify-between h-auto min-h-0">
              
              {/* Song Information banner */}
              <div className="flex items-start gap-4 relative overflow-hidden bg-white/[0.01] border border-white/[0.04] p-4 rounded-xl">
                {selectedSong.bgUrl && (
                  <div 
                    className="absolute inset-x-0 -top-12 -bottom-12 bg-cover bg-center opacity-[0.035] pointer-events-none scale-105 blur-md"
                    style={{ backgroundImage: `url(${selectedSong.bgUrl})` }}
                  />
                )}

                <div className="min-w-0">
                  <span className="text-[10px] text-indigo-400 font-extrabold uppercase font-mono tracking-wider block">
                    {selectedSong.artist}
                  </span>
                  <h3 className="text-base font-black font-sans text-white tracking-tight mt-0.5 truncate max-w-[280px]">
                    {selectedSong.title}
                  </h3>
                  <span className="inline-flex items-center gap-1.5 text-[9px] text-zinc-500 font-mono mt-1 uppercase">
                    <Clock className="h-3 w-3 text-zinc-500" />
                    Total plays: {selectedSong.records.length}
                  </span>
                </div>
              </div>

              {/* DIFFICULTIES SELECT DROPDOWN BLOCK */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] text-zinc-500 font-extrabold uppercase tracking-wider font-mono">
                  Select Logged Difficulty:
                </label>
                
                <div className="relative">
                  <select
                    value={selectedDifficultyId || ''}
                    onChange={(e) => setSelectedDifficultyId(e.target.value)}
                    className="w-full appearance-none bg-zinc-950/80 hover:bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-xs text-white font-extrabold cursor-pointer focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/25 transition-all shadow-md"
                  >
                    {difficulties.map((diff) => (
                      <option key={diff.beatmapId} value={diff.beatmapId}>
                        {!isNaN(diff.starRating) ? `★ ${diff.starRating.toFixed(2)} — ` : ''}{diff.difficultyName} ({diff.keyCount}K Mode) — {diff.records.length} {diff.records.length === 1 ? 'record' : 'records'}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-4 pointer-events-none flex items-center text-indigo-400 font-sans">
                    ▼
                  </div>
                </div>
              </div>

              {/* RECORD METRIC BOX FOR SELECTED DIFFICULTY */}
              {activeDifficulty && bestRecord ? (
                <div className="bg-[#14141b]/60 border border-white/5 px-4.5 py-4 rounded-xl grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex flex-col">
                    <span className="text-[9px] text-zinc-500 font-extrabold uppercase font-mono tracking-wider">
                      Best Score
                    </span>
                    <span className="text-sm font-black text-white font-sans mt-1">
                      {bestRecord.score.toLocaleString()}
                    </span>
                  </div>

                  <div className="flex flex-col">
                    <span className="text-[9px] text-zinc-500 font-extrabold uppercase font-mono tracking-wider">
                      Best Accuracy
                    </span>
                    <span className="text-sm font-black text-indigo-400 font-sans mt-1">
                      {bestRecord.accuracy.toFixed(2)}%
                    </span>
                  </div>

                  <div className="flex flex-col">
                    <span className="text-[9px] text-zinc-500 font-extrabold uppercase font-mono tracking-wider">
                      Max Combo
                    </span>
                    <span className="text-sm font-black text-amber-400 font-sans mt-1">
                      {bestRecord.maxCombo}x
                    </span>
                  </div>

                  <div className="flex flex-col">
                    <span className="text-[9px] text-zinc-500 font-extrabold uppercase font-mono tracking-wider">
                      Best Grade
                    </span>
                    <span className="text-sm font-black text-emerald-400 font-serif italic mt-1 bg-emerald-500/5 border border-emerald-500/10 px-2 py-0.5 rounded-md w-fit leading-none">
                      {bestRecord.grade}
                    </span>
                  </div>
                </div>
              ) : null}

              {/* ACTION VIEW RESULTS PANEL */}
              {latestRecord && onViewResult ? (
                <div className="flex flex-col gap-3 mt-2 shrink-0">
                  <button
                    onClick={() => onViewResult(latestRecord)}
                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-indigo-500 text-slate-950 hover:brightness-110 font-sans font-black uppercase text-xs tracking-widest rounded-2xl transition-all shadow-[0_4px_30px_rgba(99,102,241,0.25)] active:scale-98 cursor-pointer"
                  >
                    View Detailed Results Screen <ArrowRight className="h-4 w-4" />
                  </button>

                  <p className="text-[10px] text-center text-zinc-500 font-sans font-medium tracking-wide">
                    The results screen displays all attempts plotted together so you can review previous benchmarks or watch replays.
                  </p>
                </div>
              ) : null}

              {/* QUICK REPLAY FEED FROM SELECTED DIFFICULTY */}
              {activeDifficulty && activeDifficulty.records.length > 0 && (
                <div className="flex flex-col gap-2 mt-2">
                  <span className="text-[10px] text-zinc-500 font-extrabold uppercase tracking-wider font-mono">
                    Logged Plays on this Diff:
                  </span>
                  
                  <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1 select-none scrollbar-thin scrollbar-thumb-white/5">
                    {activeDifficulty.records.map((rec) => (
                      <div 
                        key={rec.id}
                        className="p-2.5 rounded-lg bg-black/20 hover:bg-black/35 border border-white/5 flex items-center justify-between text-xs transition-all"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-6 h-6 rounded bg-indigo-500/5 text-indigo-400 border border-indigo-500/10 font-serif italic font-bold flex items-center justify-center text-[10px]">
                            {rec.grade}
                          </span>
                          <div className="min-w-0">
                            <span className="font-bold text-white block">
                              {rec.score.toLocaleString()} pts
                            </span>
                            <span className="text-[8px] text-zinc-500 font-mono mt-0.5 flex items-center gap-1">
                              <Calendar className="h-2.5 w-2.5" />
                              {formatDate(rec.timestamp)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-mono text-slate-500 hidden sm:block">
                            {rec.accuracy.toFixed(2)}% | {rec.maxCombo}x
                          </span>
                          <button
                            onClick={() => onWatchReplay(rec)}
                            className="px-2.5 py-1 bg-white/5 hover:bg-indigo-500/10 hover:text-indigo-400 border border-white/5 hover:border-indigo-500/20 rounded text-[9px] font-sans font-bold flex items-center gap-1 active:scale-95 transition-all text-zinc-300 cursor-pointer"
                          >
                            <Play className="h-2 w-2 fill-current" /> Watch
                          </button>
                          <button
                            onClick={() => onDeleteRecord(rec.id)}
                            className="p-1 px-1.5 bg-transparent hover:bg-rose-500/10 hover:text-rose-400 text-zinc-500 rounded transition-all cursor-pointer"
                            title="Delete run record"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          ) : (
            <div className="bg-[#0e0e14]/90 border border-white/5 p-8 rounded-3xl shadow-2xl flex flex-col items-center justify-center py-20 text-center text-slate-500 h-full w-full mx-auto max-w-4xl">
              <Trophy className="h-10 w-10 text-zinc-600 mb-3" />
              <h4 className="text-xs font-bold text-slate-400">Archived Performance Station</h4>
              <p className="text-[11px] text-zinc-600 max-w-sm mt-1.5 leading-relaxed font-sans">
                Logged plays of finished tracks will cluster automatically. Select a completed song database card from the list on the left to swap difficulties.
              </p>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
