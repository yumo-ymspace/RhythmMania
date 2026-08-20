/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Play,
  Trash2,
  Search,
  Clock,
  Download,
  Upload,
  ArrowLeft,
  Music,
  CheckCircle2,
  AlertTriangle,
  MoreHorizontal,
  Shuffle,
  ChevronDown,
  Check,
  X,
} from 'lucide-react';
import { PlayHistoryRecord, Beatmap, GameSettings } from '../types';
import { sanitizeCssUrl } from '../utils/securityLimits';
import { downloadReplayExport, parseReplayImport, MAX_IMPORT_FILE_BYTES } from '../utils/replayTransfer';
import { DEFAULT_SETTINGS, HISTORY_LIMIT_UNLIMITED } from './settings/defaultSettings';
import metadata from '../../metadata.json';
import { resolveStarRating } from '../utils/starRating';
import { getCatalogSetMetadata } from '../utils/catalogSetMetadata';

interface PersonalHistoryScreenProps {
  history: PlayHistoryRecord[];
  allBeatmaps: Beatmap[];
  onWatchReplay: (record: PlayHistoryRecord) => Promise<{ success: boolean; error?: string }> | void;
  onViewResult?: (record: PlayHistoryRecord) => void;
  onClearHistory: () => void;
  onDeleteRecord: (id: string) => void;
  onImportRecords: (records: PlayHistoryRecord[]) => number;
  historyLimit: number;
  onSetHistoryLimit: (limit: number) => void;
  settings?: GameSettings;
  onBack?: () => void;
  onSelectSong?: () => void;
}

type KeyCountFilter = 'all' | '4k' | '7k';
type GradeFilter = 'all' | 's' | 'a' | 'failed';
type SortOption = 'date_desc' | 'score_desc' | 'accuracy_desc';

const MENU_BACKGROUNDS = [
  '- Y u m i J i-.webp',
  'Arushii.webp',
  'Ferineon.webp',
  'MPDisplay.webp',
  'PEALEERD_TAK.webp',
  'Porukana.webp',
  'RedcXca.webp',
  'Sm0llBanana.webp',
  'THICC Jeff.webp',
  'Triantafyllia.webp',
  'YellowX21.webp',
  'mimile1606.webp',
  'nikio.webp',
  'serr.webp',
  'soncak.webp',
  'wxyz.webp'
];

const DEFAULT_SONG_BANNER = '/backgrounds/Ferineon.webp';

function getSlimCoverUrl(item: any): string | undefined {
  const itemCoverUrl = typeof item?.coverUrl === 'string' ? item.coverUrl : undefined;
  if (itemCoverUrl) return itemCoverUrl;

  let sourceSetId = Number(
    item?.sourceSetId || String(item?.catalogSetId || '').replace(/^osuapi_/, ''),
  );

  if (!Number.isInteger(sourceSetId) || sourceSetId < 1) {
    const pkgId = item?.parentPackageId || item?.packageId;
    if (typeof pkgId === 'string') {
      const match = pkgId.match(/(?:osuapi_|pkg_)?(\d{1,10})/);
      if (match) {
        const parsed = Number(match[1]);
        if (Number.isInteger(parsed) && parsed > 0) sourceSetId = parsed;
      }
    }
  }

  if ((!Number.isInteger(sourceSetId) || sourceSetId < 1) && typeof item?.originalContent === 'string') {
    const match = item.originalContent.match(/^BeatmapSetID\s*:\s*(\d+)/im);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isInteger(parsed) && parsed > 0) sourceSetId = parsed;
    }
  }

  if (!Number.isInteger(sourceSetId) || sourceSetId < 1) return undefined;

  return getCatalogSetMetadata(sourceSetId)?.slimCoverUrl
    || `https://assets.ppy.sh/beatmaps/${sourceSetId}/covers/slimcover@2x.jpg`;
}

