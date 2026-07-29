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

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Play, 
  Trash2, 
  Search, 
  Sliders, 
  Clock,
  Info,
  Download,
  Upload
} from 'lucide-react';
import { PlayHistoryRecord, Beatmap, GameSettings } from '../types';
import { sanitizeCssUrl } from '../utils/securityLimits';
import { downloadReplayExport, parseReplayImport, MAX_IMPORT_FILE_BYTES } from '../utils/replayTransfer';
import { DEFAULT_SETTINGS } from './settings/defaultSettings';
import metadata from '../../metadata.json';

interface PersonalHistoryScreenProps {
  history: PlayHistoryRecord[];
  allBeatmaps: Beatmap[];
  onWatchReplay: (record: PlayHistoryRecord) => void;
  onViewResult?: (record: PlayHistoryRecord) => void;
  onClearHistory: () => void;
  onDeleteRecord: (id: string) => void;
  onImportRecords: (records: PlayHistoryRecord[]) => number;
  historyLimit: number;
  onSetHistoryLimit: (limit: number) => void;
  settings?: GameSettings;
}

export default function PersonalHistoryScreen({
  history,
  allBeatmaps,
  onWatchReplay,
  onViewResult,
  onClearHistory,
  onDeleteRecord,
  onImportRecords,
  historyLimit,
  onSetHistoryLimit,
  settings
}: PersonalHistoryScreenProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [randomBg, setRandomBg] = useState('');

  const handleImportFile = async (file: File) => {
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setImportNotice('Import failed: file exceeds the 64 MB limit.');
      return;
    }
    try {
      const text = await file.text();
      const { records, rejectedCount } = parseReplayImport(text, DEFAULT_SETTINGS, allBeatmaps);
      if (records.length === 0) {
        setImportNotice('Import failed: no valid replay records found in file.');
        return;
      }
      const added = onImportRecords(records);
      const skipped = records.length - added;
      setImportNotice(
        `Imported ${added} run${added === 1 ? '' : 's'}` +
        (skipped > 0 ? ` (${skipped} duplicate${skipped === 1 ? '' : 's'} skipped)` : '') +
        (rejectedCount > 0 ? ` (${rejectedCount} invalid entr${rejectedCount === 1 ? 'y' : 'ies'} rejected)` : '') +
        '.'
      );
    } catch {
      setImportNotice('Import failed: could not read the file.');
    }
  };

  useEffect(() => {
    if (!importNotice) return;
    const timer = setTimeout(() => setImportNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [importNotice]);

  useEffect(() => {
    const bgs = [
    'Arushii.webp',
    'Ferineon.webp',
    'Kourihase.webp',
    'MPDisplay.webp',
    'Porukana.webp',
    'RedcXca.webp',
    'Sm0llBanana.webp',
    'THICC Jeff.webp',
    'mimile1606.webp',
    'nikio.webp',
    'tehfire.webp',
    'wxyz.webp'
  ];
    const chosen = bgs[Math.floor(Math.random() * bgs.length)];
    setRandomBg(`/backgrounds/${chosen}`);
  }, []);

  const resolvedRecords = useMemo(() => {
    return history.map(rec => {
      const baseId = rec.beatmapId.includes('_converted_')
        ? rec.beatmapId.split('_converted_')[0]
        : rec.beatmapId;
      const matchedMap = allBeatmaps.find(b =>
        b.id === rec.beatmapId ||
        (baseId && b.id === baseId) ||
        (rec.catalogMapId && b.catalogMapId === rec.catalogMapId) ||
        (rec.beatmapHash && b.beatmapHash === rec.beatmapHash)
      );
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
    }).sort((a, b) => b.timestamp - a.timestamp);
  }, [history, allBeatmaps]);

  const selectedRecord = useMemo(() => {
    if (!selectedRecordId) return null;
    return resolvedRecords.find(r => r.id === selectedRecordId) || null;
  }, [resolvedRecords, selectedRecordId]);

  const currentBgUrl = selectedRecord?.bgUrl || randomBg;

  const filteredHistory = useMemo(() => {
    return resolvedRecords.filter(rec => {
      if (!searchTerm) return true;
      const query = searchTerm.toLowerCase();
      const modsText = rec.mods && rec.mods.length > 0 ? rec.mods.join(' ') : 'no mods';
      return rec.beatmapTitle.toLowerCase().includes(query) ||
             rec.beatmapArtist.toLowerCase().includes(query) ||
             rec.difficultyName.toLowerCase().includes(query) ||
             rec.grade.toLowerCase().includes(query) ||
             modsText.toLowerCase().includes(query);
    });
  }, [resolvedRecords, searchTerm]);

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
    switch (grade) {
      case 'SS':
        return {
          text: 'text-zinc-100',
          border: 'border-zinc-200/50',
          bg: 'bg-white/10',
          glow: 'shadow-[0_0_15px_rgba(255,255,255,0.35)]',
        };
      case 'S':
        return {
          text: 'text-yellow-400',
          border: 'border-yellow-400/50',
          bg: 'bg-yellow-400/15',
          glow: 'shadow-[0_0_15px_rgba(250,204,21,0.45)]',
        };
      case 'A':
        return {
          text: 'text-emerald-400',
          border: 'border-emerald-400/50',
          bg: 'bg-emerald-400/15',
          glow: 'shadow-[0_0_15px_rgba(52,211,153,0.35)]',
        };
      case 'B':
        return {
          text: 'text-indigo-400',
          border: 'border-indigo-400/50',
          bg: 'bg-indigo-400/15',
          glow: 'shadow-[0_0_15px_rgba(129,140,248,0.35)]',
        };
      case 'C':
        return {
          text: 'text-pink-400',
          border: 'border-pink-400/50',
          bg: 'bg-pink-400/15',
          glow: 'shadow-[0_0_15px_rgba(244,114,182,0.35)]',
        };
      case 'F':
        return {
          text: 'text-rose-500',
          border: 'border-rose-500/50',
          bg: 'bg-rose-500/15',
          glow: 'shadow-[0_0_15px_rgba(239,68,68,0.35)]',
        };
      default:
        return {
          text: 'text-rose-500',
          border: 'border-rose-500/50',
          bg: 'bg-rose-500/15',
          glow: 'shadow-[0_0_15px_rgba(244,63,94,0.35)]',
        };
    }
  };

  return (
    <div id="personal-history-view-container" className="relative w-full h-[calc(100vh_-_64px)] text-slate-100 font-sans select-none overflow-hidden flex flex-col bg-transparent animate-fade-in">
      
      <div 
        className="absolute inset-0 bg-cover bg-center transition-all duration-700 ease-in-out scale-105 pointer-events-none z-0"
        style={{ 
          backgroundImage: `linear-gradient(rgba(0, 0, 0, ${settings?.menuBackgroundDim ?? 0.3}), rgba(0, 0, 0, ${settings?.menuBackgroundDim ?? 0.3})), url("${sanitizeCssUrl(currentBgUrl)}")`,
          filter: 'blur(4px)'
        }}
      />
      
      {importNotice && (
        <div className="bg-cyan-500/10 border-b border-cyan-500/20 px-4 py-1.5 flex items-center justify-center text-center backdrop-blur-sm shrink-0 relative z-10">
          <p className="text-[11px] font-sans text-cyan-300 tracking-wide">{importNotice}</p>
        </div>
      )}

      <div className="w-full max-w-none px-4 lg:px-10 pt-2 pb-1.5 flex justify-between items-center gap-4 z-10 relative select-none border-b border-white/[0.03] bg-zinc-950/80 backdrop-blur-sm shrink-0">
        <div className="flex flex-col text-left shrink-0 bg-[#09090d] border border-white/10 px-5 py-2 rounded-xl shadow-lg">
          <h1 className="text-xl md:text-2xl font-black tracking-[0.2em] text-skin-accent leading-none font-sans uppercase">
            REPLAY SELECT
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => importInputRef.current?.click()}
            title="Import replays from an exported JSON file"
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 font-sans text-[10px] font-extrabold uppercase tracking-wider rounded-xl border border-cyan-500/15 transition-all cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5" /> Import
          </button>

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

      {resolvedRecords.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-24 gap-3 opacity-75 my-auto max-w-2xl mx-auto w-full z-10">
          <h3 className="text-sm font-sans font-black text-white tracking-widest uppercase">
            No replay history found
          </h3>
          <p className="text-[10px] text-slate-500 font-mono max-w-xs leading-relaxed uppercase">
            Once you play and complete some maps, your replays and performance archives will show up here!
          </p>
        </div>
      ) : (
        <div className="flex-1 w-full max-w-none px-4 lg:px-10 min-h-0 p-2 lg:p-4 grid grid-cols-1 lg:grid-cols-12 gap-6 z-10 relative overflow-hidden">
          
          <div className="lg:col-span-4 flex flex-col gap-4 text-left h-full overflow-y-auto pr-1 pb-[72px]">
            {selectedRecord ? (
              <div className="flex flex-col gap-4 bg-[#0c0c12] p-5 rounded-2xl border border-white/10 shadow-2xl relative z-10">
                
                {selectedRecord.bgUrl && (
                  <div 
                    className="absolute inset-x-0 -top-12 -bottom-12 bg-cover bg-center opacity-[0.045] pointer-events-none scale-105 blur-md"
                    style={{ backgroundImage: `url("${sanitizeCssUrl(selectedRecord.bgUrl)}")` }}
                  />
                )}

                <div className="space-y-4 relative z-10">
                  {(() => {
                    const style = getGradeStyle(selectedRecord.grade);
                    return (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <span className="px-3.5 py-1 bg-skin-accent-dim text-skin-accent text-[9px] tracking-widest uppercase font-mono font-black border border-skin-accent/25 rounded-full inline-block">
                            SELECTED REPLAY INFO
                          </span>
                          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight font-sans leading-tight mt-2 break-words">
                            {selectedRecord.beatmapTitle}
                          </h1>
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                            {selectedRecord.beatmapArtist}
                          </p>
                          <p className="text-[10px] text-slate-500 font-mono mt-1 uppercase tracking-wide">
                            Mapped by {selectedRecord.creator}
                          </p>
                        </div>
                        <div className={`w-14 h-14 rounded-xl border flex items-center justify-center font-sans font-black tracking-tight text-3xl leading-none uppercase shrink-0 ${style.text} ${style.bg} ${style.border} ${style.glow}`}>
                          {selectedRecord.grade}
                        </div>
                      </div>
                    );
                  })()}

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
                    <span className="px-2 py-1 bg-white/5 border border-white/10 rounded text-slate-300 normal-case tracking-normal">
                      {formatDate(selectedRecord.timestamp)}
                      <span className="text-slate-500 ml-1">({getRelativeTime(selectedRecord.timestamp)})</span>
                    </span>
                  </div>

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

                  <button
                    onClick={() => onWatchReplay(selectedRecord)}
                    disabled={!selectedRecord.replayFrames || selectedRecord.replayFrames.length === 0}
                    className="w-full py-4 bg-skin-accent hover:brightness-110 active:scale-95 text-slate-950 font-sans font-black text-base uppercase tracking-widest rounded-xl shadow-lg shadow-skin-accent/20 flex items-center justify-center gap-2 transform transition hover:scale-[1.01] duration-150 cursor-pointer select-none border border-white/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:brightness-100"
                  >
                    <Play className="h-4 w-4 fill-current text-slate-950" />
                    <span>{(!selectedRecord.replayFrames || selectedRecord.replayFrames.length === 0) ? 'No Replay Saved' : 'Watch Replay'}</span>
                  </button>

                  {onViewResult && (
                    <button
                      onClick={() => onViewResult(selectedRecord)}
                      className="w-full py-2.5 bg-white/5 hover:bg-white/10 active:scale-98 text-slate-200 font-sans font-extrabold text-xs uppercase tracking-widest rounded-xl border border-white/10 transition-all cursor-pointer"
                    >
                      View Detailed Results
                    </button>
                  )}

                  <button
                    onClick={() => downloadReplayExport([selectedRecord], `${selectedRecord.beatmapArtist} - ${selectedRecord.beatmapTitle}`)}
                    className="w-full py-2.5 bg-white/5 hover:bg-white/10 active:scale-98 text-slate-200 font-sans font-extrabold text-xs uppercase tracking-widest rounded-xl border border-white/10 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Export Replay</span>
                  </button>

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

          <div className="lg:col-span-4 hidden lg:flex flex-col justify-center items-center pointer-events-none relative select-none" />

          <div className="lg:col-span-4 flex flex-col gap-3 h-full min-h-0 -mr-4 lg:-mr-10">
            
            <div className="px-4 lg:px-6 relative flex-shrink-0 flex flex-col gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input 
                  id="replay-search-input"
                  type="text"
                  placeholder="Search replay name, difficulty, grade, or mods..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-24 py-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl font-sans text-xs text-white placeholder-slate-500 focus:outline-none focus:border-skin-accent/50 focus:ring-1 focus:ring-skin-accent/30 transition-all shadow-lg"
                />
                <span className="absolute right-3 top-2 px-2 py-0.5 bg-[#1b1c24] border border-white/10 text-[9px] font-mono text-slate-400 font-bold rounded">
                  {filteredHistory.length} attempts
                </span>
              </div>
            </div>

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
                        {rec.bgUrl && (
                          <div 
                            className="absolute inset-0 bg-cover bg-center opacity-[0.03] pointer-events-none scale-102 blur-sm"
                            style={{ backgroundImage: `url("${sanitizeCssUrl(rec.bgUrl)}")` }}
                          />
                        )}

                        <div className="flex items-center justify-between p-4 py-3 relative z-10">
                          <div className="flex flex-col text-left overflow-hidden min-w-0 pr-2 flex-1">
                            
                            <div className="flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider text-slate-400 group-hover:text-skin-accent transition-colors truncate" title={boxTitle}>
                              {rec.uploadStatus === 'uploaded' ? (
                                <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 font-bold rounded text-[8px] shrink-0 border border-emerald-500/30">
                                  UPLOADED
                                </span>
                              ) : rec.uploadStatus === 'pending' ? (
                                <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 font-bold rounded text-[8px] shrink-0 border border-amber-500/30 animate-pulse">
                                  UPLOADING
                                </span>
                              ) : rec.uploadStatus === 'failed' ? (
                                <span className="px-1.5 py-0.2 bg-red-500/20 text-red-300 font-bold rounded text-[8px] shrink-0 border border-red-500/30">
                                  FAILED
                                </span>
                              ) : rec.isServerCatalogMap ? (
                                <span className="px-1.5 py-0.2 bg-cyan-500/20 text-cyan-300 font-bold rounded text-[8px] shrink-0 border border-cyan-500/30">
                                  CATALOG
                                </span>
                              ) : null}
                              <span className="truncate">{songName} [{rec.difficultyName}]</span>
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

                          <div className="flex items-center gap-3 shrink-0 select-none">
                            <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[9px] font-mono font-black text-slate-400">
                              {rec.keyCount}K
                            </span>
                            <div className={`w-10 h-10 rounded-lg border flex items-center justify-center font-sans font-black tracking-tight text-lg leading-none uppercase shrink-0 ${style.text} ${style.bg} ${style.border} ${style.glow}`}>
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

      <div className="absolute bottom-4 left-6 text-xs text-slate-500 font-mono z-20 select-none pointer-events-none">
        {metadata.version}
      </div>

    </div>
  );
}
