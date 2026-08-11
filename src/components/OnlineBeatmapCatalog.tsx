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
  Search, X, Music, Music2, Check, Loader, Download, Info, KeyRound, LogOut, ChevronDown,
} from 'lucide-react';
import { Beatmap } from '../types';
import { parseBeatmap, parseMediaPaths } from '../utils/beatmapParser';
import { storageManager } from '../utils/storageManager';
import { MAX_COMPRESSED_SIZE_BYTES, validateZipLimits, createZipExtractionBudget, decodeBoundedUtf8 } from '../utils/securityLimits';
import { computeBeatmapHash } from '../utils/replayManager';
import { extractZipEntry } from '../utils/zipResolver';
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
  const [byoClientId, setByoClientId] = useState('');
  const [byoClientSecret, setByoClientSecret] = useState('');
  const [byoBusy, setByoBusy] = useState(false);
  const [showByo, setShowByo] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const authGeneration = useRef(0);
  const [expandedSetId, setExpandedSetId] = useState<string | null>(null);

  const refreshAuthState = useCallback(async () => {
    const generation = ++authGeneration.current;
    setOsuConnected(hasOsuConnection());
    try {
      const user = await fetchCurrentUser();
      if (generation !== authGeneration.current) return;
      setGoogleUser(user);
    } catch (error) {
      if (generation === authGeneration.current) {
        setCatalogError(error instanceof Error ? error.message : 'Unable to load account state');
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
      if (blob.size > MAX_COMPRESSED_SIZE_BYTES) throw new Error('Security Exception: Downloaded package exceeds the size limit.');

      setImportStatus({ type: 'ok', msg: 'Storing package and cache...' });

      const packageId = workingSet.id;
      const zip = await JSZip.loadAsync(blob);
      validateZipLimits(zip);
       const extractionBudget = createZipExtractionBudget();
      const fileNames = Object.keys(zip.files);
      const beatmapFiles: { name: string; content: string; checksum: string }[] = [];

      for (const name of fileNames) {
        if (name.toLowerCase().endsWith('.osu') && !zip.files[name].dir) {
           const raw = await extractZipEntry(zip.files[name], name, extractionBudget);
          beatmapFiles.push({
            name,
            content: decodeBoundedUtf8(raw, `Beatmap file ${name}`),
            checksum: SparkMD5.ArrayBuffer.hash(raw),
          });
        }
      }

      if (beatmapFiles.length === 0) throw new Error('Invalid package structure.');

      let importedCount = 0;
      const importedMaps: Beatmap[] = [];
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
        mapWithMeta.checksum = matchedDiff.checksum;
        mapWithMeta.checksumAlgorithm = 'md5' as const;
        mapWithMeta.audioFilename = media.audioFilename;
        mapWithMeta.videoFilename = media.videoFilename;
         mapWithMeta.bgFilename = media.bgFilename;
         mapWithMeta.coverUrl = s.slimCoverUrl || s.coverUrl;
        mapWithMeta.originalContent = beatmapStr.content;
         mapWithMeta.isServerMap = googleLinked && catalogActivated;
        mapWithMeta.beatmapHash = computeBeatmapHash(parsedMap);
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

  const difficultyColour = (rating: number) => {
    if (rating < 1.5) return 'linear-gradient(90deg, #4FC0FF, #4FFFD5)';
    if (rating < 2.7) return 'linear-gradient(90deg, #4FFFD5, #7CFF4F)';
    if (rating < 4) return '#F6F05C';
    if (rating < 5.3) return '#FF8068';
    if (rating < 6.5) return '#FF3C71';
    if (rating < 8) return 'linear-gradient(90deg, #6563DE, #18158E)';
    return '#000000';
  };

  const statusStyle = (status?: string) => {
    if (status === 'ranked') return 'bg-[#6CFF72] text-black';
    if (status === 'loved') return 'bg-[#FF75C8] text-black';
    return 'bg-black text-white border border-white/20';
  };

  const headerDownloadMessage = importStatus?.msg
    || (downloadingMapId ? 'Downloading beatmap…' : downloadQueue.length > 0 ? `${downloadQueue.length} beatmap${downloadQueue.length === 1 ? '' : 's'} queued…` : null);

  const closedDownloadNotice = !open && downloadNotice ? (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      className="fixed right-4 top-4 z-[130] flex max-w-sm items-stretch overflow-hidden rounded-sm border border-white/15 bg-[#474550] text-white shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
    >
      <div className="flex w-12 shrink-0 items-center justify-center bg-[#5d4308] text-amber-300">
        <Check className="h-5 w-5" />
      </div>
      <div className="px-4 py-3 text-sm font-medium">{downloadNotice}</div>
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
             className="fixed inset-x-0 top-0 z-[110] w-full max-h-[85vh] md:max-h-[90vh] bg-gradient-to-b from-[#242532]/98 to-[#181923]/98 border-b border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex flex-col rounded-b-3xl overflow-hidden font-sans text-slate-200"
            initial={{ y: '-100vh', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '-100vh', opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
            style={{ willChange: 'transform, opacity' }}
          >
            <div className="h-1 w-full bg-slate-700 shadow-[0_0_8px_rgba(100,116,139,0.3)] flex-none" />

             <div className="relative flex-none px-6 md:px-12 py-3.5 border-b border-white/5 flex items-center justify-between bg-[#202a2f]">
               <div className="flex items-center gap-4">
                 <div className="relative h-7 w-7 shrink-0 text-white" aria-hidden="true">
                   <span className="absolute left-1 top-1 h-6 w-6 rounded-[2px] border-2 border-white/90" />
                   <span className="absolute left-0 top-0 h-6 w-6 rounded-[2px] border-2 border-white/90 bg-[#202a2f]" />
                   <Music2 className="absolute left-1 top-1 h-4 w-4 stroke-[1.8]" />
                 </div>
                  <h1 className="text-lg font-medium tracking-wide text-white">
                    Beatmap Listing
                 </h1>
               </div>

               {headerDownloadMessage && (
                 <motion.div
                   initial={{ opacity: 0, y: -4 }}
                   animate={{ opacity: 1, y: 0 }}
                   className={`pointer-events-none absolute left-1/2 top-1/2 flex w-[42%] -translate-x-1/2 -translate-y-1/2 flex-col items-stretch justify-center gap-1 truncate rounded-lg border px-3 py-2 text-center text-[10px] font-mono sm:text-xs ${
                      importStatus?.type !== 'err'
                        ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/30'
                        : 'bg-rose-950/70 text-rose-300 border-rose-500/30'
                   }`}
                 >
                   <div className="flex min-w-0 items-center justify-center gap-2">
                     <Info className="h-4 w-4 shrink-0" />
                     <span className="truncate">{headerDownloadMessage}</span>
                   </div>
                   {downloadingMapId && downloadProgress && (
                     <div className="h-1 w-full overflow-hidden rounded-full bg-black/30">
                       <div className="h-full bg-emerald-300 transition-[width] duration-200" style={{ width: `${downloadProgress.percentage}%` }} />
                     </div>
                   )}
                 </motion.div>
               )}

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
                 <div className="max-w-xl mx-auto px-1 py-4 space-y-4">
                   <h2 className="text-lg font-black uppercase tracking-widest text-white">Connect osu! to search</h2>
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
                 <div className="relative flex-none px-6 md:px-12 py-4 border-b border-white/5 bg-[#101016]/80 flex flex-col items-center gap-3">
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
                       className="w-full pl-4 pr-20 py-3 bg-[#363b43] border border-white/20 rounded-md font-sans text-base font-bold text-white placeholder-slate-300/70 focus:outline-none focus:border-cyan-300/70 focus:ring-1 focus:ring-cyan-300/30 transition-all shadow-inner"
                     />
                     <button
                      type="button"
                      onClick={() => {
                        setFilterSearchTerm(searchTerm);
                        setSubmittedSearchTerm(searchTerm);
                      }}
                       className="absolute right-1 top-1 bottom-1 rounded-none bg-transparent px-3 text-cyan-100 transition hover:bg-white/10"
                     >
                       <Search className="h-6 w-6" />
                     </button>
                   </div>

                   <div className="flex items-center justify-center gap-1.5 overflow-x-auto max-w-full text-xs font-medium">
                     <span className="mr-2 text-white font-bold">Categories:</span>
                     {SEARCH_CATEGORIES.map((category) => {
                         const active = searchCategory === category;
                         return (
                           <button
                             key={category}
                             onClick={() => setSearchCategory(category)}
                             className={`px-2 py-1 transition cursor-pointer ${
                               active ? 'text-cyan-100 font-extrabold' : 'text-slate-400 hover:text-white'
                             }`}
                           >
                             {category}
                           </button>
                         );
                       })}
                   </div>
                   <div className="absolute right-6 top-4 md:right-12">
                     <button
                      type="button"
                      onClick={handleDisconnectOsu}
                         className="flex h-[50px] items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-xs font-mono uppercase text-slate-300 hover:bg-white/10 hover:text-white shrink-0"
                      title="Disconnect osu!"
                    >
                      <LogOut className="h-3 w-3" />
                      osu!
                     </button>
                   </div>
                 </div>

                 <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 min-h-0 bg-[#20212c]/70">
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
                       <p className="text-lg font-mono font-black uppercase tracking-widest text-white">Search a song!</p>
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
                             className={`bg-[#343543] border rounded-2xl overflow-hidden relative shadow-lg ${
                               isDownloaded
                                 ? 'border-emerald-400/40'
                                 : 'border-white/10'
                             }`}
                             onClick={() => revealSet(s.id)}
                           >
                             <div className="flex gap-3 p-2.5 min-h-[118px] items-stretch cursor-pointer">
                               <div className="h-[104px] w-[104px] shrink-0 self-center overflow-hidden rounded-xl bg-black/30">
                                 {s.coverUrl ? <img src={s.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" /> : <Music className="m-auto h-8 w-8 text-white/30" />}
                               </div>
                               <div className="flex-1 min-w-0 text-left py-1">
                                <h4 className="font-black text-lg text-white leading-tight truncate">
                                 {s.title}
                               </h4>
                               <p className="text-xs text-slate-200 font-bold truncate mt-1">
                                 {s.artist}
                               </p>
                               <p className="text-xs text-slate-300 truncate mt-1">Mapped by {s.creator || 'Unknown'}</p>
                               <div className="flex items-center gap-2 mt-3">
                                 <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase ${statusStyle(s.status)}`}>{s.status || 'graveyard'}</span>
                                 <span className="text-[10px] font-bold text-white/65">{charts.length} {charts.length === 1 ? 'difficulty' : 'difficulties'}</span>
                                 <ChevronDown className={`ml-auto h-4 w-4 text-white/60 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                               </div>
                               </div>
                               <div className="shrink-0 self-center pl-1" onClick={(event) => event.stopPropagation()}>
                                 {isDownloaded ? (
                                   <div className="flex flex-col items-center gap-0.5 text-emerald-300 shrink-0 select-none bg-emerald-500/10 border border-emerald-400/30 px-2.5 py-1.5 rounded-xl">
                                     <Check className="h-4 w-4" /><span className="text-[8px] font-mono font-black uppercase">READY</span>
                                   </div>
                                 ) : isDownloading ? (
                                   <div className="flex flex-col items-center gap-1 text-slate-300 shrink-0 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl animate-pulse">
                                     <Loader className="h-4 w-4 animate-spin" /><span className="text-[8px] font-mono uppercase font-black">{downloadProgress?.percentage || 0}%</span>
                                   </div>
                                 ) : isQueued ? (
                                   <div className="flex flex-col items-center gap-1 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-3 py-1.5 text-cyan-100">
                                     <Loader className="h-4 w-4" /><span className="text-[8px] font-mono font-black uppercase">QUEUED</span>
                                   </div>
                                 ) : (
                                   <button onClick={() => enqueueDownload(s)} className="p-3 bg-white/10 hover:bg-white text-white hover:text-slate-950 rounded-xl border border-white/15 hover:border-white transition duration-150 active:scale-95 flex items-center justify-center cursor-pointer" title="Queue map pack">
                                     <Download className="h-4 w-4" />
                                   </button>
                                 )}
                               </div>
                             </div>
                             {isDownloaded && <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-400" />}
                             {isDownloading && downloadProgress && <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30"><div className="h-full bg-emerald-300 transition-[width] duration-200" style={{ width: `${downloadProgress.percentage}%` }} /></div>}
                             {expanded && <div className="border-t border-white/10 bg-black/15 px-3 py-3 grid grid-cols-1 sm:grid-cols-2 gap-2" onClick={(event) => event.stopPropagation()}>
                               {charts.length > 0 ? charts.map((chart, index) => {
                                 const rating = Number(chart.starRating ?? 0);
                                 return <div key={`${chart.id}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2 text-xs text-white">
                                   <span className="truncate"><b className="text-cyan-100">{chart.keyCount ? `${chart.keyCount}K ` : ''}</b>{chart.version || chart.name || 'Unknown'}</span>
                                   <span className="shrink-0 rounded-md px-2 py-1 font-black text-[10px] text-black" style={{ background: difficultyColour(rating) }}>{rating.toFixed(2)}★</span>
                                 </div>;
                               }) : <span className="text-xs text-white/60">Difficulty details unavailable.</span>}
                             </div>}
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
                     <div className="py-16 px-8 flex flex-col items-center justify-center text-center text-slate-500 max-w-md mx-auto">
                       <Info className="h-8 w-8 mb-3 text-slate-600" />
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
