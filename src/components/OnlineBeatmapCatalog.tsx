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
import {
  Search, X, Music, Music2, Check, Loader, Download, Info, KeyRound, LogOut, ChevronDown,
} from 'lucide-react';
import { Beatmap } from '../types';
import { parseBeatmap, parseMediaPaths } from '../utils/beatmapParser';
import { storageManager } from '../utils/storageManager';
import { MAX_COMPRESSED_SIZE_BYTES, validateZipLimits, createZipExtractionBudget, decodeBoundedUtf8 } from '../utils/securityLimits';
import { computeBeatmapHash } from '../utils/replayManager';
import { extractZipEntry } from '../utils/zipResolver';
import { computeChecksum, inferChecksumAlgorithm } from '../utils/checksum';
import { saveCatalogSetMetadata } from '../utils/catalogSetMetadata';
import { fetchCurrentUser, type AuthUser } from '../utils/authClient';
import { withCsrfHeaders } from '../utils/csrfClient';
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
  onImportPackage: (packageId: string, name: string, blob: Blob, maps: Beatmap[]) => Promise<void>;
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
  keyCount?: number;
  starRating?: number;
};

type CatalogSet = {
  id: string;
  sourceSetId: number;
  title: string;
  artist: string;
  creator: string;
  status?: string;
  coverUrl?: string;
  slimCoverUrl?: string;
  charts?: CatalogChart[];
  difficulties?: CatalogChart[];
  bpm?: number;
};

const SEARCH_STATUSES = ['ranked', 'loved', 'graveyard'] as const;
const SEARCH_CATEGORIES = ['Any', 'Loved', 'Ranked', 'Graveyard'] as const;

