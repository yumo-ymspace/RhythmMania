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

import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, Upload, Sliders, Play, Compass, Info, Trash2,
  Loader, Cloud, CloudOff, FileText, Music,
  ChevronDown, Star, Check, SlidersHorizontal, Shuffle,
  Clock, Heart, Award, X, Infinity as InfinityIcon,
  SquareSlash, Rewind, FastForward, ArrowUpToLine, Keyboard, Sparkles
} from 'lucide-react';
import { Beatmap, GameSettings, PlayHistoryRecord } from '../types';
import { parseBeatmap, parseMediaPaths } from '../utils/beatmapParser';
import { isBrowserPlayableVideoFilename } from '../utils/assetLifecycle';
import { MAX_COMPRESSED_SIZE_BYTES, validateZipLimits, sanitizeHistoryRecord, sanitizeCssUrl, decodeBoundedUtf8, createZipExtractionBudget } from '../utils/securityLimits';
import { DEFAULT_SETTINGS } from './settings/defaultSettings';
import { storageManager } from '../utils/storageManager';
import { unpackBeatmap } from '../utils/unpackHelper';
import { computeBeatmapHash, hasCatalogIdentity } from '../utils/replayManager';
import { extractZipEntry } from '../utils/zipResolver';
import { LeaderboardReplayItem, fetchLeaderboardReplays, fetchReplayDetail } from '../utils/replayClient';
import { previewPlayer } from '../utils/previewPlayer';
import { resolveStarRating } from '../utils/starRating';
import { SCROLL_SPEED_MAX, SCROLL_SPEED_MIN } from './settings/defaultSettings';
import metadata from '../../metadata.json';
import { getCatalogSetMetadata } from '../utils/catalogSetMetadata';

const DEFAULT_SONG_BANNER = '/backgrounds/Ferineon.webp';

const MODIFIER_TILES = [
  {
    id: 'NF',
    name: 'No Fail',
    title: 'No Fail (NF)',
    multiplier: '0.50x',
    icon: InfinityIcon,
    activeClass: 'bg-emerald-500/25 text-emerald-300 shadow-[0_8px_24px_rgba(16,185,129,0.18)]',
    exclusiveWith: undefined
  },
  {
    id: 'EZ',
    name: 'Easy',
    title: 'Easy (EZ)',
    multiplier: '0.80x',
    icon: Sparkles,
    activeClass: 'bg-emerald-500/25 text-emerald-300 shadow-[0_8px_24px_rgba(16,185,129,0.18)]',
    exclusiveWith: 'HR'
  },
  {
    id: 'HT',
    name: 'Half Time',
    title: 'Half Time (HT)',
    multiplier: '0.50x',
    icon: Rewind,
    activeClass: 'bg-teal-500/25 text-teal-300 shadow-[0_8px_24px_rgba(20,184,166,0.18)]',
    exclusiveWith: 'DT'
  },
  {
    id: 'HR',
    name: 'Hard Rock',
    title: 'Hard Rock (HR)',
    multiplier: '1.10x',
    icon: ArrowUpToLine,
    activeClass: 'bg-rose-500/25 text-rose-300 shadow-[0_8px_24px_rgba(244,63,94,0.18)]',
    exclusiveWith: 'EZ'
  },
  {
    id: 'HD',
    name: 'Hidden',
    title: 'Hidden (HD)',
    multiplier: '1.15x',
    icon: SquareSlash,
    activeClass: 'bg-purple-500/25 text-purple-300 shadow-[0_8px_24px_rgba(168,85,247,0.18)]',
    exclusiveWith: undefined
  },
  {
    id: 'DT',
    name: 'Double Time',
    title: 'Double Time (DT)',
    multiplier: '1.25x',
    icon: FastForward,
    activeClass: 'bg-pink-500/25 text-pink-300 shadow-[0_8px_24px_rgba(236,72,153,0.18)]',
    exclusiveWith: 'HT'
  },
  {
    id: 'AT',
    name: 'Autoplay',
    title: 'Autoplay (AP)',
    multiplier: 'UNRANKED',
    icon: Sparkles,
    activeClass: 'bg-sky-500/25 text-sky-300 shadow-[0_8px_24px_rgba(14,165,233,0.18)]',
    exclusiveWith: undefined
  }
] as const;

interface SongSelectProps {
  settings: GameSettings;
  updateSettings: (s: Partial<GameSettings>) => void;
  onSelectMap: (map: Beatmap) => void;
  onOpenSettings: () => void;
  customMaps: Beatmap[];
  onImportBeatmap: (map: Beatmap) => void;
  onImportPackage: (packageId: string, name: string, blob: Blob, maps: Beatmap[]) => Promise<void>;
  onDeleteSongGroup?: (mapIds: string[]) => void;
  setSongSelectBgUrl?: (url: string) => void;
  onBack?: () => void;
  onOpenOnlineCatalog?: () => void;
  onWatchReplay?: (record: PlayHistoryRecord, beatmap?: Beatmap) => Promise<{ success: boolean; error?: string }> | void;
  onAddHistoryRecord?: (record: PlayHistoryRecord) => void;
  playHistory?: PlayHistoryRecord[];
  // When false (fresh app load), Song Select will not pre-select any map.
  // When true (returning from gameplay/replay), it resumes the last selected map.
  shouldAutoSelectOnMount?: boolean;
}

