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

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';
import SparkMD5 from 'spark-md5';
import {
  Search, X, Music, Check, Loader, Download, Info, ArrowUpDown, KeyRound, LogOut,
} from 'lucide-react';
import { Beatmap } from '../types';
import { parseBeatmap, parseMediaPaths } from '../utils/beatmapParser';
import { storageManager } from '../utils/storageManager';
import { MAX_COMPRESSED_SIZE_BYTES, validateZipLimits, validateZipEntrySize } from '../utils/securityLimits';
import { computeBeatmapHash } from '../utils/replayManager';
import { fetchCurrentUser, type AuthUser } from '../utils/authClient';
import {
  clearOsuConnection,
  connectByoCredentials,
  downloadBeatmapsetArchive,
  getValidOsuAccessToken,
  hasOsuConnection,
  initiateOsuAuthCode,
  waitForOsuSlot,
} from '../utils/osuTokenManager';

interface OnlineBeatmapCatalogProps {
  open: boolean;
  onClose: () => void;
  customMaps: Beatmap[];
  onImportBeatmap: (map: Beatmap) => void;
}

type CatalogChart = {
  id: number;
  checksum: string;
  version?: string;
  filename?: string;
  originalOsuFilename?: string;
  chartRevisionId?: string;
  name?: string;
  sourceChartId?: number;
  checksumAlgorithm?: string;
};

type CatalogSet = {
  id: string;
  sourceSetId: number;
  title: string;
  artist: string;
  creator: string;
  status?: string;
  coverUrl?: string;
  charts?: CatalogChart[];
  difficulties?: CatalogChart[];
  bpm?: number;
};

const SEARCH_STATUSES = ['ranked', 'loved', 'graveyard'] as const;

