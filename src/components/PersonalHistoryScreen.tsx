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

import React, { useState, useMemo } from 'react';
import { 
  Play, 
  Trash2, 
  Database, 
  Award, 
  Info, 
  Calendar, 
  Search, 
  Sliders, 
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Loader,
  Music,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { PlayHistoryRecord, Beatmap } from '../types';
import { unpackBeatmap } from '../utils/unpackHelper';
import { storageManager } from '../utils/storageManager';

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
  const [expandedSongKey, setExpandedSongKey] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<PlayHistoryRecord | null>(null);
  const [isUnpacking, setIsUnpacking] = useState(false);
  const [unpackError, setUnpackError] = useState<string | null>(null);
  const [unpackStage, setUnpackStage] = useState<string>('');

  const selectedMap = selectedRecord ? allBeatmaps.find(b => b.id === selectedRecord.beatmapId) : null;

  const maxScore = history.length > 0 ? Math.max(...history.map(r => r.score)) : 0;

  // Filter history records by search term
  const filteredHistory = useMemo(() => {
    return history.filter(record => {
      const titleMatch = (record.beatmapTitle || '').toLowerCase().includes(searchTerm.toLowerCase());
      const artistMatch = (record.beatmapArtist || '').toLowerCase().includes(searchTerm.toLowerCase());
      const gradeMatch = (record.grade || '').toLowerCase().includes(searchTerm.toLowerCase());
      return titleMatch || artistMatch || gradeMatch;
    });
  }, [history, searchTerm]);

  // Group filtered history records by title and artist
  const songGroups = useMemo(() => {
    const groupsMap = new Map<string, {
      songKey: string;
      title: string;
      artist: string;
      bgUrl?: string;
      records: PlayHistoryRecord[];
    }>();

    filteredHistory.forEach((record) => {
      const title = record.beatmapTitle || 'Untitled';
      const artist = record.beatmapArtist || 'Unknown';
      const songKey = `${artist.toLowerCase().trim()} - ${title.toLowerCase().trim()}`;

      // Find beatmap for bgUrl lookup
      const map = allBeatmaps.find(b => b.id === record.beatmapId);
      const bgUrl = map?.bgUrl;

      let group = groupsMap.get(songKey);
      if (!group) {
        group = {
          songKey,
          title,
          artist,
          bgUrl,
          records: []
        };
        groupsMap.set(songKey, group);
      }
      group.records.push(record);
    });

    // Sort records inside each group by timestamp descending
    groupsMap.forEach(group => {
      group.records.sort((a, b) => b.timestamp - a.timestamp);
    });

    return Array.from(groupsMap.values());
  }, [filteredHistory, allBeatmaps]);

  // Handle selecting an individual replay without unpacking
  const handleSelectRecord = (record: PlayHistoryRecord) => {
    setSelectedRecord(record);
    setUnpackError(null);
  };

  const handleWatchReplayClick = async () => {
    if (!selectedRecord || isUnpacking) return;
    
    const map = allBeatmaps.find(b => b.id === selectedRecord.beatmapId);
    if (!map) {
      setUnpackError("Beatmap reference not found in your local inventory.");
      return;
    }

    setIsUnpacking(true);
    setUnpackError(null);

    try {
      setUnpackStage("Initializing replay environment...");
      
      // Ensure any blob references on this map are cleared prior to launching replay
      if (map.audioUrl?.startsWith('blob:')) map.audioUrl = '';
      if (map.videoUrl?.startsWith('blob:')) map.videoUrl = '';
      if (map.bgUrl?.startsWith('blob:')) map.bgUrl = '';
      storageManager.lruMediaCache.evict(map.id);

      // Blocking pacing delay so the user sees the loading state on the button
      await new Promise(resolve => setTimeout(resolve, 800));
    } catch (e) {
      console.error('Failed preparing watch replay:', e);
    } finally {
      setIsUnpacking(false);
    }

    onWatchReplay(selectedRecord);
  };

  const handleDeleteRecord = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteRecord(id);
    if (selectedRecord && selectedRecord.id === id) {
      setSelectedRecord(null);
    }
  };

  const getRankBadgeProps = (grade: string) => {
    switch (grade.toUpperCase()) {
      case 'SS':
        return { bg: 'bg-cyan-500/10 border-cyan-400/30 text-cyan-400', shadow: 'shadow-[0_0_12px_rgba(34,211,238,0.2)]' };
      case 'S':
        return { bg: 'bg-amber-500/10 border-amber-400/30 text-amber-400', shadow: 'shadow-[0_0_12px_rgba(245,158,11,0.2)]' };
      case 'A':
        return { bg: 'bg-emerald-500/10 border-emerald-400/30 text-emerald-400', shadow: 'shadow-[0_0_10px_rgba(16,185,129,0.15)]' };
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
            <span className="font-sans font-medium uppercase text-[10px] tracking-wider">Max plays kept:</span>
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
                      setSelectedRecord(null);
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
        
        {/* LEFT COLUMN: HISTORY DATABASE GROUPED BY SONG */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
            <input 
              id="history-search-input"
              type="text"
              placeholder="Search historical records by song title, artist, or ranking grade..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-black/40 border border-white/5 rounded-xl font-sans text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/30 transition-all"
            />
          </div>

          <div className="space-y-3.5">
            {songGroups.length > 0 ? (
              songGroups.map((group) => {
                const isGroupExpanded = expandedSongKey === group.songKey;
                const hasSelectedRecordInGroup = group.records.some(r => r.id === selectedRecord?.id);

                return (
                  <div key={group.songKey} className="flex flex-col gap-1 transition-all">
                    
                    {/* SONG CARD HEADER - Click to Expand / Collapse */}
                    <div
                      onClick={() => setExpandedSongKey(isGroupExpanded ? null : group.songKey)}
                      className={`p-3 rounded-xl flex items-center justify-between gap-3.5 border transition-all relative overflow-hidden backdrop-blur-md cursor-pointer ${
                        isGroupExpanded
                          ? 'bg-gradient-to-r from-slate-900/90 to-[#0e0e15]/90 border-indigo-500/25 shadow-sm'
                          : hasSelectedRecordInGroup
                            ? 'bg-gradient-to-r from-indigo-950/20 to-[#08080c]/90 border-indigo-500/40 hover:border-indigo-500/60 shadow-sm'
                            : 'bg-[#08080C]/90 border-white/[0.03] hover:border-white/10 hover:bg-slate-950/90 opacity-90'
                      }`}
                    >
                      {/* Subtly tint background with song picture */}
                      {group.bgUrl && (
                        <div 
                          className="absolute inset-x-0 -top-12 -bottom-12 bg-cover bg-center opacity-[0.035] pointer-events-none scale-105 select-none blur-sm"
                          style={{ backgroundImage: `url(${group.bgUrl})` }}
                        />
                      )}

                      <div className="flex items-center gap-3 w-full pr-1 overflow-hidden pointer-events-none select-none">
                        <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-slate-900 border border-white/5 flex items-center justify-center relative">
                          {group.bgUrl ? (
                            <img 
                              src={group.bgUrl} 
                              alt={group.title} 
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Music className="h-4 w-4 text-indigo-400/75" />
                          )}
                        </div>

                        <div className="overflow-hidden w-full">
                          <span className="text-[9px] text-[#8e99ef] font-extrabold uppercase font-mono tracking-wider block truncate max-w-[90%]">
                            {group.artist || 'Unknown Artist'}
                          </span>
                          <h4 className="font-extrabold font-sans text-xs text-white tracking-tight -mt-0.5 truncate max-w-[95%]">
                            {group.title}
                          </h4>
                          
                          <div className="flex gap-2 items-center text-[9px] text-slate-500 mt-1 font-mono leading-none">
                            <span className="font-bold px-1.5 py-0.5 border rounded uppercase tracking-wide text-[8px] bg-indigo-500/10 text-indigo-300 border-indigo-500/15">
                              {group.records.length} {group.records.length === 1 ? 'play logged' : 'plays logged'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Expanded UI arrow states */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isGroupExpanded ? (
                          <ChevronUp className="h-4 w-4 text-indigo-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-slate-500" />
                        )}
                      </div>
                    </div>

                    {/* EXPANDED DROPDOWN LIST OF INDIVIDUAL REPLAYS */}
                    {isGroupExpanded && (
                      <div className="mt-1 ml-4 border-l border-indigo-500/20 pl-3 flex flex-col gap-1.5 select-none animate-fade-in-slow">
                        {group.records.map((record) => {
                          const isSelected = selectedRecord?.id === record.id;
                          const badge = getRankBadgeProps(record.grade);
                          const associatedMap = allBeatmaps.find(b => b.id === record.beatmapId);

                          return (
                            <div
                              key={record.id}
                              onClick={() => handleSelectRecord(record)}
                              className={`p-3 rounded-lg transition-all duration-150 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border ${
                                isSelected 
                                  ? 'bg-gradient-to-r from-indigo-500/15 to-indigo-950/10 border-indigo-500/50 shadow-indigo-500/5'
                                  : 'bg-[#050508]/85 border-white/[0.02] hover:bg-[#0c0c14]/90 opacity-90 cursor-pointer'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                {/* RANK CHARACTER STYLED BULLET */}
                                <span className={`w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border text-xs font-serif font-black italic select-none ${badge.bg} ${badge.shadow}`}>
                                  {record.grade}
                                </span>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-extrabold text-[11px] text-white font-sans tracking-tight truncate">
                                      {associatedMap?.difficulty || `${record.keyCount}K Play`}
                                    </span>
                                    <span className="px-1 py-0.5 bg-white/5 border border-white/5 text-[8px] text-slate-400 font-mono rounded tracking-widest uppercase shrink-0">
                                      {record.keyCount}K
                                    </span>
                                  </div>
                                  
                                  {/* Timestamp metadata */}
                                  <span className="flex items-center gap-1 text-[9px] text-slate-500 mt-1 font-mono">
                                    <Calendar className="h-2.5 w-2.5" />
                                    {formatDate(record.timestamp)}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                                <div className="text-right font-mono text-[10px] hidden sm:block">
                                  <div className="text-indigo-400 font-bold">{record.score.toLocaleString()} pts</div>
                                  <div className="text-slate-500 text-[9px]">{record.accuracy.toFixed(2)}% | {record.maxCombo}x max</div>
                                </div>

                                <button
                                  onClick={(e) => handleDeleteRecord(record.id, e)}
                                  className="p-1.5 rounded bg-white/5 border border-white/5 text-slate-500 hover:text-red-400 hover:bg-rose-500/10 hover:border-red-500/10 transition-all cursor-pointer"
                                  title="Wipe this performance log"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

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

        {/* RIGHT COLUMN: REPLAY VIEWER DETAIL & DYNAMIC UNPACKER */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {selectedRecord ? (
            <div className="bg-[#08080C]/90 border border-white/5 p-6 rounded-2xl shadow-md backdrop-blur-md flex flex-col gap-5">
              
              <div className="flex justify-between items-start gap-4">
                <div>
                  <span className="text-[9px] text-slate-500 font-mono tracking-widest uppercase">// SELECTED REPLAY</span>
                  <h3 className="text-sm font-extrabold font-sans leading-tight mt-1 text-white truncate max-w-[200px]">
                    {selectedRecord.beatmapTitle}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[200px]">
                    {selectedRecord.beatmapArtist}
                  </p>
                </div>
                
                {/* Visual Rank badge */}
                {(() => {
                  const badge = getRankBadgeProps(selectedRecord.grade);
                  return (
                    <span className={`w-12 h-12 shrink-0 flex items-center justify-center rounded-xl border ${badge.bg} ${badge.shadow} font-serif font-black text-xl italic select-none`}>
                      {selectedRecord.grade}
                    </span>
                  );
                })()}
              </div>

              {/* Core metrics readout */}
              <div className="space-y-2 text-xs border-y border-white/5 py-4 font-sans">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Score Achieved:</span>
                  <span className="font-extrabold text-white">{selectedRecord.score.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Accuracy Score:</span>
                  <span className="font-extrabold text-indigo-400">{selectedRecord.accuracy.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Max Combo Spurt:</span>
                  <span className="font-extrabold text-emerald-400">{selectedRecord.maxCombo}x</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Recorded Mode:</span>
                  <span className="font-bold text-slate-300 font-mono text-[10px]">{selectedRecord.keyCount}K Key mode</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Date Played:</span>
                  <span className="text-[10px] text-slate-500 font-mono">{formatDate(selectedRecord.timestamp)}</span>
                </div>
              </div>

              {/* Hit judgements breakdown */}
              {selectedRecord.scoreState && (
                <div className="bg-black/30 border border-white/5 p-3.5 rounded-xl space-y-2">
                  <span className="text-[9px] tracking-wider uppercase font-mono text-slate-500 block">Spread Breakdown</span>
                  <div className="grid grid-cols-3 gap-1.5 font-mono text-[9px] text-center">
                    <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-md p-1">
                      <div className="text-cyan-400 font-bold">Marvelous</div>
                      <div className="text-slate-300 mt-0.5">{selectedRecord.scoreState.marvelousCount || 0}</div>
                    </div>
                    <div className="bg-amber-500/5 border border-amber-500/10 rounded-md p-1">
                      <div className="text-amber-400 font-bold">Perfect</div>
                      <div className="text-slate-300 mt-0.5">{selectedRecord.scoreState.perfectCount || 0}</div>
                    </div>
                    <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-md p-1">
                      <div className="text-emerald-400 font-bold">Great</div>
                      <div className="text-slate-300 mt-0.5">{selectedRecord.scoreState.greatCount || 0}</div>
                    </div>
                    <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-md p-1">
                      <div className="text-indigo-400 font-bold">Good</div>
                      <div className="text-slate-300 mt-0.5">{selectedRecord.scoreState.goodCount || 0}</div>
                    </div>
                    <div className="bg-purple-500/5 border border-purple-500/10 rounded-md p-1">
                      <div className="text-purple-400 font-bold">Bad</div>
                      <div className="text-slate-300 mt-0.5">{selectedRecord.scoreState.badCount || 0}</div>
                    </div>
                    <div className="bg-rose-500/5 border border-rose-500/10 rounded-md p-1">
                      <div className="text-rose-400 font-bold">Miss</div>
                      <div className="text-slate-300 mt-0.5">{selectedRecord.scoreState.missCount || 0}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Progress feedback for package decryption/media unpacking */}
              <div className="bg-black/40 border border-white/5 p-3.5 rounded-xl flex items-center justify-between text-xs transition-all">
                {isUnpacking ? (
                  <div className="flex items-center gap-2.5 text-indigo-400 font-sans font-medium">
                    <Loader className="h-3.5 w-3.5 animate-spin text-indigo-400 shrink-0" />
                    <span>{unpackStage || "Initializing replay..."}</span>
                  </div>
                ) : unpackError ? (
                  <div className="flex items-start gap-2 text-rose-400 font-sans font-medium">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
                    <div>
                      <span>Decryption error</span>
                      <p className="text-[10px] text-slate-500 mt-0.5">{unpackError}</p>
                    </div>
                  </div>
                ) : selectedMap ? (
                  <div className="flex items-center gap-2.5 text-emerald-400 font-sans font-medium">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    <span>Replay synchronized and ready.</span>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 text-rose-400 font-sans font-medium">
                    <AlertTriangle className="h-4.5 w-4.5 shrink-0 mt-0.5 text-rose-400" />
                    <div>
                      <span>Beatmap missing</span>
                      <p className="text-[10px] text-slate-500 mt-0.5">Please import the beatmap package prior to viewing.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Direct playback/viewer triggers */}
              <button
                id="watch-replay-telemetry-btn"
                disabled={isUnpacking || !selectedMap}
                onClick={handleWatchReplayClick}
                className={`w-full flex items-center justify-center gap-2 py-3 bg-indigo-500 hover:brightness-110 text-slate-950 font-sans text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-indigo-500/10 ${
                  isUnpacking || !selectedMap ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:scale-95'
                }`}
              >
                {isUnpacking ? (
                  <>
                    <Loader className="h-4 w-4 animate-spin text-slate-950" />
                    <span>Preparing Replay Engine...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" /> Watch Replay
                  </>
                )}
              </button>

            </div>
          ) : (
            <div className="bg-[#08080C]/90 border border-white/5 p-6 rounded-2xl shadow-md backdrop-blur-md flex flex-col items-center justify-center py-16 text-center text-slate-500">
              <Award className="h-10 w-10 text-slate-650 mb-3" />
              <h4 className="text-sm font-bold text-slate-300">Replay Station Panel</h4>
              <p className="text-xs text-slate-500 max-w-sm mt-1.5 leading-relaxed font-sans">
                Select an individual score record from the listed song group dropdown on the left. The replay, audio, and video files will automatically unpack and assemble.
              </p>
            </div>
          )}

          {/* STORAGE DIAGNOSTICS AS SECONDARY */}
          <div className="bg-[#08080C]/90 border border-white/5 p-5 rounded-2xl shadow-md backdrop-blur-md flex flex-col gap-4">
            <h3 className="text-xs font-black font-sans tracking-wide uppercase text-indigo-400 flex items-center gap-1.5">
              <Info className="h-4 w-4" /> Storage Diagnostics
            </h3>
            
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              Every score registered encodes precise sub-millisecond timeline events (press coordinates, hold constraints, releases). This allows accurate, frame-perfect game state re-construction.
            </p>

            <div className="border-t border-white/5 pt-4 space-y-3 font-sans text-xs">
              <div className="flex justify-between items-center text-slate-300">
                <span>Plays Recorded</span>
                <span className="font-extrabold text-white text-sm">{history.length}</span>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span>Highest Score</span>
                <span className="font-extrabold text-indigo-400">
                  {history.length > 0 ? maxScore.toLocaleString() : "Play first"}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-300">
                <span>Persistence Engine</span>
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