export default function SongSelect({
  settings,
  updateSettings,
  onSelectMap,
  onOpenSettings,
  customMaps,
  onImportBeatmap,
  onImportPackage,
  onDeleteSongGroup,
  setSongSelectBgUrl,
  onBack,
  onOpenOnlineCatalog,
  onWatchReplay,
  onAddHistoryRecord,
  playHistory = [],
  shouldAutoSelectOnMount = false,
}: SongSelectProps) {
  // Search & Basic UI State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCustomMapId, setSelectedCustomMapId] = useState<string>('');
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [lastSelectedDifficultyBySong, setLastSelectedDifficultyBySong] = useState<Record<string, string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('rhythm_mania_v1_last_diff_by_song');
        return saved ? JSON.parse(saved) : {};
      } catch (e) {
        console.warn('Failed to load last selected difficulty by song:', e);
      }
    }
    return {};
  });
  const lastSelectedDifficultyBySongRef = useRef(lastSelectedDifficultyBySong);
  lastSelectedDifficultyBySongRef.current = lastSelectedDifficultyBySong;
  const [unpackTrigger, setUnpackTrigger] = useState<number>(0);
  const [manualExpandedSongKey, setManualExpandedSongKey] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        const tag = document.activeElement?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') onOpenSettings();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onOpenSettings]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importStatus, setImportStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  
  const [songDeleteConfirmKey, setSongDeleteConfirmKey] = useState<string | null>(null);


  // High-fidelity options, filters, details state variables
  const [showPreplayOptions, setShowPreplayOptions] = useState<boolean>(false);
  const [minStar, setMinStar] = useState<number>(0.0);
  const [maxStar, setMaxStar] = useState<number>(10.0);
  const [sortBy, setSortBy] = useState<string>('Title');
  const [collectionFilter, setCollectionFilter] = useState<string>('Downloaded');
  const [openFilterMenu, setOpenFilterMenu] = useState<'sort' | 'star' | null>(null);
  const [localScores, setLocalScores] = useState<any[]>([]);
  const [showModsModal, setShowModsModal] = useState<boolean>(false);

  // Favorites: stable song-group keys persisted to localStorage
  const [favoriteSongs, setFavoriteSongs] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('rhythm_mania_v1_favorite_songs');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            return parsed
              .filter((k): k is string => typeof k === 'string' && k.length > 0 && k.length <= 300)
              .slice(0, 5000);
          }
        }
      } catch (e) {
        console.warn('Failed to load favorite songs:', e);
      }
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('rhythm_mania_v1_favorite_songs', JSON.stringify(favoriteSongs));
    } catch (e) {
      console.warn('Failed to save favorite songs:', e);
    }
  }, [favoriteSongs]);

  const toggleFavorite = (songKey: string) => {
    setFavoriteSongs(prev =>
      prev.includes(songKey) ? prev.filter(k => k !== songKey) : [...prev, songKey]
    );
  };

  // Handle ESC key to close mods menu
  useEffect(() => {
    if (!showModsModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowModsModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModsModal]);

  // Sync state for play history records of the selected beatmap
  useEffect(() => {
    try {
      const storedHistoryText = localStorage.getItem('rhythm_mania_v1_play_history');
      if (storedHistoryText) {
        const parsed = JSON.parse(storedHistoryText);
        if (Array.isArray(parsed)) {
          const sanitized = parsed
            .map(item => sanitizeHistoryRecord(item, DEFAULT_SETTINGS))
            .filter((item): item is any => item !== null);
          setLocalScores(sanitized);
        }
      }
    } catch (e) {
      console.warn('Failed to load performance score logs:', e);
    }
  }, [selectedCustomMapId, showPreplayOptions]);

  // Online Leaderboard Replays State
  const [onlineReplays, setOnlineReplays] = useState<LeaderboardReplayItem[]>([]);
  const [isLoadingOnlineReplays, setIsLoadingOnlineReplays] = useState<boolean>(false);
  const [onlineReplayError, setOnlineReplayError] = useState<string | null>(null);
  const [leaderboardTab, setLeaderboardTab] = useState<'online' | 'local'>('online');
  const [actionNotice, setActionNotice] = useState<{ id?: string; text: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [downloadingReplayId, setDownloadingReplayId] = useState<string | null>(null);
  const [watchingReplayId, setWatchingReplayId] = useState<string | null>(null);
  const leaderboardGeneration = useRef(0);

  // Clean raw local custom URL allocations prior to page reload/destruction
  useEffect(() => {
    return () => {
      // Intentionally NOT clearing blob URLs here, as those are required during gameplay and passed verbatim.
      // AssetLifecycleManager.clearAll(); (Removed to fix Audio Failed to Decode issues during handoff)
    };
  }, []);

  // Determine actual star rating dynamically
  const getStarRating = (map: any) => resolveStarRating(map);

  const getDifficultyColor = (rating: number) => {
    if (rating < 2.0) return 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20';
    if (rating < 3.0) return 'text-cyan-400 bg-cyan-500/10 border border-cyan-500/20';
    if (rating < 4.0) return 'text-amber-400 bg-amber-500/10 border border-amber-500/20';
    if (rating < 5.0) return 'text-orange-400 bg-orange-500/10 border border-orange-500/20';
    if (rating < 6.5) return 'text-rose-400 bg-rose-500/10 border border-rose-500/20';
    return 'text-purple-400 bg-purple-500/10 border border-purple-500/20';
  };

  // Resolve locally stored uploads and previously downloaded mirror maps.
  const mergedCustomMaps = React.useMemo((): Beatmap[] => {
    const resolvedCustomMaps: Beatmap[] = [];
    
    // 1. Incorporate local custom maps with media blob checks
    customMaps.forEach((map) => {
      const cached = storageManager.lruMediaCache.get(map.id);
      resolvedCustomMaps.push({
        ...map,
        audioUrl: cached?.audioUrl || map.audioUrl,
        videoUrl: cached?.videoUrl || map.videoUrl,
        bgUrl: cached?.bgUrl || map.bgUrl,
        isCached: true,
        mode: map.mode !== undefined ? map.mode : 3
      } as any);
    });

    return resolvedCustomMaps;
  }, [customMaps, unpackTrigger]);



  // Save selected map ID to local storage for persistent selection
  useEffect(() => {
    if (selectedCustomMapId) {
      localStorage.setItem('rhythm_mania_v1_last_selected_map_id', selectedCustomMapId);
    }
  }, [selectedCustomMapId]);

  const getArtistTitleKey = (map: any) => {
    const mapArtist = map.artist || 'Unknown';
    const mapTitle = map.title || 'Untitled';
    return `${mapArtist.toLowerCase().trim()} - ${mapTitle.toLowerCase().trim()}`;
  };

  const getMapSongKey = (map: any) => {
    const mapPkgId = map.parentPackageId || (map.packageId ? map.packageId.replace(/^pkg_/, '') : undefined);
    if (mapPkgId) return `package_${mapPkgId}`;
    // Standalone imports have no package identity. Keep same-name imports
    // separate instead of collapsing them into one song group.
    return map.id ? `local_map_${map.id}` : getArtistTitleKey(map);
  };

  const getSlimCoverUrl = (map: any): string | undefined => {
    const mapCoverUrl = typeof map?.coverUrl === 'string' ? map.coverUrl : undefined;
    if (mapCoverUrl) return mapCoverUrl;

    const sourceSetId = Number(
      map?.sourceSetId || String(map?.catalogSetId || '').replace(/^osuapi_/, ''),
    );
    if (!Number.isInteger(sourceSetId) || sourceSetId < 1) return undefined;

    return getCatalogSetMetadata(sourceSetId)?.slimCoverUrl
      || `https://assets.ppy.sh/beatmaps/${sourceSetId}/covers/slimcover@2x.jpg`;
  };

  // Filter and prepare display beatmaps
  const filteredCustomMaps = React.useMemo(() => {
    return mergedCustomMaps.filter(map => {
       // Song Select exposes osu!mania charts only.
       if (map.mode !== undefined && map.mode !== 3) return false;

      // Filter by search text query
      const matchesSearch = map.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            map.artist.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (map.creator && map.creator.toLowerCase().includes(searchTerm.toLowerCase()));
      if (!matchesSearch) return false;

      // Filter by dynamic star limits
      const rating = getStarRating(map);
      if (rating < minStar || rating > maxStar) return false;

      // Filter by collection
      if (collectionFilter === 'Favorites') {
        if (!favoriteSongs.includes(getMapSongKey(map))) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'Title') return a.title.localeCompare(b.title);
      if (sortBy === 'Artist') return a.artist.localeCompare(b.artist);
      if (sortBy === 'Difficulty') return getStarRating(b) - getStarRating(a);
      if (sortBy === 'BPM') return (b.bpm || 0) - (a.bpm || 0);
      if (sortBy === 'Length') return (b.duration || 0) - (a.duration || 0);
      if (sortBy === 'Date Added') {
        const delta = ((b as any).importedAt || 0) - ((a as any).importedAt || 0);
        return delta !== 0 ? delta : a.title.localeCompare(b.title);
      }
      return 0;
    });
  }, [mergedCustomMaps, searchTerm, minStar, maxStar, collectionFilter, sortBy, favoriteSongs]);

  const persistLastDifficultyForMap = (map: any) => {
    if (!map?.id) return;
    const keys = new Set<string>([getMapSongKey(map), getArtistTitleKey(map)]);
    if (map.parentPackageId) keys.add(`package_${map.parentPackageId}`);
    if (map.packageId) keys.add(`package_${String(map.packageId).replace(/^pkg_/, '')}`);
    // Difficulty name fallback (used when map ids are rebuilt on re-import)
    const metaKey = `diffname:${getArtistTitleKey(map)}`;

    setLastSelectedDifficultyBySong(prev => {
      const updated = { ...prev };
      keys.forEach((k) => { updated[k] = map.id; });
      if (map.difficulty) updated[metaKey] = String(map.difficulty);
      lastSelectedDifficultyBySongRef.current = updated;
      try {
        localStorage.setItem('rhythm_mania_v1_last_diff_by_song', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to save last selected difficulty by song:', e);
      }
      return updated;
    });
  };

  // Save selected difficulty for the song
  useEffect(() => {
    if (selectedCustomMapId) {
      const selectedMap = mergedCustomMaps.find(m => m.id === selectedCustomMapId);
      if (selectedMap) {
        persistLastDifficultyForMap(selectedMap);
      }
    }
  }, [selectedCustomMapId, mergedCustomMaps]);

  // Load last selected map ID on mount/update if none is currently selected.
  // Suppressed on fresh app loads (shouldAutoSelectOnMount === false) so the
  // user starts with a clean, unselected Song Select; only returns from a
  // finished/quit gameplay session opt into auto-resuming the last played map.
  useEffect(() => {
    if (!shouldAutoSelectOnMount) return;
    if (!selectedCustomMapId && filteredCustomMaps.length > 0) {
      const savedLastId = localStorage.getItem('rhythm_mania_v1_last_selected_map_id');
      if (savedLastId) {
        const exists = filteredCustomMaps.some(m => m.id === savedLastId);
        if (exists) {
          const savedMap = filteredCustomMaps.find(m => m.id === savedLastId);
          if (savedMap) {
            handleSelectCustomMap(savedMap);
            return;
          }
        }
      }

      const defaultMap = filteredCustomMaps[0];
      if (defaultMap) {
        handleSelectCustomMap(defaultMap);
      }
    }
  }, [filteredCustomMaps, selectedCustomMapId, shouldAutoSelectOnMount]);

  // Group maps by normalized artist & title
  const songGroups = React.useMemo(() => {
    const groupsMap = new Map<string, {
      songKey: string;
      title: string;
      artist: string;
      creator?: string;
      coverUrl?: string;
      packageId?: string;
      bgUrl?: string;
      difficultiesSummary?: string[];
      maps: typeof filteredCustomMaps;
    }>();

    filteredCustomMaps.forEach((map) => {
      const songKey = getMapSongKey(map);
      
      let group = groupsMap.get(songKey);
      if (!group) {
        const mapTitle = map.title || 'Untitled';
        const mapArtist = map.artist || 'Unknown';
        group = {
          songKey,
          title: mapTitle,
          artist: mapArtist,
          creator: map.creator || (map as any).creator,
            coverUrl: getSlimCoverUrl(map),
          packageId: (map as any).packageId,
          bgUrl: map.bgUrl,
          difficultiesSummary: (map as any).difficultiesSummary || (map as any).difficultsSummary || [],
          maps: []
        };
        groupsMap.set(songKey, group);
      } else {
        if (!group.bgUrl && map.bgUrl) group.bgUrl = map.bgUrl;
        if (!group.coverUrl) group.coverUrl = getSlimCoverUrl(map);
        if (!group.creator && map.creator) group.creator = map.creator;
      }
      
      const mapDiffs = (map as any).difficultiesSummary || (map as any).difficultsSummary;
      if (mapDiffs && mapDiffs.length > (group.difficultiesSummary?.length || 0)) {
        group.difficultiesSummary = mapDiffs;
      }
      
      group.maps.push(map);
    });

    return Array.from(groupsMap.values());
  }, [filteredCustomMaps]);

  const activeSongKey = React.useMemo(() => {
    const selected = filteredCustomMaps.find(m => m.id === selectedCustomMapId);
    if (!selected) return '';
    return getMapSongKey(selected);
  }, [selectedCustomMapId, filteredCustomMaps]);

  const expandedSongKey = manualExpandedSongKey !== null ? manualExpandedSongKey : activeSongKey;

  const resolveGroupTargetMap = (group: any) => {
    const pool: any[] = [];
    const seen = new Set<string>();
    const pushAll = (maps: any[] | undefined) => {
      (maps || []).forEach((m) => {
        if (m?.id && !seen.has(m.id)) {
          seen.add(m.id);
          pool.push(m);
        }
      });
    };
    pushAll(group.maps);
    // Include unfiltered sibling diffs (star/search filters can hide the last-picked difficulty from group.maps)
    const artistTitleKey = getArtistTitleKey(group);
    mergedCustomMaps.forEach((m) => {
      if (getMapSongKey(m) === group.songKey || (group.songKey === artistTitleKey && getArtistTitleKey(m) === artistTitleKey)) {
        pushAll([m]);
      }
    });

    if (pool.length === 0) return null;

    const memory = lastSelectedDifficultyBySongRef.current;
    const candidateIds = [
      memory[group.songKey],
      memory[artistTitleKey],
      group.packageId ? memory[`package_${String(group.packageId).replace(/^pkg_/, '')}`] : undefined,
    ].filter(Boolean) as string[];

    for (const savedMapId of candidateIds) {
      const found = pool.find((m) => m.id === savedMapId);
      if (found) return found;
    }

    const savedDiffName = memory[`diffname:${artistTitleKey}`];
    if (savedDiffName) {
      const byName = pool.find((m) => String(m.difficulty || '') === savedDiffName);
      if (byName) return byName;
    }

    // Prefer keeping the currently selected difficulty when re-clicking the active group
    const current = pool.find((m) => m.id === selectedCustomMapId);
    if (current) return current;

    return pool[0];
  };

  const handleSelectGroup = (group: any) => {
    const targetMap = resolveGroupTargetMap(group);

    if (expandedSongKey === group.songKey) {
      setManualExpandedSongKey('');
    } else {
      setManualExpandedSongKey(group.songKey);
      if (targetMap) {
        handleSelectCustomMap(targetMap);
      }
    }
  };

  const selectedCustomMap = mergedCustomMaps.find(m => m.id === selectedCustomMapId) || null;
  // Catalog identity is enough to show the leaderboard shell. Verified server
  // status remains separate and is enforced by replay upload verification.
  const isServerLeaderboardMap = hasCatalogIdentity(selectedCustomMap);
  const leaderboardChartRevisionId = isServerLeaderboardMap && selectedCustomMap
    ? typeof (selectedCustomMap as any).chartRevisionId === 'string' ? (selectedCustomMap as any).chartRevisionId : ''
    : '';

  useEffect(() => {
    setLeaderboardTab(isServerLeaderboardMap ? 'online' : 'local');
  }, [selectedCustomMapId, isServerLeaderboardMap]);

  // Fetch online replays for current selected beatmap difficulty
  useEffect(() => {
    if (!selectedCustomMapId || !isServerLeaderboardMap) {
      setOnlineReplays([]);
      setOnlineReplayError(null);
      setIsLoadingOnlineReplays(false);
      return;
    }

    if (!leaderboardChartRevisionId) {
      setOnlineReplays([]);
      setOnlineReplayError(null);
      setIsLoadingOnlineReplays(false);
      return;
    }

    const generation = ++leaderboardGeneration.current;
    const controller = new AbortController();

    setIsLoadingOnlineReplays(true);
    setOnlineReplayError(null);

    fetchLeaderboardReplays(leaderboardChartRevisionId, controller.signal).then((res) => {
      if (generation !== leaderboardGeneration.current || controller.signal.aborted) return;
      setIsLoadingOnlineReplays(false);
      if (res.success) {
        setOnlineReplays(res.replays);
        setOnlineReplayError(null);
      } else {
        setOnlineReplays([]);
        setOnlineReplayError(res.error || 'Failed to load online replays');
      }
    });
    return () => {
      controller.abort();
      leaderboardGeneration.current++;
    };
  }, [selectedCustomMapId, leaderboardChartRevisionId, isServerLeaderboardMap]);

  const handleDownloadOnlineReplay = async (replayId: string) => {
    const replayItem = onlineReplays.find((replay) => replay.id === replayId);
    if (!replayItem?.isOwn) {
      setActionNotice({ id: replayId, text: 'Only your own scores can be downloaded to Local History.', type: 'error' });
      return;
    }

    setDownloadingReplayId(replayId);
    setActionNotice({ id: replayId, text: 'Downloading replay file...', type: 'info' });

    const res = await fetchReplayDetail(replayId, undefined, 'download');
    setDownloadingReplayId(null);

    if (!res.success || !res.record) {
      setActionNotice({ id: replayId, text: res.error || 'Failed to download replay data', type: 'error' });
      return;
    }

    const record = res.record;

    if (onAddHistoryRecord) {
      onAddHistoryRecord(record);
      setLocalScores(prev => (
        prev.some((existing) => existing.id === record.id)
          ? prev
          : [record, ...prev]
      ));
    } else {
      try {
        const storedHistoryText = localStorage.getItem('rhythm_mania_v1_play_history');
        let currentHistory: any[] = [];
        if (storedHistoryText) {
          currentHistory = JSON.parse(storedHistoryText);
        }
        if (!currentHistory.some((r: any) => r.id === record.id)) {
          const updated = [record, ...currentHistory];
          localStorage.setItem('rhythm_mania_v1_play_history', JSON.stringify(updated));
          setLocalScores(updated);
        }
      } catch (e) {
        console.warn('Failed to save replay to local history:', e);
      }
    }

    setActionNotice({ id: replayId, text: 'Replay downloaded to Local History!', type: 'success' });
    setTimeout(() => setActionNotice(null), 3000);
  };

  const handleWatchOnlineReplay = async (replayItem: LeaderboardReplayItem) => {
    setWatchingReplayId(replayItem.id);
    setActionNotice({ id: replayItem.id, text: 'Preparing replay playback...', type: 'info' });

    const res = await fetchReplayDetail(replayItem.id);

    if (!res.success || !res.record) {
      setWatchingReplayId(null);
      setActionNotice({ id: replayItem.id, text: res.error || 'Failed to load replay details', type: 'error' });
      return;
    }

    const record = res.record;

    if (onWatchReplay) {
      const currentMap = mergedCustomMaps.find(m => m.id === selectedCustomMapId);
      const targetMap = currentMap && (currentMap.id === record.beatmapId || (currentMap as any).catalogMapId === record.catalogMapId)
        ? currentMap
        : undefined;

      const watchRes = await onWatchReplay(record, targetMap);
      setWatchingReplayId(null);

      if (watchRes && !watchRes.success) {
        setActionNotice({ id: replayItem.id, text: watchRes.error || 'Failed to launch replay playback', type: 'error' });
      } else {
        setActionNotice(null);
      }
    } else {
      setWatchingReplayId(null);
      setActionNotice({ id: replayItem.id, text: 'Replay playback is unavailable in this view', type: 'error' });
    }
  };

  // Background cover images (Always ensure we have a beautiful wallpaper background with vibrant, lively colors)
  const selectBgUrl = selectedCustomMap?.bgUrl || '';

  const defaultRandomBgRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (typeof setSongSelectBgUrl === 'function') {
      if (selectBgUrl && selectBgUrl !== '/backgrounds/default.svg' && selectBgUrl !== '/backgrounds/Ferineon.webp') {
        setSongSelectBgUrl(selectBgUrl);
      } else if (!selectedCustomMap) {
        if (!defaultRandomBgRef.current) {
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
          defaultRandomBgRef.current = bgs[Math.floor(Math.random() * bgs.length)];
        }
        setSongSelectBgUrl(`/backgrounds/${defaultRandomBgRef.current}`);
      }
    }
  }, [selectBgUrl, selectedCustomMap, setSongSelectBgUrl, unpackTrigger]);

  const selectedGroup = React.useMemo(() => {
    if (!selectedCustomMap) return null;
    const songKey = getMapSongKey(selectedCustomMap);
    return songGroups.find(g => g.songKey === songKey) || null;
  }, [selectedCustomMap, songGroups]);

  // Extract all compiled difficulties for the currently selected track regardless of star thresholds/filter bounds
  const currentSongMaps = React.useMemo(() => {
    if (!selectedCustomMap) return [];
    const songKey = getMapSongKey(selectedCustomMap);
    return mergedCustomMaps.filter(m => getMapSongKey(m) === songKey);
  }, [selectedCustomMap, mergedCustomMaps]);

  const availableKeyCounts = React.useMemo(() => {
    return Array.from(new Set(currentSongMaps.map(m => m.keyCount).filter(Boolean)));
  }, [currentSongMaps]);

  // Automatically remove conflicting key change mods when switching to a song group that has native difficulties for those keys
  useEffect(() => {
    const activeMods = settings.selectedMods || [];
    const activeKeyChangeMod = activeMods.find(m => /^K[2-9]$/.test(m));
    
    if (activeKeyChangeMod) {
      const keyCount = parseInt(activeKeyChangeMod.substring(1), 10);
      if (availableKeyCounts.includes(keyCount)) {
        const newMods = activeMods.filter(m => m !== activeKeyChangeMod);
        if (newMods.length !== activeMods.length) {
          updateSettings({ selectedMods: newMods });
        }
      }
    }
  }, [availableKeyCounts, settings.selectedMods, updateSettings]);


  // Core map asset extraction and mounting
  const handleSelectCustomMap = async (map: Beatmap, forceUnpack = false) => {
    const wantsVideo = isBrowserPlayableVideoFilename((map as any).videoFilename || '');
    const cacheReady = (c: { audioUrl: string; videoUrl: string; bgUrl: string } | null) =>
      !!(c?.audioUrl && c?.bgUrl && (!wantsVideo || c.videoUrl));

    if (map.id === selectedCustomMapId) {
      const cached = storageManager.lruMediaCache.get(map.id);
      if (cacheReady(cached)) {
        map.audioUrl = cached!.audioUrl;
        map.bgUrl = cached!.bgUrl;
        map.videoUrl = cached!.videoUrl || '';
      }
      if (!forceUnpack && cacheReady(cached)) {
        return;
      }
    }
    
    setSelectedCustomMapId(map.id);
    persistLastDifficultyForMap(map);
    
    try {
      await unpackBeatmap(map, forceUnpack);
      const cached = storageManager.lruMediaCache.get(map.id);
      if (cached) {
        map.audioUrl = cached.audioUrl || map.audioUrl;
        map.bgUrl = cached.bgUrl || map.bgUrl;
        map.videoUrl = cached.videoUrl || map.videoUrl;
      }
      setUnpackTrigger(prev => prev + 1);
    } catch (err) {
      console.warn('Unpacker encountered an issue resolving map media channels:', err);
    }
  };

  // Song preview: play audio for the currently selected map once its media has
  // been unpacked (blob URL available).
  const isStartingPlayRef = useRef(false);

  useEffect(() => {
    if (isStartingPlayRef.current) return;
    if (!settings.enableSongPreview || !selectedCustomMapId) {
      previewPlayer.stop();
      return;
    }
    const map = mergedCustomMaps.find(m => m.id === selectedCustomMapId);
    if (!map?.audioUrl || !map.audioUrl.startsWith('blob:')) {
      previewPlayer.stop();
      return;
    }
    const previewMs = (map.previewTime != null && map.previewTime >= 0)
      ? map.previewTime
      : (map.duration || 180) * 1000 * 0.4;
    previewPlayer.play(map.audioUrl, previewMs, settings.musicVolume * settings.previewVolume * settings.masterVolume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomMapId, unpackTrigger, mergedCustomMaps, settings.enableSongPreview, settings.previewVolume, settings.masterVolume]);

  // Keep preview volume in sync with the music volume setting
  useEffect(() => {
    previewPlayer.setVolume(settings.musicVolume * settings.previewVolume * settings.masterVolume);
  }, [settings.musicVolume, settings.previewVolume, settings.masterVolume]);

  // Stop preview when leaving Song Select
  useEffect(() => () => previewPlayer.stop(), []);

  const handleStartPlay = async (mapOverride?: Beatmap) => {
    const activeMap = mapOverride || selectedCustomMap;
    if (activeMap) {
      isStartingPlayRef.current = true;
      previewPlayer.stopImmediately();

      const isMobileDevice = typeof window !== 'undefined' && (
        window.innerWidth <= 1024 && (
          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
          window.innerWidth <= 768 ||
          window.innerHeight < 500
        )
      );

      if (isMobileDevice) {
        const elem = document.documentElement;
        try {
          if (elem.requestFullscreen) {
            elem.requestFullscreen().catch(err => console.log('Fullscreen rejected:', err));
          } else if ((elem as any).webkitRequestFullscreen) {
            (elem as any).webkitRequestFullscreen();
          }
        } catch (fullscreenErr) {
          console.warn('Browser standard fullscreen is unsupported inside frames:', fullscreenErr);
        }
      }

      try {
        await handleSelectCustomMap(activeMap, true);
      } catch (e) {
        console.error('Failed unpacking media prior to gameplay:', e);
      }
      // Forced unpacking can retrigger the preview effect while this handler
      // is awaiting media. Invalidate any preview again at the handoff point.
      previewPlayer.stopImmediately();
      onSelectMap(activeMap);
    }
  };

  // Uploader drag and drop events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      await processImportedFile(file);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      await processImportedFile(file);
    }
  };

  const processImportedFile = async (file: File) => {
    const isZip = file.name.toLowerCase().endsWith('.osz') || file.name.toLowerCase().endsWith('.zip');
    const isSingleOsu = file.name.toLowerCase().endsWith('.osu');

    if (!isZip && !isSingleOsu) {
      setImportStatus({ type: 'err', msg: 'Supports beatmap or compressed .osz game files.' });
      return;
    }

    setImportStatus({ type: 'ok', msg: `Decompressing & importing ${file.name}...` });

    try {
      if (isSingleOsu) {
        const text = decodeBoundedUtf8(await file.arrayBuffer(), 'Beatmap text');
        const customId = `local_diff_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const parsedMap = parseBeatmap(text, customId);
        if (parsedMap.notes.length === 0) {
          throw new Error('Beatmap has no playable hit notes.');
        }
        const media = parseMediaPaths(text);
        
        const mapWithMeta = parsedMap as any;
        mapWithMeta.audioFilename = media.audioFilename;
        mapWithMeta.videoFilename = media.videoFilename;
        mapWithMeta.bgFilename = media.bgFilename;
        mapWithMeta.originalContent = text;
        mapWithMeta.isServerMap = false;
        mapWithMeta.catalogSetId = null;
        mapWithMeta.catalogMapId = null;
        mapWithMeta.beatmapHash = computeBeatmapHash(parsedMap);

        onImportBeatmap(parsedMap);
        setImportStatus({ type: 'ok', msg: `Successfully imported "${parsedMap.title}" - [${parsedMap.difficulty}] difficulty!` });
        setSelectedCustomMapId(parsedMap.id);
      } else {
        if (file.size > MAX_COMPRESSED_SIZE_BYTES) {
          throw new Error(`Security Exception: Uploaded file size exceeds limit (${(file.size / (1024 * 1024)).toFixed(1)} MB, limit: ${(MAX_COMPRESSED_SIZE_BYTES / (1024 * 1024)).toFixed(1)} MB)`);
        }
        const zip = await JSZip.loadAsync(file);
        validateZipLimits(zip);
        
         const extractionBudget = createZipExtractionBudget();
         const fileNames = Object.keys(zip.files);
        const beatmapFiles: { name: string; content: string }[] = [];

        for (const name of fileNames) {
          if (name.toLowerCase().endsWith('.osu') && !zip.files[name].dir) {
             const raw = await extractZipEntry(zip.files[name], name, extractionBudget);
             const content = decodeBoundedUtf8(raw, `Beatmap file ${name}`);
            beatmapFiles.push({ name, content });
          }
        }

        if (beatmapFiles.length === 0) {
          throw new Error('Empty package structure. No beatmap files discovered.');
        }

         const packageId = `pkg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
         const stagedMaps: Beatmap[] = [];
         let successCount = 0;
        let lastId = '';

        for (let i = 0; i < beatmapFiles.length; i++) {
          const beatmapStr = beatmapFiles[i];
          const mapId = `${packageId}_idx${i}`;
          const parsedMap = parseBeatmap(beatmapStr.content, mapId);

          if (parsedMap.notes.length > 0) {
            const media = parseMediaPaths(beatmapStr.content);
            const mapWithMeta = parsedMap as any;
            mapWithMeta.packageId = packageId;
            mapWithMeta.audioFilename = media.audioFilename;
            mapWithMeta.videoFilename = media.videoFilename;
            mapWithMeta.bgFilename = media.bgFilename;
            mapWithMeta.originalContent = beatmapStr.content;
            mapWithMeta.isCached = true;
            mapWithMeta.isServerMap = false;
            mapWithMeta.catalogSetId = null;
            mapWithMeta.catalogMapId = null;
            mapWithMeta.beatmapHash = computeBeatmapHash(parsedMap);

             stagedMaps.push(parsedMap);
            successCount++;
            lastId = parsedMap.id;
          }
        }

        if (successCount > 0) {
           await onImportPackage(packageId, file.name, file, stagedMaps);
           setImportStatus({ type: 'ok', msg: `Successfully unpacked ${successCount} playable difficulties!` });
          if (lastId) setSelectedCustomMapId(lastId);
        } else {
          throw new Error('No playable difficulties found in package.');
        }
      }
    } catch (err: unknown) {
      setImportStatus({ type: 'err', msg: err instanceof Error ? err.message : 'Failure processing package structure.' });
    } finally {
      setTimeout(() => setImportStatus(null), 5000);
    }
  };

  const handleSelectRandom = () => {
    if (filteredCustomMaps.length > 0) {
      const randomIndex = Math.floor(Math.random() * filteredCustomMaps.length);
      handleSelectCustomMap(filteredCustomMaps[randomIndex]);
    }
  };

  const toggleModifier = (id: string, exclusiveWith?: string) => {
    const activeMods = settings.selectedMods || [];
    if (activeMods.includes(id)) {
      updateSettings({ selectedMods: activeMods.filter((mod) => mod !== id) });
      return;
    }

    const nextMods = exclusiveWith
      ? activeMods.filter((mod) => mod !== exclusiveWith)
      : [...activeMods];
    nextMods.push(id);
    updateSettings({ selectedMods: nextMods });
  };

  const toggleKeyModifier = (keyCount: number) => {
    const id = `K${keyCount}`;
    const activeMods = settings.selectedMods || [];
    const nextMods = activeMods.includes(id)
      ? activeMods.filter((mod) => mod !== id)
      : [...activeMods.filter((mod) => !/^K[2-9]$/.test(mod)), id];
    updateSettings({ selectedMods: nextMods });
  };

  const handleDeleteSelectedSet = () => {
    if (!selectedCustomMap || !onDeleteSongGroup) return;
    const songKey = getMapSongKey(selectedCustomMap);
    const mapIds = mergedCustomMaps
      .filter((map) => getMapSongKey(map) === songKey)
      .map((map) => map.id);
    if (songDeleteConfirmKey === songKey) {
      void onDeleteSongGroup(mapIds);
      setSelectedCustomMapId('');
      setSongDeleteConfirmKey(null);
    } else {
      setSongDeleteConfirmKey(songKey);
    }
  };

  // Extract selected beatmap statistics
  const currentStarRating = selectedCustomMap ? getStarRating(selectedCustomMap) : 0.0;
  if (isMobile) {
    return (
      <div className="relative w-full h-[calc(100vh_-_64px)] text-slate-100 font-sans select-none overflow-hidden flex flex-col bg-transparent px-4 py-3 gap-3">
        {/* BACKGROUND EFFECT LAYER */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] pointer-events-none z-0" />

        {/* 1. SELECTED SONG CARD */}
        {selectedCustomMap ? (
           <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c12]/70 backdrop-blur-md p-4 flex flex-col gap-3 shadow-2xl z-10 shrink-0">
            {/* Ambient Background Glow of Current Artwork */}
            {selectBgUrl && (
              <div 
                className="absolute inset-0 bg-cover bg-center opacity-10 blur-xl scale-110 pointer-events-none"
                style={{ backgroundImage: `url("${sanitizeCssUrl(selectBgUrl)}")` }}
              />
            )}

            {/* Song Cover & Text Info Row */}
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-14 h-14 rounded-xl border border-white/10 bg-slate-900/80 overflow-hidden flex items-center justify-center shrink-0 shadow-md">
                {selectBgUrl ? (
                  <img src={selectBgUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" alt="Artwork" />
                ) : (
                  <Music className="h-6 w-6 text-pink-500" />
                )}
              </div>
              <div className="flex-1 min-w-0 text-left flex flex-col justify-center">
                <span className="text-[10px] uppercase font-mono tracking-widest text-pink-500 font-black leading-none mb-1">
                  {selectedCustomMap.artist || 'Unknown Artist'}
                </span>
                <h2 className="font-sans font-black text-base text-white tracking-tight truncate leading-tight">
                  {selectedCustomMap.title}
                </h2>
                <span className="text-[10px] text-slate-400 font-mono uppercase mt-0.5 tracking-wide">
                  mapped by {selectedCustomMap.creator || 'alevi'}
                </span>
              </div>
            </div>

            {/* Controls Row: Difficulty Selector & Big Play Button */}
            <div className="flex items-center justify-between gap-3 relative z-10">
              {/* Custom styled capsule difficulty dropdown */}
              <div className="flex-1 min-w-0">
                <select 
                  value={selectedCustomMap.id}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    const foundMap = currentSongMaps.find(m => m.id === selectedId);
                    if (foundMap) {
                      handleSelectCustomMap(foundMap);
                    }
                  }}
                  className="w-full bg-[#12121a] border border-white/10 px-3 py-2.5 rounded-xl text-xs font-mono font-bold text-slate-200 outline-none focus:border-pink-500 transition-all cursor-pointer shadow-lg appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%25239cbdca%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:10px_10px] bg-[right_12px_center] bg-no-repeat pr-8"
                >
                  {[...currentSongMaps].sort((a, b) => getStarRating(a) - getStarRating(b)).map((map) => {
                    const rating = getStarRating(map);
                    return (
                      <option key={map.id} value={map.id} className="bg-[#0c0c12] text-slate-100">
                        {map.difficulty} (★ {rating.toFixed(2)})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Big Solid Pink PLAY Button */}
              <button
                onClick={() => handleStartPlay()}
                 className="px-6 py-2.5 bg-pink-500/80 hover:bg-pink-500 active:brightness-90 active:scale-95 text-slate-950 font-sans font-black text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-pink-500/20 flex items-center justify-center gap-1.5 transform transition duration-150 cursor-pointer border border-white/10 select-none shrink-0"
              >
                <Play className="h-4 w-4 fill-current text-slate-950" />
                <span>PLAY</span>
              </button>
              {selectedCustomMap && onDeleteSongGroup && (
                <button
                  onClick={handleDeleteSelectedSet}
                   className={`px-3 py-2.5 rounded-xl border text-[10px] font-sans font-black uppercase tracking-wider transition ${songDeleteConfirmKey === getMapSongKey(selectedCustomMap) ? 'border-rose-500 bg-rose-500/80 text-rose-100' : 'border-white/10 bg-[#12121a]/80 text-slate-300 hover:border-rose-500/50 hover:text-rose-200'}`}
                >
                  {songDeleteConfirmKey === getMapSongKey(selectedCustomMap) ? 'Confirm Delete' : 'Delete Set'}
                </button>
              )}
            </div>

          </div>
          ) : (
           <div className="rounded-2xl border border-white/10 bg-[#0c0c12]/70 backdrop-blur-md p-6 text-center shadow-2xl z-10 shrink-0">
             <p className="text-xs text-slate-400 font-mono uppercase font-bold tracking-wider">No song selected</p>
             {onOpenOnlineCatalog && (
               <button
                 type="button"
                 onClick={onOpenOnlineCatalog}
                 className="mt-3 inline-flex items-center gap-2 rounded-xl border border-cyan-400/35 bg-cyan-400/80 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-cyan-950 transition hover:bg-cyan-400"
               >
                 <Search className="h-3.5 w-3.5" /> Beatmap Listing
               </button>
             )}
             <button
               onClick={() => fileInputRef.current?.click()}
               className="inline-flex items-center gap-2 rounded-xl border border-pink-500/35 bg-pink-500/80 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-pink-100 transition hover:bg-pink-500"
            >
              <Upload className="h-3.5 w-3.5" /> Import Songs
            </button>
            <input ref={fileInputRef} type="file" accept=".osu,.osz,.zip" onChange={handleFileSelect} className="hidden" />
          </div>
        )}

        {/* 2. SEARCH & FIND ONLINE BEATMAPS ACTION ROW */}
        <div className="flex items-center gap-2 z-10 shrink-0">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-400" />
            <input 
              type="text"
              placeholder="Search tracks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-[#0f0e15] border border-white/10 rounded-xl font-sans text-xs text-white placeholder-slate-500 focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/30 transition-all shadow-lg"
            />
          </div>

          {onOpenOnlineCatalog && (
            <button
              onClick={onOpenOnlineCatalog}
               className="px-3.5 py-2.5 bg-[#12121a]/80 hover:brightness-110 active:scale-95 border border-pink-500/35 rounded-xl text-[10px] font-sans font-black tracking-wider text-white uppercase flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-all shrink-0"
            >
              <Compass className="h-3.5 w-3.5 text-pink-500 animate-pulse shrink-0" />
              <span>ONLINE MAPS</span>
            </button>
          )}
        </div>

        {/* 3. AVAILABLE TRACKS HEADING */}
        <div className="flex items-center justify-between text-[10px] font-mono font-black text-slate-400 tracking-wider uppercase z-10 px-1 shrink-0">
          <span>AVAILABLE TRACKS</span>
          <span className="text-pink-400 font-bold bg-pink-550/10 px-2 py-0.5 rounded border border-pink-500/10">{songGroups.length} groups</span>
        </div>

        {/* 4. HIGH-DENSITY SCROLLABLE BEATMAP LIST */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-2 z-10 pb-[90px] pr-0.5 min-h-0">
          {songGroups.length > 0 ? (
            songGroups.map((group) => {
              const isGroupActive = selectedGroup?.songKey === group.songKey;
              const activeMap = group.maps[0];
              const rating = activeMap ? getStarRating(activeMap) : 0.0;

              return (
                <div 
                  key={group.songKey}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isGroupActive}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleSelectGroup(group);
                    }
                  }}
                  onClick={() => handleSelectGroup(group)}
                  className={`group relative border rounded-xl overflow-hidden cursor-pointer select-none transition-all p-3 flex items-center justify-between gap-3 shadow-md active:scale-[0.99] duration-150 ${
                    isGroupActive
                      ? 'border-pink-500 bg-pink-500/5 shadow-[0_0_15px_rgba(236,72,153,0.15)] text-pink-400'
                      : 'border-white/[0.05] bg-[#0c0c12]/85 hover:bg-[#12121a]/90 hover:border-white/10 text-slate-100'
                  }`}
                >
                   {group.coverUrl ? (
                     <img
                       src={group.coverUrl}
                       className="absolute inset-0 h-full w-full object-cover opacity-15 blur-sm pointer-events-none"
                       referrerPolicy="no-referrer"
                       alt=""
                     />
                   ) : group.bgUrl && (
                     <div 
                       className="absolute inset-0 bg-cover bg-center opacity-5 blur-sm pointer-events-none"
                       style={{ backgroundImage: `url("${sanitizeCssUrl(group.bgUrl)}")` }}
                     />
                   )}

                  <div className="flex items-center gap-3 relative z-10 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-slate-900 border border-white/5 overflow-hidden flex items-center justify-center shrink-0">
                       {group.coverUrl || group.bgUrl ? (
                         <img src={group.coverUrl || group.bgUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" alt="" />
                      ) : (
                        <Music className="h-4 w-4 text-pink-500" />
                      )}
                    </div>
                    <div className="text-left min-w-0 flex-1">
                      <h4 className="font-bold font-sans text-sm text-white tracking-tight truncate leading-snug">
                        {group.title}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-mono truncate uppercase mt-0.5">
                        {group.artist || 'Unknown Artist'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 z-10 select-none">
                   <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${getDifficultyColor(rating)}`}>
                      ★ {rating.toFixed(1)}
                    </span>
                    {onDeleteSongGroup && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (songDeleteConfirmKey === group.songKey) {
                             void onDeleteSongGroup(mergedCustomMaps.filter((map) => getMapSongKey(map) === group.songKey).map((map) => map.id));
                            if (group.maps.some((map) => map.id === selectedCustomMapId)) setSelectedCustomMapId('');
                            setSongDeleteConfirmKey(null);
                          } else {
                            setSongDeleteConfirmKey(group.songKey);
                          }
                        }}
                        title={songDeleteConfirmKey === group.songKey ? 'Confirm delete beatmap set' : 'Delete downloaded beatmap set'}
                        className={`p-1.5 rounded-lg border transition-colors ${songDeleteConfirmKey === group.songKey ? 'border-rose-500/50 bg-rose-500/20 text-rose-300' : 'border-white/10 text-slate-500 hover:border-rose-500/40 hover:text-rose-300'}`}
                      >
                        {songDeleteConfirmKey === group.songKey ? <Check className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="bg-[#0c0c12]/60 border border-white/10 p-8 rounded-2xl flex flex-col items-center justify-center text-center text-slate-500 shadow-xl z-10 py-12">
              <Info className="h-6 w-6 mb-2 text-slate-600 animate-pulse" />
              <p className="text-[10px] font-sans font-black tracking-widest uppercase">No tracks discovered</p>
              <p className="text-[8px] text-slate-600 font-mono mt-1 uppercase max-w-xs">Adjust search terms or visit the online store to fetch map packages</p>
            </div>
          )}
        </div>

        {/* 5. FLOATING BOTTOM NAVIGATION ACTION BAR (BACK, MODS, RANDOM) */}
        <div className="fixed bottom-0 inset-x-0 bg-[#09090d]/95 backdrop-blur-md border-t border-white/10 p-4 pb-6 flex items-center justify-between gap-3 z-40 shadow-2xl">
          <button
            onClick={() => {
              if (onBack) onBack();
            }}
            className="flex-1 py-3.5 bg-[#121216] border border-white/10 rounded-xl flex items-center justify-center gap-2 text-white font-sans font-bold text-xs uppercase cursor-pointer active:brightness-90 active:scale-95 transition-all shadow-md"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-left text-pink-500">
              <path d="m15 18-6-6 6-6"/>
            </svg>
            <span>Back</span>
          </button>

          <button
            onClick={() => setShowModsModal(true)}
            className="flex-1 py-3.5 bg-[#121216] border border-white/10 rounded-xl flex items-center justify-center gap-2 text-white font-sans font-bold text-xs uppercase cursor-pointer active:brightness-90 active:scale-95 transition-all shadow-md relative"
          >
            <SlidersHorizontal className="h-4 w-4 text-[#a3e635]" />
            <span>Mods</span>
            {(settings.selectedMods || []).length > 0 && (
              <span className="absolute -top-1.5 right-2 px-1.5 py-0.5 bg-lime-500 rounded-full text-[8px] font-black font-mono text-black leading-none border border-black/40 z-10">
                {(settings.selectedMods || []).length}
              </span>
            )}
          </button>

          <button
            onClick={handleSelectRandom}
            className="flex-1 py-3.5 bg-[#121216] border border-white/10 rounded-xl flex items-center justify-center gap-2 text-white font-sans font-bold text-xs uppercase cursor-pointer active:brightness-90 active:scale-95 transition-all shadow-md"
          >
            <Shuffle className="h-4 w-4 text-[#38bdf8]" />
            <span>Random</span>
          </button>
        </div>

        {/* RENDER MODS OVERLAY CONTAINER */}
        <AnimatePresence>
          {showModsModal && (
            <>
              <motion.div 
                key="mods-backdrop-mobile"
                className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm cursor-pointer"
                onClick={() => setShowModsModal(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />

              <motion.div
                key="mods-panel-mobile"
                className="fixed inset-x-0 bottom-0 z-[110] w-full max-h-[85vh] bg-gradient-to-t from-[#0c0c12]/98 to-[#06060a]/98 border-t border-white/10 shadow-2xl flex flex-col rounded-t-3xl overflow-hidden font-sans text-slate-200"
                initial={{ y: '100vh', opacity: 0.6 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: '100vh', opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
              >
                <div className="h-1 w-full bg-[#ff80a5] shadow-sm flex-none" />

                <div className="flex-none px-5 py-4 border-b border-white/5 flex items-center justify-between bg-black/20">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="h-5 w-5 text-[#ff80a5]" />
                     <h1 className="text-2xl font-semibold tracking-tight text-white font-sans">
                       Gameplay Modifiers
                     </h1>
                  </div>

                   <div className="flex items-center gap-2">
                     <button
                       type="button"
                       disabled
                       className="px-2.5 py-1.5 rounded-lg bg-white/5 text-[10px] font-semibold text-white/25 cursor-not-allowed"
                       title="Practice mode coming soon"
                     >
                       Practice - Coming soon
                     </button>
                     <button
                       onClick={() => setShowModsModal(false)}
                       className="p-1.5 rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:text-white transition duration-150 cursor-pointer shadow-md"
                     >
                       <X className="h-4 w-4" />
                     </button>
                   </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 bg-black/5 flex flex-col gap-4">
                  <div className="bg-[#1a1525] border border-[#ff80a5]/20 p-3 rounded-xl flex items-center justify-between gap-3 shadow-md text-left">
                    <span className="text-[10px] font-bold text-slate-300 font-mono uppercase">
                      MULTIPLIER: {(() => {
                        let factor = 1.0;
                        const active = settings.selectedMods || [];
                        if (active.includes('AT')) return 'UNRANKED';
                        if (active.includes('NF')) factor *= 0.5;
                        if (active.includes('EZ')) factor *= 0.8;
                        if (active.includes('HT')) factor *= 0.5;
                        if (active.includes('HR')) factor *= 1.1;
                        if (active.includes('HD')) factor *= 1.15;
                        if (active.includes('DT')) factor *= 1.25;
                        if (active.some(mod => /^K[2-9]$/.test(mod))) factor *= 0.9;
                        return factor.toFixed(2) + 'x';
                      })()}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateSettings({ selectedMods: [] })}
                      className="px-2.5 py-1 bg-slate-900 border border-white/10 rounded-lg text-[9px] font-bold text-slate-400 hover:text-white"
                    >
                      RESET
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-2 gap-y-7 justify-items-center pb-2">
                    {MODIFIER_TILES.map((mod) => {
                      const isActive = (settings.selectedMods || []).includes(mod.id);
                      const Icon = mod.icon;
                      return (
                        <button
                          type="button"
                          key={mod.id}
                          title={mod.title}
                          onClick={() => toggleModifier(mod.id, mod.exclusiveWith)}
                          className="group flex min-w-0 flex-col items-center gap-2 text-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c12]"
                        >
                          <span className={`relative flex h-[88px] w-[88px] shrink-0 flex-col items-center justify-center overflow-hidden rounded-xl transition-all duration-150 group-hover:-translate-y-0.5 group-hover:bg-white/[.14] group-active:scale-95 ${isActive ? mod.activeClass : 'bg-white/[.08] text-white/80'}`}>
                            <span className="absolute inset-x-0 top-2 text-center text-[9px] font-black tracking-wide text-white/70">{mod.multiplier}</span>
                            <Icon className="h-9 w-9 stroke-[2.25] transition-transform duration-150 group-hover:scale-110" />
                            {isActive && <span className="absolute bottom-2 h-1 w-1 rounded-full bg-current" />}
                          </span>
                          <span className={`max-w-[96px] text-[11px] font-semibold leading-tight ${isActive ? 'text-white' : 'text-white/60 group-hover:text-white/85'}`}>{mod.name}</span>
                        </button>
                      );
                    })}
                    {[2, 3, 4, 5, 6, 7, 8, 9].map((keyCount) => {
                      const id = `K${keyCount}`;
                      const isActive = (settings.selectedMods || []).includes(id);
                      const isDisabled = availableKeyCounts.includes(keyCount);
                      return (
                        <button
                          type="button"
                          key={id}
                          disabled={isDisabled}
                          title={isDisabled ? `${keyCount}K is already native to this map` : `Force ${keyCount}-key play`}
                          onClick={() => !isDisabled && toggleKeyModifier(keyCount)}
                          className="group flex min-w-0 flex-col items-center gap-2 text-center cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c12]"
                        >
                          <span className={`relative flex h-[88px] w-[88px] shrink-0 flex-col items-center justify-center overflow-hidden rounded-xl transition-all duration-150 ${isDisabled ? 'bg-black/30 text-white/20 opacity-50' : isActive ? 'bg-cyan-500/25 text-cyan-300 shadow-[0_8px_24px_rgba(6,182,212,0.18)] group-hover:-translate-y-0.5' : 'bg-white/[.08] text-white/80 group-hover:-translate-y-0.5 group-hover:bg-white/[.14]'} group-active:scale-95`}>
                            <span className="absolute inset-x-0 top-2 text-center text-[9px] font-black tracking-wide text-white/70">0.90x</span>
                            <Keyboard className="h-9 w-9 stroke-[2.25] transition-transform duration-150 group-hover:scale-110" />
                            <span className="absolute bottom-2 text-[9px] font-black tracking-wider">K{keyCount}</span>
                          </span>
                          <span className={`max-w-[96px] text-[11px] font-semibold leading-tight ${isDisabled ? 'text-white/25' : isActive ? 'text-white' : 'text-white/60 group-hover:text-white/85'}`}>{keyCount}K Mode</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex-none px-5 py-4 bg-[#101016]/85 border-t border-white/5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowModsModal(false)}
                    className="px-6 py-2.5 bg-[#ff80a5] text-slate-950 font-black font-sans text-xs rounded-xl transition cursor-pointer uppercase tracking-wider shadow-lg"
                  >
                    Apply Selection
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div 
      className="relative w-full h-[calc(100vh_-_64px)] text-slate-100 font-sans select-none overflow-hidden flex flex-col bg-transparent"
    >
      {/* Bottom Left Version Tag */}
      <div className="absolute bottom-6 left-6 text-xs text-white/40 font-mono z-[100] select-none pointer-events-none">
        {metadata.version}
      </div>

      {/* 1. SEAMLESS GLASS BLUR FILTER BACKGROUND OVERLAY */}
      <div className="absolute inset-0 bg-black/10 backdrop-blur-[0.5px] pointer-events-none z-0" />

      {/* 2. OPTION / PREPLAY LOADING SCREEN ACTIVE STAGE OVERLAY */}
      {showPreplayOptions && selectedCustomMap && (
        <div 
          className="absolute inset-0 z-50 bg-[#030305] flex flex-col justify-between p-6 overflow-y-auto animate-fade-in"
        >
          {/* Dynamic background image layer */}
          {selectBgUrl && (
            <div 
              className="absolute inset-0 bg-cover bg-center pointer-events-none"
              style={{
                backgroundImage: `url("${sanitizeCssUrl(selectBgUrl)}")`,
                zIndex: 0
              }}
            />
          )}
          {/* Dynamic real-time background dim layer */}
          <div 
            className="absolute inset-0 bg-black pointer-events-none transition-opacity duration-150"
            style={{ 
              opacity: settings.backgroundDim !== undefined ? settings.backgroundDim : 0.60,
              zIndex: 1
            }}
          />
          {/* Backdrop blur layer */}
          <div 
            className="absolute inset-0 backdrop-blur-xl bg-black/10 pointer-events-none"
            style={{ zIndex: 2 }}
          />
          {/* Top Title Bar */}
          <div className="w-full flex justify-between items-center z-10 max-w-7xl mx-auto">
            <span className="text-[10px] text-pink-500 font-mono tracking-widest font-black uppercase bg-pink-550/10 border border-pink-500/20 px-3 py-1 rounded-full">
              INTERACTIVE PREPLAY OPTIONS
            </span>
            <div className="text-right text-[10px] text-slate-500 font-mono">
              PREVIEW SYSTEM CONTROLLING WINDOWS
            </div>
          </div>

          {/* Interactive Core: Center Area and Right Panels */}
          <div className="flex-1 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-center my-6 z-10">
            
            {/* Center Area (Logo circle spinner & details banner) */}
            <div className="lg:col-span-7 flex flex-col items-center justify-center text-center gap-6">
              {/* Spinning / Rippling interactive central logo trigger */}
              <div
                role="button"
                tabIndex={0}
                aria-label={`Play ${selectedCustomMap.title}`}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleStartPlay();
                  }
                }}
                onClick={() => handleStartPlay()}
                className="relative cursor-pointer group flex items-center justify-center select-none active:scale-95 transition-all w-48 h-48 rounded-full shadow-2xl"
              >
                {/* Visual guidelines */}
                <span className="absolute inset-x-0 inset-y-0 rounded-full border border-pink-500/10 animate-ping" style={{ animationDuration: '4s' }} />
                <span className="absolute -inset-4 rounded-full border border-dashed border-pink-500/20 animate-spin" style={{ animationDuration: '30s' }} />
                <span className="absolute -inset-8 rounded-full border border-dashed border-indigo-500/10 animate-spin" style={{ animationDuration: '15s', animationDirection: 'reverse' }} />
                
                {/* Glowing pink centerpiece */}
                <div className="absolute inset-0 bg-gradient-to-r from-pink-500 to-rose-600 rounded-full group-hover:brightness-110 shadow-[0_0_40px_rgba(236,72,153,0.4)] flex items-center justify-center transition-all duration-300">
                  <div className="flex flex-col items-center justify-center text-slate-950 font-black italic tracking-widest select-none">
                    <span className="text-4xl font-sans tracking-tight uppercase">Play</span>
                    <span className="text-[9px] font-mono uppercase tracking-[0.25em] font-black leading-none mt-1 group-hover:scale-105 transition-all">
                       MANIA
                    </span>
                  </div>
                </div>
              </div>
              {/* Text Info */}
              <div className="space-y-1 text-center">
                <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight leading-none">
                  {selectedCustomMap.title}
                </h1>
                <p className="text-base text-pink-400 font-medium uppercase tracking-widest">
                  {selectedCustomMap.artist}
                </p>
                {/* Active Rendering Engine Badge Indicator */}
                <div className="flex justify-center gap-2 pt-2 pb-1 select-none">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-mono font-black uppercase tracking-widest border shadow-lg transition-all ${
                    settings.renderEngine === 'babylon'
                      ? 'bg-purple-500/10 text-purple-300 border-purple-500/30 shadow-purple-500/5 animate-pulse'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-amber-500/5'
                  }`}>
                    Engine: {settings.renderEngine === 'babylon' ? 'Babylon.js 3D' : 'Canvas 2D'}
                  </span>
                </div>
              </div>

              {/* Miniature card showcase */}
              <div className="p-1 px-4 bg-[#0a0a0f]/80 border border-white/5 rounded-2xl flex items-center gap-3.5 shadow-xl max-w-sm w-full">
                <div className="w-12 h-12 rounded-lg bg-slate-900 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                  {selectBgUrl ? (
                    <img src={selectBgUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <Music className="h-5 w-5 text-pink-500" />
                  )}
                </div>
                <div className="text-left w-full overflow-hidden">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-100 font-extrabold text-xs truncate max-w-[150px]">
                      {selectedCustomMap.difficulty}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[8px] font-mono tracking-wider font-extrabold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/10">
                      ★ {currentStarRating.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate uppercase">
                    Mapper: {selectedCustomMap.creator || 'alevi'} • bpm: {selectedCustomMap.bpm || 120}
                  </div>
                </div>
              </div>

            </div>

            {/* Right Panels (Visual settings, Audio settings, inputs settings) */}
            <div className="lg:col-span-5 flex flex-col gap-5 overflow-y-auto max-h-[85vh] pr-1.5">
              
              {/* Option panel Box */}
              <div className="bg-[#12121a]/95 border border-white/5 p-6 rounded-2xl flex flex-col gap-5 shadow-2xl relative">
                <div className="flex justify-between items-center border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2">
                    <Sliders className="h-4 w-4 text-pink-500" />
                    <span className="text-xs font-black uppercase tracking-widest text-white font-sans">VISUAL CONFIGURATOR</span>
                  </div>
                  <div className="flex space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-pink-500" />
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                  </div>
                </div>

                {/* VISUAL SETTINGS */}
                <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-[11px] font-mono tracking-wider text-slate-350 uppercase">
                      <span>Background Dim:</span>
                      <span className="text-amber-400 font-bold">{Math.round(settings.backgroundDim * 100)}%</span>
                    </div>
                    <input 
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(settings.backgroundDim * 100)}
                      onChange={(e) => updateSettings({ backgroundDim: parseFloat(e.target.value) / 100 })}
                      className="w-full accent-amber-450 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-[11px] font-mono tracking-wider text-slate-350 uppercase">
                      <span>Lane Translucency:</span>
                      <span className="text-amber-400 font-bold">{Math.round((settings.receptorOpacity || 0.85) * 100)}%</span>
                    </div>
                    <input 
                      type="range"
                      min="10"
                      max="100"
                      value={Math.round((settings.receptorOpacity || 0.85) * 100)}
                      onChange={(e) => updateSettings({ receptorOpacity: parseFloat(e.target.value) / 100 })}
                      className="w-full accent-amber-450 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-[11px] font-mono tracking-wider text-slate-350 uppercase">
                        <span>Scroll Multiplier:</span>
                        <span className="text-amber-400 font-bold">{settings.scrollSpeed}x</span>
                      </div>
                      <input 
                        type="range"
                         min={SCROLL_SPEED_MIN}
                         max={SCROLL_SPEED_MAX}
                        value={settings.scrollSpeed}
                        onChange={(e) => updateSettings({ scrollSpeed: parseInt(e.target.value) })}
                        className="w-full accent-amber-450 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                  </div>

                  <div className="flex justify-between items-center py-2 border-t border-white/[0.03]">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-slate-300">Storyboard / Video Media:</span>
                    <button 
                      onClick={() => updateSettings({ disableVideo: !settings.disableVideo })}
                      className={`w-11 h-5.5 rounded-full transition-all duration-150 p-0.5 relative flex items-center ${
                        !settings.disableVideo ? 'bg-amber-450 justify-end' : 'bg-slate-700 justify-start'
                      }`}
                    >
                      <span className="w-4.5 h-4.5 rounded-full bg-slate-950 block shadow shadow-black" />
                    </button>
                  </div>

                  <div className="flex justify-between items-center py-2 border-t border-white/[0.03]">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-slate-300">Hitsounds Audio Playback:</span>
                    <button 
                      onClick={() => updateSettings({ hitsoundVolume: settings.hitsoundVolume > 0 ? 0 : 0.85 })}
                      className={`w-11 h-5.5 rounded-full transition-all duration-150 p-0.5 relative flex items-center ${
                        settings.hitsoundVolume > 0 ? 'bg-amber-450 justify-end' : 'bg-slate-700 justify-start'
                      }`}
                    >
                      <span className="w-4.5 h-4.5 rounded-full bg-slate-950 block shadow shadow-black" />
                    </button>
                  </div>

                  <div className="flex justify-between items-center py-2 border-t border-white/[0.03]">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-slate-300">Combo Particle Emitters:</span>
                    <button 
                      onClick={() => updateSettings({ disableParticles: !settings.disableParticles })}
                      className={`w-11 h-5.5 rounded-full transition-all duration-150 p-0.5 relative flex items-center ${
                        !settings.disableParticles ? 'bg-amber-450 justify-end' : 'bg-slate-700 justify-start'
                      }`}
                    >
                      <span className="w-4.5 h-4.5 rounded-full bg-slate-950 block shadow shadow-black" />
                    </button>
                  </div>

                </div>
              </div>

              {/* Global Calibration Quick-Desk */}
              <div className="bg-[#12121a]/95 border border-white/5 p-6 rounded-2xl flex flex-col gap-4 shadow-2xl">
                <div className="flex items-center gap-2 border-b border-white/5 pb-2.5">
                  <Clock className="h-4 w-4 text-cyan-400" />
                  <span className="text-xs font-black uppercase tracking-widest text-slate-200">TIMING & AUDIO OFFSET</span>
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-[11px] font-mono text-slate-400">
                    <span>AUDIO OFFSET:</span>
                    <span className="text-cyan-400 font-extrabold">{settings.audioOffset} ms</span>
                  </div>
                  <input 
                    type="range"
                    min="-150"
                    max="150"
                    value={settings.audioOffset}
                    onChange={(e) => updateSettings({ audioOffset: parseInt(e.target.value) })}
                    className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                  <p className="text-[9px] text-slate-500 font-mono italic mt-0.5">
                    Negative delays audio track; positive delays key hit judgements.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Navigation Row */}
          <div className="w-full border-t border-white/5 pt-4 max-w-7xl mx-auto flex items-center justify-between z-10 select-none">
            {/* Elegant back pink trapezoidal parallelogram button */}
            <button 
              onClick={() => setShowPreplayOptions(false)}
              className="px-6 py-2.5 bg-pink-500 hover:bg-pink-600 active:scale-95 text-slate-950 font-sans font-black text-xs uppercase tracking-widest italic rounded-lg shadow-pink-500/25 shadow-lg flex items-center gap-1.5 transition-all cursor-pointer"
              style={{ transform: 'skew-x(-10deg)' }}
            >
              <span className="inline-block" style={{ transform: 'skew-x(10deg)' }}>&lt; BACK TO SONGSELECT</span>
            </button>

            <div className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">
              1.2 ms, 120 fps // RHYTHMMANIA
            </div>
          </div>
        </div>
      )}

      {/* 3. MAIN BEATMAP SELECT SCREEN STAGE PANEL - 3-COLUMN RECONSTRUCTION */}
      <div className="flex-1 w-full max-w-none pl-0 pr-4 lg:pr-10 min-h-0 pt-0 pb-0 grid grid-cols-1 lg:grid-cols-12 gap-6 z-10 relative overflow-hidden">
        
        {/* =======================================================
            LEFT COLUMN: DISPLAY METRICS & PLAY HISTORIC STATISTICS 
            ======================================================= */}
         <div className="lg:col-span-4 flex flex-col gap-4 text-left h-full overflow-y-auto pr-1 pb-[72px] bg-[#0c0c12]/70 border border-white/10 rounded-none shadow-2xl">
          {selectedCustomMap ? (
            <div className="flex flex-col gap-5 p-5 relative z-10">
              
              {/* STAGE HEADER BANNER: title, artist */}
              <div className="space-y-1 text-left">
                <span className="px-3.5 py-1 bg-skin-accent-dim text-skin-accent text-[9px] tracking-widest uppercase font-mono font-black border border-skin-accent/25 rounded-full inline-block">
                  SELECTED TRACK
                </span>
                <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight font-sans leading-tight break-words mt-2">
                  {selectedCustomMap.title}
                </h1>
                <p className="text-sm text-slate-400 font-bold uppercase tracking-widest mt-1">
                  {selectedCustomMap.artist}
                </p>
              </div>

              {/* DIFFICULTIES DROPDOWN MENU */}
              <div className="flex flex-col gap-1.5 text-left">
                <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest font-black leading-none pl-1">DIFFICULTY PRESET:</span>
                <select 
                  value={selectedCustomMap.id}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    const foundMap = currentSongMaps.find(m => m.id === selectedId);
                    if (foundMap) {
                      handleSelectCustomMap(foundMap);
                    }
                  }}
                  className="w-full bg-[#12121a]/95 border border-white/10 p-2.5 rounded-xl text-xs font-mono text-slate-200 outline-none focus:outline-none transition-all cursor-pointer shadow-lg hover:border-skin-accent focus:border-skin-accent"
                  style={{ border: '1px solid rgba(var(--skin-accent-rgb), 0.3)' }}
                >
                  {[...currentSongMaps].sort((a, b) => getStarRating(a) - getStarRating(b)).map((map) => {
                    const rating = getStarRating(map);
                    return (
                      <option key={map.id} value={map.id} className="bg-[#0c0c12] text-slate-100">
                        {map.difficulty} (★ {rating.toFixed(2)})
                      </option>
                    );
                  })}
                </select>
              </div>

               {/* GIANT PLAY SONG BUTTON */}
              <button
                id="main-left-play-button"
                onClick={() => handleStartPlay()}
                 className="w-full py-4 bg-[#061a34]/80 hover:bg-[#193454] active:scale-95 text-white font-sans font-black text-base tracking-widest rounded-xl shadow-lg shadow-black/20 flex items-center justify-center gap-2 transform transition hover:scale-[1.01] duration-150 cursor-pointer border border-white/10 select-none"
              >
                <Play className="h-5 w-5 fill-current text-cyan-300" />
                <span>Play beatmap</span>
              </button>
              {selectedCustomMap && onDeleteSongGroup && (
                <button
                  onClick={handleDeleteSelectedSet}
                   className={`w-full py-3 rounded-xl border text-xs font-sans font-black uppercase tracking-widest transition ${songDeleteConfirmKey === getMapSongKey(selectedCustomMap) ? 'border-rose-500 bg-rose-500/80 text-rose-100' : 'border-white/10 bg-[#12121a]/80 text-slate-300 hover:border-rose-500/50 hover:text-rose-200'}`}
                >
                  {songDeleteConfirmKey === getMapSongKey(selectedCustomMap) ? 'Confirm Delete Beatmap Set' : 'Delete Beatmap Set'}
                </button>
              )}

              {/* ONLINE & LOCAL LEADERBOARD REPLAYS PANEL */}
              <div className="flex flex-col mt-1">
                {/* TAB BAR HEADER */}
                <div className="flex border-b border-white/10 bg-black/40">
                {isServerLeaderboardMap && (
                  <button
                    onClick={() => setLeaderboardTab('online')}
                    className={`flex-1 py-2 px-3 text-[10px] font-mono font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      leaderboardTab === 'online'
                        ? 'bg-pink-500/20 text-pink-300 border-b-2 border-pink-500'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Cloud className="h-3.5 w-3.5" />
                    <span>Online Leaderboard</span>
                    {onlineReplays.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-pink-500/30 text-[8px] text-pink-200">
                        {onlineReplays.length}
                      </span>
                    )}
                  </button>
                )}

                <button
                  onClick={() => setLeaderboardTab('local')}
                  className={`${isServerLeaderboardMap ? 'flex-1' : 'w-full'} py-2 px-3 text-[10px] font-mono font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    leaderboardTab === 'local'
                      ? 'bg-cyan-500/20 text-cyan-300 border-b-2 border-cyan-500'
                      : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Award className="h-3.5 w-3.5" />
                    <span>Local Scores</span>
                  </button>
                </div>

                {/* TAB CONTENT */}
                <div className="p-3 max-h-[360px] overflow-y-auto space-y-2 text-left">
                  {/* Action/Notification Bar */}
                  {actionNotice && (
                    <div className={`p-2 rounded-xl text-[10px] font-mono flex items-center justify-between ${
                      actionNotice.type === 'error' ? 'bg-red-950/40 text-red-300 border border-red-500/30' :
                      actionNotice.type === 'success' ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/30' :
                      'bg-cyan-950/40 text-cyan-300 border border-cyan-500/30'
                    }`}>
                      <span className="truncate pr-2">{actionNotice.text}</span>
                      {actionNotice.type === 'info' && <Loader className="h-3 w-3 animate-spin shrink-0 text-cyan-300" />}
                    </div>
                  )}

                  {isServerLeaderboardMap && leaderboardTab === 'online' && (
                    <>
                      {isLoadingOnlineReplays ? (
                        <div className="space-y-2" aria-busy="true" aria-label="Loading online leaderboard">
                          {Array.from({ length: 5 }, (_, index) => (
                            <div
                              key={`leaderboard-skeleton-${index}`}
                              className="p-2.5 bg-black/40 border border-white/5 rounded-xl animate-pulse"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="h-4 w-7 rounded bg-white/10" />
                                  <div className="h-4 w-4 rounded-full bg-pink-500/20 shrink-0" />
                                  <div className="h-3 w-24 rounded bg-white/10" />
                                </div>
                                <div className="h-4 w-8 rounded bg-white/10" />
                              </div>
                              <div className="flex items-center justify-between mt-2 pl-9">
                                <div className="h-2.5 w-28 rounded bg-white/[0.07]" />
                                <div className="h-2.5 w-16 rounded bg-white/[0.07]" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : onlineReplayError ? (
                        <div className="py-6 px-3 text-center text-slate-400 text-[10px] font-mono uppercase space-y-1">
                          <p className="text-red-400">{onlineReplayError}</p>
                          <button 
                            onClick={() => {
                              if (leaderboardChartRevisionId) {
                                 setIsLoadingOnlineReplays(true);
                                 setOnlineReplayError(null);
                                 const generation = ++leaderboardGeneration.current;
                                  fetchLeaderboardReplays(leaderboardChartRevisionId).then(res => {
                                   if (generation !== leaderboardGeneration.current) return;
                                   setIsLoadingOnlineReplays(false);
                                   if (res.success) {
                                     setOnlineReplays(res.replays);
                                     setOnlineReplayError(null);
                                   } else {
                                     setOnlineReplays([]);
                                     setOnlineReplayError(res.error || 'Failed to load online replays');
                                   }
                                 });
                              }
                            }}
                            className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-[9px] text-slate-300 mt-2 cursor-pointer"
                          >
                            Retry
                          </button>
                        </div>
                      ) : onlineReplays.length === 0 ? (
                        <div className="py-8 text-center text-slate-500 text-[10px] font-mono uppercase">
                          <CloudOff className="h-6 w-6 mx-auto mb-1.5 opacity-40 text-slate-400" />
                          <p>No online replays submitted yet for this difficulty</p>
                          <p className="text-[9px] text-slate-600 mt-1">Play and log in to submit a record!</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {onlineReplays.map((rep, idx) => {
                            const gradeColor =
                              rep.grade === 'SS' ? 'text-amber-300 bg-amber-500/20 border-amber-500/40' :
                              rep.grade === 'S' ? 'text-amber-400 bg-amber-500/15 border-amber-500/30' :
                              rep.grade === 'A' ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' :
                              rep.grade === 'B' ? 'text-cyan-400 bg-cyan-500/15 border-cyan-500/30' :
                              'text-rose-400 bg-rose-500/15 border-rose-500/30';

                            const rankLabel = `#${idx + 1}`;
                            const formattedDate = new Date(rep.createdAt).toLocaleDateString();

                            return (
                              <div 
                                key={rep.id} 
                                className="p-2.5 bg-black/40 hover:bg-black/60 border border-white/5 rounded-xl transition flex flex-col gap-2"
                              >
                                {/* Top Row: Rank, Avatar + Name, Grade, Score */}
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-black ${
                                      idx === 0 ? 'bg-amber-400 text-black' :
                                      idx === 1 ? 'bg-slate-300 text-black' :
                                      idx === 2 ? 'bg-amber-700 text-white' :
                                      'bg-white/10 text-slate-400'
                                    }`}>
                                      {rankLabel}
                                    </span>

                                    {rep.avatarUrl ? (
                                      <img src={rep.avatarUrl} alt="" className="w-4 h-4 rounded-full" />
                                    ) : (
                                      <div className="w-4 h-4 rounded-full bg-pink-500/30 flex items-center justify-center text-[8px] font-black text-pink-300 shrink-0">
                                        {rep.username.charAt(0).toUpperCase()}
                                      </div>
                                    )}

                                    {rep.userId ? (
                                      <a
                                        href={`/profile/${rep.userId}`}
                                        className="text-xs font-bold text-white truncate font-sans hover:text-pink-300 transition-colors"
                                        title={`View ${rep.username}'s profile`}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {rep.username}
                                      </a>
                                    ) : (
                                      <span className="text-xs font-bold text-white truncate font-sans">
                                        {rep.username}
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-black border ${gradeColor}`}>
                                      {rep.grade}
                                    </span>
                                    <span className="text-xs font-black font-mono text-amber-300">
                                      {rep.score.toLocaleString()}
                                    </span>
                                  </div>
                                </div>

                                {/* Middle Row: Accuracy, Combo, Mods, Date */}
                                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 border-t border-white/5 pt-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-cyan-300 font-bold">{rep.accuracy.toFixed(2)}%</span>
                                    <span>•</span>
                                    <span>{rep.maxCombo}x combo</span>
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    {rep.mods && rep.mods.length > 0 ? (
                                      <div className="flex gap-1">
                                        {rep.mods.map(m => (
                                          <span key={m} className="px-1 py-0.2 bg-pink-500/20 text-pink-300 rounded text-[8px] font-bold uppercase">
                                            {m}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-[9px] text-slate-500">No Mods</span>
                                    )}
                                    <span className="text-[9px] text-slate-500">{formattedDate}</span>
                                  </div>
                                </div>

                                {/* Bottom Row: Actions (Download & Watch Replay) */}
                                <div className="flex items-center gap-2 pt-1">
                                  {rep.isOwn ? (
                                    (playHistory.some((s) => s.id === rep.id) || localScores.some((s) => s.id === rep.id)) ? (
                                      <span
                                        className="flex-1 py-1 px-2 bg-transparent text-slate-600 rounded-lg text-[10px] font-mono font-bold flex items-center justify-center gap-1 opacity-40 cursor-default select-none"
                                        title="Already saved locally — delete it from Replay Select to download again"
                                      >
                                        <FileText className="h-3 w-3" />
                                        <span>Saved Locally</span>
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() => handleDownloadOnlineReplay(rep.id)}
                                        disabled={downloadingReplayId === rep.id}
                                        className="flex-1 py-1 px-2 bg-white/5 hover:bg-white/10 active:scale-95 text-slate-300 hover:text-white rounded-lg text-[10px] font-mono font-bold flex items-center justify-center gap-1 transition cursor-pointer disabled:opacity-50"
                                        title="Download your replay to Local History"
                                      >
                                        {downloadingReplayId === rep.id ? (
                                          <Loader className="h-3 w-3 animate-spin text-pink-400" />
                                        ) : (
                                          <FileText className="h-3 w-3 text-cyan-400" />
                                        )}
                                        <span>Download</span>
                                      </button>
                                    )
                                  ) : (
                                    <span className="flex-1 py-1 px-2 text-slate-500 rounded-lg text-[10px] font-mono font-bold flex items-center justify-center gap-1">
                                      <span>Watch-only</span>
                                    </span>
                                  )}

                                  <button
                                    onClick={() => handleWatchOnlineReplay(rep)}
                                    disabled={watchingReplayId === rep.id}
                                    className="flex-1 py-1 px-2 bg-pink-500/20 hover:bg-pink-500/30 active:scale-95 text-pink-300 hover:text-pink-100 border border-pink-500/30 rounded-lg text-[10px] font-mono font-bold flex items-center justify-center gap-1 transition cursor-pointer disabled:opacity-50"
                                    title="Watch Replay Playback"
                                  >
                                    {watchingReplayId === rep.id ? (
                                      <Loader className="h-3 w-3 animate-spin text-pink-300" />
                                    ) : (
                                      <Play className="h-3 w-3 text-pink-400 fill-current" />
                                    )}
                                    <span>Watch Replay</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}

                  {leaderboardTab === 'local' && (
                    <div className="space-y-2">
                      {localScores.filter(s => 
                        selectedCustomMap && (s.beatmapId === selectedCustomMap.id || s.catalogMapId === (selectedCustomMap as any).catalogMapId)
                      ).length === 0 ? (
                        <div className="py-6 text-center text-slate-500 text-[10px] font-mono uppercase">
                          <Award className="h-6 w-6 mx-auto mb-1.5 opacity-40 text-slate-400" />
                          <p>No local score history for this difficulty</p>
                        </div>
                      ) : (
                        localScores
                          .filter(s => selectedCustomMap && (s.beatmapId === selectedCustomMap.id || s.catalogMapId === (selectedCustomMap as any).catalogMapId))
                          .sort((a, b) => b.score - a.score)
                          .map((s, idx) => (
                            <div key={s.id || idx} className="p-2.5 bg-black/40 border border-white/5 rounded-xl flex items-center justify-between text-xs font-mono">
                              <div className="flex items-center gap-2">
                                <span className="px-1.5 py-0.5 bg-cyan-500/20 text-cyan-300 rounded text-[9px] font-bold">
                                  #{idx + 1}
                                </span>
                                <div className="flex flex-col">
                                  <span className="font-bold text-white">{s.score.toLocaleString()}</span>
                                  <span className="text-[9px] text-slate-400">{s.accuracy.toFixed(2)}% • {s.maxCombo}x</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-white/10 text-slate-200">
                                  {s.grade}
                                </span>
                                {onWatchReplay && (
                                  <button
                                    onClick={() => onWatchReplay(s, selectedCustomMap)}
                                    className="p-1.5 bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 rounded-lg transition cursor-pointer"
                                    title="Watch Local Replay"
                                  >
                                    <Play className="h-3 w-3 fill-current" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Integrated file drag and drop area for a compact utility drop */}
              <button
                type="button"
                aria-label="Import beatmap package"
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                 className="p-3 rounded-xl border border-dashed border-white/10 text-center cursor-pointer hover:border-pink-500/30 bg-black/80 hover:bg-black/90 transition flex flex-col items-center justify-center"
              >
                <input 
                  ref={fileInputRef}
                  type="file" 
                  accept=".osu,.osz,.zip"
                  onChange={handleFileSelect}
                  className="hidden" 
                />
                <Upload className="h-4 w-4 text-slate-500 mb-1" />
                <span className="text-[8px] font-mono font-bold text-slate-400 uppercase tracking-widest">DRAG & DROP BEATMAP TO IMPORT</span>
              </button>

              {importStatus && (
                <div className={`p-2 rounded text-[9px] font-mono border ${
                  importStatus.type === 'ok' ? 'bg-emerald-950/20 text-emerald-400 border-emerald-900/30' : 'bg-rose-950/20 text-rose-400 border-rose-900/30'
                }`}>
                  {importStatus.msg}
                </div>
              )}
            </div>
          ) : (
             <div className="flex-1 flex flex-col items-center justify-center text-center py-24 gap-4 opacity-75 p-6 relative z-10">
              <span className="p-4 bg-pink-500/10 text-pink-500 rounded-full border border-pink-500/20 shadow animate-pulse">
                <Music className="h-8 w-8 text-pink-500" />
              </span>
              <div className="flex flex-col gap-1.5">
                 <h3 className="text-lg font-sans font-black text-white tracking-widest uppercase">
                   No Beatmap Selected
                 </h3>
                 <p className="text-sm text-slate-400 font-sans max-w-sm leading-relaxed">
                   Select a song or use the beatmap listing to find new songs
                 </p>
                 {onOpenOnlineCatalog && (
                   <button
                     type="button"
                     onClick={onOpenOnlineCatalog}
                      className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/35 bg-cyan-400/80 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-cyan-950 transition hover:bg-cyan-400"
                   >
                     <Search className="h-3.5 w-3.5" /> Beatmap Listing
                   </button>
                 )}
                 <button
                   onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-pink-500/35 bg-pink-500/80 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-pink-100 transition hover:bg-pink-500"
                 >
                   <Upload className="h-3.5 w-3.5" /> Import Songs Locally
                 </button>
                <input ref={fileInputRef} type="file" accept=".osu,.osz,.zip" onChange={handleFileSelect} className="hidden" />
              </div>
            </div>
          )}
        </div>

        {/* =======================================================
            MIDDLE SPACING COLUMN (LEAVES THE SELECTED BG IMAGE UNBLURRED AND PRISTINE)
            ======================================================= */}
        <div className="lg:col-span-4 hidden lg:flex flex-col justify-center items-center pointer-events-none relative select-none">
          {/* Transparent spacing to showcase the pristine background track artwork completely */}
        </div>

        {/* =======================================================
            RIGHT COLUMN: SEARCH, STAR RATING SLIDER, BEATMAP LIST
            ======================================================= */}
         <div className="lg:col-span-4 flex flex-col gap-3 h-full min-h-0 pt-8 lg:pt-12 -mr-4 lg:-mr-10">
          
          {/* SEARCH INTERFACE */}
          <div className="px-4 lg:px-6 relative flex-shrink-0">
             <Search className="absolute left-7 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input 
              id="song-search-input"
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
               className="w-full min-h-[54px] pl-12 pr-24 py-3 bg-[#0f0e15]/80 border border-white/10 rounded-xl font-sans text-base font-bold text-white placeholder-slate-400 focus:outline-none focus:border-skin-accent/50 focus:ring-1 focus:ring-skin-accent/30 transition-all shadow-lg"
            />
             <span className="absolute right-7 top-1/2 -translate-y-1/2 px-2 py-0.5 bg-[#1b1c24] border border-white/10 text-[9px] font-mono text-slate-400 font-bold rounded">
              {filteredCustomMaps.length} matches
            </span>
          </div>

          {/* FILTER / SORT TOOLBAR */}
          <div className="px-4 lg:px-6 flex-shrink-0 flex flex-wrap items-center gap-1.5 relative z-20">
            {/* Collection chips */}
            <div className="flex items-center gap-0.5 bg-[#0f0e15] border border-white/10 rounded-lg p-0.5">
              {([
                { id: 'Downloaded', label: 'Downloaded' },
                { id: 'Favorites', label: 'Favorites' },
              ] as const).map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setCollectionFilter(opt.id)}
                  className={`px-2 py-1 rounded-md text-[9px] font-mono font-bold uppercase tracking-wider transition-all ${
                    collectionFilter === opt.id
                      ? 'bg-skin-accent/20 text-skin-accent border border-skin-accent/40'
                      : 'text-slate-500 hover:text-slate-300 border border-transparent'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Sort dropdown */}
            <div className="relative">
              <button
                onClick={() => setOpenFilterMenu(openFilterMenu === 'sort' ? null : 'sort')}
                className="flex items-center gap-1 px-2 py-1.5 bg-[#0f0e15] border border-white/10 rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200 hover:border-white/20 transition-all"
              >
                Sort: <span className="text-white">{sortBy}</span>
                <ChevronDown className="h-3 w-3" />
              </button>
              {openFilterMenu === 'sort' && (
                <>
                  <div className="fixed inset-0 z-30 cursor-default" onClick={() => setOpenFilterMenu(null)} />
                  <div className="absolute left-0 top-full mt-1 z-40 bg-[#12121a] border border-white/10 rounded-lg shadow-2xl py-1 min-w-[140px]">
                    {['Title', 'Artist', 'Difficulty', 'BPM', 'Length', 'Date Added'].map(opt => (
                      <button
                        key={opt}
                        onClick={() => { setSortBy(opt); setOpenFilterMenu(null); }}
                        className={`w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors ${
                          sortBy === opt ? 'text-skin-accent bg-skin-accent/10' : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {opt}
                        {sortBy === opt && <Check className="h-3 w-3" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Star range popover */}
            <div className="relative">
              <button
                onClick={() => setOpenFilterMenu(openFilterMenu === 'star' ? null : 'star')}
                className={`flex items-center gap-1 px-2 py-1.5 bg-[#0f0e15] border rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider transition-all ${
                  minStar > 0 || maxStar < 10
                    ? 'border-amber-500/40 text-amber-300'
                    : 'border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20'
                }`}
              >
                <Star className="h-3 w-3" />
                {minStar.toFixed(1)}–{maxStar.toFixed(1)}
              </button>
              {openFilterMenu === 'star' && (
                <>
                  <div className="fixed inset-0 z-30 cursor-default" onClick={() => setOpenFilterMenu(null)} />
                  <div className="absolute left-0 top-full mt-1 z-40 bg-[#12121a] border border-white/10 rounded-lg shadow-2xl p-3 w-56 flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[9px] font-mono text-slate-400 uppercase tracking-wider">
                        <span>Min stars</span><span className="text-white">{minStar.toFixed(1)}</span>
                      </div>
                      <input
                        type="range" min={0} max={10} step={0.1} value={minStar}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setMinStar(v);
                          if (v > maxStar) setMaxStar(v);
                        }}
                        className="w-full accent-amber-400"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[9px] font-mono text-slate-400 uppercase tracking-wider">
                        <span>Max stars</span><span className="text-white">{maxStar.toFixed(1)}</span>
                      </div>
                      <input
                        type="range" min={0} max={10} step={0.1} value={maxStar}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setMaxStar(v);
                          if (v < minStar) setMinStar(v);
                        }}
                        className="w-full accent-amber-400"
                      />
                    </div>
                    <button
                      onClick={() => { setMinStar(0); setMaxStar(10); }}
                      className="self-end text-[9px] font-mono uppercase tracking-wider text-slate-500 hover:text-white transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                </>
              )}
            </div>

          </div>

          {/* HIGH-DENSITY SCROLL BEATMAP GROUP LISTING CARD STACK */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden py-1 flex flex-col gap-1 relative z-10 min-h-0 pb-[72px]">
            {songGroups.length > 0 ? (
              songGroups.map((group) => {
                const isGroupActive = selectedGroup?.songKey === group.songKey;
                const hasActiveMap = group.maps.some(m => m.id === selectedCustomMapId);
                const groupBannerUrl = group.coverUrl || group.bgUrl || DEFAULT_SONG_BANNER;

                return (
                  <div key={group.songKey} className="flex flex-col gap-0 transition-all pl-8">
                    
                    {/* GROUP HEADER ITEM CARD */}
                    <div 
                      role="button"
                      tabIndex={0}
                      aria-pressed={isGroupActive}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleSelectGroup(group);
                        }
                      }}
                      onClick={() => handleSelectGroup(group)}
                      className={`group transition-all duration-300 relative border-l border-t border-b cursor-pointer select-none overflow-hidden rounded-l-xl ${
                        isGroupActive 
                           ? 'border-skin-accent shadow-skin-accent-glow bg-[#1a1726]/70 ml-[-20px]'
                          : hasActiveMap
                             ? 'border-skin-accent/30 bg-[#0e0c15]/70'
                             : 'border-white/[0.03] bg-[#0c0c12]/70 hover:bg-[#12121a]/80 hover:border-white/10'
                      } border-r-0`}
                    >
                        <img
                          src={groupBannerUrl}
                          className="absolute inset-0 h-full w-full object-cover opacity-75 pointer-events-none"
                          referrerPolicy="no-referrer"
                          loading="eager"
                          decoding="async"
                          onError={(event) => {
                            event.currentTarget.onerror = null;
                            event.currentTarget.src = DEFAULT_SONG_BANNER;
                          }}
                          alt=""
                        />
                        <div className="absolute inset-0 bg-[#0c0c12]/60 pointer-events-none" />
                       <div className="relative flex items-center justify-between p-4 py-3">
                         <div className="flex flex-col text-left overflow-hidden min-w-0 pr-20 flex-1">
                          <span className="text-[10px] uppercase font-mono tracking-wider text-skin-accent mb-0.5 leading-none">
                            {group.artist || 'Unknown Artist'}
                          </span>
                          
                          <h4 className="font-extrabold font-sans text-lg lg:text-xl text-white tracking-tight truncate leading-tight">
                            {group.title}
                          </h4>
                          
                          <span className="text-[10px] text-slate-400 font-mono mt-1 uppercase font-black tracking-normal">
                            mapped by {group.creator || 'alevi'}
                          </span>
                        </div>

                        {/* RIGHT SIDE OF ROW: FAVORITE TOGGLE + KEY COUNT */}
                        <div className="flex items-center gap-2.5 shrink-0 select-none">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(group.songKey); }}
                            title={favoriteSongs.includes(group.songKey) ? 'Remove from favorites' : 'Add to favorites'}
                            className="p-1 rounded-md hover:bg-white/5 transition-colors"
                          >
                            <Heart className={`h-3.5 w-3.5 transition-colors ${
                              favoriteSongs.includes(group.songKey)
                                ? 'fill-rose-500 text-rose-500'
                                : 'text-slate-600 group-hover:text-slate-400'
                            }`} />
                          </button>
                          {group.maps?.length > 0 && (
                            <span className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[10px] font-mono font-black text-slate-300">
                              {Array.from(new Set(group.maps.map(m => m.keyCount).filter(Boolean)))
                                .sort((a, b) => Number(a) - Number(b))
                                .map(k => `${k}K`)
                                .join('/')}
                            </span>
                          )}

                            {onDeleteSongGroup && (
                             <button
                               onClick={(e) => {
                                 e.stopPropagation();
                                 if (songDeleteConfirmKey === group.songKey) {
                                    void onDeleteSongGroup(mergedCustomMaps.filter((map) => getMapSongKey(map) === group.songKey).map((map) => map.id));
                                   if (group.maps.some((map) => map.id === selectedCustomMapId)) setSelectedCustomMapId('');
                                   setSongDeleteConfirmKey(null);
                                 } else {
                                   setSongDeleteConfirmKey(group.songKey);
                                 }
                               }}
                               title={songDeleteConfirmKey === group.songKey ? 'Confirm delete beatmap set' : 'Delete downloaded beatmap set'}
                               className={`p-1.5 rounded-lg border transition-colors ${songDeleteConfirmKey === group.songKey ? 'border-rose-500/50 bg-rose-500/20 text-rose-300' : 'border-white/10 text-slate-500 hover:border-rose-500/40 hover:text-rose-300'}`}
                             >
                               {songDeleteConfirmKey === group.songKey ? <Check className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                             </button>
                           )}
                         </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="bg-[#0c0c12] border border-white/10 p-8 rounded-xl flex flex-col items-center justify-center text-center text-slate-500 shadow-xl">
                <Info className="h-6 w-6 mb-2 text-slate-600" />
                <p className="text-[11px] font-sans font-black tracking-widest uppercase">No beatmaps matches discovered</p>
                <p className="text-[9px] text-slate-600 font-mono max-w-xs mt-1 uppercase">Tweak your star rating boundaries or verify directory packages</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. BOTTOM FLOATING CONTROL PANEL: MODS & RANDOM BUTTONS */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-30 select-none bg-transparent pointer-events-none w-auto">
        <div className="flex items-center gap-0.5 bg-[#09090d]/90 backdrop-blur-md border-t border-l border-r border-white/10 rounded-t-2xl pointer-events-auto shadow-2xl">
          {/* MODS BUTTON CONTAINER */}
          <button
            onClick={() => setShowModsModal(true)}
            className="relative flex flex-col items-center justify-center bg-[#1e2326]/90 hover:bg-[#252b2f] border border-white/10 active:brightness-95 w-32 h-16 transition-all duration-150 shadow-md cursor-pointer group"
            style={{ transform: 'skew-x(-12deg)', borderTopLeftRadius: '14px', borderBottomLeftRadius: '14px' }}
          >
            {/* Unskewed inner items */}
            <div className="flex flex-col items-center gap-1.5" style={{ transform: 'skew-x(12deg)' }}>
              {/* Green double bidirectional exchange arrows */}
              <div className="text-[#a3e635] flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-left-right transition group-hover:scale-110">
                  <path d="M20 17H4" />
                  <path d="M4 17l4 4" />
                  <path d="M4 17l-4-4" className="opacity-0" />
                  <path d="M4 17l4-4" />
                  <path d="M4 7h16" />
                  <path d="M20 7l-4-4" />
                  <path d="M20 7l-4 4" />
                </svg>
              </div>
              <span className="text-sm font-sans font-extrabold text-white tracking-wide leading-none select-none">
                Mods
              </span>
            </div>

            {/* Active mods count bubble indicator */}
            {(settings.selectedMods || []).length > 0 && (
              <div className="absolute top-1.5 right-2 px-1.5 py-0.5 bg-lime-500 rounded-full text-[8px] font-black font-mono text-black leading-none border border-black/40 z-10" style={{ transform: 'skew-x(12deg)' }}>
                {(settings.selectedMods || []).length}
              </div>
            )}

            {/* Underline lime status bar highlight */}
            <div className="absolute bottom-0 inset-x-0 h-[3px] bg-[#a3e635] rounded-bl-lg" />
          </button>

          {/* RANDOM BUTTON CONTAINER */}
          <button
            onClick={handleSelectRandom}
            className="relative flex flex-col items-center justify-center bg-[#1e2326]/90 hover:bg-[#252b2f] border border-white/10 active:brightness-95 w-32 h-16 transition-all duration-150 shadow-md cursor-pointer group"
            style={{ transform: 'skew-x(-12deg)', borderTopRightRadius: '14px', borderBottomRightRadius: '14px' }}
          >
            {/* Unskewed inner items */}
            <div className="flex flex-col items-center gap-1.5" style={{ transform: 'skew-x(12deg)' }}>
              {/* Blue crossing diagonal shuffle arrows */}
              <div className="text-[#38bdf8] flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-shuffle transition group-hover:rotate-12">
                  <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-7.6c.9-1.1 2.1-1.7 3.4-1.7H22" />
                  <path d="M22 6l3 3-3 3" />
                  <path d="M2 6h1.4c1.3 0 2.5.6 3.3 1.7l6.1 7.6c.9 1.1 2.1 1.7 3.4 1.7H22" />
                  <path d="M22 18l3-3-3-3" />
                </svg>
              </div>
              <span className="text-sm font-sans font-extrabold text-white tracking-wide leading-none select-none">
                Random
              </span>
            </div>

            {/* Underline sky-blue status bar highlight */}
            <div className="absolute bottom-0 inset-x-0 h-[3px] bg-[#38bdf8] rounded-br-lg" />
          </button>
        </div>
      </div>

      {/* =======================================================
          MODS INTERACTIVE OVERLAY SCREEN
          ======================================================= */}
      <AnimatePresence>
        {showModsModal && (
          <>
            {/* Seamless backdrop overlay */}
            <motion.div 
              key="mods-backdrop"
              className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm cursor-pointer"
              onClick={() => setShowModsModal(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />

            {/* Bottom drawer style popup matching settings and catalog designs but wider */}
            <motion.div
              key="mods-panel"
              className="fixed inset-3 sm:inset-6 md:inset-8 lg:inset-[7vh_auto] lg:left-1/2 lg:-translate-x-1/2 z-[110] w-auto lg:w-[min(1080px,calc(100vw-64px))] max-h-[calc(100vh-24px)] md:max-h-[86vh] bg-[#292a2e]/[.98] border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.75)] flex flex-col rounded-lg overflow-hidden font-sans text-slate-200"
              initial={{ y: '100vh', opacity: 0.6 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100vh', opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
              style={{ willChange: 'transform, opacity' }}
            >
              {/* Header mirrors the compact mode switcher from the reference UI. */}
              <div className="flex-none px-5 sm:px-8 py-5 border-b border-white/[.07] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#303136]">
                <div>
                  <h1 className="text-2xl sm:text-[2rem] leading-none font-semibold tracking-[-.04em] text-white">
                    Gameplay Modifiers
                  </h1>
                  <p className="text-[11px] text-white/45 mt-2 tracking-wide">Tune the chart to match the way you play.</p>
                </div>

                <div className="flex items-center gap-1.5 self-start sm:self-auto">
                  <button
                    type="button"
                    className="h-9 px-3 rounded-lg bg-white/25 text-white text-sm font-medium flex items-center gap-1.5 shadow-inner"
                    aria-pressed="true"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" /> Play
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const active = settings.selectedMods || [];
                      updateSettings({ selectedMods: active.includes('AT') ? active.filter(mod => mod !== 'AT') : [...active, 'AT'] });
                    }}
                    className={`h-9 px-3 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
                      (settings.selectedMods || []).includes('AT') ? 'bg-sky-400/25 text-sky-200' : 'text-white/65 hover:bg-white/10 hover:text-white'
                    }`}
                    aria-pressed={(settings.selectedMods || []).includes('AT')}
                  >
                     <span className="text-xs font-black">AP</span> Autoplay
                  </button>
                  <button
                    type="button"
                    disabled
                    className="h-9 px-3 rounded-lg text-sm font-medium flex items-center gap-1.5 text-white/25 cursor-not-allowed"
                    title="Practice mode coming soon"
                  >
                    <span className="text-xs">--</span> Practice - Coming soon
                  </button>
                  <button
                    onClick={() => setShowModsModal(false)}
                    className="ml-2 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white/75 hover:text-white transition duration-150 cursor-pointer flex items-center justify-center"
                    title="Close modifiers"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Scrollable Content Area */}
              <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-6 min-h-0 bg-[#28292d] flex flex-col gap-5">

                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[.07] pb-4">
                  <div className="flex items-center gap-3 text-sm text-white/65">
                    <span>Selected</span>
                     <span className="text-white font-semibold">{(settings.selectedMods || []).length ? (settings.selectedMods || []).map((mod) => mod === 'AT' ? 'AP' : mod).join(' / ') : 'None'}</span>
                  </div>
                  <div className="text-xs font-medium text-[#ff9fba] bg-[#ff80a5]/10 border border-[#ff80a5]/20 rounded-full px-3 py-1.5">
                    {(() => {
                      let factor = 1.0;
                      const active = settings.selectedMods || [];
                      if (active.includes('NF')) factor *= 0.5;
                      if (active.includes('EZ')) factor *= 0.8;
                      if (active.includes('HT')) factor *= 0.5;
                      if (active.includes('HR')) factor *= 1.1;
                      if (active.includes('HD')) factor *= 1.15;
                      if (active.includes('DT')) factor *= 1.25;
                      if (active.some(mod => /^K[2-9]$/.test(mod))) factor *= 0.9;
                      return `Multiplier ${factor.toFixed(2)}x${active.includes('AT') ? ' / Unranked' : ''}`;
                    })()}
                  </div>
                </div>

                 {/* MODS GRID */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-3 gap-y-7 pb-2 max-w-none w-full justify-items-center">
                  
                  {/* DIFFICULTY REDUCTION MODS */}
                   <div className="contents">
                    <span className="sr-only">Difficulty reduction mods</span>
                    
                     <div className="contents">
                      {[
                        {
                          id: 'NF',
                          title: 'NoFail (NF)',
                          activeBg: 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400',
                          mult: '0.50x'
                        },
                        {
                          id: 'EZ',
                          title: 'Easy (EZ)',
                          activeBg: 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400',
                          mult: '0.80x',
                          exclusiveWith: 'HR'
                        },
                        {
                          id: 'HT',
                          title: 'HalfTime (HT)',
                          activeBg: 'bg-teal-500/20 border-teal-500/60 text-teal-400',
                          mult: '0.50x',
                          exclusiveWith: 'DT'
                        }
                      ].map((mod) => {
                        const isActive = (settings.selectedMods || []).includes(mod.id);
                        const tile = MODIFIER_TILES.find((item) => item.id === mod.id);
                        const Icon = tile?.icon || Sparkles;
                        return (
                          <button
                            type="button"
                            key={mod.id}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              let mods = [...(settings.selectedMods || [])];
                              if (isActive) {
                                mods = mods.filter(m => m !== mod.id);
                              } else {
                                // handle exclusivities
                                if (mod.exclusiveWith) {
                                  mods = mods.filter(m => m !== mod.exclusiveWith);
                                }
                                mods.push(mod.id);
                              }
                              updateSettings({ selectedMods: mods });
                            }}
                             title={mod.title}
                             className="group flex min-w-0 flex-col items-center gap-2 text-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#28292d]"
                           >
                              <span className={`relative flex h-[104px] w-[104px] shrink-0 flex-col items-center justify-center overflow-hidden rounded-xl transition-all duration-150 group-hover:-translate-y-0.5 group-hover:bg-white/[.14] group-active:scale-95 ${isActive ? tile?.activeClass || 'bg-white/20 text-white' : 'bg-white/[.08] text-white/80'}`}>
                                <span className="absolute inset-x-0 top-2 text-center text-[10px] font-black tracking-wide text-white/70">{mod.mult}</span>
                                <Icon className="h-10 w-10 stroke-[2.25] transition-transform duration-150 group-hover:scale-110" />
                                {isActive && <span className="absolute bottom-2 h-1 w-1 rounded-full bg-current" />}
                              </span>
                              <span className={`max-w-[112px] text-xs font-semibold leading-tight ${isActive ? 'text-white' : 'text-white/60 group-hover:text-white/85'}`}>{tile?.name || mod.title}</span>
                           </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* DIFFICULTY INCREASE MODS */}
                   <div className="contents">
                    <span className="sr-only">Difficulty increase mods</span>
                    
                     <div className="contents">
                      {[
                        {
                          id: 'HR',
                          title: 'HardRock (HR)',
                          activeBg: 'bg-rose-500/20 border-rose-500/60 text-rose-400',
                          mult: '1.10x',
                          exclusiveWith: 'EZ'
                        },
                        {
                          id: 'HD',
                          title: 'Hidden (HD)',
                          activeBg: 'bg-purple-500/20 border-purple-500/60 text-purple-400',
                          mult: '1.15x'
                        },
                        {
                          id: 'DT',
                          title: 'DoubleTime (DT)',
                          activeBg: 'bg-[#ff80a5]/20 border-[#ff80a5]/60 text-[#ff80a5]',
                          mult: '1.25x',
                          exclusiveWith: 'HT'
                        }
                      ].map((mod) => {
                        const isActive = (settings.selectedMods || []).includes(mod.id);
                        const tile = MODIFIER_TILES.find((item) => item.id === mod.id);
                        const Icon = tile?.icon || Sparkles;
                        return (
                          <button
                            type="button"
                            key={mod.id}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              let mods = [...(settings.selectedMods || [])];
                              if (isActive) {
                                mods = mods.filter(m => m !== mod.id);
                              } else {
                                if (mod.exclusiveWith) {
                                  mods = mods.filter(m => m !== mod.exclusiveWith);
                                }
                                mods.push(mod.id);
                              }
                              updateSettings({ selectedMods: mods });
                            }}
                             title={mod.title}
                             className="group flex min-w-0 flex-col items-center gap-2 text-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#28292d]"
                           >
                              <span className={`relative flex h-[104px] w-[104px] shrink-0 flex-col items-center justify-center overflow-hidden rounded-xl transition-all duration-150 group-hover:-translate-y-0.5 group-hover:bg-white/[.14] group-active:scale-95 ${isActive ? tile?.activeClass || 'bg-white/20 text-white' : 'bg-white/[.08] text-white/80'}`}>
                                <span className="absolute inset-x-0 top-2 text-center text-[10px] font-black tracking-wide text-white/70">{mod.mult}</span>
                                <Icon className="h-10 w-10 stroke-[2.25] transition-transform duration-150 group-hover:scale-110" />
                                {isActive && <span className="absolute bottom-2 h-1 w-1 rounded-full bg-current" />}
                              </span>
                              <span className={`max-w-[112px] text-xs font-semibold leading-tight ${isActive ? 'text-white' : 'text-white/60 group-hover:text-white/85'}`}>{tile?.name || mod.title}</span>
                           </button>
                        );
                      })}
                    </div>
                  </div>

                   {/* KEY CONVERSION MODS */}
                   <div className="contents">
                     <span className="sr-only">Key conversion</span>
                     {[2, 3, 4, 5, 6, 7, 8, 9].map((keyCount) => {
                       const id = `K${keyCount}`;
                       const isActive = (settings.selectedMods || []).includes(id);
                       const isDisabled = availableKeyCounts.includes(keyCount);
                       return (
                         <button
                           type="button"
                           key={id}
                           disabled={isDisabled}
                           title={isDisabled ? `${keyCount}K is already native to this map` : `Force ${keyCount}-key play`}
                           onClick={() => !isDisabled && toggleKeyModifier(keyCount)}
                           className="group flex min-w-0 flex-col items-center gap-2 text-center cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#28292d]"
                         >
                           <span className={`relative flex h-[104px] w-[104px] shrink-0 flex-col items-center justify-center overflow-hidden rounded-xl transition-all duration-150 group-active:scale-95 ${isDisabled ? 'bg-black/30 text-white/20 opacity-50' : isActive ? 'bg-cyan-500/25 text-cyan-300 shadow-[0_8px_24px_rgba(6,182,212,0.18)] group-hover:-translate-y-0.5' : 'bg-white/[.08] text-white/80 group-hover:-translate-y-0.5 group-hover:bg-white/[.14]'}`}>
                             <span className="absolute inset-x-0 top-2 text-center text-[10px] font-black tracking-wide text-white/70">0.90x</span>
                             <Keyboard className="h-10 w-10 stroke-[2.25] transition-transform duration-150 group-hover:scale-110" />
                             <span className="absolute bottom-2 text-[10px] font-black tracking-wider">K{keyCount}</span>
                           </span>
                           <span className={`max-w-[112px] text-xs font-semibold leading-tight ${isDisabled ? 'text-white/25' : isActive ? 'text-white' : 'text-white/60 group-hover:text-white/85'}`}>{keyCount}K Mode</span>
                         </button>
                       );
                     })}
                   </div>

                   {/* AUTOMATION MODS */}
                   <div className="contents">
                     <span className="sr-only">Autoplay</span>
                     {(() => {
                       const mod = MODIFIER_TILES.find((item) => item.id === 'AT')!;
                       const isActive = (settings.selectedMods || []).includes(mod.id);
                       const Icon = mod.icon;
                       return (
                         <button
                           type="button"
                           onClick={() => toggleModifier(mod.id)}
                           title={mod.title}
                           className="group flex min-w-0 flex-col items-center gap-2 text-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#28292d]"
                         >
                           <span className={`relative flex h-[104px] w-[104px] shrink-0 flex-col items-center justify-center overflow-hidden rounded-xl transition-all duration-150 group-hover:-translate-y-0.5 group-hover:bg-white/[.14] group-active:scale-95 ${isActive ? mod.activeClass : 'bg-white/[.08] text-white/80'}`}>
                             <span className="absolute inset-x-0 top-2 text-center text-[10px] font-black tracking-wide text-white/70">{mod.multiplier}</span>
                             <Icon className="h-10 w-10 stroke-[2.25] transition-transform duration-150 group-hover:scale-110" />
                             {isActive && <span className="absolute bottom-2 h-1 w-1 rounded-full bg-current" />}
                           </span>
                           <span className={`max-w-[112px] text-xs font-semibold leading-tight ${isActive ? 'text-white' : 'text-white/60 group-hover:text-white/85'}`}>{mod.name}</span>
                         </button>
                       );
                     })()}
                   </div>

                </div>

              </div>

              {/* Bottom status/nav metrics and footer triggers */}
              <div className="flex-none px-6 md:px-12 py-4 bg-[#101016]/85 border-t border-white/5 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => updateSettings({ selectedMods: [] })}
                  className="px-4 py-2.5 bg-slate-900 border border-white/10 hover:bg-slate-800 rounded-xl font-bold font-sans text-xs text-slate-300 hover:text-white transition cursor-pointer shadow-md"
                >
                  RESET ALL MODS
                </button>
                
                <button
                  type="button"
                  onClick={() => setShowModsModal(false)}
                  className="px-6 py-2.5 bg-[#ff80a5] hover:brightness-110 text-slate-950 font-black font-sans text-xs rounded-xl transition cursor-pointer uppercase tracking-wider shadow-lg hover:scale-105 active:scale-95"
                >
                  Apply Selection
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
