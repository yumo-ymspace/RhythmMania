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
  Search, Upload, Sliders, Play, Settings, Compass, Info, Trash2, 
  Loader, Cloud, CloudOff, Database, FileText, Sparkles, Music, 
  ChevronDown, ChevronUp, Star, Check, SlidersHorizontal, Shuffle, 
  Repeat, Layers, Eye, Volume2, User, Clock, Heart, Award, ArrowUpRight, X
} from 'lucide-react';
import { Beatmap, GameSettings } from '../types';
import { parseBeatmap, parseMediaPaths } from '../utils/beatmapParser';
import { RobustZipResolver } from '../utils/zipResolver';
import { AssetLifecycleManager } from '../utils/assetLifecycle';
import { storageManager } from '../utils/storageManager';
import { TempMemoryCache } from '../utils/tempMemoryCache';
import { unpackBeatmap } from '../utils/unpackHelper';
import metadata from '../../metadata.json';

interface SongSelectProps {
  settings: GameSettings;
  updateSettings: (s: Partial<GameSettings>) => void;
  onSelectMap: (map: Beatmap) => void;
  onOpenSettings: () => void;
  customMaps: Beatmap[];
  onImportBeatmap: (map: Beatmap) => void;
  onDeleteCustomMap?: (id: string) => void;
  onDeleteSongGroup?: (mapIds: string[]) => void;
  filterMode: number;
  setSongSelectBgUrl?: (url: string) => void;
}