export default function OnlineBeatmapCatalog({
  open,
  onClose,
  customMaps,
  onImportBeatmap,
}: OnlineBeatmapCatalogProps) {
  const [mirrorManifest, setMirrorManifest] = useState<CatalogSet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [catalogRequestState, setCatalogRequestState] = useState<'idle' | 'loading' | 'loaded'>('idle');
  const [searchTerm, setSearchTerm] = useState('');
  const [submittedSearchTerm, setSubmittedSearchTerm] = useState('');
  const [filterSearchTerm, setFilterSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('Title');
  const [downloadingMapId, setDownloadingMapId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ loaded: number; total: number; percentage: number } | null>(null);
  const [importStatus, setImportStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [osuConnected, setOsuConnected] = useState(false);
  const [googleUser, setGoogleUser] = useState<AuthUser | null>(null);
  const [byoClientId, setByoClientId] = useState('');
  const [byoClientSecret, setByoClientSecret] = useState('');
  const [byoBusy, setByoBusy] = useState(false);
  const [showByo, setShowByo] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const refreshAuthState = useCallback(async () => {
    setOsuConnected(hasOsuConnection());
    const user = await fetchCurrentUser();
    setGoogleUser(user);
  }, []);

  useEffect(() => {
    if (!open) return;
    setIsLoading(false);
    void refreshAuthState();
  }, [open, refreshAuthState]);

  useEffect(() => {
    if (!open || !submittedSearchTerm.trim() || !osuConnected) {
      if (open && !submittedSearchTerm.trim()) {
        setMirrorManifest([]);
        setCatalogRequestState('idle');
        setIsLoading(false);
      }
      return;
    }

    const controller = new AbortController();
    const requestTerm = submittedSearchTerm.trim();

    const fetchManifest = async () => {
      setIsLoading(true);
      setCatalogRequestState('loading');
      setCatalogError(null);
      setMirrorManifest([]);
      try {
        const merged = new Map<number, CatalogSet>();
        for (const status of SEARCH_STATUSES) {
          if (controller.signal.aborted) return;
          await waitForOsuSlot('api');
          const accessToken = await getValidOsuAccessToken();
          const response = await fetch(
            `/api/catalog/search?q=${encodeURIComponent(requestTerm)}&s=${status}`,
            {
              headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${accessToken}`,
              },
              signal: controller.signal,
            },
          );
          const result = await response.json().catch(() => ({ data: [] }));
          if (!response.ok) throw new Error(result.error || 'osu! catalog search failed');
          const rows = Array.isArray(result.data) ? result.data : [];
          for (const item of rows) {
            const sourceSetId = Number(item.sourceSetId);
            if (!Number.isInteger(sourceSetId) || sourceSetId < 1) continue;
            if (merged.has(sourceSetId)) continue;
            merged.set(sourceSetId, {
              id: item.id || `osuapi_${sourceSetId}`,
              sourceSetId,
              title: item.title || 'Unknown Title',
              artist: item.artist || 'Unknown Artist',
              creator: item.creator || 'Unknown Mapper',
              status: item.status,
              coverUrl: item.coverUrl,
              charts: Array.isArray(item.charts) ? item.charts : [],
              bpm: item.bpm,
            });
          }
        }
        if (controller.signal.aborted) return;
        setMirrorManifest(Array.from(merged.values()));
      } catch (err) {
        if (controller.signal.aborted) return;
        console.warn('Unable to load online beatmap manifest.', err);
        setMirrorManifest([]);
        setCatalogError(err instanceof Error ? err.message : 'osu! catalog search failed');
      } finally {
        if (controller.signal.aborted) return;
        setIsLoading(false);
        setCatalogRequestState('loaded');
      }
    };

    void fetchManifest();
    return () => controller.abort();
  }, [open, submittedSearchTerm, osuConnected]);

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

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleConnectOsu = () => {
    void initiateOsuAuthCode(
      () => {
        setOsuConnected(true);
        setCatalogError(null);
      },
      (msg) => setCatalogError(msg),
    );
  };

  const handleByoConnect = async () => {
    setByoBusy(true);
    setCatalogError(null);
    try {
      await connectByoCredentials(byoClientId, byoClientSecret);
      setOsuConnected(true);
      setShowByo(false);
      setByoClientSecret('');
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'BYO osu! connect failed');
    } finally {
      setByoBusy(false);
    }
  };

  const handleDisconnectOsu = () => {
    clearOsuConnection();
    setOsuConnected(false);
    setMirrorManifest([]);
    setSubmittedSearchTerm('');
    setCatalogRequestState('idle');
  };

  const handleDownload = async (s: CatalogSet) => {
    if (downloadingMapId) {
      setImportStatus({ type: 'err', msg: 'A download is already in progress! Please wait until it completes.' });
      return;
    }

    const mirrorSetId = s.id;
    const mirrorSetTitle = s.title;
    let workingSet = s;
    let activationToken: string | null = null;
    const activationCharts: { beatmapId: number; checksum: string }[] = [];
    const googleLinked = !!googleUser;

    setDownloadingMapId(mirrorSetId);
    setDownloadProgress({ loaded: 0, total: 0, percentage: 0 });
    setImportStatus({ type: 'ok', msg: googleLinked ? 'Registering map for online scores…' : 'Preparing local download…' });

    try {
      if (!s.sourceSetId) throw new Error('The result is missing its osu! beatmap set id.');

      if (googleLinked) {
        await waitForOsuSlot('api');
        const accessToken = await getValidOsuAccessToken();
        const registration = await fetch('/api/catalog/register-download', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ beatmapsetId: s.sourceSetId }),
        });
        const registrationJson = await registration.json();
        if (!registration.ok || !registrationJson.success) {
          throw new Error(registrationJson.error || 'Catalog registration failed');
        }
        activationToken = registrationJson.data.token;
        workingSet = {
          ...s,
          id: registrationJson.data.cloudSetId,
          difficulties: registrationJson.data.charts.map((chart: CatalogChart & { id: number }) => ({
            ...chart,
            sourceChartId: chart.id,
            chartRevisionId: chart.chartRevisionId || `osuapi_${s.sourceSetId}_b${chart.id}_${chart.checksum}`,
            name: chart.version || chart.name,
            originalOsuFilename: chart.originalOsuFilename || chart.filename,
          })),
        };
      } else {
        workingSet = {
          ...s,
          difficulties: (s.charts || []).map((chart) => ({
            ...chart,
            sourceChartId: chart.id,
            chartRevisionId: `osuapi_${s.sourceSetId}_b${chart.id}_${chart.checksum}`,
            name: chart.version || chart.name,
            originalOsuFilename: chart.filename || chart.originalOsuFilename,
            checksumAlgorithm: 'md5',
          })),
        };
      }

      const blob = await downloadBeatmapsetArchive(
        s.sourceSetId,
        (msg) => setImportStatus({ type: 'ok', msg }),
        (loaded, total) => {
          setDownloadProgress({
            loaded,
            total,
            percentage: total ? Math.round((loaded / total) * 100) : 0,
          });
        },
        MAX_COMPRESSED_SIZE_BYTES,
      );

      setImportStatus({ type: 'ok', msg: 'Storing package and cache...' });

      const packageId = workingSet.id;
      const zip = await JSZip.loadAsync(blob);
      validateZipLimits(zip);
      await storageManager.savePackage(packageId, `${mirrorSetTitle}.osz`, blob);
      await new Promise((resolve) => setTimeout(resolve, 15));

      const fileNames = Object.keys(zip.files);
      const beatmapFiles: { name: string; content: string; checksum: string }[] = [];

      for (const name of fileNames) {
        if (name.toLowerCase().endsWith('.osu') && !zip.files[name].dir) {
          validateZipEntrySize(zip.files[name], name);
          const raw = await zip.files[name].async('arraybuffer');
          beatmapFiles.push({
            name,
            content: new TextDecoder().decode(raw),
            checksum: SparkMD5.ArrayBuffer.hash(raw),
          });
        }
      }

      if (beatmapFiles.length === 0) throw new Error('Invalid package structure.');

      let importedCount = 0;
      const diffs = workingSet.difficulties || [];

      for (const beatmapStr of beatmapFiles) {
        let matchedDiff = diffs.find(
          (d) => d.checksum?.toLowerCase() === beatmapStr.checksum.toLowerCase(),
        );
        if (!matchedDiff) {
          matchedDiff = diffs.find(
            (d) => (d.originalOsuFilename || d.filename) === beatmapStr.name,
          );
        }
        if (!matchedDiff?.chartRevisionId) continue;

        const sourceChartId = Number(matchedDiff.sourceChartId ?? matchedDiff.id);
        if (Number.isInteger(sourceChartId) && sourceChartId > 0 && matchedDiff.checksum) {
          activationCharts.push({ beatmapId: sourceChartId, checksum: matchedDiff.checksum });
        }

        const parsedMap = parseBeatmap(beatmapStr.content, matchedDiff.chartRevisionId);
        if (parsedMap.notes.length === 0) continue;

        const media = parseMediaPaths(beatmapStr.content);
        const mapWithMeta = parsedMap as Beatmap & Record<string, unknown>;
        mapWithMeta.packageId = packageId;
        mapWithMeta.parentPackageId = packageId;
        mapWithMeta.catalogSetId = packageId;
        mapWithMeta.catalogMapId = matchedDiff.chartRevisionId;
        mapWithMeta.chartRevisionId = matchedDiff.chartRevisionId;
        mapWithMeta.checksum = matchedDiff.checksum;
        mapWithMeta.checksumAlgorithm = 'md5' as const;
        mapWithMeta.audioFilename = media.audioFilename;
        mapWithMeta.videoFilename = media.videoFilename;
        mapWithMeta.bgFilename = media.bgFilename;
        mapWithMeta.originalContent = beatmapStr.content;
        mapWithMeta.isServerMap = googleLinked;
        mapWithMeta.beatmapHash = computeBeatmapHash(parsedMap);
        parsedMap.audioUrl = '';
        parsedMap.videoUrl = '';
        parsedMap.bgUrl = '';

        onImportBeatmap(parsedMap);
        importedCount++;
      }

      if (importedCount === 0) throw new Error('No valid playable difficulties found inside.');

      if (activationToken) {
        const activation = await fetch('/api/catalog/activate-download', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cloudSetId: workingSet.id,
            token: activationToken,
            charts: activationCharts,
          }),
        });
        const activationJson = await activation.json().catch(() => ({}));
        if (!activation.ok || !activationJson.success) {
          throw new Error(activationJson.error || 'Downloaded map authentication failed.');
        }
      }

      setImportStatus({
        type: 'ok',
        msg: googleLinked
          ? `Successfully downloaded and activated "${mirrorSetTitle}"!`
          : `Successfully downloaded "${mirrorSetTitle}" (local only — sign in with Google for online scores).`,
      });
    } catch (err: unknown) {
      console.error('Downloader error:', err instanceof Error ? err.message : String(err));
      try {
        await storageManager.deletePackageAndAllBeatmaps(workingSet.id || mirrorSetId);
        if (workingSet.id !== mirrorSetId) {
          await storageManager.deletePackageAndAllBeatmaps(mirrorSetId);
        }
      } catch {
        // ignore cleanup errors
      }
      setImportStatus({
        type: 'err',
        msg: err instanceof Error ? err.message : 'Download error. Check network connection.',
      });
    } finally {
      setDownloadingMapId(null);
      setDownloadProgress(null);
      setTimeout(() => setImportStatus(null), 5000);
    }
  };

  const filteredManifest = mirrorManifest
    .filter((s) => {
      if (!filterSearchTerm) return true;
      const q = filterSearchTerm.toLowerCase();
      return (
        (s.title || '').toLowerCase().includes(q) ||
        (s.artist || '').toLowerCase().includes(q) ||
        (s.creator || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'Title') return (a.title || '').localeCompare(b.title || '');
      if (sortBy === 'Artist') return (a.artist || '').localeCompare(b.artist || '');
      if (sortBy === 'BPM') return (b.bpm || 0) - (a.bpm || 0);
      return 0;
    });

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />

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
            <div className="h-1 w-full bg-slate-700 shadow-[0_0_8px_rgba(100,116,139,0.3)] flex-none" />

            <div className="flex-none px-6 md:px-12 py-5 border-b border-white/5 flex items-center justify-between bg-black/10">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 shadow-inner">
                  <Music className="h-6 w-6 text-slate-300" />
                </div>
                <div>
                  <h1 className="text-xl font-black tracking-widest text-white font-sans uppercase">
                    Find Mirror Beatmaps
                  </h1>
                  <p className="text-xs text-slate-450 mt-0.5 font-sans font-medium tracking-wide">
                    osu! search · Catboy mirror (Mino)
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

            {!osuConnected ? (
              <div className="flex-1 overflow-y-auto px-6 md:px-12 py-10">
                <div className="max-w-lg mx-auto bg-[#12121a]/80 border border-white/10 rounded-2xl p-6 space-y-4">
                  <h2 className="text-sm font-black uppercase tracking-widest text-white">Connect osu! to search</h2>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Search uses your personal osu! API token (1 request/second). Downloads use Catboy mirror (Mino),
                    with osudl.org as fallback. Google sign-in is only required if you want online scores.
                  </p>
                  {catalogError && (
                    <div className="p-3 rounded-xl text-xs font-mono border bg-rose-950/20 text-rose-400 border-rose-500/20">
                      {catalogError}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleConnectOsu}
                    className="w-full py-3 rounded-xl bg-pink-500/20 hover:bg-pink-500/30 border border-pink-400/30 text-pink-100 text-xs font-black uppercase tracking-widest transition"
                  >
                    Sign in with osu!
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowByo((v) => !v)}
                    className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-[10px] font-mono uppercase tracking-wider transition flex items-center justify-center gap-2"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Advanced: use my own OAuth app
                  </button>
                  {showByo && (
                    <div className="space-y-3 pt-2 border-t border-white/10">
                      <p className="text-[10px] text-amber-300/90 leading-relaxed">
                        Your Client Secret stays only in this browser (localStorage). XSS or a shared PC can leak it.
                        Prefer Sign in with osu! when possible.
                      </p>
                      <input
                        type="text"
                        placeholder="Client ID"
                        value={byoClientId}
                        onChange={(e) => setByoClientId(e.target.value)}
                        className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-xl text-xs text-white"
                      />
                      <input
                        type="password"
                        placeholder="Client Secret"
                        value={byoClientSecret}
                        onChange={(e) => setByoClientSecret(e.target.value)}
                        className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-xl text-xs text-white"
                      />
                      <button
                        type="button"
                        disabled={byoBusy || !byoClientId.trim() || !byoClientSecret.trim()}
                        onClick={() => void handleByoConnect()}
                        className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-40 text-xs font-black uppercase tracking-widest"
                      >
                        {byoBusy ? 'Connecting…' : 'Save & connect'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="flex-none px-6 md:px-12 py-4 border-b border-white/5 bg-[#101016]/80 flex flex-col md:flex-row items-center gap-4 justify-between">
                  <div className="relative w-full md:max-w-sm">
                    <input
                      type="text"
                      placeholder="Type song title, artist, or creator..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setFilterSearchTerm(searchTerm);
                          setSubmittedSearchTerm(searchTerm);
                        }
                      }}
                      className="w-full pl-9 pr-20 py-2 bg-black/30 border border-white/10 rounded-xl font-sans text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all shadow-inner"
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

                  <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto py-1">
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
                              active ? 'text-white font-extrabold bg-white/10' : 'text-slate-450 hover:text-white'
                            }`}
                          >
                            {sortVal}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={handleDisconnectOsu}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-white/10 bg-white/5 text-[9px] font-mono uppercase text-slate-400 hover:text-white shrink-0"
                      title="Disconnect osu!"
                    >
                      <LogOut className="h-3 w-3" />
                      osu!
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 md:px-12 py-6 min-h-0 bg-black/5">
                  {catalogError && (
                    <div className="p-3.5 mb-5 rounded-xl text-xs font-mono border bg-rose-950/20 text-rose-400 border-rose-500/20">
                      {catalogError}
                    </div>
                  )}
                  {!googleUser && (
                    <div className="p-3 mb-4 rounded-xl text-[10px] font-mono border bg-amber-950/20 text-amber-200/90 border-amber-500/20">
                      Google not signed in — downloads stay local only (no online leaderboard activation).
                    </div>
                  )}
                  {isLoading ? (
                    <div className="py-16 text-center text-slate-500">
                      <Loader className="h-8 w-8 mx-auto mb-3 animate-spin text-cyan-400" />
                      <p className="text-xs font-mono font-black uppercase tracking-widest text-white">
                        Searching osu! (ranked → loved → graveyard)…
                      </p>
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
                          (m) =>
                            (m as Beatmap & { parentPackageId?: string; packageId?: string }).parentPackageId === s.id ||
                            (m as Beatmap & { packageId?: string }).packageId === `pkg_${s.id}`,
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
                            <div className="flex-1 min-w-0 text-left">
                              <h4 className="font-extrabold text-sm text-white leading-snug truncate group-hover:text-slate-200 transition-colors">
                                {s.title}
                              </h4>
                              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider truncate mt-0.5">
                                {s.artist}
                              </p>
                              <div className="flex items-center gap-1.5 mt-2 flex-wrap text-[9px] font-mono text-slate-500 uppercase leading-none">
                                <span className="truncate max-w-[150px]">By {s.creator || 'Unknown'}</span>
                                {s.status && (
                                  <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{s.status}</span>
                                )}
                              </div>
                            </div>

                            <div className="shrink-0 pl-1">
                              {isDownloaded ? (
                                <div className="flex flex-col items-center gap-0.5 text-emerald-400 shrink-0 select-none bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-xl">
                                  <Check className="h-4 w-4 text-emerald-400" />
                                  <span className="text-[8px] font-mono font-black uppercase">READY</span>
                                </div>
                              ) : isDownloading ? (
                                <div className="flex flex-col items-center gap-1 text-slate-300 shrink-0 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl animate-pulse">
                                  <Loader className="h-4.5 w-4.5 animate-spin text-slate-400" />
                                  <span className="text-[8px] font-mono uppercase font-black">
                                    {downloadProgress?.percentage || 0}%
                                  </span>
                                </div>
                              ) : (
                                <button
                                  onClick={() => void handleDownload(s)}
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
                  ) : mirrorManifest.length === 0 ? (
                    <div className="bg-[#12121a]/50 border border-white/5 py-16 px-8 rounded-2xl flex flex-col items-center justify-center text-center text-slate-500 max-w-md mx-auto shadow-xl">
                      <Info className="h-8 w-8 mb-3 text-slate-600" />
                      <p className="text-xs font-sans font-black tracking-widest uppercase text-white">No maps found</p>
                      <p className="text-[10px] text-slate-500 font-mono max-w-xs mt-1 leading-relaxed uppercase">
                        Try a different song title, artist, or mapper
                      </p>
                    </div>
                  ) : (
                    <div className="bg-[#12121a]/50 border border-white/5 py-16 px-8 rounded-2xl flex flex-col items-center justify-center text-center text-slate-500 max-w-md mx-auto shadow-xl">
                      <Info className="h-8 w-8 mb-3 text-slate-600" />
                      <p className="text-xs font-sans font-black tracking-widest uppercase text-white">No matching beatmaps</p>
                      <p className="text-[10px] text-slate-500 font-mono max-w-xs mt-1 leading-relaxed uppercase">
                        Try a different song title, artist, or mapper
                      </p>
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
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
