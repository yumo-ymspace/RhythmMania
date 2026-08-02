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
import SparkMD5 from 'spark-md5';
import { 
  Search, X, Music, Check, Loader, Download, Info, SlidersHorizontal, ArrowUpDown 
} from 'lucide-react';
import { Beatmap } from '../types';
import { parseBeatmap, parseMediaPaths } from '../utils/beatmapParser';
import { RobustZipResolver } from '../utils/zipResolver';
import { storageManager } from '../utils/storageManager';
import { MAX_COMPRESSED_SIZE_BYTES, validateZipLimits, validateZipEntrySize, assertSafeAssetUrl } from '../utils/securityLimits';
import { computeBeatmapHash } from '../utils/replayManager';

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
  const [catalogRequestState, setCatalogRequestState] = useState<'idle' | 'loading' | 'loaded'>('idle');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [submittedSearchTerm, setSubmittedSearchTerm] = useState<string>('');
  const [filterSearchTerm, setFilterSearchTerm] = useState<string>('');
  const [selectedMode, setSelectedMode] = useState<string>('Any');
  const [sortBy, setSortBy] = useState<string>('Title');
  const [downloadingMapId, setDownloadingMapId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ loaded: number; total: number; percentage: number } | null>(null);
  const [importStatus, setImportStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync isLoading when open changes to true
  useEffect(() => {
    if (open) {
      setIsLoading(true);
    }
  }, [open]);

  // Fetch server results only for an explicitly submitted, non-empty query.
  useEffect(() => {
    if (!open || !submittedSearchTerm.trim()) {
      if (open) {
        setServerManifest([]);
        setIsLoading(false);
        setCatalogRequestState('idle');
      }
      return;
    }
    const controller = new AbortController();
    const requestTerm = submittedSearchTerm;
    const fetchManifest = async () => {
      setIsLoading(true);
      setCatalogRequestState('loading');
      setCatalogError(null);
      try {
        const [localResponse, osuResponse] = await Promise.all([
          fetch(`/api/catalog/search?q=${encodeURIComponent(requestTerm)}`, { credentials: 'include', signal: controller.signal }),
          fetch(`/api/catalog/search?source=osu&q=${encodeURIComponent(requestTerm)}`, { credentials: 'include', signal: controller.signal }),
        ]);
        const [local, osu] = await Promise.all([
          localResponse.json().catch(() => ({ data: [] })),
          osuResponse.json().catch(() => ({ data: [] })),
        ]);
        const failures = [localResponse, osuResponse].filter(response => !response.ok);
        if (failures.length === 2) {
          throw new Error(local.error || osu.error || 'Cloud catalog is unavailable.');
        }
        if (failures.length > 0) {
          setCatalogError('One catalog source is unavailable; showing the results from the other source.');
        }
        const results = [
          ...(Array.isArray(local.data) ? local.data : []),
          ...(Array.isArray(osu.data) ? osu.data.map((item: any) => ({ ...item, id: `osuapi_${item.sourceSetId}`, source: 'osuapi', catalogState: 'pending' })) : []),
        ];
        const uniqueResults = Array.from(new Map(
          results.map((item: any) => [`${item.source || 'local'}:${item.cloudSetId || item.id}`, item])
        ).values());
        setServerManifest(uniqueResults);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.warn('Unable to load online beatmap manifest.', err);
        setServerManifest([]);
        setCatalogError(err instanceof Error ? err.message : 'Cloud catalog is unavailable.');
      } finally {
        if (controller.signal.aborted) return;
        setIsLoading(false);
        setCatalogRequestState('loaded');
      }
    };
    fetchManifest();
    return () => controller.abort();
  }, [open, submittedSearchTerm]);

  // Remove old remote results as soon as a new query is submitted. This prevents
  // a previous response from remaining visible while the new request is pending.
  useEffect(() => {
    if (open && submittedSearchTerm.trim()) {
      setServerManifest([]);
    }
  }, [open, submittedSearchTerm]);

  useEffect(() => {
    if (!open || searchTerm === submittedSearchTerm) return;
    const timer = window.setTimeout(() => setSubmittedSearchTerm(searchTerm), 4000);
    return () => window.clearTimeout(timer);
  }, [open, searchTerm, submittedSearchTerm]);

  useEffect(() => {
    if (!open || searchTerm === filterSearchTerm) return;
    const timer = window.setTimeout(() => setFilterSearchTerm(searchTerm), 1500);
    return () => window.clearTimeout(timer);
  }, [open, searchTerm, filterSearchTerm]);

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
    let oszUrl = s.oszUrl;
    let activationToken: string | null = null;
    const activationCharts: { beatmapId: number; checksum: string }[] = [];

    setDownloadingMapId(serverMapId);
    setDownloadProgress({ loaded: 0, total: 0, percentage: 0 });
    setImportStatus({
      type: 'ok',
      msg: s.source === 'osuapi' ? 'Verifying map authentication...' : `Downloading "${serverMapTitle}"...`,
    });

    try {
      if (s.source === 'osuapi' && s.sourceSetId) {
        const registration = await fetch('/api/catalog/register-download', {
         method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ beatmapsetId: s.sourceSetId }),
       });
        const registrationJson = await registration.json();
        if (!registration.ok || !registrationJson.success) throw new Error(registrationJson.error || 'osu! mirror registration failed');
        oszUrl = registrationJson.data.downloadUrl;
        activationToken = registrationJson.data.token;
        s = { ...s, id: registrationJson.data.cloudSetId, difficulties: registrationJson.data.charts.map((chart: any) => ({ ...chart, sourceChartId: chart.sourceChartId ?? chart.id, chartRevisionId: `osuapi_${s.sourceSetId}_b${chart.id}_${chart.checksum}`, name: chart.version })) };
        setImportStatus({ type: 'ok', msg: `Downloading "${serverMapTitle}"...` });
      }
       if (typeof oszUrl !== 'string' || !oszUrl) throw new Error('This catalog entry has no downloadable package URL. Reseed the bundled catalog.');
       if (s.source !== 'osuapi') assertSafeAssetUrl(oszUrl, 'OnlineBeatmapCatalog download');
      const response = await fetch(oszUrl);
      if (!response.ok) {
        throw new Error(`Failed to request map pack. Status: ${response.status}`);
      }

      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
      if (totalBytes > MAX_COMPRESSED_SIZE_BYTES) {
        throw new Error(`Security Exception: Download size exceeds limit (${(totalBytes / (1024 * 1024)).toFixed(1)} MB, limit: ${(MAX_COMPRESSED_SIZE_BYTES / (1024 * 1024)).toFixed(1)} MB)`);
      }
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
          if (loadedBytes > MAX_COMPRESSED_SIZE_BYTES) {
            reader.cancel();
            throw new Error(`Security Exception: Download size limit exceeded (${(loadedBytes / (1024 * 1024)).toFixed(1)} MB, limit: ${(MAX_COMPRESSED_SIZE_BYTES / (1024 * 1024)).toFixed(1)} MB)`);
          }
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
       const packageId = serverMapId;

       // Preserve the verified archive byte-for-byte; media is validated when unpacked.
       const zip = await JSZip.loadAsync(blob);
       validateZipLimits(zip);
       await storageManager.savePackage(packageId, `${serverMapTitle}.osz`, blob);
      await new Promise(resolve => setTimeout(resolve, 15));

      const resolver = new RobustZipResolver(zip);
      const fileNames = Object.keys(zip.files);
       const beatmapFiles: { name: string; content: string; checksum: string }[] = [];

      for (const name of fileNames) {
        if (name.toLowerCase().endsWith('.osu') && !zip.files[name].dir) {
          validateZipEntrySize(zip.files[name], name);
          const raw = await zip.files[name].async('arraybuffer');
          beatmapFiles.push({ name, content: new TextDecoder().decode(raw), checksum: SparkMD5.ArrayBuffer.hash(raw) });
        }
      }

      if (beatmapFiles.length === 0) {
        throw new Error('Invalid package structure.');
      }

      let importedCount = 0;
      const parsedDifficulties: Beatmap[] = [];

      for (let i = 0; i < beatmapFiles.length; i++) {
        const beatmapStr = beatmapFiles[i];
         const matchingServerObj = s.source === 'osuapi'
           ? s
           : serverManifest.find(sm => sm.id === serverMapId);

          let canonicalMapId = '';
          let matchedDiff: any;
           if (matchingServerObj?.difficulties && Array.isArray(matchingServerObj.difficulties)) {
            matchedDiff = matchingServerObj.difficulties.find((d: any) =>
             d.checksum?.toLowerCase() === beatmapStr.checksum.toLowerCase() ||
             ((d.originalOsuFilename || d.osuFilename) === beatmapStr.name)
           );
           if (matchedDiff?.chartRevisionId) canonicalMapId = matchedDiff.chartRevisionId;
         }
          if (!canonicalMapId) continue;
          const sourceChartId = Number(matchedDiff?.sourceChartId ?? matchedDiff?.id);
          if (s.source === 'osuapi' && Number.isInteger(sourceChartId) && sourceChartId > 0 && matchedDiff.checksum) {
            activationCharts.push({ beatmapId: sourceChartId, checksum: matchedDiff.checksum });
          }

        const parsedMap = parseBeatmap(beatmapStr.content, canonicalMapId);

        if (parsedMap.notes.length > 0) {
          const media = parseMediaPaths(beatmapStr.content);
          const mapWithMeta = parsedMap as any;

          mapWithMeta.packageId = packageId;
          mapWithMeta.parentPackageId = serverMapId;
          mapWithMeta.catalogSetId = serverMapId;
           mapWithMeta.catalogMapId = canonicalMapId;
           mapWithMeta.chartRevisionId = canonicalMapId;
           const chart = matchingServerObj?.difficulties?.find((d: any) => d.chartRevisionId === canonicalMapId);
           mapWithMeta.checksum = chart?.checksum;
           mapWithMeta.checksumAlgorithm = chart?.checksumAlgorithm;
          mapWithMeta.audioFilename = media.audioFilename;
          mapWithMeta.videoFilename = media.videoFilename;
          mapWithMeta.bgFilename = media.bgFilename;
          mapWithMeta.originalContent = beatmapStr.content;
          mapWithMeta.isServerMap = true;
          mapWithMeta.oszUrl = oszUrl;
          mapWithMeta.beatmapHash = computeBeatmapHash(parsedMap);

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
        if (s.source === 'osuapi' && activationToken) {
          const activation = await fetch('/api/catalog/activate-download', {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cloudSetId: s.id, token: activationToken, charts: activationCharts }),
          });
          const activationJson = await activation.json().catch(() => ({}));
          if (!activation.ok || !activationJson.success) {
            throw new Error(activationJson.error || 'Downloaded map authentication failed.');
          }
        }
        setImportStatus({ type: 'ok', msg: `Successfully downloaded and unpacked "${serverMapTitle}"!` });
      } else {
        throw new Error('No valid playable difficulties found inside.');
      }

    } catch (err: any) {
      console.error('Downloader error:', err?.message || String(err));
      try {
        await storageManager.deletePackageAndAllBeatmaps(serverMapId);
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
    if (filterSearchTerm) {
      const q = filterSearchTerm.toLowerCase();
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
                  <p className="text-xs text-slate-450 mt-0.5 font-sans font-medium tracking-wide">
                    Discover your favourite song!
                  </p>
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setFilterSearchTerm(searchTerm);
                      setSubmittedSearchTerm(searchTerm);
                    }
                  }}
                  className="w-full pl-9 pr-4 py-2 bg-black/30 border border-white/10 rounded-xl font-sans text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all shadow-inner"
                />
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <button
                  type="button"
                  onClick={() => {
                    setFilterSearchTerm(searchTerm);
                    setSubmittedSearchTerm(searchTerm);
                  }}
                  className="absolute right-1 top-1 bottom-1 rounded-lg bg-white/10 px-3 text-[10px] font-mono font-black uppercase text-white transition hover:bg-white/20"
                >
                  Search
                </button>
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
              
              {/* Catalog availability message */}
              {catalogError && (
                <div className="p-3.5 mb-5 rounded-xl text-xs font-mono border bg-rose-950/20 text-rose-400 border-rose-500/20">
                  {catalogError}
                </div>
              )}
              {isLoading ? (
                <div className="py-16 text-center text-slate-500">
                  <Loader className="h-8 w-8 mx-auto mb-3 animate-spin text-cyan-400" />
                  <p className="text-xs font-mono font-black uppercase tracking-widest text-white">Fetching beatmaps from the server...</p>
                </div>
              ) : !filterSearchTerm.trim() ? (
                <div className="py-16 text-center text-slate-500">
                  <Search className="h-8 w-8 mx-auto mb-3 text-slate-600" />
                  <p className="text-xs font-mono font-black uppercase tracking-widest text-white">Search a song!</p>
                </div>
              ) : catalogRequestState !== 'loaded' ? (
                <div className="py-16 text-center text-slate-500">
                  <Loader className="h-8 w-8 mx-auto mb-3 animate-spin text-cyan-400" />
                  <p className="text-xs font-mono font-black uppercase tracking-widest text-white">Searching beatmaps...</p>
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
              ) : serverManifest.length === 0 ? (
                <div className="bg-[#12121a]/50 border border-white/5 py-16 px-8 rounded-2xl flex flex-col items-center justify-center text-center text-slate-500 max-w-md mx-auto shadow-xl">
                  <Info className="h-8 w-8 mb-3 text-slate-600" />
                  <p className="text-xs font-sans font-black tracking-widest uppercase text-white">No community profiles discovered</p>
                  <p className="text-[10px] text-slate-500 font-mono max-w-xs mt-1 leading-relaxed uppercase">Tweak your search keywords or select different timing mode filters</p>
                </div>
              ) : (
                <div className="bg-[#12121a]/50 border border-white/5 py-16 px-8 rounded-2xl flex flex-col items-center justify-center text-center text-slate-500 max-w-md mx-auto shadow-xl">
                  <Info className="h-8 w-8 mb-3 text-slate-600" />
                  <p className="text-xs font-sans font-black tracking-widest uppercase text-white">No matching beatmaps</p>
                  <p className="text-[10px] text-slate-500 font-mono max-w-xs mt-1 leading-relaxed uppercase">Try a different local filter</p>
                </div>
              )}
              {importStatus && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mt-2 p-3.5 rounded-xl text-xs font-mono border flex items-center gap-2.5 ${
                    importStatus.type === 'ok'
                      ? 'bg-emerald-950/20 text-emerald-400 border-emerald-500/20 shadow-[0_4px_12px_rgba(16,185,129,0.08)]'
                      : 'bg-rose-950/20 text-rose-400 border-rose-500/20'
                  }`}
                >
                  <Info className="h-4.5 w-4.5 shrink-0" />
                  <span>{importStatus.msg}</span>
                </motion.div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
