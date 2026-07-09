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

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';
import { 
  Search, X, Music, Check, Loader, Download, Info, SlidersHorizontal, ArrowUpDown 
} from 'lucide-react';
import { Beatmap } from '../types';
import { parseBeatmap, parseMediaPaths } from '../utils/beatmapParser';
import { RobustZipResolver } from '../utils/zipResolver';
import { storageManager } from '../utils/storageManager';

interface OnlineBeatmapCatalogProps {
  open: boolean;
  onClose: () => void;
  customMaps: Beatmap[];
  onImportBeatmap: (map: Beatmap) => void;
}

export default function OnlineBeatmapCatalog({ 
  open, 
  onClose, 
  customMaps, 
  onImportBeatmap 
}: OnlineBeatmapCatalogProps) {
  const [serverManifest, setServerManifest] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedMode, setSelectedMode] = useState<string>('Any');
  const [sortBy, setSortBy] = useState<string>('Title');
  const [downloadingMapId, setDownloadingMapId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ loaded: number; total: number; percentage: number } | null>(null);
  const [importStatus, setImportStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync isLoading when open changes to true
  useEffect(() => {
    if (open) {
      setIsLoading(true);
    }
  }, [open]);

  // Fetch server manifest on mount/open
  useEffect(() => {
    if (!open) return;
    const fetchManifest = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/beatmaps/manifest.json?t=${Date.now()}`);
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data)) {
            setServerManifest(data);
          }
        }
      } catch (err) {
        console.warn('Unable to load online beatmap manifest.', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchManifest();
  }, [open]);

  // Handle ESC key to close
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Star rating mapping
  const getStarRating = (map: any) => {
    if (map.starRating !== undefined) return map.starRating;
    const diffName = (map.difficulty || '').toLowerCase();
    if (diffName.includes('easy') || diffName.includes('beginner')) return 1.5;
    if (diffName.includes('doubtful')) return 2.33;
    if (diffName.includes('normal')) return 2.1;
    if (diffName.includes('hard') || diffName.includes('hyper')) return 3.65;
    if (diffName.includes('insane') || diffName.includes('another')) return 4.8;
    if (diffName.includes('expert') || diffName.includes('black')) return 5.85;
    if (diffName.includes('extra') || diffName.includes('deluge')) return 6.4;
    if (diffName.includes('master') || diffName.includes('zenith')) return 7.5;
    
    const hash = (map.id || '').split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
    const calculated = 1.0 + (hash % 75) / 10; 
    return Math.round(calculated * 100) / 100;
  };

  const getCircleColor = (rating: number) => {
    if (rating < 2.0) return 'bg-emerald-500';
    if (rating < 3.0) return 'bg-cyan-500';
    if (rating < 4.0) return 'bg-amber-500';
    if (rating < 5.0) return 'bg-orange-500';
    if (rating < 6.5) return 'bg-rose-500';
    return 'bg-purple-500';
  };

  // Downloading and Unzipping logic
  const handleDownload = async (s: any) => {
    if (downloadingMapId) {
      setImportStatus({ type: 'err', msg: 'A download is already in progress! Please wait until it completes.' });
      return;
    }

    const serverMapId = s.id;
    const serverMapTitle = s.title;
    const oszUrl = s.oszUrl;

    setDownloadingMapId(serverMapId);
    setDownloadProgress({ loaded: 0, total: 0, percentage: 0 });
    setImportStatus({ type: 'ok', msg: `Downloading "${serverMapTitle}"...` });

    try {
      const response = await fetch(oszUrl);
      if (!response.ok) {
        throw new Error(`Failed to request map pack. Status: ${response.status}`);
      }

      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('ReadableStream parser is unsupported.');
      }

      let loadedBytes = 0;
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loadedBytes += value.length;
          const percentage = totalBytes ? Math.round((loadedBytes / totalBytes) * 100) : 0;
          setDownloadProgress({
            loaded: loadedBytes,
            total: totalBytes,
            percentage
          });
        }
      }

      setImportStatus({ type: 'ok', msg: 'Storing package and cache...' });

      const blob = new Blob(chunks, { type: 'application/octet-stream' });
      const packageId = `pkg_${serverMapId}`;

      // Unzip and delete all .wav files
      const zip = await JSZip.loadAsync(blob);
      const zipKeys = Object.keys(zip.files);
      let wavsDeletedCount = 0;
      for (const key of zipKeys) {
        if (key.toLowerCase().endsWith('.wav')) {
          zip.remove(key);
          wavsDeletedCount++;
        }
      }
      if (wavsDeletedCount > 0) {
        console.log(`Removed ${wavsDeletedCount} .wav files from downloaded map: ${serverMapTitle}`);
      }

      // Compile clean zip without wavs
      const cleanedBlob = await zip.generateAsync({ type: 'blob' });
      await storageManager.savePackage(packageId, `${serverMapTitle}.osz`, cleanedBlob);
      await new Promise(resolve => setTimeout(resolve, 15));

      const resolver = new RobustZipResolver(zip);
      const fileNames = Object.keys(zip.files);
      const beatmapFiles: { name: string; content: string }[] = [];

      for (const name of fileNames) {
        if (name.toLowerCase().endsWith('.osu') && !zip.files[name].dir) {
          const content = await zip.files[name].async('text');
          beatmapFiles.push({ name, content });
        }
      }

      if (beatmapFiles.length === 0) {
        throw new Error('Invalid package structure.');
      }

      let importedCount = 0;
      const parsedDifficulties: Beatmap[] = [];

      for (let i = 0; i < beatmapFiles.length; i++) {
        const beatmapStr = beatmapFiles[i];
        const mapId = `${serverMapId}_idx${i}`;
        const parsedMap = parseBeatmap(beatmapStr.content, mapId);

        if (parsedMap.notes.length > 0) {
          const media = parseMediaPaths(beatmapStr.content);
          const mapWithMeta = parsedMap as any;

          mapWithMeta.packageId = packageId;
          mapWithMeta.parentPackageId = serverMapId;
          mapWithMeta.audioFilename = media.audioFilename;
          mapWithMeta.videoFilename = media.videoFilename;
          mapWithMeta.bgFilename = media.bgFilename;
          mapWithMeta.originalContent = beatmapStr.content;
          mapWithMeta.isServerMap = true;
          mapWithMeta.oszUrl = oszUrl;

          const matchingServerObj = serverManifest.find(sm => sm.id === serverMapId);
          if (matchingServerObj && matchingServerObj.mode !== undefined) {
            parsedMap.mode = matchingServerObj.mode;
            const diffSummary = matchingServerObj.difficultiesSummary || matchingServerObj.difficultsSummary;
            if (diffSummary) {
              mapWithMeta.difficultiesSummary = diffSummary;
            }
          }

          parsedMap.audioUrl = '';
          parsedMap.videoUrl = '';
          parsedMap.bgUrl = '';

          onImportBeatmap(parsedMap);
          parsedDifficulties.push(parsedMap);
          importedCount++;
        }
      }

      if (importedCount > 0 && parsedDifficulties.length > 0) {
        setImportStatus({ type: 'ok', msg: `Successfully downloaded and unpacked "${serverMapTitle}"!` });
      } else {
        throw new Error('No valid playable difficulties found inside.');
      }

    } catch (err: any) {
      console.error('Downloader error:', err?.message || String(err));
      try {
        await storageManager.deleteBeatmapAndCleanup(serverMapId);
      } catch {
        // Ignore clean error
      }
      setImportStatus({ type: 'err', msg: err?.message || 'Download error. Check network connection.' });
    } finally {
      setDownloadingMapId(null);
      setDownloadProgress(null);
      setTimeout(() => setImportStatus(null), 5000);
    }
  };

  const filteredManifest = serverManifest.filter((s) => {
    if (selectedMode !== 'Any') {
      const requiredMode = selectedMode.toLowerCase().includes('mania') ? 3 : 0;
      if (s.mode !== undefined && s.mode !== requiredMode) return false;
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const match = (s.title || '').toLowerCase().includes(q) ||
                    (s.artist || '').toLowerCase().includes(q) ||
                    (s.creator || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sortBy === 'Title') return (a.title || '').localeCompare(b.title || '');
    if (sortBy === 'Artist') return (a.artist || '').localeCompare(b.artist || '');
    if (sortBy === 'BPM') return (b.bpm || 0) - (a.bpm || 0);
    return 0;
  });

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Settings Style backdrop overlay with strong blur */}
          <motion.div 
            key="backdrop"
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />

          {/* Roll down from top style popup matching settings panel design */}
          <motion.div
            key="catalog-panel"
            ref={containerRef}
            className="fixed inset-x-0 top-0 z-[110] w-full max-h-[85vh] md:max-h-[90vh] bg-gradient-to-b from-[#0c0c12]/98 to-[#06060a]/98 border-b border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex flex-col rounded-b-3xl overflow-hidden font-sans text-slate-200"
            initial={{ y: '-100vh', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '-100vh', opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
            style={{ willChange: 'transform, opacity' }}
          >
            {/* Top slate accent rail */}
            <div className="h-1 w-full bg-slate-700 shadow-[0_0_8px_rgba(100,116,139,0.3)] flex-none" />

            {/* Header section with closing button */}
            <div className="flex-none px-6 md:px-12 py-5 border-b border-white/5 flex items-center justify-between bg-black/10">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 shadow-inner">
                  <Music className="h-6 w-6 text-slate-300" />
                </div>
                <div>
                  <h1 className="text-xl font-black tracking-widest text-white font-sans uppercase">
                    Find Server Beatmaps
                  </h1>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition duration-150 cursor-pointer shadow-md"
                title="Close catalog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Filters Bar in settings style */}
            <div className="flex-none px-6 md:px-12 py-4 border-b border-white/5 bg-[#101016]/80 flex flex-col md:flex-row items-center gap-4 justify-between">
              {/* Search input with search icon */}
              <div className="relative w-full md:max-w-sm">
                <input
                  type="text"
                  placeholder="Type song title, artist, or creator... (Ctrl+F)"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-black/30 border border-white/10 rounded-xl font-sans text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all shadow-inner"
                />
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              </div>

              {/* Sorting Filter buttons */}
              <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto py-1">
                {/* Sort By Selector */}
                <div className="flex items-center gap-1.5 bg-black/20 p-1 px-2.5 rounded-xl border border-white/5 text-[10px] shrink-0">
                  <ArrowUpDown className="h-3 w-3 text-slate-400" />
                  <span className="font-mono text-slate-400 mr-1">SORT:</span>
                  {['Title', 'Artist', 'BPM'].map((sortVal) => {
                    const active = sortBy === sortVal;
                    return (
                      <button
                        key={sortVal}
                        onClick={() => setSortBy(sortVal)}
                        className={`px-2 py-1 rounded-lg text-[9px] font-mono tracking-wide transition cursor-pointer ${
                          active 
                            ? 'text-white font-extrabold bg-white/10' 
                            : 'text-slate-450 hover:text-white'
                        }`}
                      >
                        {sortVal}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Main Content Area (Aesthetic Grid of Beatmap Tiles) */}
            <div className="flex-1 overflow-y-auto px-6 md:px-12 py-6 min-h-0 bg-black/5">
              
              {/* Import status message / notification banner */}
              {importStatus && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-3.5 mb-5 rounded-xl text-xs font-mono border flex items-center gap-2.5 ${
                    importStatus.type === 'ok' 
                      ? 'bg-emerald-950/20 text-emerald-400 border-emerald-500/20 shadow-[0_4px_12px_rgba(16,185,129,0.08)]' 
                      : 'bg-rose-950/20 text-rose-400 border-rose-500/20'
                  }`}
                >
                  <Info className="h-4.5 w-4.5 shrink-0" />
                  <span>{importStatus.msg}</span>
                </motion.div>
              )}

              {isLoading ? (
                <div className="bg-[#12121a]/50 border border-white/5 py-16 px-8 rounded-2xl flex flex-col items-center justify-center text-center text-slate-300 max-w-md mx-auto shadow-xl">
                  <div className="flex items-center gap-3 bg-[#0d0d14] px-6 py-4 rounded-xl border border-white/5 shadow-inner">
                    <Loader className="h-5 w-5 animate-spin text-cyan-400 shrink-0" />
                    <p className="text-xs font-sans font-black tracking-widest uppercase text-white">Fetching beatmaps from the server...</p>
                  </div>
                </div>
              ) : filteredManifest.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
                  {filteredManifest.map((s) => {
                    const isDownloading = downloadingMapId === s.id;
                    const isDownloaded = customMaps.some(
                      (m) => (m as any).parentPackageId === s.id || (m as any).packageId === `pkg_${s.id}`
                    );

                    return (
                      <div 
                        key={s.id}
                        className={`group bg-[#13131a] hover:bg-[#1a1a24] border rounded-2xl p-4 flex gap-4 transition duration-200 items-center overflow-hidden relative shadow-lg ${
                          isDownloaded 
                            ? 'border-emerald-500/20 bg-emerald-500/[0.01]' 
                            : 'border-white/5 hover:border-white/20 hover:shadow-white/[0.01]'
                        }`}
                      >
                        {/* Left Cover Art */}
                        <div className="w-16 h-16 rounded-xl bg-slate-900 border border-white/5 overflow-hidden relative shrink-0 flex items-center justify-center shadow">
                          {s.bgUrl ? (
                            <img src={s.bgUrl} className="w-full h-full object-cover transition duration-300 group-hover:scale-105" referrerPolicy="no-referrer" />
                          ) : (
                            <Music className="h-6 w-6 text-slate-450" />
                          )}
                          <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/80 border border-white/10 rounded font-mono text-[8px] text-slate-300 uppercase leading-none scale-90">
                            {s.mode === 0 ? 'std' : 'mania'}
                          </div>
                        </div>

                        {/* Middle Text Info */}
                        <div className="flex-1 min-w-0 text-left">
                          <h4 className="font-extrabold text-sm text-white leading-snug truncate group-hover:text-slate-200 transition-colors">
                            {s.title}
                          </h4>
                          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider truncate mt-0.5">
                            {s.artist}
                          </p>
                          
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap text-[9px] font-mono text-slate-500 uppercase leading-none">
                            <span className="truncate max-w-[150px]">By {s.creator || 'alevi'}</span>
                          </div>
                        </div>

                        {/* Download Trigger Block */}
                        <div className="shrink-0 pl-1">
                          {isDownloaded ? (
                            <div className="flex flex-col items-center gap-0.5 text-emerald-400 shrink-0 select-none bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-xl">
                              <Check className="h-4 w-4 text-emerald-400" />
                              <span className="text-[8px] font-mono font-black uppercase">READY</span>
                            </div>
                          ) : isDownloading ? (
                            <div className="flex flex-col items-center gap-1 text-slate-300 shrink-0 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl animate-pulse">
                              <Loader className="h-4.5 w-4.5 animate-spin text-slate-400" />
                              <span className="text-[8px] font-mono uppercase font-black">{downloadProgress?.percentage || 0}%</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleDownload(s)}
                              className="p-3 bg-white/5 hover:bg-white text-slate-400 hover:text-slate-950 rounded-xl border border-white/10 hover:border-white transition duration-150 active:scale-95 flex items-center justify-center cursor-pointer shadow-md group-hover:scale-105"
                              title="Download map pack"
                            >
                              <Download className="h-4.5 w-4.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-[#12121a]/50 border border-white/5 py-16 px-8 rounded-2xl flex flex-col items-center justify-center text-center text-slate-500 max-w-md mx-auto shadow-xl">
                  <Info className="h-8 w-8 mb-3 text-slate-600" />
                  <p className="text-xs font-sans font-black tracking-widest uppercase text-white">No community profiles discovered</p>
                  <p className="text-[10px] text-slate-500 font-mono max-w-xs mt-1 leading-relaxed uppercase">Tweak your search keywords or select different timing mode filters</p>
                </div>
              )}
            </div>

            {/* Bottom status/nav metrics matching settings style */}
            <div className="flex-none px-6 md:px-12 py-3 bg-black/20 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-slate-500 uppercase select-none">
              <div>
                Showing {filteredManifest.length} of {serverManifest.length} total cloud packages
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>SERVER RESPONSE: 200 OK</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