export default function OnlineBeatmapCatalog({
  open,
  onClose,
  customMaps,
  onImportPackage,
}: OnlineBeatmapCatalogProps) {
  const [mirrorManifest, setMirrorManifest] = useState<CatalogSet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [catalogRequestState, setCatalogRequestState] = useState<'idle' | 'loading' | 'loaded'>('idle');
  const [searchTerm, setSearchTerm] = useState('');
  const [submittedSearchTerm, setSubmittedSearchTerm] = useState('');
  const [filterSearchTerm, setFilterSearchTerm] = useState('');
  const [searchCategory, setSearchCategory] = useState<(typeof SEARCH_CATEGORIES)[number]>('Any');
  const [downloadingMapId, setDownloadingMapId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ loaded: number; total: number; percentage: number } | null>(null);
  const [downloadQueue, setDownloadQueue] = useState<CatalogSet[]>([]);
  const downloadQueueRef = useRef<CatalogSet[]>([]);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [osuConnected, setOsuConnected] = useState(false);
  const [googleUser, setGoogleUser] = useState<AuthUser | null>(null);
  const [googleAuthLoading, setGoogleAuthLoading] = useState(true);
  const [byoClientId, setByoClientId] = useState('');
  const [byoClientSecret, setByoClientSecret] = useState('');
  const [byoBusy, setByoBusy] = useState(false);
  const [showByo, setShowByo] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const authGeneration = useRef(0);
  const [expandedSetId, setExpandedSetId] = useState<string | null>(null);

  const refreshAuthState = useCallback(async () => {
    const generation = ++authGeneration.current;
    setGoogleAuthLoading(true);
    setOsuConnected(hasOsuConnection());
    try {
      const user = await fetchCurrentUser();
      if (generation !== authGeneration.current) return;
      setGoogleUser(user);
    } catch (error) {
      if (generation === authGeneration.current) {
        setCatalogError(error instanceof Error ? error.message : 'Unable to load account state');
      }
    } finally {
      if (generation === authGeneration.current) {
        setGoogleAuthLoading(false);
      }
    }
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
        const statuses = searchCategory === 'Any'
          ? SEARCH_STATUSES
          : [searchCategory.toLowerCase() as (typeof SEARCH_STATUSES)[number]];
        for (const status of statuses) {
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
              slimCoverUrl: item.slimCoverUrl,
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
  }, [open, submittedSearchTerm, searchCategory, osuConnected]);

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
    const mirrorSetId = s.id;
    const mirrorSetTitle = s.title;
    let workingSet = s;
    let activationToken: string | null = null;
    let packageStaged = false;
    const googleLinked = !!googleUser;
    let catalogActivated = false;

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
           headers: withCsrfHeaders({
             'Content-Type': 'application/json',
             Authorization: `Bearer ${accessToken}`,
           }),
          body: JSON.stringify({ beatmapsetId: s.sourceSetId }),
        });
        const registrationJson = await registration.json();
        if (!registration.ok || !registrationJson.success) {
          throw new Error(registrationJson.error || 'Catalog registration failed');
        }
        activationToken = typeof registrationJson.data.token === 'string' ? registrationJson.data.token : null;
        catalogActivated = registrationJson.data.state === 'active';
        workingSet = {
          ...s,
          id: registrationJson.data.cloudSetId,
          difficulties: registrationJson.data.charts.map((chart: CatalogChart & { id: number }) => ({
            ...chart,
            sourceChartId: chart.id,
            checksum: chart.checksum.toLowerCase(),
            chartRevisionId: chart.chartRevisionId || `osuapi_${s.sourceSetId}_b${chart.id}_${chart.checksum.toLowerCase()}`,
            name: chart.version || chart.name,
            originalOsuFilename: chart.originalOsuFilename || chart.filename,
            checksumAlgorithm: chart.checksumAlgorithm === 'sha256' || chart.checksum.length === 64 ? 'sha256' : 'md5',
          })),
        };
      } else {
        workingSet = {
          ...s,
          difficulties: (s.charts || []).map((chart) => ({
            ...chart,
            sourceChartId: chart.id,
            checksum: chart.checksum.toLowerCase(),
            chartRevisionId: `osuapi_${s.sourceSetId}_b${chart.id}_${chart.checksum.toLowerCase()}`,
            name: chart.version || chart.name,
            originalOsuFilename: chart.filename || chart.originalOsuFilename,
            checksumAlgorithm: inferChecksumAlgorithm(chart.checksum),
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
      if (blob.size > MAX_COMPRESSED_SIZE_BYTES) throw new Error('Security Exception: Downloaded package exceeds the size limit.');

      setImportStatus({ type: 'ok', msg: 'Storing package and cache...' });

      const packageId = workingSet.id;
      const zip = await JSZip.loadAsync(blob);
      validateZipLimits(zip);
      const extractionBudget = createZipExtractionBudget();
      const fileNames = Object.keys(zip.files);
      const beatmapFiles: { name: string; content: string; raw: ArrayBuffer }[] = [];

      for (const name of fileNames) {
        if (name.toLowerCase().endsWith('.osu') && !zip.files[name].dir) {
          const raw = await extractZipEntry(zip.files[name], name, extractionBudget);
          beatmapFiles.push({
            name,
            content: decodeBoundedUtf8(raw, `Beatmap file ${name}`),
            raw,
          });
        }
      }

      if (beatmapFiles.length === 0) throw new Error('Invalid package structure.');

      let importedCount = 0;
      const importedMaps: Beatmap[] = [];
      const diffs = workingSet.difficulties || [];

      for (const beatmapStr of beatmapFiles) {
        const [md5, sha256] = await Promise.all([
          computeChecksum(beatmapStr.raw, 'md5'),
          computeChecksum(beatmapStr.raw, 'sha256'),
        ]);
        const matchedDiff = diffs.find((diff) => {
          const expected = diff.checksum?.toLowerCase();
          if (!expected) return false;
          return expected === (expected.length === 64 ? sha256 : md5);
        });
        if (!matchedDiff?.chartRevisionId) continue;

        const parsedMap = parseBeatmap(beatmapStr.content, matchedDiff.chartRevisionId);
        if (parsedMap.notes.length === 0) continue;

        const media = parseMediaPaths(beatmapStr.content);
        const mapWithMeta = parsedMap as Beatmap & Record<string, unknown>;
        mapWithMeta.packageId = packageId;
        mapWithMeta.parentPackageId = packageId;
        mapWithMeta.catalogSetId = packageId;
        mapWithMeta.sourceSetId = s.sourceSetId;
        mapWithMeta.catalogMapId = matchedDiff.chartRevisionId;
        mapWithMeta.chartRevisionId = matchedDiff.chartRevisionId;
        mapWithMeta.checksum = matchedDiff.checksum?.toLowerCase();
        mapWithMeta.checksumAlgorithm = matchedDiff.checksumAlgorithm === 'sha256' || matchedDiff.checksum?.length === 64 ? 'sha256' : 'md5';
        mapWithMeta.audioFilename = media.audioFilename;
        mapWithMeta.videoFilename = media.videoFilename;
        mapWithMeta.bgFilename = media.bgFilename;
        mapWithMeta.coverUrl = s.slimCoverUrl || s.coverUrl;
        mapWithMeta.originalContent = beatmapStr.content;
        mapWithMeta.isServerMap = googleLinked && catalogActivated;
        mapWithMeta.beatmapHash = computeBeatmapHash(parsedMap);
        if (Number.isFinite(matchedDiff.starRating) && Number(matchedDiff.starRating) >= 0) {
          mapWithMeta.starRating = Number(matchedDiff.starRating);
          mapWithMeta.starRatingSource = 'osu-api-download';
        }
        mapWithMeta.starRatingVersion = undefined;
        parsedMap.audioUrl = '';
        parsedMap.videoUrl = '';
        parsedMap.bgUrl = '';

        importedMaps.push(parsedMap);
        importedCount++;
      }

      if (importedCount === 0) throw new Error('No valid playable difficulties found inside.');

      if (activationToken) {
        const activation = await fetch('/api/catalog/activate-download', {
          method: 'POST',
          credentials: 'include',
           headers: withCsrfHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
             cloudSetId: workingSet.id,
             token: activationToken,
          }),
        });
        const activationJson = await activation.json().catch(() => ({}));
         if (activation.ok && activationJson.success && activationJson.data?.state === 'active') {
           catalogActivated = true;
           for (const importedMap of importedMaps) {
             importedMap.isServerMap = true;
           }
         } else {
           setImportStatus({ type: 'ok', msg: 'Mirror verification is pending; the map will remain local until it can be independently verified.' });
         }
      }

       await onImportPackage(packageId, `${mirrorSetTitle}.osz`, blob, importedMaps);
       saveCatalogSetMetadata({
         sourceSetId: s.sourceSetId,
         title: s.title,
         artist: s.artist,
         creator: s.creator,
         slimCoverUrl: s.slimCoverUrl,
       });
      packageStaged = true;

       setImportStatus({
        type: 'ok',
         msg: googleLinked && catalogActivated
           ? `Successfully downloaded and activated "${mirrorSetTitle}"!`
           : googleLinked
             ? `Successfully downloaded "${mirrorSetTitle}" locally; online verification is still pending.`
             : `Successfully downloaded "${mirrorSetTitle}" (local only — sign in with Google for online scores).`,
       });
       setDownloadNotice(`${mirrorSetTitle} has been downloaded.`);
       window.setTimeout(() => setDownloadNotice(null), 6000);
    } catch (err: unknown) {
      console.error('Downloader error:', err instanceof Error ? err.message : String(err));
      if (packageStaged) {
        try {
          await storageManager.deletePackageAndAllBeatmaps(workingSet.id || mirrorSetId);
          if (workingSet.id !== mirrorSetId) {
            await storageManager.deletePackageAndAllBeatmaps(mirrorSetId);
          }
        } catch {
          // ignore cleanup errors
        }
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

  const enqueueDownload = (s: CatalogSet) => {
    const alreadyQueued = downloadQueueRef.current.some((queued) => queued.id === s.id);
    if (alreadyQueued || downloadingMapId === s.id) return;
    downloadQueueRef.current = [...downloadQueueRef.current, s];
    setDownloadQueue(downloadQueueRef.current);
  };

  useEffect(() => {
    if (downloadingMapId || downloadQueueRef.current.length === 0) return;
    const [next, ...remaining] = downloadQueueRef.current;
    downloadQueueRef.current = remaining;
    setDownloadQueue(remaining);
    void handleDownload(next);
  }, [downloadQueue, downloadingMapId]);

  const filteredManifest = mirrorManifest.filter((s) => {
    if (!filterSearchTerm) return true;
    const q = filterSearchTerm.toLowerCase();
    return (
      (s.title || '').toLowerCase().includes(q) ||
      (s.artist || '').toLowerCase().includes(q) ||
      (s.creator || '').toLowerCase().includes(q)
    );
  });

  const revealSet = (setId: string) => {
    setExpandedSetId((current) => current === setId ? null : setId);
  };

  const getDifficultyBadge = (rating: number) => {
    if (rating < 2.0) return 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30';
    if (rating < 3.0) return 'text-cyan-400 bg-cyan-500/15 border-cyan-500/30';
    if (rating < 4.0) return 'text-amber-400 bg-amber-500/15 border-amber-500/30';
    if (rating < 5.0) return 'text-orange-400 bg-orange-500/15 border-orange-500/30';
    if (rating < 6.5) return 'text-rose-400 bg-rose-500/15 border-rose-500/30';
    return 'text-purple-400 bg-purple-500/15 border-purple-500/30';
  };

  const statusStyle = (status?: string) => {
    if (status === 'ranked') return 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]';
    if (status === 'loved') return 'bg-pink-500/20 text-pink-300 border border-pink-400/30 shadow-[0_0_10px_rgba(236,72,153,0.2)]';
    return 'bg-slate-800/80 text-slate-300 border border-white/10';
  };

  const headerDownloadMessage = importStatus?.msg
    || (downloadingMapId ? 'Downloading beatmap…' : downloadQueue.length > 0 ? `${downloadQueue.length} beatmap${downloadQueue.length === 1 ? '' : 's'} queued…` : null);

  const closedDownloadNotice = !open && downloadNotice ? (
    <motion.div
      initial={{ opacity: 0, x: 24, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.95 }}
      className="fixed right-4 top-4 z-[130] flex max-w-sm items-stretch overflow-hidden rounded-2xl border border-cyan-400/30 bg-[#071932]/95 text-white shadow-[0_15px_40px_rgba(0,0,0,0.6),0_0_25px_rgba(0,176,255,0.15)] backdrop-blur-xl"
    >
      <div className="flex w-12 shrink-0 items-center justify-center border-r border-emerald-500/30 bg-emerald-500/20 text-emerald-400">
        <Check className="h-5 w-5" />
      </div>
      <div className="px-4 py-3 text-sm font-medium leading-snug">{downloadNotice}</div>
    </motion.div>
  ) : null;

  return (
    <>
      <AnimatePresence>{closedDownloadNotice}</AnimatePresence>
      <AnimatePresence>
        {open && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />

          <motion.div
            key="catalog-panel"
            ref={containerRef}
            className="fixed inset-x-0 top-0 z-[110] w-full max-h-[85vh] md:max-h-[90vh] bg-gradient-to-b from-[#0b1426]/98 via-[#07101e]/98 to-[#050811]/98 border-b border-cyan-500/20 shadow-[0_25px_60px_rgba(0,0,0,0.85),0_0_40px_rgba(0,176,255,0.08)] backdrop-blur-2xl flex flex-col rounded-b-3xl overflow-hidden font-sans text-slate-200"
            initial={{ y: '-100vh', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '-100vh', opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
            style={{ willChange: 'transform, opacity' }}
          >
            <div className="h-1 w-full bg-gradient-to-r from-cyan-500 via-sky-400 to-indigo-500 shadow-[0_0_12px_rgba(0,176,255,0.5)] flex-none" />

            <div className="relative flex-none px-6 md:px-12 py-3.5 border-b border-white/[0.08] flex items-center justify-between bg-[#081326]/90 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10 text-cyan-300 shadow-[0_0_12px_rgba(0,176,255,0.2)]" aria-hidden="true">
                  <Music2 className="h-4 w-4 stroke-[2.2]" />
                </div>
                <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                  Beatmap <span className="text-cyan-300">Listing</span>
                </h1>
              </div>

              {headerDownloadMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`pointer-events-none absolute left-1/2 top-1/2 flex w-[42%] -translate-x-1/2 -translate-y-1/2 flex-col items-stretch justify-center gap-1 truncate rounded-xl border px-3 py-2 text-center text-[10px] font-mono sm:text-xs shadow-lg backdrop-blur-md ${
                    importStatus?.type !== 'err'
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40 shadow-emerald-950/40'
                      : 'bg-rose-950/80 text-rose-300 border-rose-500/40 shadow-rose-950/40'
                  }`}
                >
                  <div className="flex min-w-0 items-center justify-center gap-2">
                    <Info className="h-4 w-4 shrink-0" />
                    <span className="truncate">{headerDownloadMessage}</span>
                  </div>
                  {downloadingMapId && downloadProgress && (
                    <div className="h-1 w-full overflow-hidden rounded-full bg-black/40">
                      <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-[width] duration-200" style={{ width: `${downloadProgress.percentage}%` }} />
                    </div>
                  )}
                </motion.div>
              )}

              <button
                onClick={onClose}
                className="p-2 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/10 hover:border-cyan-400/30 text-slate-400 hover:text-white transition duration-150 cursor-pointer shadow-md"
                title="Close catalog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!osuConnected ? (
              <div className="flex-1 overflow-y-auto px-6 md:px-12 py-10">
                <div className="max-w-xl mx-auto px-6 py-6 space-y-5 rounded-2xl border border-white/[0.08] bg-[#091426]/75 shadow-2xl backdrop-blur-md">
                  <div>
                    <h2 className="text-xl font-black uppercase tracking-wider text-white">Connect osu! to search</h2>
                    <p className="text-xs text-slate-400 leading-relaxed mt-1.5">
                      Search uses your personal osu! API token (1 request/second). Downloads use Catboy mirror (Mino),
                      with osudl.org as fallback. Google sign-in is only required if you want online scores.
                    </p>
                  </div>
                  {catalogError && (
                    <div className="p-3.5 rounded-xl text-xs font-mono border bg-rose-950/30 text-rose-400 border-rose-500/30">
                      {catalogError}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleConnectOsu}
                    className="w-full py-3.5 rounded-xl bg-pink-500/20 hover:bg-pink-500/30 border border-pink-400/40 text-pink-100 hover:text-white text-xs font-black uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(236,72,153,0.15)] active:scale-[0.99] cursor-pointer"
                  >
                    Sign in with osu!
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowByo((v) => !v)}
                    className="w-full py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-300 hover:text-white text-[10px] font-mono uppercase tracking-wider transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Advanced: use my own OAuth app
                  </button>
                  {showByo && (
                    <div className="space-y-3 pt-3 border-t border-white/10">
                      <p className="text-[10px] text-amber-300/90 leading-relaxed">
                        Your Client Secret stays only in this browser (localStorage). XSS or a shared PC can leak it.
                        Prefer Sign in with osu! when possible.
                      </p>
                      <input
                        type="text"
                        placeholder="Client ID"
                        value={byoClientId}
                        onChange={(e) => setByoClientId(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-[#060e1c] border border-white/15 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 rounded-xl text-xs text-white placeholder-slate-500 transition-all outline-none"
                      />
                      <input
                        type="password"
                        placeholder="Client Secret"
                        value={byoClientSecret}
                        onChange={(e) => setByoClientSecret(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-[#060e1c] border border-white/15 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 rounded-xl text-xs text-white placeholder-slate-500 transition-all outline-none"
                      />
                      <button
                        type="button"
                        disabled={byoBusy || !byoClientId.trim() || !byoClientSecret.trim()}
                        onClick={() => void handleByoConnect()}
                        className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-40 text-xs font-black uppercase tracking-widest text-white transition cursor-pointer"
                      >
                        {byoBusy ? 'Connecting…' : 'Save & connect'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="relative flex-none px-6 md:px-12 py-4 border-b border-white/[0.06] bg-[#060e1c]/80 flex flex-col items-center gap-3">
                  <div className="relative w-full md:w-[68%] lg:w-[64%]">
                    <input
                      type="text"
                      placeholder="type in keywords..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setFilterSearchTerm(searchTerm);
                          setSubmittedSearchTerm(searchTerm);
                        }
                      }}
                      className="w-full pl-4 pr-14 py-3 bg-[#0a1526]/90 border border-white/15 rounded-xl font-sans text-base font-bold text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400/80 focus:ring-2 focus:ring-cyan-400/25 transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setFilterSearchTerm(searchTerm);
                        setSubmittedSearchTerm(searchTerm);
                      }}
                      className="absolute right-2 top-2 bottom-2 rounded-lg bg-cyan-500/15 hover:bg-cyan-400 text-cyan-300 hover:text-slate-950 px-3 transition-all flex items-center justify-center cursor-pointer shadow-sm"
                      title="Search"
                    >
                      <Search className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-center gap-2 overflow-x-auto max-w-full text-xs font-medium py-0.5">
                    <span className="mr-1 text-slate-300 font-bold uppercase text-[11px] tracking-wider font-mono">Categories:</span>
                    {SEARCH_CATEGORIES.map((category) => {
                      const active = searchCategory === category;
                      return (
                        <button
                          key={category}
                          onClick={() => setSearchCategory(category)}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                            active
                              ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 shadow-[0_0_12px_rgba(0,176,255,0.25)] font-bold'
                              : 'bg-white/[0.04] text-slate-400 border border-white/5 hover:bg-white/[0.08] hover:text-slate-200'
                          }`}
                        >
                          {category}
                        </button>
                      );
                    })}
                  </div>
                  <div className="absolute right-6 top-4 md:right-12 hidden sm:block">
                    <button
                      type="button"
                      onClick={handleDisconnectOsu}
                      className="flex h-[44px] items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-xs font-mono uppercase text-slate-300 hover:bg-rose-500/15 hover:text-rose-300 hover:border-rose-500/30 transition-all shrink-0 cursor-pointer"
                      title="Disconnect osu!"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Logout
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 min-h-0 bg-[#050913]/60">
                  {catalogError && (
                    <div className="p-3.5 mb-5 rounded-xl text-xs font-mono border bg-rose-950/30 text-rose-300 border-rose-500/30 shadow-lg">
                      {catalogError}
                    </div>
                  )}
                  {!googleAuthLoading && !googleUser && (
                    <div className="p-3 mb-4 rounded-xl text-[10px] font-mono border bg-amber-950/30 text-amber-200/90 border-amber-500/30 shadow-lg">
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
                      <Search className="h-10 w-10 mx-auto mb-3 text-slate-600" />
                      <p className="text-lg font-mono font-black uppercase tracking-widest text-white">Search a song!</p>
                      <p className="text-xs text-slate-400 font-sans mt-1">Enter a song title, artist, or mapper above</p>
                    </div>
                  ) : catalogRequestState !== 'loaded' ? (
                    <div className="py-16 text-center text-slate-500">
                      <Loader className="h-8 w-8 mx-auto mb-3 animate-spin text-cyan-400" />
                      <p className="text-xs font-mono font-black uppercase tracking-widest text-white">Searching beatmaps...</p>
                    </div>
                  ) : filteredManifest.length > 0 ? (
                    <div className="grid grid-cols-1 xl:grid-cols-2 items-start gap-3 pb-6">
                      {filteredManifest.map((s) => {
                        const isDownloading = downloadingMapId === s.id;
                        const isQueued = downloadQueue.some((queued) => queued.id === s.id);
                        const isDownloaded = customMaps.some(
                          (m) =>
                            (m as Beatmap & { parentPackageId?: string; packageId?: string }).parentPackageId === s.id ||
                            (m as Beatmap & { packageId?: string }).packageId === `pkg_${s.id}`,
                        );

                        const expanded = expandedSetId === s.id;
                        const charts = s.charts || s.difficulties || [];
                        return (
                          <div
                            key={s.id}
                            className={`border rounded-2xl overflow-hidden relative shadow-lg transition-all duration-200 group ${
                              isDownloaded
                                ? 'border-emerald-500/40 bg-[#071822]/80 hover:bg-[#0a2230]/90 shadow-[0_0_20px_rgba(16,185,129,0.08)]'
                                : 'border-white/[0.08] bg-[#0a1528]/75 hover:bg-[#0e1e38]/90 hover:border-cyan-400/30 shadow-[0_8px_24px_rgba(0,0,0,0.4)] hover:shadow-[0_8px_30px_rgba(0,176,255,0.12)]'
                            }`}
                            onClick={() => revealSet(s.id)}
                          >
                            <div className="flex gap-3 p-3 min-h-[118px] items-stretch cursor-pointer">
                              <div className="h-[104px] w-[104px] shrink-0 self-center overflow-hidden rounded-xl bg-black/40 border border-white/10 shadow-inner">
                                {s.coverUrl ? (
                                  <img src={s.coverUrl} alt="" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center">
                                    <Music className="h-8 w-8 text-cyan-400/40" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0 text-left py-1">
                                <h4 className="font-black text-lg text-white leading-tight truncate group-hover:text-cyan-100 transition-colors">
                                  {s.title}
                                </h4>
                                <p className="text-xs text-cyan-300/80 font-bold truncate mt-1">
                                  {s.artist}
                                </p>
                                <p className="text-xs text-slate-400 truncate mt-1">Mapped by <span className="text-slate-300 font-medium">{s.creator || 'Unknown'}</span></p>
                                <div className="flex items-center gap-2 mt-3">
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase font-mono ${statusStyle(s.status)}`}>
                                    {s.status || 'graveyard'}
                                  </span>
                                  <span className="text-[10px] font-bold text-slate-400">
                                    {charts.length} {charts.length === 1 ? 'difficulty' : 'difficulties'}
                                  </span>
                                  <ChevronDown className={`ml-auto h-4 w-4 text-slate-400 group-hover:text-cyan-300 transition-all ${expanded ? 'rotate-180 text-cyan-300' : ''}`} />
                                </div>
                              </div>
                              <div className="shrink-0 self-center pl-1" onClick={(event) => event.stopPropagation()}>
                                {isDownloaded ? (
                                  <div className="flex flex-col items-center gap-0.5 text-emerald-300 shrink-0 select-none bg-emerald-500/15 border border-emerald-400/30 px-3 py-2 rounded-xl shadow-[0_0_12px_rgba(16,185,129,0.2)]">
                                    <Check className="h-4 w-4 stroke-[2.5]" />
                                    <span className="text-[8px] font-mono font-black uppercase tracking-wider">READY</span>
                                  </div>
                                ) : isDownloading ? (
                                  <div className="flex flex-col items-center gap-1 text-cyan-300 shrink-0 bg-cyan-500/15 border border-cyan-400/30 px-3 py-2 rounded-xl animate-pulse shadow-[0_0_15px_rgba(0,176,255,0.2)]">
                                    <Loader className="h-4 w-4 animate-spin text-cyan-400" />
                                    <span className="text-[8px] font-mono uppercase font-black">{downloadProgress?.percentage || 0}%</span>
                                  </div>
                                ) : isQueued ? (
                                  <div className="flex flex-col items-center gap-1 rounded-xl border border-amber-400/30 bg-amber-500/15 px-3 py-2 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
                                    <Loader className="h-4 w-4 animate-spin text-amber-400" />
                                    <span className="text-[8px] font-mono font-black uppercase tracking-wider">QUEUED</span>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => enqueueDownload(s)}
                                    className="p-3 bg-cyan-500/15 hover:bg-cyan-400 text-cyan-300 hover:text-slate-950 rounded-xl border border-cyan-400/30 hover:border-cyan-300 shadow-[0_0_15px_rgba(0,176,255,0.15)] hover:shadow-[0_0_20px_rgba(0,176,255,0.4)] transition-all duration-150 active:scale-95 flex items-center justify-center cursor-pointer"
                                    title="Queue map pack"
                                  >
                                    <Download className="h-4 w-4 stroke-[2.2]" />
                                  </button>
                                )}
                              </div>
                            </div>
                            {isDownloaded && <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />}
                            {isDownloading && downloadProgress && (
                              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
                                <div className="h-full bg-gradient-to-r from-cyan-400 to-sky-300 shadow-[0_0_8px_rgba(0,176,255,0.6)] transition-[width] duration-200" style={{ width: `${downloadProgress.percentage}%` }} />
                              </div>
                            )}
                            {expanded && (
                              <div className="border-t border-white/[0.08] bg-black/30 px-3 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2" onClick={(event) => event.stopPropagation()}>
                                {charts.length > 0 ? charts.map((chart, index) => {
                                  const rating = Number(chart.starRating ?? 0);
                                  return (
                                    <div key={`${chart.id}-${index}`} className="flex items-center justify-between gap-2 rounded-xl bg-[#060f1e]/80 border border-white/[0.06] hover:border-cyan-500/20 px-3 py-2 text-xs text-slate-200 transition-colors">
                                      <span className="truncate">
                                        <b className="text-cyan-300 font-mono font-bold mr-1">{chart.keyCount ? `${chart.keyCount}K` : ''}</b>
                                        {chart.version || chart.name || 'Unknown'}
                                      </span>
                                      <span className={`shrink-0 rounded-md px-2 py-0.5 font-mono font-bold text-[10px] border uppercase ${getDifficultyBadge(rating)}`}>
                                        ★ {rating.toFixed(2)}
                                      </span>
                                    </div>
                                  );
                                }) : (
                                  <span className="text-xs text-slate-400 col-span-full py-1">Difficulty details unavailable.</span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : mirrorManifest.length === 0 ? (
                    <div className="bg-[#091426]/60 border border-white/[0.08] py-16 px-8 rounded-2xl flex flex-col items-center justify-center text-center text-slate-500 max-w-md mx-auto shadow-2xl backdrop-blur-md">
                      <Info className="h-10 w-10 mb-3 text-slate-600" />
                      <p className="text-xs font-sans font-black tracking-widest uppercase text-white">No maps found</p>
                      <p className="text-[10px] text-slate-400 font-mono max-w-xs mt-1 leading-relaxed uppercase">
                        Try a different song title, artist, or mapper
                      </p>
                    </div>
                  ) : (
                    <div className="py-16 px-8 flex flex-col items-center justify-center text-center text-slate-500 max-w-md mx-auto">
                      <Info className="h-10 w-10 mb-3 text-slate-600" />
                      <p className="text-base font-sans font-black tracking-widest uppercase text-white">No matching beatmaps</p>
                      <p className="text-sm text-slate-400 font-sans max-w-xs mt-2 leading-relaxed">
                        Try a different song title, artist, or mapper
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
      </AnimatePresence>
    </>
  );
}