export default function SongSelect({
  settings,
  updateSettings,
  onSelectMap,
  onOpenSettings,
  customMaps,
  onImportBeatmap,
  onDeleteCustomMap,
  onDeleteSongGroup,
  filterMode,
  setSongSelectBgUrl
}: SongSelectProps) {
  // Search & Basic UI State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCustomMapId, setSelectedCustomMapId] = useState<string>('');
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
  const [isDragActive, setIsDragActive] = useState<boolean>(false);
  const [importStatus, setImportStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [songDeleteConfirmKey, setSongDeleteConfirmKey] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [isLoadingMedia, setIsLoadingMedia] = useState<boolean>(false);

  const [serverManifest, setServerManifest] = useState<any[]>([]);
  const [showServerPackages, setShowServerPackages] = useState<boolean>(true);
  const [downloadingMapId, setDownloadingMapId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ loaded: number; total: number; percentage: number } | null>(null);

  // High-fidelity options, filters, details state variables
  const [showPreplayOptions, setShowPreplayOptions] = useState<boolean>(false);
  const [minStar, setMinStar] = useState<number>(0.0);
  const [maxStar, setMaxStar] = useState<number>(10.0);
  const [showConverts, setShowConverts] = useState<boolean>(true);
  const [sortBy, setSortBy] = useState<string>('Title');
  const [groupBy, setGroupBy] = useState<string>('None');
  const [collectionFilter, setCollectionFilter] = useState<string>('Downloaded');
  const [selectedDetailTab, setSelectedDetailTab] = useState<'details' | 'ranking'>('details');
  const [localScores, setLocalScores] = useState<any[]>([]);
  const [showModsModal, setShowModsModal] = useState<boolean>(false);

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

  // Fetch server manifest on mount
  useEffect(() => {
    const fetchManifest = async () => {
      try {
        const response = await fetch(`/beatmaps/manifest.json?t=${Date.now()}`);
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data)) {
            setServerManifest(data);
          }
        }
      } catch (err) {
        console.warn('Unable to load beatmap manifest. Using cached custom maps only.', err);
      }
    };
    fetchManifest();
  }, []);

  // Sync state for play history records of the selected beatmap
  useEffect(() => {
    try {
      const storedHistoryText = localStorage.getItem('rhythm_mania_v1_play_history');
      if (storedHistoryText) {
        const parsed = JSON.parse(storedHistoryText);
        if (Array.isArray(parsed)) {
          setLocalScores(parsed);
        }
      }
    } catch (e) {
      console.warn('Failed to load performance score logs:', e);
    }
  }, [selectedCustomMapId, showPreplayOptions]);

  // Clean raw local custom URL allocations prior to page reload/destruction
  useEffect(() => {
    return () => {
      // Intentionally NOT clearing blob URLs here, as those are required during gameplay and passed verbatim.
      // AssetLifecycleManager.clearAll(); (Removed to fix Audio Failed to Decode issues during handoff)
    };
  }, []);

  // Determine actual star rating dynamically
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
    
    // Fallback deterministic star code
    const hash = (map.id || '').split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
    const calculated = 1.0 + (hash % 75) / 10; 
    return Math.round(calculated * 100) / 100;
  };

  const getDifficultyColor = (rating: number) => {
    if (rating < 2.0) return 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20';
    if (rating < 3.0) return 'text-cyan-400 bg-cyan-500/10 border border-cyan-500/20';
    if (rating < 4.0) return 'text-amber-400 bg-amber-500/10 border border-amber-500/20';
    if (rating < 5.0) return 'text-orange-400 bg-orange-500/10 border border-orange-500/20';
    if (rating < 6.5) return 'text-rose-400 bg-rose-500/10 border border-rose-500/20';
    return 'text-purple-400 bg-purple-500/10 border border-purple-500/20';
  };

  const getCircleColor = (rating: number) => {
    if (rating < 2.0) return 'bg-emerald-450';
    if (rating < 3.0) return 'bg-cyan-455';
    if (rating < 4.0) return 'bg-amber-450';
    if (rating < 5.0) return 'bg-orange-450';
    if (rating < 6.5) return 'bg-rose-450';
    return 'bg-purple-450';
  };

  // Extract merged custom and virtual server/cloud maps
  const getMergedCustomMaps = (): Beatmap[] => {
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

    // 2. Synthesize virtual servers packages as cloud offerings
    if (showServerPackages) {
      serverManifest.forEach((s) => {
        const pkgId = `pkg_${s.id}`;
        const isAlreadyImported = resolvedCustomMaps.push && resolvedCustomMaps.some(
          m => (m as any).parentPackageId === s.id || (m as any).packageId === pkgId
        );

        if (!isAlreadyImported) {
          resolvedCustomMaps.push({
            id: s.id,
            title: s.title,
            artist: s.artist,
            bpm: s.bpm || 120,
            creator: s.creator || 'Server',
            difficulty: s.difficultiesSummary?.[0] || s.difficultsSummary?.[0] || 'Cloud Pack',
            keyCount: s.keyCount || 4,
            duration: s.duration || 180,
            isServerPackage: true,
            isServerMap: true,
            oszUrl: s.oszUrl,
            difficultiesSummary: s.difficultiesSummary || s.difficultsSummary || [],
            notes: [],
            hpDrainRate: 8,
            overallDifficulty: 8,
            audioUrl: '',
            videoUrl: '',
            bgUrl: '',
            packageId: `pkg_${s.id}`,
            parentPackageId: s.id,
            mode: s.mode !== undefined ? s.mode : 3,
          } as any);
        }
      });
    }

    return resolvedCustomMaps;
  };

  const mergedCustomMaps = getMergedCustomMaps();



  // Save selected map ID to local storage for persistent selection
  useEffect(() => {
    if (selectedCustomMapId) {
      localStorage.setItem('rhythm_mania_v1_last_selected_map_id', selectedCustomMapId);
    }
  }, [selectedCustomMapId]);

  // Filter and prepare display beatmaps
  const filteredCustomMaps = React.useMemo(() => {
    return mergedCustomMaps.filter(map => {
      // Game mode (Mania vs Standard)
      const mapMode = map.mode !== undefined ? map.mode : 3;
      if (mapMode !== filterMode) return false;

      // Filter by search text query
      const matchesSearch = map.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            map.artist.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (map.creator && map.creator.toLowerCase().includes(searchTerm.toLowerCase()));
      if (!matchesSearch) return false;

      // Filter by dynamic star limits
      const rating = getStarRating(map);
      if (rating < minStar || rating > maxStar) return false;

      // Filter by Collection / Source type
      if (collectionFilter === 'Downloaded') {
        if ((map as any).isServerPackage) return false;
      } else if (collectionFilter === 'Cloud/Virtual') {
        if (!(map as any).isServerPackage) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'Title') return a.title.localeCompare(b.title);
      if (sortBy === 'Artist') return a.artist.localeCompare(b.artist);
      if (sortBy === 'Difficulty') return getStarRating(b) - getStarRating(a);
      if (sortBy === 'BPM') return (b.bpm || 0) - (a.bpm || 0);
      return 0;
    });
  }, [mergedCustomMaps, searchTerm, minStar, maxStar, collectionFilter, sortBy, filterMode]);

  const getMapSongKey = (map: any) => {
    const mapPkgId = map.parentPackageId || (map.packageId ? map.packageId.replace(/^pkg_/, '') : undefined);
    if (mapPkgId) return `server_pkg_${mapPkgId}`;
    const mapArtist = map.artist || 'Unknown';
    const mapTitle = map.title || 'Untitled';
    return `${mapArtist.toLowerCase().trim()} - ${mapTitle.toLowerCase().trim()}`;
  };

  // Group maps by normalized artist & title
  const songGroups = React.useMemo(() => {
    const groupsMap = new Map<string, {
      songKey: string;
      title: string;
      artist: string;
      creator?: string;
      isServerPackage?: boolean;
      packageId?: string;
      oszUrl?: string;
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
        const mapPkgId = map.parentPackageId || (map.packageId ? map.packageId.replace(/^pkg_/, '') : undefined);
        const matchingManifest = mapPkgId ? serverManifest.find(s => s.id === mapPkgId) : undefined;
        
        group = {
          songKey,
          title: matchingManifest ? matchingManifest.title : mapTitle,
          artist: matchingManifest ? matchingManifest.artist : mapArtist,
          creator: matchingManifest ? matchingManifest.creator : (map.creator || (map as any).creator),
          isServerPackage: !!(map as any).isServerPackage,
          packageId: (map as any).packageId,
          oszUrl: (map as any).oszUrl,
          bgUrl: map.bgUrl,
          difficultiesSummary: matchingManifest ? (matchingManifest.difficultiesSummary || matchingManifest.difficultsSummary || []) : ((map as any).difficultiesSummary || (map as any).difficultsSummary || []),
          maps: []
        };
        groupsMap.set(songKey, group);
      } else {
        if (!group.bgUrl && map.bgUrl) group.bgUrl = map.bgUrl;
        if (!group.creator && map.creator) group.creator = map.creator;
        if ((map as any).isServerPackage) group.isServerPackage = true;
      }
      
      const mapDiffs = (map as any).difficultiesSummary || (map as any).difficultsSummary;
      if (mapDiffs && mapDiffs.length > (group.difficultiesSummary?.length || 0)) {
        group.difficultiesSummary = mapDiffs;
      }
      
      group.maps.push(map);
    });

    // Mark as local if cached difficulties are bound
    groupsMap.forEach((group) => {
      const containsCached = group.maps.some((m) => (m as any).isCached);
      if (containsCached) {
        group.isServerPackage = false;
      }
    });

    return Array.from(groupsMap.values());
  }, [filteredCustomMaps, serverManifest]);

  const activeSongKey = React.useMemo(() => {
    const selected = filteredCustomMaps.find(m => m.id === selectedCustomMapId);
    if (!selected) return '';
    return getMapSongKey(selected);
  }, [selectedCustomMapId, filteredCustomMaps]);

  const expandedSongKey = manualExpandedSongKey !== null ? manualExpandedSongKey : activeSongKey;

  const handleSelectGroup = (group: any) => {
    if (group.isServerPackage) {
      if (group.maps.length > 0) {
        handleSelectCustomMap(group.maps[0]);
      }
      return;
    }
    if (expandedSongKey === group.songKey) {
      setManualExpandedSongKey('');
    } else {
      setManualExpandedSongKey(group.songKey);
      if (group.maps.length > 0) {
        handleSelectCustomMap(group.maps[0]);
      }
    }
  };

  const selectedCustomMap = mergedCustomMaps.find(m => m.id === selectedCustomMapId) || null;

  // Background cover images (Always ensure we have a beautiful wallpaper background with vibrant, lively colors)
  const selectBgUrl = selectedCustomMap?.bgUrl || '';

  const defaultRandomBgRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (typeof setSongSelectBgUrl === 'function') {
      if (selectBgUrl && selectBgUrl !== '/backgrounds/default.svg') {
        setSongSelectBgUrl(selectBgUrl);
      } else {
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
  }, [selectBgUrl, setSongSelectBgUrl, unpackTrigger]);

  const selectedGroup = React.useMemo(() => {
    if (!selectedCustomMap) return null;
    const songKey = getMapSongKey(selectedCustomMap);
    return songGroups.find(g => g.songKey === songKey) || null;
  }, [selectedCustomMap, songGroups]);

  const difficultiesList = React.useMemo(() => {
    if (!selectedCustomMap) return [];
    const metaDiffs = (selectedCustomMap as any).difficultiesSummary || selectedGroup?.difficultiesSummary;
    if (metaDiffs && metaDiffs.length > 0) return metaDiffs;
    
    if (selectedGroup && selectedGroup.maps.length > 0) {
      return Array.from(new Set(selectedGroup.maps.map(m => m.difficulty || 'Normal')));
    }
    
    return [selectedCustomMap.difficulty || 'Normal'];
  }, [selectedCustomMap, selectedGroup]);

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
    const activeKeyChangeMod = activeMods.find(m => /^K[2-8]$/.test(m));
    
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


  const isSelectedMapReady = (() => {
    if (!selectedCustomMap) return false;
    if ((selectedCustomMap as any).isServerPackage || ((selectedCustomMap as any).isServerMap && !(selectedCustomMap as any).isCached)) {
      return true; // Virtual cloud pack - button will say GET BEATMAP SET
    }
    return !!(selectedCustomMap as any).isCached;
  })();

  // Core map asset extraction and mounting
  const handleSelectCustomMap = async (map: Beatmap, forceUnpack = false) => {
    if (map.id === selectedCustomMapId) {
      // Safely propagate cached URLs from the LRU cache onto this fresh object reference
      const cached = storageManager.lruMediaCache.get(map.id);
      if (cached?.audioUrl && cached?.bgUrl) {
        map.audioUrl = cached.audioUrl;
        map.bgUrl = cached.bgUrl;
        map.videoUrl = cached.videoUrl || '';
      }
      if (!forceUnpack) {
        // If it's missing bgUrl, we MUST unpack it, so don't return early!
        if (cached?.audioUrl && cached?.bgUrl) {
          return;
        }
      }
    }
    
    setSelectedCustomMapId(map.id);
    
    const isVirtualPackage = (map as any).isServerPackage || ((map as any).isServerMap && !(map as any).isCached);
    if (!isVirtualPackage) {
      setIsLoadingMedia(true);
      try {
        const cached = storageManager.lruMediaCache.get(map.id);
        if (cached?.audioUrl && cached?.bgUrl && !forceUnpack) {
          map.audioUrl = cached.audioUrl;
          map.bgUrl = cached.bgUrl;
          map.videoUrl = cached.videoUrl || '';
          setUnpackTrigger(prev => prev + 1);
        } else {
          await unpackBeatmap(map);
          setUnpackTrigger(prev => prev + 1);
        }
      } catch (err) {
        console.warn('Unpacker encountered an issue resolving map media channels:', err);
      } finally {
        setIsLoadingMedia(false);
      }
    }
  };

  const handleStartPlay = async (mapOverride?: Beatmap) => {
    const activeMap = mapOverride || selectedCustomMap;
    if (activeMap) {
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

      const isVirtual = (activeMap as any).isServerMap && !(activeMap as any).isCached;

      if (isVirtual) {
        const oszUrl = (activeMap as any).oszUrl;
        const serverMapId = activeMap.id;
        const serverMapTitle = activeMap.title;

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

              const matchingServerObj = serverManifest.find(s => s.id === serverMapId);
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
            setImportStatus({ type: 'ok', msg: `Successfully downloaded! Pick a difficulty to play.` });
            setSelectedCustomMapId(parsedDifficulties[0].id);
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
        return;
      }

      setIsLoadingMedia(true);
      try {
        await handleSelectCustomMap(activeMap, true);
      } catch (e) {
        console.error('Failed unpacking media prior to gameplay:', e);
      } finally {
        setIsLoadingMedia(false);
      }
      onSelectMap(activeMap);
    }
  };

  // Uploader drag and drop events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

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
        const text = await file.text();
        const customId = `local_diff_${Date.now()}`;
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

        onImportBeatmap(parsedMap);
        setImportStatus({ type: 'ok', msg: `Successfully imported "${parsedMap.title}" - [${parsedMap.difficulty}] difficulty!` });
        setSelectedCustomMapId(parsedMap.id);
      } else {
        const zip = await JSZip.loadAsync(file);
        
        // Remove all .wav files from the uploaded zip
        const zipKeys = Object.keys(zip.files);
        let wavsDeletedCount = 0;
        for (const key of zipKeys) {
          if (key.toLowerCase().endsWith('.wav')) {
            zip.remove(key);
            wavsDeletedCount++;
          }
        }
        if (wavsDeletedCount > 0) {
          console.log(`Removed ${wavsDeletedCount} .wav files from uploaded local map: ${file.name}`);
        }

        const fileNames = Object.keys(zip.files);
        const beatmapFiles: { name: string; content: string }[] = [];

        for (const name of fileNames) {
          if (name.toLowerCase().endsWith('.osu') && !zip.files[name].dir) {
            const content = await zip.files[name].async('text');
            beatmapFiles.push({ name, content });
          }
        }

        if (beatmapFiles.length === 0) {
          throw new Error('Empty package structure. No beatmap files discovered.');
        }

        // Generate clean zip package without wavs
        const cleanedBlob = await zip.generateAsync({ type: 'blob' });

        // Save binary bundle to local storage
        const packageId = `pkg_${Date.now()}`;
        await storageManager.savePackage(packageId, file.name, cleanedBlob);

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

            onImportBeatmap(parsedMap);
            successCount++;
            lastId = parsedMap.id;
          }
        }

        if (successCount > 0) {
          setImportStatus({ type: 'ok', msg: `Successfully unpacked ${successCount} playable difficulties!` });
          if (lastId) setSelectedCustomMapId(lastId);
        } else {
          throw new Error('No playable difficulties found in package.');
        }
      }
    } catch (err: any) {
      setImportStatus({ type: 'err', msg: err?.message || 'Failure processing package structure.' });
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

  // Extract selected beatmap statistics
  const currentStarRating = selectedCustomMap ? getStarRating(selectedCustomMap) : 0.0;
  const filteredScores = localScores.filter(s => s.beatmapId === selectedCustomMapId);

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
                backgroundImage: `url("${selectBgUrl}")`,
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
                      {downloadingMapId ? 'FETCHING' : 'MANIA'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Text Info */}
              <div className="space-y-1">
                <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight leading-none">
                  {selectedCustomMap.title}
                </h1>
                <p className="text-base text-pink-400 font-medium uppercase tracking-widest">
                  {selectedCustomMap.artist}
                </p>
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

              {downloadingMapId && downloadProgress && (
                <div className="w-full max-w-sm flex flex-col gap-1.5 bg-black/40 border border-pink-500/20 p-4 rounded-xl shadow-lg">
                  <div className="flex justify-between text-[10px] font-mono font-black text-pink-400 uppercase">
                    <span>DOWNLOADING BEATMAP SET</span>
                    <span>{downloadProgress.percentage}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                    <div className="bg-pink-500 h-full transition-all" style={{ width: `${downloadProgress.percentage}%` }} />
                  </div>
                </div>
              )}
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

                  {filterMode !== 0 && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-[11px] font-mono tracking-wider text-slate-350 uppercase">
                        <span>Scroll Multiplier:</span>
                        <span className="text-amber-400 font-bold">{settings.scrollSpeed}x</span>
                      </div>
                      <input 
                        type="range"
                        min="5"
                        max="80"
                        value={settings.scrollSpeed}
                        onChange={(e) => updateSettings({ scrollSpeed: parseInt(e.target.value) })}
                        className="w-full accent-amber-450 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>
                  )}

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

      {/* SONGSELECT BIG MAIN HEADER ROW */}
      <div className="w-full max-w-none px-4 lg:px-10 pt-2 pb-1.5 flex justify-between items-center gap-4 z-10 relative select-none border-b border-white/[0.03]">
        <div className="flex flex-col text-left shrink-0 bg-[#09090d] border border-white/10 px-5 py-2 rounded-xl shadow-lg">
          <h1 className="text-xl md:text-2xl font-black tracking-[0.2em] text-skin-accent leading-none font-sans">
            SONG SELECT
          </h1>
        </div>
      </div>

      {/* 3. MAIN BEATMAP SELECT SCREEN STAGE PANEL - 3-COLUMN RECONSTRUCTION */}
      <div className="flex-1 w-full max-w-none px-4 lg:px-10 min-h-0 p-2 lg:p-4 grid grid-cols-1 lg:grid-cols-12 gap-6 z-10 relative overflow-hidden">
        
        {/* =======================================================
            LEFT COLUMN: DISPLAY METRICS & PLAY HISTORIC STATISTICS 
            ======================================================= */}
        <div className="lg:col-span-4 flex flex-col gap-4 text-left h-full overflow-y-auto pr-1 pb-[72px]">          {selectedCustomMap ? (
            <div className="flex flex-col gap-5 bg-[#0c0c12] p-5 rounded-2xl border border-white/10 shadow-2xl relative z-10">
              
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
                className="w-full py-4 bg-skin-accent hover:brightness-110 active:scale-95 text-slate-950 font-sans font-black text-base uppercase tracking-widest rounded-xl shadow-lg shadow-skin-accent/20 flex items-center justify-center gap-2 transform transition hover:scale-[1.01] duration-150 cursor-pointer border border-white/10 select-none"
              >
                <Play className="h-5 w-5 fill-current text-slate-950" />
                <span>PLAY SONG</span>
              </button>

              {/* DELETE CUSTOM SONG SET */}
              {(!(selectedCustomMap as any).isServerMap || (selectedCustomMap as any).isCached) && (
                <div className="w-full">
                  {showDeleteConfirm ? (
                    <div className="flex gap-2 p-2 bg-red-950/20 border border-red-500/30 rounded-xl">
                      <button
                        onClick={async () => {
                          if (selectedCustomMap) {
                            const songKey = getMapSongKey(selectedCustomMap);
                            const mapsToDelete = customMaps.filter(m => getMapSongKey(m) === songKey).map(m => m.id);
                            if (onDeleteSongGroup && mapsToDelete.length > 0) {
                              onDeleteSongGroup(mapsToDelete);
                            } else if (onDeleteCustomMap) {
                              onDeleteCustomMap(selectedCustomMap.id);
                            }
                            setSelectedCustomMapId('');
                          }
                          setShowDeleteConfirm(false);
                        }}
                        className="flex-1 py-1.5 bg-red-650 hover:bg-red-700 text-white font-mono text-[10px] font-black uppercase rounded-lg transition cursor-pointer"
                      >
                        CONFIRM DEL
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="px-3 py-1.5 bg-slate-850 hover:bg-slate-800 text-slate-350 font-mono text-[10px] font-black uppercase rounded-lg border border-white/5 transition cursor-pointer"
                      >
                        CANCEL
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="w-full py-1.5 bg-red-955/20 hover:bg-red-955/40 border border-red-500/15 hover:border-red-500/35 text-red-400 font-mono text-[9px] uppercase font-black tracking-widest rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer mt-0.5"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>DELETE BEATMAP SET</span>
                    </button>
                  )}
                </div>
              )}

              {/* Integrated file drag and drop area for a compact utility drop */}
              <div 
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="p-3 rounded-xl border border-dashed border-white/10 text-center cursor-pointer hover:border-pink-500/30 bg-black/20 hover:bg-black/40 transition flex flex-col items-center justify-center"
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
              </div>

              {importStatus && (
                <div className={`p-2 rounded text-[9px] font-mono border ${
                  importStatus.type === 'ok' ? 'bg-emerald-950/20 text-emerald-400 border-emerald-900/30' : 'bg-rose-950/20 text-rose-400 border-rose-900/30'
                }`}>
                  {importStatus.msg}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-24 gap-4 opacity-75 bg-[#0c0c12] p-6 rounded-2xl border border-white/10 shadow-2xl relative z-10">
              <span className="p-4 bg-pink-500/10 text-pink-500 rounded-full border border-pink-500/20 shadow animate-pulse">
                <Music className="h-8 w-8 text-pink-500" />
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-xs font-sans font-black text-white tracking-widest uppercase">
                  NO SONGS SELECTED
                </h3>
                <p className="text-[10px] text-slate-500 font-mono max-w-xs leading-relaxed uppercase">
                  Download or select a song to play!
                </p>
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
        <div className="lg:col-span-4 flex flex-col gap-3 h-full min-h-0 -mr-4 lg:-mr-10">
          
          {/* SEARCH INTERFACE */}
          <div className="px-4 lg:px-6 relative flex-shrink-0">
            <Search className="absolute left-7 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              id="song-search-input"
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-6 py-2 bg-[#0f0e15] border border-white/10 rounded-xl font-sans text-xs text-white placeholder-slate-500 focus:outline-none focus:border-skin-accent/50 focus:ring-1 focus:ring-skin-accent/30 transition-all shadow-lg"
            />
            <span className="absolute right-7 top-2 px-2 py-0.5 bg-[#1b1c24] border border-white/10 text-[9px] font-mono text-slate-400 font-bold rounded">
              {filteredCustomMaps.length} matches
            </span>
          </div>

          {/* HIGH-DENSITY SCROLL BEATMAP GROUP LISTING CARD STACK */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden py-1 flex flex-col gap-1 relative z-10 min-h-0 pb-[72px]">
            {songGroups.length > 0 ? (
              songGroups.map((group) => {
                const isGroupActive = selectedGroup?.songKey === group.songKey;
                const hasActiveMap = group.maps.some(m => m.id === selectedCustomMapId);

                return (
                  <div key={group.songKey} className="flex flex-col gap-0 transition-all pl-8">
                    
                    {/* GROUP HEADER ITEM CARD */}
                    <div 
                      onClick={() => handleSelectGroup(group)}
                      className={`group transition-all duration-300 relative border-l border-t border-b cursor-pointer select-none overflow-hidden rounded-l-xl ${
                        isGroupActive 
                          ? 'border-skin-accent shadow-skin-accent-glow bg-[#1a1726]/100 ml-[-20px]'
                          : hasActiveMap
                            ? 'border-skin-accent/30 bg-[#0e0c15]/95'
                            : 'border-white/[0.03] bg-[#0c0c12]/95 hover:bg-[#12121a]/98 hover:border-white/10'
                      } border-r-0`}
                    >
                      <div className="flex items-center justify-between p-4 py-3">
                        <div className="flex flex-col text-left overflow-hidden min-w-0 pr-2 flex-1">
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

                        {/* RIGHT SIDE OF ROW: KEY COUNT */}
                        <div className="flex items-center gap-2.5 shrink-0 select-none">
                          {group.maps?.length > 0 && (
                            <span className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[10px] font-mono font-black text-slate-300">
                              {Array.from(new Set(group.maps.map(m => m.keyCount).filter(Boolean)))
                                .sort((a, b) => Number(a) - Number(b))
                                .map(k => `${k}K`)
                                .join('/')}
                            </span>
                          )}

                          {group.isServerPackage && (
                            <span className="px-1.5 py-0.5 bg-cyan-500/15 border border-cyan-500/20 text-cyan-300 text-[8px] font-mono font-black tracking-widest rounded uppercase">
                              CLOUD
                            </span>
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
              className="fixed inset-x-0 bottom-0 z-[110] w-full max-h-[85vh] md:max-h-[90vh] bg-gradient-to-t from-[#0c0c12]/98 to-[#06060a]/98 border-t border-white/10 shadow-[0_-20px_50px_rgba(0,0,0,0.85)] flex flex-col rounded-t-3xl overflow-hidden font-sans text-slate-200"
              initial={{ y: '100vh', opacity: 0.6 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100vh', opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
              style={{ willChange: 'transform, opacity' }}
            >
              {/* Top signature pink accent rail */}
              <div className="h-1 w-full bg-[#ff80a5] shadow-[0_0_8px_rgba(255,128,165,0.3)] flex-none" />

              {/* Header section with closing button */}
              <div className="flex-none px-6 md:px-12 py-5 border-b border-white/5 flex items-center justify-between bg-black/10">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 shadow-inner">
                    <SlidersHorizontal className="h-6 w-6 text-[#ff80a5]" />
                  </div>
                  <div>
                    <h1 className="text-xl font-black tracking-widest text-[#ff80a5] font-sans uppercase">
                      GAMEPLAY MODS SELECTOR
                    </h1>
                    <p className="text-[10px] text-slate-400 font-mono uppercase mt-0.5 tracking-wider">
                      Select game modifiers to customize your scoring multiplier
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowModsModal(false)}
                  className="p-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition duration-150 cursor-pointer shadow-md"
                  title="Close mods selector"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Scrollable Content Area */}
              <div className="flex-1 overflow-y-auto px-6 md:px-12 py-6 min-h-0 bg-black/5 flex flex-col gap-6">
                
                {/* active listing total multiplier stats badge row */}
                <div className="bg-[#1a1525] border border-[#ff80a5]/20 p-3.5 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                  <span className="text-xs font-bold text-slate-300 font-mono uppercase">
                    Active Mods: {(settings.selectedMods || []).length > 0 ? (
                      <span className="text-[#ff80a5] font-black ml-1">
                        {(settings.selectedMods || []).join(', ')}
                      </span>
                    ) : 'None'}
                  </span>
                  <div className="px-3.5 py-1.5 bg-[#ff80a5]/10 text-[#ff80a5] font-black font-mono text-xs rounded-full border border-[#ff80a5]/20 shadow-sm whitespace-nowrap">
                    SCORING MULTIPLIER: {(() => {
                      let factor = 1.0;
                      const active = settings.selectedMods || [];
                      if (active.includes('NF')) factor *= 0.5;
                      if (active.includes('EZ')) factor *= 0.5;
                      if (active.includes('HT')) factor *= 0.3;
                      if (active.includes('HR')) factor *= 1.06;
                      if (active.includes('HD')) factor *= 1.06;
                      if (active.includes('DT')) factor *= 1.12;
                      return factor.toFixed(2) + 'x';
                    })()}
                  </div>
                </div>

                {/* MODS GRID GROUPS */}
                <div className="grid grid-cols-1 xl:grid-cols-3 md:grid-cols-2 gap-6 pb-6">
                  
                  {/* DIFFICULTY REDUCTION MODS */}
                  <div className="bg-[#0e0e15] border border-white/5 p-5 rounded-2xl flex flex-col gap-4 shadow-md">
                    <span className="text-[10px] font-black tracking-wider text-emerald-400 uppercase font-mono border-b border-emerald-500/10 pb-2 flex items-center justify-between">
                      <span>DIFFICULTY REDUCTION</span>
                      <span className="text-[8px] text-slate-500 font-bold">MUTUALLY EXCLUSIVE</span>
                    </span>
                    
                    <div className="flex flex-col gap-3">
                      {[
                        {
                          id: 'NF',
                          title: 'NoFail (NF)',
                          desc: 'Cannot fail the song even if you reach zero HP.',
                          activeBg: 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400',
                          mult: '0.50x'
                        },
                        {
                          id: 'EZ',
                          title: 'Easy (EZ)',
                          desc: 'Toggles larger difficulty hit windows with less HP drain.',
                          activeBg: 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400',
                          mult: '0.50x',
                          exclusiveWith: 'HR'
                        },
                        {
                          id: 'HT',
                          title: 'HalfTime (HT)',
                          desc: 'Decreases playback speed and rate by 0.75x.',
                          activeBg: 'bg-teal-500/20 border-teal-500/60 text-teal-400',
                          mult: '0.30x',
                          exclusiveWith: 'DT'
                        }
                      ].map((mod) => {
                        const isActive = (settings.selectedMods || []).includes(mod.id);
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
                            className={`p-3.5 rounded-xl border flex gap-3.5 text-left items-start transition-all cursor-pointer ${
                              isActive 
                                ? mod.activeBg 
                                : 'bg-[#12121c] hover:bg-[#181826] border-white/5 text-slate-350'
                            }`}
                          >
                            {/* Circle logo abbreviation */}
                            <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center font-black font-sans text-xs ${isActive ? 'bg-black/30' : 'bg-white/5 border border-white/10 shadow-inner'}`}>
                              {mod.id}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-black tracking-wide uppercase">{mod.title}</span>
                                <span className="text-[8px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-white/5 shrink-0">{mod.mult} Multiplier</span>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-1 leading-relaxed font-mono uppercase">{mod.desc}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* DIFFICULTY INCREASE MODS */}
                  <div className="bg-[#0e0e15] border border-white/5 p-5 rounded-2xl flex flex-col gap-4 shadow-md">
                    <span className="text-[10px] font-black tracking-wider text-rose-400 uppercase font-mono border-b border-rose-500/10 pb-2 flex items-center justify-between">
                      <span>DIFFICULTY INCREASE</span>
                      <span className="text-[8px] text-slate-500 font-bold">TRAINING CHALLENGES</span>
                    </span>
                    
                    <div className="flex flex-col gap-3">
                      {[
                        {
                          id: 'HR',
                          title: 'HardRock (HR)',
                          desc: 'Tighter timing accuracy windows, faster HP loss.',
                          activeBg: 'bg-rose-500/20 border-rose-500/60 text-rose-400',
                          mult: '1.06x',
                          exclusiveWith: 'EZ'
                        },
                        {
                          id: 'HD',
                          title: 'Hidden (HD)',
                          desc: 'Fades notes out completely before hitting target.',
                          activeBg: 'bg-purple-500/20 border-purple-500/60 text-purple-400',
                          mult: '1.06x'
                        },
                        {
                          id: 'DT',
                          title: 'DoubleTime (DT)',
                          desc: 'Increases playback and simulation rate by 1.50x.',
                          activeBg: 'bg-[#ff80a5]/20 border-[#ff80a5]/60 text-[#ff80a5]',
                          mult: '1.12x',
                          exclusiveWith: 'HT'
                        }
                      ].map((mod) => {
                        const isActive = (settings.selectedMods || []).includes(mod.id);
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
                            className={`p-3.5 rounded-xl border flex gap-3.5 text-left items-start transition-all cursor-pointer ${
                              isActive 
                                ? mod.activeBg 
                                : 'bg-[#12121c] hover:bg-[#181826] border-white/5 text-slate-350'
                            }`}
                          >
                            {/* Circle logo abbreviation */}
                            <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center font-black font-sans text-xs ${isActive ? 'bg-black/30' : 'bg-white/5 border border-white/10 shadow-inner'}`}>
                              {mod.id}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-black tracking-wide uppercase">{mod.title}</span>
                                <span className="text-[8px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-white/5 shrink-0">{mod.mult} Multiplier</span>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-1 leading-relaxed font-mono uppercase">{mod.desc}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* KEY CHANGE MODS */}
                  <div className="bg-[#0e0e15] border border-white/5 p-5 rounded-2xl flex flex-col gap-4 shadow-md col-span-1 md:col-span-2 xl:col-span-1">
                    <span className="text-[10px] font-black tracking-wider text-cyan-400 uppercase font-mono border-b border-cyan-500/10 pb-2 flex items-center justify-between">
                      <span>KEY CONVERSION</span>
                      <span className="text-[8px] text-slate-500 font-bold">MUTUALLY EXCLUSIVE</span>
                    </span>
                    
                    <div className="flex flex-col gap-2.5 max-h-[300px] overflow-y-auto pr-1">
                      {[2, 3, 4, 5, 6, 7, 8].map((k) => {
                        const modId = `K${k}`;
                        const isActive = (settings.selectedMods || []).includes(modId);
                        const isDisabled = availableKeyCounts.includes(k);
                        
                        return (
                          <button
                            type="button"
                            key={modId}
                            disabled={isDisabled}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (isDisabled) return;
                              
                              let mods = [...(settings.selectedMods || [])];
                              if (isActive) {
                                mods = mods.filter(m => m !== modId);
                              } else {
                                // Remove all other key change mods first
                                mods = mods.filter(m => !/^K[2-8]$/.test(m));
                                mods.push(modId);
                              }
                              updateSettings({ selectedMods: mods });
                            }}
                            className={`p-3 rounded-xl border flex gap-3 text-left items-start transition-all ${
                              isDisabled
                                ? 'bg-black/40 border-white/2.5 text-slate-600 opacity-40 cursor-not-allowed'
                                : isActive 
                                  ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-400 cursor-pointer' 
                                  : 'bg-[#12121c] hover:bg-[#181826] border-white/5 text-slate-350 cursor-pointer'
                            }`}
                          >
                            {/* Circle logo abbreviation */}
                            <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center font-black font-sans text-xs ${isActive ? 'bg-black/30' : isDisabled ? 'bg-white/2.5 text-slate-600' : 'bg-white/5 border border-white/10 shadow-inner'}`}>
                              {k}K
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1.5">
                                <span className="text-[10px] font-black tracking-wide uppercase">{k} Keys (K{k})</span>
                                {isDisabled ? (
                                  <span className="text-[8px] font-mono text-rose-400 bg-rose-950/40 px-1.5 py-0.5 rounded border border-rose-500/10 shrink-0">Map Native</span>
                                ) : (
                                  <span className="text-[8px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-white/5 shrink-0">1.00x Multiplier</span>
                                )}
                              </div>
                              <p className="text-[9px] text-slate-500 mt-0.5 leading-normal font-mono uppercase">
                                {isDisabled 
                                  ? `Native ${k}K difficulty is already available` 
                                  : `Forces playfield to utilize ${k}-lane layout.`}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
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