export default function PersonalHistoryScreen({
  history,
  allBeatmaps,
  onWatchReplay,
  onClearHistory,
  onDeleteRecord,
  onImportRecords,
  historyLimit,
  onSetHistoryLimit,
  onBack,
  onSelectSong
}: PersonalHistoryScreenProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [keyFilter, setKeyFilter] = useState<KeyCountFilter>('all');
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [openFilterMenu, setOpenFilterMenu] = useState<'sort' | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [randomBg, setRandomBg] = useState('');

  useEffect(() => {
    const chosen = MENU_BACKGROUNDS[Math.floor(Math.random() * MENU_BACKGROUNDS.length)];
    setRandomBg(`/backgrounds/${chosen}`);
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowSettingsMenu(false);
      if (openFilterMenu) {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-filter-menu]')) setOpenFilterMenu(null);
      }
    };
    if (showSettingsMenu || openFilterMenu) {
      window.addEventListener('mousedown', handleClickOutside);
      return () => window.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSettingsMenu, openFilterMenu]);

  const handleImportFile = async (file: File) => {
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setImportNotice({ text: 'Import failed: file exceeds the 64 MB limit.', isError: true });
      return;
    }
    try {
      const text = await file.text();
      const { records, rejectedCount } = parseReplayImport(text, DEFAULT_SETTINGS, allBeatmaps);
      if (records.length === 0) {
        setImportNotice({ text: 'Import failed: no valid replay records found in file.', isError: true });
        return;
      }
      const added = onImportRecords(records);
      const skipped = records.length - added;
      setImportNotice({
        text: `Imported ${added} run${added === 1 ? '' : 's'}` + (skipped > 0 ? ` (${skipped} skipped)` : '') + (rejectedCount > 0 ? ` (${rejectedCount} rejected)` : '') + '.',
        isError: false
      });
    } catch {
      setImportNotice({ text: 'Import failed: could not read the file.', isError: true });
    }
  };

  useEffect(() => {
    if (!importNotice) return;
    const t = setTimeout(() => setImportNotice(null), 4000);
    return () => clearTimeout(t);
  }, [importNotice]);

  const resolvedRecords = useMemo(() => {
    return history.map(rec => {
      const baseId = rec.beatmapId.includes('_converted_') ? rec.beatmapId.split('_converted_')[0] : rec.beatmapId;
      const matchedMap = allBeatmaps.find(b =>
        b.id === rec.beatmapId ||
        (baseId && b.id === baseId) ||
        (rec.catalogMapId && b.catalogMapId === rec.catalogMapId) ||
        (rec.beatmapHash && b.beatmapHash === rec.beatmapHash)
      );
      const coverUrl = (matchedMap as any)?.coverUrl || (matchedMap ? getSlimCoverUrl(matchedMap) : undefined) || getSlimCoverUrl(rec);
      return {
        ...rec,
        bgUrl: matchedMap?.bgUrl,
        coverUrl,
        difficultyName: matchedMap?.difficulty || `${rec.keyCount}K`,
        starRating: matchedMap ? resolveStarRating(matchedMap) : 4.50,
      };
    });
  }, [history, allBeatmaps]);

  const filteredHistory = useMemo(() => {
    return resolvedRecords
      .filter(rec => {
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase().trim();
          const modsText = rec.mods && rec.mods.length > 0 ? rec.mods.join(' ') : '';
          if (!rec.beatmapTitle.toLowerCase().includes(q) && !rec.beatmapArtist.toLowerCase().includes(q) && !rec.difficultyName.toLowerCase().includes(q) && !modsText.toLowerCase().includes(q)) return false;
        }
        if (keyFilter === '4k' && rec.keyCount !== 4) return false;
        if (keyFilter === '7k' && rec.keyCount !== 7) return false;
        if (gradeFilter === 's' && rec.grade !== 'S' && rec.grade !== 'SS') return false;
        if (gradeFilter === 'a' && rec.grade !== 'A') return false;
        if (gradeFilter === 'failed' && !rec.isFailed && rec.grade !== 'F') return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'score_desc') return b.score - a.score;
        if (sortBy === 'accuracy_desc') return b.accuracy - a.accuracy;
        return b.timestamp - a.timestamp;
      });
  }, [resolvedRecords, searchTerm, keyFilter, gradeFilter, sortBy]);

  useEffect(() => {
    if (filteredHistory.length > 0) {
      if (!selectedRecordId || !filteredHistory.some(r => r.id === selectedRecordId)) setSelectedRecordId(filteredHistory[0].id);
    } else setSelectedRecordId(null);
  }, [filteredHistory, selectedRecordId]);

  const selectedRecord = useMemo(() => {
    if (!selectedRecordId) return null;
    return resolvedRecords.find(r => r.id === selectedRecordId) || null;
  }, [resolvedRecords, selectedRecordId]);

  const currentBgUrl = selectedRecord?.bgUrl || randomBg || DEFAULT_SONG_BANNER;

  const handleDeleteRecord = (id: string) => {
    if (selectedRecordId === id) {
      const remaining = filteredHistory.filter(r => r.id !== id);
      setSelectedRecordId(remaining.length > 0 ? remaining[0].id : null);
    }
    setConfirmDeleteId(null);
    onDeleteRecord(id);
  };

  const handleWatchRecord = async (record: PlayHistoryRecord) => {
    const result = await onWatchReplay(record);
    if (result && !result.success) setImportNotice({ text: result.error || 'Replay playback could not be started.', isError: true });
  };

  const getRelativeTime = (ts: number) => {
    const d = Date.now() - ts;
    const m = Math.floor(d / 60000), h = Math.floor(m / 60), days = Math.floor(h / 24);
    if (m < 1) return 'Just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  };

  const getGradeTheme = (grade: string, isFailed?: boolean) => {
    if (isFailed || grade === 'F') return { label: 'Failed', badge: 'bg-rose-500/15 text-rose-400 border border-rose-500/20', tag: 'F' };
    switch (grade) {
      case 'SS': return { label: 'Perfect', badge: 'bg-cyan-500/15 text-cyan-300 border border-cyan-400/30', tag: 'SS' };
      case 'S': return { label: 'Excellent', badge: 'bg-amber-500/15 text-amber-300 border border-amber-400/25', tag: 'S' };
      case 'A': return { label: 'Great', badge: 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/20', tag: 'A' };
      case 'B': return { label: 'Good', badge: 'bg-indigo-500/15 text-indigo-300 border border-indigo-400/20', tag: 'B' };
      case 'C': return { label: 'Clear', badge: 'bg-purple-500/15 text-purple-300 border border-purple-400/20', tag: 'C' };
      default: return { label: 'Clear', badge: 'bg-white/10 text-slate-300 border border-white/10', tag: 'D' };
    }
  };

  const getDifficultyColor = (rating: number) => {
    if (rating < 2.0) return 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20';
    if (rating < 3.0) return 'text-cyan-400 bg-cyan-500/10 border border-cyan-500/20';
    if (rating < 4.0) return 'text-amber-400 bg-amber-500/10 border border-amber-500/20';
    if (rating < 5.0) return 'text-orange-400 bg-orange-500/10 border border-orange-500/20';
    if (rating < 6.5) return 'text-rose-400 bg-rose-500/10 border border-rose-500/20';
    return 'text-purple-400 bg-purple-500/10 border border-purple-500/20';
  };

  const handleExportAll = () => {
    if (filteredHistory.length === 0) return;
    downloadReplayExport(filteredHistory, `RhythmMania_History_${new Date().toISOString().slice(0, 10)}`);
  };

  const handleSelectRandom = () => {
    if (filteredHistory.length === 0) return;
    setSelectedRecordId(filteredHistory[Math.floor(Math.random() * filteredHistory.length)].id);
  };

  const handleDrag = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    const f = e.dataTransfer.files?.[0];
    if (f) await handleImportFile(f);
  };

  if (resolvedRecords.length === 0) {
    return (
      <div className="relative w-full h-[calc(100vh_-_64px)] text-slate-100 font-sans select-none overflow-hidden flex flex-col bg-transparent">
        <div className="absolute bottom-6 left-6 text-xs text-white/40 font-mono z-[100] select-none pointer-events-none">{metadata.version}</div>
        <div className="absolute inset-0 bg-black/10 backdrop-blur-[0.5px] pointer-events-none z-0" />
        <input ref={importInputRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImportFile(f); e.target.value = ''; }} />
        {importNotice && (
          <div className={`absolute top-0 inset-x-0 z-30 px-5 py-2 flex items-center justify-between gap-3 text-xs font-medium backdrop-blur-xl border-b ${importNotice.isError ? 'bg-rose-950/70 border-rose-500/20 text-rose-200' : 'bg-zinc-900/80 border-cyan-500/20 text-cyan-200'}`}>
            <div className="flex items-center gap-2">{importNotice.isError ? <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" /> : <CheckCircle2 className="h-4 w-4 text-cyan-400 shrink-0" />}<span>{importNotice.text}</span></div>
            <button type="button" onClick={() => setImportNotice(null)} className="p-1 rounded-md text-white/50 hover:text-white"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
        <div className="flex-1 w-full max-w-none pl-0 pr-4 lg:pr-10 min-h-0 pt-0 pb-0 grid grid-cols-1 lg:grid-cols-12 gap-6 z-10 relative overflow-hidden">
          <div className="lg:col-span-4 flex flex-col gap-4 text-left h-full overflow-y-auto pr-1 pb-[72px] bg-[#0c0c12]/70 border border-white/10 rounded-none shadow-2xl">
            <div className="flex-1 flex flex-col items-center justify-center text-center py-24 gap-4 opacity-75 p-6 relative z-10">
              <span className="p-4 bg-pink-500/10 text-pink-500 rounded-full border border-pink-500/20 shadow animate-pulse"><Music className="h-8 w-8 text-pink-500" /></span>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-lg font-sans font-black text-white tracking-widest uppercase">No Replays Yet</h3>
                <p className="text-sm text-slate-400 font-sans max-w-sm leading-relaxed">Complete songs in Song Select or import replays to see your history here.</p>
                <div className="flex items-center justify-center gap-2 mt-3">
                  {onSelectSong && <button type="button" onClick={onSelectSong} className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/35 bg-cyan-400/80 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-cyan-950 transition hover:bg-cyan-400"><Music className="h-3.5 w-3.5" /> Song Select</button>}
                  <button type="button" onClick={() => importInputRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-pink-500/35 bg-pink-500/80 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-pink-100 transition hover:bg-pink-500"><Upload className="h-3.5 w-3.5" /> Import</button>
                </div>
              </div>
              <button type="button" aria-label="Import replay file" onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop} onClick={() => importInputRef.current?.click()} className="mt-6 p-3 rounded-xl border border-dashed border-white/10 text-center cursor-pointer hover:border-pink-500/30 bg-black/80 hover:bg-black/90 transition flex flex-col items-center justify-center w-full max-w-sm">
                <Upload className="h-4 w-4 text-slate-500 mb-1" /><span className="text-[8px] font-mono font-bold text-slate-400 uppercase tracking-widest">DRAG & DROP REPLAY JSON TO IMPORT</span>
              </button>
            </div>
          </div>
          <div className="lg:col-span-4 hidden lg:flex flex-col justify-center items-center pointer-events-none relative select-none" />
          <div className="lg:col-span-4 hidden lg:flex flex-col gap-3 h-full min-h-0 pt-8 lg:pt-12 -mr-4 lg:-mr-10">
            <div className="bg-[#0c0c12] border border-white/10 p-8 rounded-xl flex flex-col items-center justify-center text-center text-slate-500 shadow-xl">
              <Clock className="h-6 w-6 mb-2 text-slate-600" /><p className="text-[11px] font-sans font-black tracking-widest uppercase">No replay matches</p><p className="text-[9px] text-slate-600 font-mono max-w-xs mt-1 uppercase">Play a map or import replays to populate this selector</p>
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-30 select-none bg-transparent pointer-events-none w-auto">
          <div className="flex items-center gap-0.5 bg-[#09090d]/90 backdrop-blur-md border-t border-l border-r border-white/10 rounded-t-2xl pointer-events-auto shadow-2xl">
            <button type="button" onClick={() => importInputRef.current?.click()} className="relative flex flex-col items-center justify-center bg-[#1e2326]/90 hover:bg-[#252b2f] border border-white/10 active:brightness-95 w-32 h-16 transition-all duration-150 shadow-md cursor-pointer group" style={{ transform: 'skewX(-12deg)', borderTopLeftRadius: '14px', borderBottomLeftRadius: '14px' }}>
              <div className="flex flex-col items-center gap-1.5" style={{ transform: 'skewX(12deg)' }}><Upload className="h-[22px] w-[22px] text-[#a3e635] transition group-hover:scale-110" /><span className="text-sm font-sans font-extrabold text-white tracking-wide leading-none select-none">Import</span></div>
              <div className="absolute bottom-0 inset-x-0 h-[3px] bg-[#a3e635] rounded-bl-lg" />
            </button>
            <button type="button" onClick={() => onBack?.()} className="relative flex flex-col items-center justify-center bg-[#1e2326]/90 hover:bg-[#252b2f] border border-white/10 active:brightness-95 w-32 h-16 transition-all duration-150 shadow-md cursor-pointer group" style={{ transform: 'skewX(-12deg)', borderTopRightRadius: '14px', borderBottomRightRadius: '14px' }}>
              <div className="flex flex-col items-center gap-1.5" style={{ transform: 'skewX(12deg)' }}><ArrowLeft className="h-[22px] w-[22px] text-[#38bdf8] transition group-hover:scale-110" /><span className="text-sm font-sans font-extrabold text-white tracking-wide leading-none select-none">Back</span></div>
              <div className="absolute bottom-0 inset-x-0 h-[3px] bg-[#38bdf8] rounded-br-lg" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="relative w-full h-[calc(100vh_-_64px)] text-slate-100 font-sans select-none overflow-hidden flex flex-col bg-transparent px-4 py-3 gap-3">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] pointer-events-none z-0" />
        {currentBgUrl && <div className="absolute inset-0 bg-cover bg-center opacity-20 blur-xl scale-110 pointer-events-none z-0" style={{ backgroundImage: `url("${sanitizeCssUrl(currentBgUrl)}")` }} />}
        <input ref={importInputRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImportFile(f); e.target.value = ''; }} />
        {importNotice && (
          <div className={`shrink-0 z-20 px-3 py-2 flex items-center justify-between gap-2 text-xs font-medium backdrop-blur-xl border rounded-xl ${importNotice.isError ? 'bg-rose-950/70 border-rose-500/20 text-rose-200' : 'bg-zinc-900/80 border-cyan-500/20 text-cyan-200'}`}>
            <div className="flex items-center gap-2 min-w-0">{importNotice.isError ? <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" /> : <CheckCircle2 className="h-4 w-4 text-cyan-400 shrink-0" />}<span className="truncate">{importNotice.text}</span></div>
            <button type="button" onClick={() => setImportNotice(null)} className="p-1 rounded-md text-white/50 hover:text-white shrink-0"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}

        {selectedRecord ? (
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c12]/70 backdrop-blur-md p-4 flex flex-col gap-3 shadow-2xl z-10 shrink-0">
            {currentBgUrl && <div className="absolute inset-0 bg-cover bg-center opacity-10 blur-xl scale-110 pointer-events-none" style={{ backgroundImage: `url("${sanitizeCssUrl(currentBgUrl)}")` }} />}
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-14 h-14 rounded-xl border border-white/10 bg-slate-900/80 overflow-hidden flex items-center justify-center shrink-0 shadow-md">
                {currentBgUrl ? <img src={currentBgUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" alt="" /> : <Music className="h-6 w-6 text-pink-500" />}
              </div>
              <div className="flex-1 min-w-0 text-left flex flex-col justify-center">
                <span className="text-[10px] uppercase font-mono tracking-widest text-pink-500 font-black leading-none mb-1 truncate">{selectedRecord.beatmapArtist || 'Unknown Artist'}</span>
                <h2 className="font-sans font-black text-base text-white tracking-tight truncate leading-tight">{selectedRecord.beatmapTitle}</h2>
                <span className="text-[10px] text-slate-400 font-mono uppercase mt-0.5 tracking-wide truncate">{selectedRecord.difficultyName} • {selectedRecord.keyCount}K • ★ {selectedRecord.starRating.toFixed(2)}</span>
              </div>
              <span className={`shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-lg font-bold text-xs font-sans ${getGradeTheme(selectedRecord.grade, selectedRecord.isFailed).badge}`}>{getGradeTheme(selectedRecord.grade, selectedRecord.isFailed).tag}</span>
            </div>
            <div className="flex items-center justify-between gap-3 relative z-10">
              <div className="flex-1 min-w-0 rounded-xl bg-black/40 border border-white/5 px-3 py-2 flex items-center justify-between">
                <div className="text-left"><div className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Score</div><div className="text-sm font-mono font-black text-white tabular-nums">{selectedRecord.score.toLocaleString()}</div></div>
                <div className="text-right"><div className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Accuracy</div><div className="text-sm font-mono font-bold text-cyan-300 tabular-nums">{selectedRecord.accuracy.toFixed(2)}%</div></div>
              </div>
              <button onClick={() => void handleWatchRecord(selectedRecord)} disabled={!selectedRecord.replayFrames || selectedRecord.replayFrames.length === 0} className="px-5 py-2.5 bg-pink-500/80 hover:bg-pink-500 active:brightness-90 active:scale-95 text-slate-950 font-sans font-black text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-pink-500/20 flex items-center justify-center gap-1.5 transform transition duration-150 cursor-pointer border border-white/10 select-none shrink-0 disabled:opacity-30">
                <Play className="h-4 w-4 fill-current text-slate-950" /><span>WATCH</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-[#0c0c12]/70 backdrop-blur-md p-6 text-center shadow-2xl z-10 shrink-0">
            <p className="text-xs text-slate-400 font-mono uppercase font-bold tracking-wider">No replay selected</p>
            <div className="flex items-center justify-center gap-2 mt-3">
              {onSelectSong && <button type="button" onClick={onSelectSong} className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/35 bg-cyan-400/80 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-cyan-950"><Music className="h-3.5 w-3.5" /> Song Select</button>}
              <button type="button" onClick={() => importInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-pink-500/35 bg-pink-500/80 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-pink-100"><Upload className="h-3.5 w-3.5" /> Import</button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 z-10 shrink-0">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-400" />
            <input type="text" placeholder="Search replays..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2.5 bg-[#0f0e15] border border-white/10 rounded-xl font-sans text-xs text-white placeholder-slate-500 focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/30 transition-all shadow-lg" />
          </div>
          <button type="button" onClick={() => importInputRef.current?.click()} className="px-3.5 py-2.5 bg-[#12121a]/80 hover:brightness-110 active:scale-95 border border-white/10 rounded-xl text-[10px] font-sans font-black tracking-wider text-white uppercase flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-all shrink-0"><Upload className="h-3.5 w-3.5 text-emerald-400 shrink-0" /><span>IMPORT</span></button>
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono font-black text-slate-400 tracking-wider uppercase z-10 px-1 shrink-0">
          <span>AVAILABLE REPLAYS</span>
          <span className="text-pink-400 font-bold bg-pink-550/10 px-2 py-0.5 rounded border border-pink-500/10">{filteredHistory.length} replays</span>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-2 z-10 pb-[90px] pr-0.5 min-h-0">
          {filteredHistory.length > 0 ? (
            filteredHistory.map((rec) => {
              const isActive = selectedRecordId === rec.id;
              const theme = getGradeTheme(rec.grade, rec.isFailed);
              const banner = rec.coverUrl || DEFAULT_SONG_BANNER;
              return (
                <div key={rec.id} role="button" tabIndex={0} aria-pressed={isActive}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedRecordId(rec.id); } }}
                  onClick={() => setSelectedRecordId(rec.id)}
                  className={`group relative border rounded-xl overflow-hidden cursor-pointer select-none transition-all p-3 flex items-center justify-between gap-3 shadow-md active:scale-[0.99] duration-150 ${isActive ? 'border-pink-500 bg-pink-500/5 shadow-[0_0_15px_rgba(236,72,153,0.15)]' : 'border-white/[0.05] bg-[#0c0c12]/85 hover:bg-[#12121a]/90 hover:border-white/10'}`}>
                  {rec.coverUrl && (
                    <img src={rec.coverUrl} className="absolute inset-0 h-full w-full object-cover opacity-15 blur-sm pointer-events-none" referrerPolicy="no-referrer" alt="" />
                  )}
                  <div className="flex items-center gap-3 relative z-10 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-slate-900 border border-white/5 overflow-hidden flex items-center justify-center shrink-0">
                      {rec.coverUrl ? <img src={rec.coverUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" alt="" /> : <Music className="h-4 w-4 text-pink-500" />}
                    </div>
                    <div className="text-left min-w-0 flex-1">
                      <h4 className="font-bold font-sans text-sm text-white tracking-tight truncate leading-snug">{rec.beatmapTitle}</h4>
                      <p className="text-[10px] text-slate-400 font-mono truncate uppercase mt-0.5">{rec.beatmapArtist} • {rec.difficultyName}</p>
                      <div className="flex items-center gap-1.5 mt-1 text-[10px] font-mono text-slate-400">
                        <span className="text-slate-200 font-semibold tabular-nums">{rec.score.toLocaleString()}</span><span>•</span><span className="tabular-nums">{rec.accuracy.toFixed(2)}%</span><span>•</span><span>{rec.keyCount}K</span>
                        {rec.mods && rec.mods.length > 0 && <><span>•</span><span className="text-pink-400 font-sans font-medium text-[9px]">+{rec.mods.join('')}</span></>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0 z-10 select-none">
                    <span className={`inline-flex items-center justify-center h-7 w-7 rounded-lg font-bold text-xs font-sans ${theme.badge}`}>{theme.tag}</span>
                    <span className="text-[9px] font-mono text-slate-500">{getRelativeTime(rec.timestamp)}</span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="bg-[#0c0c12]/60 border border-white/10 p-8 rounded-2xl flex flex-col items-center justify-center text-center text-slate-500 shadow-xl z-10 py-12">
              <Clock className="h-6 w-6 mb-2 text-slate-600 animate-pulse" /><p className="text-[10px] font-sans font-black tracking-widest uppercase">No replays found</p><p className="text-[8px] text-slate-600 font-mono mt-1 uppercase max-w-xs">Adjust search or filters, or import replays</p>
            </div>
          )}
        </div>

        <div className="fixed bottom-0 inset-x-0 bg-[#09090d]/95 backdrop-blur-md border-t border-white/10 p-4 pb-6 flex items-center justify-between gap-3 z-40 shadow-2xl">
          <button type="button" onClick={() => { if (onBack) onBack(); }} className="flex-1 py-3.5 bg-[#121216] border border-white/10 rounded-xl flex items-center justify-center gap-2 text-white font-sans font-bold text-xs uppercase cursor-pointer active:brightness-90 active:scale-95 transition-all shadow-md"><ArrowLeft className="h-4 w-4 text-pink-500" /><span>Back</span></button>
          <button type="button" onClick={() => importInputRef.current?.click()} className="flex-1 py-3.5 bg-[#121216] border border-white/10 rounded-xl flex items-center justify-center gap-2 text-white font-sans font-bold text-xs uppercase cursor-pointer active:brightness-90 active:scale-95 transition-all shadow-md"><Upload className="h-4 w-4 text-emerald-400" /><span>Import</span></button>
          <button type="button" onClick={handleSelectRandom} className="flex-1 py-3.5 bg-[#121216] border border-white/10 rounded-xl flex items-center justify-center gap-2 text-white font-sans font-bold text-xs uppercase cursor-pointer active:brightness-90 active:scale-95 transition-all shadow-md"><Shuffle className="h-4 w-4 text-[#38bdf8]" /><span>Random</span></button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[calc(100vh_-_64px)] text-slate-100 font-sans select-none overflow-hidden flex flex-col bg-transparent">
      <div className="absolute bottom-6 left-6 text-xs text-white/40 font-mono z-[100] select-none pointer-events-none">{metadata.version}</div>
      <div className="absolute inset-0 bg-black/10 backdrop-blur-[0.5px] pointer-events-none z-0" />
      {currentBgUrl && <div className="absolute inset-0 bg-cover bg-center pointer-events-none" style={{ backgroundImage: `url("${sanitizeCssUrl(currentBgUrl)}")`, filter: 'blur(0px) brightness(0.9)', opacity: 0.35 }} />}
      <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/20 to-transparent pointer-events-none z-[1]" />
      <input ref={importInputRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImportFile(f); e.target.value = ''; }} />
      {importNotice && (
        <div className={`absolute top-0 inset-x-0 z-30 px-5 py-2 flex items-center justify-between gap-3 text-xs font-medium backdrop-blur-xl border-b ${importNotice.isError ? 'bg-rose-950/70 border-rose-500/20 text-rose-200' : 'bg-emerald-950/40 border-emerald-500/20 text-emerald-200'}`} role="alert">
          <div className="flex items-center gap-2">{importNotice.isError ? <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" /> : <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}<span>{importNotice.text}</span></div>
          <button type="button" onClick={() => setImportNotice(null)} className="p-1 rounded-md text-white/50 hover:text-white"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {showConfirmClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-white/10 p-5 shadow-2xl text-center">
            <h3 className="text-base font-semibold text-white mb-1">Clear History?</h3>
            <p className="text-xs text-slate-400 mb-5">This will erase all {resolvedRecords.length} locally saved play records and replay telemetry. This action cannot be undone.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowConfirmClear(false)} className="flex-1 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium text-slate-300 transition-all">Cancel</button>
              <button type="button" onClick={() => { onClearHistory(); setSelectedRecordId(null); setShowConfirmClear(false); }} className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-medium text-white transition-all">Clear All</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 w-full max-w-none pl-0 pr-4 lg:pr-10 min-h-0 pt-0 pb-0 grid grid-cols-1 lg:grid-cols-12 gap-6 z-10 relative overflow-hidden">
        <div className="lg:col-span-4 flex flex-col gap-4 text-left h-full overflow-y-auto pr-1 pb-[72px] bg-[#0c0c12]/70 border border-white/10 rounded-none shadow-2xl">
          {selectedRecord ? (
            <div className="flex flex-col gap-5 p-5 relative z-10">
              <div className="space-y-1 text-left">
                <span className="px-3.5 py-1 bg-skin-accent-dim text-skin-accent text-[9px] tracking-widest uppercase font-mono font-black border border-skin-accent/25 rounded-full inline-block">SELECTED REPLAY</span>
                <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight font-sans leading-tight break-words mt-2">{selectedRecord.beatmapTitle}</h1>
                <p className="text-sm text-slate-400 font-bold uppercase tracking-widest mt-1">{selectedRecord.beatmapArtist}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${getDifficultyColor(selectedRecord.starRating)}`}>★ {selectedRecord.starRating.toFixed(2)}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-white/5 border border-white/10 text-slate-300">{selectedRecord.difficultyName}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-white/5 border border-white/10 text-slate-300">{selectedRecord.keyCount}K</span>
                  {selectedRecord.mods && selectedRecord.mods.length > 0 && <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-pink-500/20 text-pink-300 border border-pink-500/30">+{selectedRecord.mods.join('')}</span>}
                </div>
              </div>

              <button id="main-left-play-button" onClick={() => void handleWatchRecord(selectedRecord)} disabled={!selectedRecord.replayFrames || selectedRecord.replayFrames.length === 0} className="w-full py-4 bg-[#061a34]/80 hover:bg-[#193454] active:scale-95 text-white font-sans font-black text-base tracking-widest rounded-xl shadow-lg shadow-black/20 flex items-center justify-center gap-2 transform transition hover:scale-[1.01] duration-150 cursor-pointer border border-white/10 select-none disabled:opacity-30">
                <Play className="h-5 w-5 fill-current text-cyan-300" /><span>Watch Replay</span>
              </button>

              {confirmDeleteId === selectedRecord.id ? (
                <div className="flex gap-2">
                  <button type="button" onClick={() => handleDeleteRecord(selectedRecord.id)} className="flex-1 py-3 rounded-xl border border-rose-500 bg-rose-500/80 text-rose-100 text-xs font-black uppercase tracking-wider">Confirm Delete</button>
                  <button type="button" onClick={() => setConfirmDeleteId(null)} className="flex-1 py-3 rounded-xl border border-white/10 bg-[#12121a]/80 text-slate-300 text-xs font-bold uppercase tracking-wider">Cancel</button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDeleteId(selectedRecord.id)} className="w-full py-3 rounded-xl border border-white/10 bg-[#12121a]/80 text-slate-400 hover:border-rose-500/40 hover:text-rose-300 text-xs font-black uppercase tracking-wider transition flex items-center justify-center gap-1.5"><Trash2 className="h-3.5 w-3.5" /> Delete Replay</button>
              )}

              <button type="button" onClick={() => downloadReplayExport([selectedRecord], `${selectedRecord.beatmapArtist} - ${selectedRecord.beatmapTitle}`)} className="w-full py-3 rounded-xl border border-white/10 bg-[#12121a]/80 text-slate-300 hover:border-white/20 hover:text-white text-xs font-sans font-bold uppercase tracking-wider transition flex items-center justify-center gap-1.5"><Download className="h-3.5 w-3.5" /> Export JSON</button>

              <button type="button" aria-label="Import replay file" onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop} onClick={() => importInputRef.current?.click()} className="p-3 rounded-xl border border-dashed border-white/10 text-center cursor-pointer hover:border-pink-500/30 bg-black/80 hover:bg-black/90 transition flex flex-col items-center justify-center">
                <Upload className="h-4 w-4 text-slate-500 mb-1" /><span className="text-[8px] font-mono font-bold text-slate-400 uppercase tracking-widest">DRAG & DROP REPLAY JSON TO IMPORT</span>
              </button>

              <div className="relative" ref={menuRef}>
                <button type="button" onClick={() => setShowSettingsMenu(!showSettingsMenu)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 text-xs font-medium text-slate-300 hover:text-white transition-all">
                  <MoreHorizontal className="h-4 w-4" /> History Options
                </button>
                {showSettingsMenu && (
                  <div className="absolute left-0 right-0 bottom-full mb-2 rounded-2xl bg-zinc-900/95 border border-white/10 shadow-2xl backdrop-blur-2xl p-2 z-50 text-xs flex flex-col gap-1">
                    <div className="px-3 py-2 border-b border-white/[0.06]">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">Retention Limit</span>
                      <select value={historyLimit} onChange={(e) => onSetHistoryLimit(Number(e.target.value))} className="w-full bg-black/50 border border-white/10 rounded-lg px-2 py-1 text-slate-200 outline-none text-xs">
                        <option value="10">Keep last 10 plays</option><option value="25">Keep last 25 plays</option><option value="50">Keep last 50 plays</option><option value="100">Keep last 100 plays</option><option value={HISTORY_LIMIT_UNLIMITED}>Unlimited plays</option>
                      </select>
                    </div>
                    <button type="button" onClick={() => { setShowSettingsMenu(false); handleExportAll(); }} className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors"><Download className="h-3.5 w-3.5" /><span>Export Filtered Plays</span></button>
                    <button type="button" onClick={() => { setShowSettingsMenu(false); importInputRef.current?.click(); }} className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors"><Upload className="h-3.5 w-3.5" /><span>Import Replay File</span></button>
                    <button type="button" onClick={() => { setShowSettingsMenu(false); setShowConfirmClear(true); }} className="flex items-center gap-2 px-3 py-2 rounded-lg text-rose-400 hover:bg-rose-500/10 transition-colors"><Trash2 className="h-3.5 w-3.5" /><span>Clear All History</span></button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-24 gap-4 opacity-75 p-6 relative z-10">
              <span className="p-4 bg-pink-500/10 text-pink-500 rounded-full border border-pink-500/20 shadow animate-pulse"><Music className="h-8 w-8 text-pink-500" /></span>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-lg font-sans font-black text-white tracking-widest uppercase">No Replay Selected</h3>
                <p className="text-sm text-slate-400 font-sans max-w-sm leading-relaxed">Select a replay from the list to watch it</p>
                <div className="flex items-center justify-center gap-2 mt-2">
                  {onSelectSong && <button type="button" onClick={onSelectSong} className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/35 bg-cyan-400/80 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-cyan-950 transition hover:bg-cyan-400"><Music className="h-3.5 w-3.5" /> Song Select</button>}
                  <button type="button" onClick={() => importInputRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-pink-500/35 bg-pink-500/80 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-pink-100 transition hover:bg-pink-500"><Upload className="h-3.5 w-3.5" /> Import</button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 hidden lg:flex flex-col justify-center items-center pointer-events-none relative select-none" />

        <div className="lg:col-span-4 flex flex-col gap-3 h-full min-h-0 pt-8 lg:pt-12 -mr-4 lg:-mr-10">
          <div className="px-4 lg:px-6 relative flex-shrink-0">
            <Search className="absolute left-7 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input id="history-search-input" type="text" placeholder="Search replays..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full min-h-[54px] pl-12 pr-24 py-3 bg-[#0f0e15]/80 border border-white/10 rounded-xl font-sans text-base font-bold text-white placeholder-slate-400 focus:outline-none focus:border-skin-accent/50 focus:ring-1 focus:ring-skin-accent/30 transition-all shadow-lg" />
            <span className="absolute right-7 top-1/2 -translate-y-1/2 px-2 py-0.5 bg-[#1b1c24] border border-white/10 text-[9px] font-mono text-slate-400 font-bold rounded">{filteredHistory.length} matches</span>
          </div>

          <div className="px-4 lg:px-6 flex-shrink-0 flex flex-wrap items-center gap-1.5 relative z-20">
            <div className="flex items-center gap-0.5 bg-[#0f0e15] border border-white/10 rounded-lg p-0.5">
              {(['all', '4k', '7k'] as KeyCountFilter[]).map((mode) => (
                <button key={mode} type="button" onClick={() => setKeyFilter(mode)} className={`px-2 py-1 rounded-md text-[9px] font-mono font-bold uppercase tracking-wider transition-all ${keyFilter === mode ? 'bg-skin-accent/20 text-skin-accent border border-skin-accent/40' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}>{mode === 'all' ? 'All Keys' : mode.toUpperCase()}</button>
              ))}
            </div>
            <div className="flex items-center gap-0.5 bg-[#0f0e15] border border-white/10 rounded-lg p-0.5">
              {([{ id: 'all', label: 'All Grades' }, { id: 's', label: 'S / SS' }, { id: 'a', label: 'A' }, { id: 'failed', label: 'Fails' }] as { id: GradeFilter; label: string }[]).map((g) => (
                <button key={g.id} type="button" onClick={() => setGradeFilter(g.id)} className={`px-2 py-1 rounded-md text-[9px] font-mono font-bold uppercase tracking-wider transition-all ${gradeFilter === g.id ? 'bg-skin-accent/20 text-skin-accent border border-skin-accent/40' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}>{g.label}</button>
              ))}
            </div>
            <div className="relative" data-filter-menu>
              <button type="button" onClick={() => setOpenFilterMenu(openFilterMenu === 'sort' ? null : 'sort')} className="flex items-center gap-1 px-2 py-1.5 bg-[#0f0e15] border border-white/10 rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200 hover:border-white/20 transition-all">Sort: <span className="text-white">{sortBy === 'date_desc' ? 'Recent' : sortBy === 'score_desc' ? 'Score' : 'Accuracy'}</span><ChevronDown className="h-3 w-3" /></button>
              {openFilterMenu === 'sort' && (
                <div className="absolute left-0 top-full mt-1 z-40 bg-[#12121a] border border-white/10 rounded-lg shadow-2xl py-1 min-w-[140px]">
                  {([{ id: 'date_desc', label: 'Recent' }, { id: 'score_desc', label: 'Score' }, { id: 'accuracy_desc', label: 'Accuracy' }] as { id: SortOption; label: string }[]).map(opt => (
                    <button key={opt.id} onClick={() => { setSortBy(opt.id); setOpenFilterMenu(null); }} className={`w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors ${sortBy === opt.id ? 'text-skin-accent bg-skin-accent/10' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>{opt.label}{sortBy === opt.id && <Check className="h-3 w-3" />}</button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden py-1 flex flex-col gap-1 relative z-10 min-h-0 pb-[72px]">
            {filteredHistory.length > 0 ? (
              filteredHistory.map((rec) => {
                const isActive = selectedRecordId === rec.id;
                const banner = rec.coverUrl || DEFAULT_SONG_BANNER;
                const theme = getGradeTheme(rec.grade, rec.isFailed);
                return (
                  <div key={rec.id} className="flex flex-col gap-0 transition-all pl-8">
                    <div role="button" tabIndex={0} aria-pressed={isActive}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedRecordId(rec.id); } }}
                      onClick={() => setSelectedRecordId(rec.id)}
                      className={`group transition-all duration-300 relative border-l border-t border-b cursor-pointer select-none overflow-hidden rounded-l-xl ${isActive ? 'border-skin-accent shadow-skin-accent-glow bg-[#1a1726]/70 ml-[-20px]' : 'border-white/[0.03] bg-[#0c0c12]/70 hover:bg-[#12121a]/80 hover:border-white/10'} border-r-0`}>
                      <img src={banner} className="absolute inset-0 h-full w-full object-cover opacity-75 pointer-events-none" referrerPolicy="no-referrer" loading="eager" decoding="async" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = DEFAULT_SONG_BANNER; }} alt="" />
                      <div className="absolute inset-0 bg-[#0c0c12]/60 pointer-events-none" />
                      <div className="relative flex items-center justify-between p-4 py-3">
                        <div className="flex flex-col text-left overflow-hidden min-w-0 pr-20 flex-1">
                          <span className="text-[10px] uppercase font-mono tracking-wider text-skin-accent mb-0.5 leading-none truncate">{rec.beatmapArtist || 'Unknown Artist'}</span>
                          <h4 className="font-extrabold font-sans text-lg lg:text-xl text-white tracking-tight truncate leading-tight">{rec.beatmapTitle}</h4>
                          <span className="text-[10px] text-slate-400 font-mono mt-1 uppercase font-black tracking-normal truncate">{rec.difficultyName} • {rec.keyCount}K • {getRelativeTime(rec.timestamp)}</span>
                          <div className="flex items-center gap-1.5 mt-1.5 text-[10px] font-mono">
                            <span className="text-slate-200 font-semibold tabular-nums">{rec.score.toLocaleString()}</span><span className="text-slate-500">•</span><span className="text-cyan-300 font-bold tabular-nums">{rec.accuracy.toFixed(2)}%</span><span className="text-slate-500">•</span><span className="text-slate-400">{rec.maxCombo}x</span>
                            {rec.mods && rec.mods.length > 0 && <span className="text-pink-400 font-sans font-bold text-[10px]">+{rec.mods.join('')}</span>}
                          </div>
                        </div>
                        <div className="flex flex-col items-center gap-1.5 shrink-0 select-none">
                          <span className={`inline-flex items-center justify-center h-8 w-8 rounded-lg font-bold text-xs font-sans ${theme.badge}`}>{theme.tag}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase border ${getDifficultyColor(rec.starRating)}`}>★ {rec.starRating.toFixed(1)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="bg-[#0c0c12] border border-white/10 p-8 rounded-xl flex flex-col items-center justify-center text-center text-slate-500 shadow-xl mx-4">
                <Clock className="h-6 w-6 mb-2 text-slate-600" /><p className="text-[11px] font-sans font-black tracking-widest uppercase">No replays matches</p><p className="text-[9px] text-slate-600 font-mono max-w-xs mt-1 uppercase">Adjust search or filters, or import replays</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-30 select-none bg-transparent pointer-events-none w-auto">
        <div className="flex items-center gap-0.5 bg-[#09090d]/90 backdrop-blur-md border-t border-l border-r border-white/10 rounded-t-2xl pointer-events-auto shadow-2xl">
          <button type="button" onClick={() => importInputRef.current?.click()} className="relative flex flex-col items-center justify-center bg-[#1e2326]/90 hover:bg-[#252b2f] border border-white/10 active:brightness-95 w-32 h-16 transition-all duration-150 shadow-md cursor-pointer group" style={{ transform: 'skewX(-12deg)', borderTopLeftRadius: '14px', borderBottomLeftRadius: '14px' }}>
            <div className="flex flex-col items-center gap-1.5" style={{ transform: 'skewX(12deg)' }}><Upload className="h-[22px] w-[22px] text-[#a3e635] transition group-hover:scale-110" /><span className="text-sm font-sans font-extrabold text-white tracking-wide leading-none select-none">Import</span></div>
            <div className="absolute bottom-0 inset-x-0 h-[3px] bg-[#a3e635] rounded-bl-lg" />
          </button>
          <button type="button" onClick={handleSelectRandom} className="relative flex flex-col items-center justify-center bg-[#1e2326]/90 hover:bg-[#252b2f] border border-white/10 active:brightness-95 w-32 h-16 transition-all duration-150 shadow-md cursor-pointer group" style={{ transform: 'skewX(-12deg)', borderTopRightRadius: '14px', borderBottomRightRadius: '14px' }}>
            <div className="flex flex-col items-center gap-1.5" style={{ transform: 'skewX(12deg)' }}><Shuffle className="h-[22px] w-[22px] text-[#38bdf8] transition group-hover:rotate-12" /><span className="text-sm font-sans font-extrabold text-white tracking-wide leading-none select-none">Random</span></div>
            <div className="absolute bottom-0 inset-x-0 h-[3px] bg-[#38bdf8] rounded-br-lg" />
          </button>
        </div>
      </div>
    </div>
  );
}
