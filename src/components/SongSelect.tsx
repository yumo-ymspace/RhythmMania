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

import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { Search, Upload, Sliders, Play, Settings, Compass, Info, Trash2, Loader, Cloud, CloudOff, Database, FileText, Sparkles, Music, ChevronDown, ChevronUp, Star, Check } from 'lucide-react';
import { Beatmap, GameSettings } from '../types';
import { parseOsuBeatmap, parseMediaPaths } from '../utils/beatmapParser';
import { RobustZipResolver } from '../utils/zipResolver';
import { AssetLifecycleManager } from '../utils/assetLifecycle';
import { storageManager } from '../utils/storageManager';
import { TempMemoryCache } from '../utils/tempMemoryCache';

interface SongSelectProps {
  settings: GameSettings;
  updateSettings: (s: Partial<GameSettings>) => void;
  onSelectMap: (map: Beatmap) => void;
  onOpenGlobalSettings: () => void;
  customMaps: Beatmap[];
  onImportOsuMap: (map: Beatmap) => void;
  onDeleteCustomMap?: (id: string) => void;
  onDeleteSongGroup?: (mapIds: string[]) => void;
}

export default function SongSelect({
  settings,
  updateSettings,
  onSelectMap,
  onOpenGlobalSettings,
  customMaps,
  onImportOsuMap,
  onDeleteCustomMap,
  onDeleteSongGroup
}: SongSelectProps) {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCustomMapId, setSelectedCustomMapId] = useState<string>('');
  const [manualExpandedSongKey, setManualExpandedSongKey] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setIsDragActive] = useState<boolean>(false);
  const [importStatus, setImportStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [songDeleteConfirmKey, setSongDeleteConfirmKey] = useState<string | null>(null);
  const [isLoadingMedia, setIsLoadingMedia] = useState<boolean>(false);

  const [serverManifest, setServerManifest] = useState<any[]>([]);
  const [showServerPackages, setShowServerPackages] = useState<boolean>(true);
  const [downloadingMapId, setDownloadingMapId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ loaded: number; total: number; percentage: number } | null>(null);

  useEffect(() => {
    const fetchManifest = async () => {
      try {
        const response = await fetch('/beatmaps/manifest.json');
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data)) {
            setServerManifest(data);
          }
        }
      } catch (err) {
        console.warn('Offline mode: Gracefully fell back for custom beatmap loading.', err instanceof Error ? err.message : String(err));
      }
    };
    fetchManifest();
  }, []);

  const handleSelectCustomMap = async (map: Beatmap) => {
    setSelectedCustomMapId(map.id);
    const mapWithPkg = map as any;
    if (mapWithPkg.isServerMap && !mapWithPkg.isCached) {
      return;
    }

    // Clear stale mutated blob URLs if they are not in the active media cache
    const cached = storageManager.lruMediaCache.get(map.id);
    if (!cached) {
      if (map.audioUrl?.startsWith('blob:')) map.audioUrl = '';
      if (map.videoUrl?.startsWith('blob:')) map.videoUrl = '';
      if (map.bgUrl?.startsWith('blob:')) map.bgUrl = '';
    } else {
      map.audioUrl = cached.audioUrl || map.audioUrl;
      map.videoUrl = cached.videoUrl || map.videoUrl;
      map.bgUrl = cached.bgUrl || map.bgUrl;
    }

    if (mapWithPkg.packageId) {
      setIsLoadingMedia(true);
      try {
        const cachedInside = storageManager.lruMediaCache.get(map.id);
        if (cachedInside) {
          map.audioUrl = cachedInside.audioUrl || map.audioUrl;
          map.videoUrl = cachedInside.videoUrl || map.videoUrl;
          map.bgUrl = cachedInside.bgUrl || map.bgUrl;
          return;
        }

        let zipBuffer: ArrayBuffer | Blob | null = TempMemoryCache.get(mapWithPkg.packageId);
        if (!zipBuffer) {
          zipBuffer = await storageManager.getPackage(mapWithPkg.packageId);
        }

        if (zipBuffer) {
          const zip = await JSZip.loadAsync(zipBuffer);
          const resolver = new RobustZipResolver(zip);
          const audioFilename = mapWithPkg.audioFilename || '';
          const videoFilename = mapWithPkg.videoFilename || '';
          const bgFilename = mapWithPkg.bgFilename || '';

          let parsedAudioUrl = '';
          let parsedVideoUrl = '';
          let parsedBgUrl = '';

          if (audioFilename) {
            const file = resolver.findFile(audioFilename);
            if (file) {
              const b = await file.async('blob');
              parsedAudioUrl = AssetLifecycleManager.registerBlob(b);
            }
          }
          if (videoFilename) {
            const file = resolver.findFile(videoFilename);
            if (file) {
              const b = await file.async('blob');
              parsedVideoUrl = AssetLifecycleManager.registerBlob(b);
            }
          }

          if (!parsedAudioUrl) {
            const fallbackObj = await resolver.findLargestFileByExtensions(['.mp3', '.ogg', '.wav']) || resolver.findFallbackByExtensions(['.mp3', '.ogg', '.wav'])?.file;
            if (fallbackObj) {
              const b = await fallbackObj.async('blob');
              parsedAudioUrl = AssetLifecycleManager.registerBlob(b);
            }
          }
          if (!parsedVideoUrl) {
            const fallbackObj = await resolver.findLargestFileByExtensions(['.mp4', '.webm', '.avi', '.mkv']) || resolver.findFallbackByExtensions(['.mp4', '.webm', '.avi'])?.file;
            if (fallbackObj) {
              const b = await fallbackObj.async('blob');
              parsedVideoUrl = AssetLifecycleManager.registerBlob(b);
            }
          }

          if (!parsedVideoUrl && bgFilename) {
            const file = resolver.findFile(bgFilename);
            if (file) {
              const b = await file.async('blob');
              parsedBgUrl = AssetLifecycleManager.registerBlob(b);
            }
          }
          if (!parsedVideoUrl && !parsedBgUrl) {
            const fallbackObj = await resolver.findLargestFileByExtensions(['.jpg', '.jpeg', '.png', '.bmp']) || resolver.findFallbackByExtensions(['.jpg', '.jpeg', '.png', '.bmp'])?.file;
            if (fallbackObj) {
              const b = await fallbackObj.async('blob');
              parsedBgUrl = AssetLifecycleManager.registerBlob(b);
            }
          }

          storageManager.lruMediaCache.put(map.id, {
            audioUrl: parsedAudioUrl,
            videoUrl: parsedVideoUrl,
            bgUrl: parsedBgUrl
          });

          if (parsedAudioUrl) map.audioUrl = parsedAudioUrl;
          if (parsedVideoUrl) map.videoUrl = parsedVideoUrl;
          if (parsedBgUrl) map.bgUrl = parsedBgUrl;

          TempMemoryCache.remove(mapWithPkg.packageId);
        }
      } catch (err) {
        console.error('Error unpacking file media:', err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoadingMedia(false);
      }
    }
  };

  const getMergedCustomMaps = () => {
    const resolvedCustomMaps = customMaps.map(map => {
      const mapWithMeta = map as any;
      const isServer = !!mapWithMeta.isServerMap || !!mapWithMeta.parentPackageId || (mapWithMeta.packageId && serverManifest.some(s => `pkg_${s.id}` === mapWithMeta.packageId));
      return {
        ...map,
        isServerMap: isServer,
        isCached: true,
        parentPackageId: mapWithMeta.parentPackageId || (mapWithMeta.packageId ? mapWithMeta.packageId.replace(/^pkg_/, '') : undefined),
        oszUrl: mapWithMeta.oszUrl || (isServer ? serverManifest.find(s => `pkg_${s.id}` === mapWithMeta.packageId || s.id === mapWithMeta.parentPackageId)?.oszUrl : undefined),
      };
    });

    const virtualServerPackages: any[] = [];
    if (showServerPackages) {
      const activePackageIds = new Set<string>();
      customMaps.forEach(m => {
        const mm = m as any;
        if (mm.parentPackageId) {
          activePackageIds.add(mm.parentPackageId);
        } else if (mm.packageId) {
          activePackageIds.add(mm.packageId.replace(/^pkg_/, ''));
        }
      });

      serverManifest.forEach(s => {
        if (!activePackageIds.has(s.id)) {
          virtualServerPackages.push({
            id: s.id,
            title: s.title.replace(/\s*[([][1-8]K(ey|eys)?(?:\s*Mania)?[\])]/gi, '').trim(),
            artist: s.artist,
            creator: s.creator,
            oszUrl: s.oszUrl,
            hash: s.hash,
            difficultiesSummary: s.difficultiesSummary || [],
            isServerPackage: true,
            isServerMap: true,
            isCached: false,
            bpm: 180,
            duration: 120,
            keyCount: s.keyCount || 4,
            notes: [],
            hpDrainRate: 8,
            overallDifficulty: 8,
            audioUrl: '',
            videoUrl: '',
            bgUrl: '',
            packageId: `pkg_${s.id}`,
            parentPackageId: s.id,
          });
        }
      });
    }

    return [...resolvedCustomMaps, ...virtualServerPackages];
  };

  const mergedCustomMaps = getMergedCustomMaps();

  const filteredCustomMaps = mergedCustomMaps.filter(map => 
    map.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    map.artist.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group the maps by normalized artist & title (osu! style)
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
      const mapTitle = map.title || 'Untitled';
      const mapArtist = map.artist || 'Unknown';
      const songKey = `${mapArtist.toLowerCase().trim()} - ${mapTitle.toLowerCase().trim()}`;
      
      let group = groupsMap.get(songKey);
      if (!group) {
        group = {
          songKey,
          title: mapTitle,
          artist: mapArtist,
          creator: map.creator || (map as any).creator,
          isServerPackage: !!(map as any).isServerPackage,
          packageId: (map as any).packageId,
          oszUrl: (map as any).oszUrl,
          bgUrl: map.bgUrl,
          difficultiesSummary: (map as any).difficultiesSummary || [],
          maps: []
        };
        groupsMap.set(songKey, group);
      }
      group.maps.push(map);
    });

    // Refinement: If a group contains any cached maps, it is local, not a virtual cloud package!
    groupsMap.forEach((group) => {
      const containsCached = group.maps.some((m) => (m as any).isCached);
      if (containsCached) {
        group.isServerPackage = false;
      }
    });

    return Array.from(groupsMap.values());
  }, [filteredCustomMaps]);

  // Determine active dynamic expansion (selected difficulty song)
  const activeSongKey = React.useMemo(() => {
    const selected = filteredCustomMaps.find(m => m.id === selectedCustomMapId);
    if (!selected || (selected as any).isServerPackage) return '';
    return `${(selected.artist || 'Unknown').toLowerCase().trim()} - ${(selected.title || 'Untitled').toLowerCase().trim()}`;
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
      // Autofocus first map inside that group (loads preview immediately)
      if (group.maps.length > 0) {
        handleSelectCustomMap(group.maps[0]);
      }
    }
  };

  const selectedCustomMap = mergedCustomMaps.find(m => m.id === selectedCustomMapId) || null;

  const isSelectedMapReady = (() => {
    if (!selectedCustomMap) return false;
    if ((selectedCustomMap as any).isServerPackage || ((selectedCustomMap as any).isServerMap && !(selectedCustomMap as any).isCached)) {
      return true; // Virtual package needs download first, button is active for GET BEATMAP SET
    }
    if ((selectedCustomMap as any).packageId) {
      const cached = storageManager.lruMediaCache.get(selectedCustomMap.id);
      return !!cached && !!cached.audioUrl;
    }
    return true;
  })();

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processImportedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processImportedFile(e.target.files[0]);
    }
  };

  const processImportedFile = async (file: File) => {
    const isZip = file.name.endsWith('.osz') || file.name.endsWith('.zip');
    
    if (!file.name.endsWith('.osu') && !isZip) {
      setImportStatus({ type: 'err', msg: 'Only .osu files or .osz zipped packages are loadable.' });
      return;
    }

    if (isZip) {
      try {
        setImportStatus({ type: 'ok', msg: 'Reading package data...' });
        const packageId = `pkg_${Date.now()}`;
        await storageManager.savePackage(packageId, file.name, file);

        customMaps.forEach(map => {
          if (map.id === selectedCustomMapId) return;
          storageManager.lruMediaCache.evict(map.id);
        });

        const zip = await JSZip.loadAsync(file);
        const resolver = new RobustZipResolver(zip);
        const fileNames = Object.keys(zip.files);
        const osuFiles: { name: string; content: string }[] = [];
        
        for (const name of fileNames) {
          if (name.toLowerCase().endsWith('.osu') && !zip.files[name].dir) {
            const content = await zip.files[name].async('text');
            osuFiles.push({ name, content });
          }
        }
        
        if (osuFiles.length === 0) {
          setImportStatus({ type: 'err', msg: 'Package contains no playable .osu files.' });
          return;
        }

        let importedCount = 0;
        let lastId = '';
        let lastMap: Beatmap | null = null;
        
        for (let i = 0; i < osuFiles.length; i++) {
          const osu = osuFiles[i];
          const mapId = `custom_${Date.now()}_idx${i}`;
          const parsedMap = parseOsuBeatmap(osu.content, mapId);
          
          if (parsedMap.notes.length > 0) {
            const media = parseMediaPaths(osu.content);
            const mapWithMeta = parsedMap as any;
            
            mapWithMeta.packageId = packageId;
            mapWithMeta.audioFilename = media.audioFilename;
            mapWithMeta.videoFilename = media.videoFilename;
            mapWithMeta.bgFilename = media.bgFilename;
            mapWithMeta.originalOsuContent = osu.content;
            
            parsedMap.audioUrl = '';
            parsedMap.videoUrl = '';
            parsedMap.bgUrl = '';
            
            onImportOsuMap(parsedMap);
            lastId = parsedMap.id;
            lastMap = parsedMap;
            importedCount++;
          }
        }
        
        if (importedCount > 0 && lastMap) {
          setSelectedCustomMapId('');
          setImportStatus({ 
            type: 'ok', 
            msg: `Successfully imported ${importedCount} beatmaps! Select a map from the library list on the left to play.` 
          });
        } else {
          setImportStatus({ type: 'err', msg: 'No playable difficulties inside.' });
        }
        setTimeout(() => setImportStatus(null), 5000);
      } catch (err) {
        setImportStatus({ type: 'err', msg: 'Error decompressing zipped beatmap package.' });
      }
      return;
    }

    try {
      const text = await file.text();
      const mapId = `custom_${Date.now()}`;
      const parsedMap = parseOsuBeatmap(text, mapId);

      if (parsedMap.notes.length === 0) {
        setImportStatus({ type: 'err', msg: 'No standard notes found.' });
        return;
      }

      onImportOsuMap(parsedMap);
      setSelectedCustomMapId('');
      setImportStatus({ 
        type: 'ok', 
        msg: `Successfully loaded single beatmap: "${parsedMap.title}"! Select it from the library list on the left to play.` 
      });
      setTimeout(() => setImportStatus(null), 5000);
    } catch (err) {
      setImportStatus({ type: 'err', msg: 'Error parsing .osu structure.' });
    }
  };

  const handleStartPlay = async () => {
    if (selectedCustomMap) {
      // Automatic fullscreen on mobile devices to optimize playable vertical space
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
            elem.requestFullscreen().catch(err => console.log('Fullscreen request was blocked:', err));
          } else if ((elem as any).webkitRequestFullscreen) {
            (elem as any).webkitRequestFullscreen();
          } else if ((elem as any).msRequestFullscreen) {
            (elem as any).msRequestFullscreen();
          }
        } catch (fullscreenErr) {
          console.warn('Browser standard fullscreen is unsupported or denied inside iframe sandbox:', fullscreenErr);
        }
      }

      const isVirtual = (selectedCustomMap as any).isServerMap && !(selectedCustomMap as any).isCached;

      if (isVirtual) {
        const oszUrl = (selectedCustomMap as any).oszUrl;
        const serverMapId = selectedCustomMap.id;
        const serverMapTitle = selectedCustomMap.title;

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
            throw new Error('ReadableStream reader is unsupported.');
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

          await storageManager.savePackage(packageId, `${serverMapTitle}.osz`, blob);
          await new Promise(resolve => setTimeout(resolve, 15));

          const zip = await JSZip.loadAsync(blob);
          const resolver = new RobustZipResolver(zip);
          const fileNames = Object.keys(zip.files);
          const osuFiles: { name: string; content: string }[] = [];

          for (const name of fileNames) {
            if (name.toLowerCase().endsWith('.osu') && !zip.files[name].dir) {
              const content = await zip.files[name].async('text');
              osuFiles.push({ name, content });
            }
          }

          if (osuFiles.length === 0) {
            throw new Error('Invalid package structure.');
          }

          let importedCount = 0;
          const parsedDifficulties: Beatmap[] = [];

          for (let i = 0; i < osuFiles.length; i++) {
            const osu = osuFiles[i];
            const mapId = `${serverMapId}_idx${i}`;
            const parsedMap = parseOsuBeatmap(osu.content, mapId);

            if (parsedMap.notes.length > 0) {
              const media = parseMediaPaths(osu.content);
              const mapWithMeta = parsedMap as any;

              mapWithMeta.packageId = packageId;
              mapWithMeta.parentPackageId = serverMapId;
              mapWithMeta.audioFilename = media.audioFilename;
              mapWithMeta.videoFilename = media.videoFilename;
              mapWithMeta.bgFilename = media.bgFilename;
              mapWithMeta.originalOsuContent = osu.content;
              mapWithMeta.isServerMap = true;
              mapWithMeta.oszUrl = oszUrl;

              // Defer media URL generation to selection time to prevent stale Blobs
              parsedMap.audioUrl = '';
              parsedMap.videoUrl = '';
              parsedMap.bgUrl = '';

              onImportOsuMap(parsedMap);
              parsedDifficulties.push(parsedMap);
              importedCount++;
            }
          }

          if (importedCount > 0 && parsedDifficulties.length > 0) {
            setImportStatus({ type: 'ok', msg: `Successfully downloaded and cached "${serverMapTitle}"!` });
            setSelectedCustomMapId('');
          } else {
            throw new Error('No valid playable difficulties found inside.');
          }

        } catch (err: any) {
          console.error('Progressive downloader error:', err instanceof Error ? err.message : String(err));
          try {
            await storageManager.deleteBeatmapAndCleanup(serverMapId);
          } catch {
            // Safe skip
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
        await handleSelectCustomMap(selectedCustomMap);
      } catch (e) {
        console.error('Failed unpacking custom map media prior to launch:', e instanceof Error ? e.message : String(e));
      } finally {
        setIsLoadingMedia(false);
      }
      onSelectMap(selectedCustomMap);
    }
  };

  return (
    <div id="song-select-container" className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full max-w-7xl mx-auto h-full p-2 lg:p-4">
      
      {/* LEFT COL: BEATMAP LISTING PLATFORM */}
      <div className="lg:col-span-7 flex flex-col gap-6">
        
        {/* UPPER CONTROLS GRID PANEL */}
        <div className="bg-[#08080C]/90 border border-white/5 p-6 rounded-2xl flex flex-col gap-4 shadow-xl relative overflow-hidden backdrop-blur-md">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="p-3 bg-skin-accent-dim text-skin-accent rounded-xl border border-skin-accent-dim shadow-skin-accent-glow">
                <Compass className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-black uppercase italic tracking-wider text-white">
                  BROWSE <span className="text-skin-accent">BEATMAPS</span>
                </h2>
                <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mt-0.5">
                  Select server map packs or import custom files • {mergedCustomMaps.length} total
                </p>
              </div>
            </div>

            <div className="flex gap-2 items-center justify-end w-full sm:w-auto shrink-0">
              <button
                id="toggle-server-packages-btn"
                onClick={() => setShowServerPackages(prev => !prev)}
                className={`flex items-center gap-1.5 px-3 py-2 font-sans text-[10px] font-black uppercase tracking-wider rounded-lg border transition-all cursor-pointer ${
                  showServerPackages 
                    ? 'bg-skin-accent-dim hover:brightness-110 text-skin-accent border border-skin-accent-dim shadow-skin-accent-glow' 
                    : 'bg-white/5 hover:bg-white/10 text-slate-400 border-white/5'
                }`}
                title={showServerPackages ? "Hide Cloud Beats" : "Show Cloud Beats"}
              >
                {showServerPackages ? <CloudOff className="h-3.5 w-3.5" /> : <Cloud className="h-3.5 w-3.5" />}
                <span>{showServerPackages ? "Hide Cloud" : "Show Cloud"}</span>
              </button>

              <button
                id="global-settings-btn"
                onClick={onOpenGlobalSettings}
                className="flex items-center gap-1.5 px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 font-sans text-[10px] font-black uppercase tracking-wider rounded-lg border border-white/5 transition-all cursor-pointer"
              >
                <Settings className="h-3.5 w-3.5 text-skin-accent" /> Settings
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
            <input 
              id="song-search-input"
              type="text"
              placeholder="Filter by title, artist, creator..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-black/40 border border-white/5 rounded-xl font-sans text-xs text-white placeholder-slate-500 focus:outline-none focus:border-skin-accent-dim focus:ring-1 focus:ring-skin-accent-dim transition-all"
            />
          </div>
        </div>

        {/* COMPACT BEATMAP LIST WITH OSU-LIKE SONG GROUPS & DIFFICULTY CORNER DROPDOWNS */}
        <div className="flex-1 max-h-[500px] overflow-y-auto pr-1 flex flex-col gap-2.5">
          {songGroups.length > 0 ? (
            songGroups.map((group) => {
              const isGroupExpanded = expandedSongKey === group.songKey;
              
              // Count how many keys are represented in the group (e.g. 4K, 7K)
              const keysSet = new Set(group.maps.map(m => m.keyCount));
              const keysLabel = Array.from(keysSet).map(k => `${k}K`).join(' / ');

              // Check if any map inside is the selected map
              const hasActiveMap = group.maps.some(m => m.id === selectedCustomMapId);

              return (
                <div 
                  key={group.songKey}
                  className="flex flex-col gap-1 transition-all"
                >
                  {/* GROUP CARD HEADER - Click to Expand / Select First Diff */}
                  <div
                    onClick={() => handleSelectGroup(group)}
                    className={`p-3 rounded-xl flex items-center justify-between gap-3.5 border transition-all relative overflow-hidden backdrop-blur-md cursor-pointer ${
                      isGroupExpanded
                        ? 'bg-gradient-to-r from-slate-900/90 to-[#0e0e15]/90 border-indigo-500/25 shadow-sm'
                        : hasActiveMap
                          ? 'bg-gradient-to-r from-indigo-950/20 to-[#08080c]/90 border-skin-accent-dim/40 hover:border-skin-accent-dim/60 shadow-sm'
                          : 'bg-[#08080C]/90 border-white/[0.03] hover:border-white/10 hover:bg-slate-950/90 opacity-90'
                    }`}
                  >
                    {/* Background image tint subtle glow just like premium interfaces */}
                    {group.bgUrl && (
                      <div 
                        className="absolute inset-x-0 -top-12 -bottom-12 bg-cover bg-center opacity-[0.035] pointer-events-none scale-105 select-none blur-sm"
                        style={{ backgroundImage: `url(${group.bgUrl})` }}
                      />
                    )}

                    <div className="flex items-center gap-3 w-full pr-1 overflow-hidden pointer-events-none select-none">
                      {/* Song thumbnail art */}
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
                        {/* Server/Cloud Pack Badge integrated */}
                        {group.isServerPackage && (
                          <div className="absolute inset-0 bg-cyan-950/40 flex items-center justify-center">
                            <Cloud className="h-3.5 w-3.5 text-cyan-400" />
                          </div>
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
                          <span className={`font-bold px-1.5 py-0.5 border rounded uppercase tracking-wide text-[8px] ${
                            group.isServerPackage 
                              ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' 
                              : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/15'
                          }`}>
                            {group.isServerPackage 
                              ? (group.difficultiesSummary?.length || 1) 
                              : group.maps.length} {((group.isServerPackage ? group.difficultiesSummary?.length : group.maps.length) || 1) === 1 ? 'difficulty' : 'difficulties'}
                          </span>
                          {!group.isServerPackage && (
                            <>
                              <span className="text-slate-700">•</span>
                              <span className="text-slate-400 font-bold">{keysLabel}</span>
                            </>
                          )}
                          {group.creator && (
                            <>
                              <span className="text-slate-700">•</span>
                              <span className="text-slate-500 truncate max-w-[120px]">by {group.creator}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right expand visual indicator */}
                    <div className="flex items-center gap-2 shrink-0">
                      {group.isServerPackage ? (
                        <span className="px-1.5 py-0.5 bg-cyan-400/5 border border-cyan-400/10 text-cyan-300 text-[8px] font-mono rounded font-black tracking-widest uppercase shrink-0">
                          CLOUD
                        </span>
                      ) : (
                        <div className="flex items-center gap-2" onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
                          {/* Trash button to delete entire song */}
                          {songDeleteConfirmKey === group.songKey ? (
                            <div className="flex gap-1 items-center bg-rose-950/95 border border-rose-500/30 text-[8px] uppercase font-bold text-white px-2 py-1 rounded-md shadow-lg pointer-events-auto z-30">
                              <span className="text-[7px] text-rose-350 mr-1 font-mono font-bold">ALL DIFFS?</span>
                              <button
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  ev.preventDefault();
                                  const mapIds = group.maps.map((m: any) => m.id);
                                  if (mapIds.includes(selectedCustomMapId)) {
                                    setSelectedCustomMapId('');
                                  }
                                  if (onDeleteSongGroup) {
                                    onDeleteSongGroup(mapIds);
                                  }
                                  setSongDeleteConfirmKey(null);
                                }}
                                className="bg-rose-550 hover:bg-rose-450 text-black font-black rounded px-1.5 py-0.5 cursor-pointer transition leading-none text-[8px]"
                              >
                                YES
                              </button>
                              <button
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  ev.preventDefault();
                                  setSongDeleteConfirmKey(null);
                                }}
                                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-black rounded px-1.5 py-0.5 cursor-pointer transition leading-none text-[8px]"
                              >
                                NO
                              </button>
                            </div>
                          ) : (
                            <button
                              title="Delete Entire Song (All Difficulties)"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                ev.preventDefault();
                                setSongDeleteConfirmKey(group.songKey);
                              }}
                              className="p-1.5 rounded bg-white/5 border border-white/5 text-slate-500 hover:text-red-400 hover:bg-rose-500/10 hover:border-red-500/10 transition-all cursor-pointer mr-0.5 pointer-events-auto z-20"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                          {isGroupExpanded ? (
                            <ChevronUp className="h-4 w-4 text-indigo-400 cursor-pointer pointer-events-auto" onClick={(ev) => { ev.stopPropagation(); ev.preventDefault(); setManualExpandedSongKey(''); }} />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-slate-505 cursor-pointer pointer-events-auto" onClick={(ev) => { ev.stopPropagation(); ev.preventDefault(); setManualExpandedSongKey(group.songKey); }} />
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* DIFFICULTY LEVEL SUB-ROWS (VISIBLE WHEN EXPANDED) */}
                  {isGroupExpanded && !group.isServerPackage && (
                    <div className="mt-1 ml-4 border-l border-indigo-500/20 pl-3 flex flex-col gap-1.5 select-none animate-fade-in-slow">
                      {group.maps.map((map) => {
                        const isSelected = selectedCustomMapId === map.id;
                        const isConfirming = deleteConfirmId === map.id;

                        return (
                          <div
                            id={`custom-map-card-${map.id}`}
                            key={map.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isLoadingMedia) return;
                              handleSelectCustomMap(map);
                            }}
                            className={`p-2.5 rounded-lg transition-all duration-150 flex items-center justify-between gap-3 border ${
                              isSelected 
                                ? 'bg-gradient-to-r from-skin-accent-dim/35 to-indigo-950/15 border-skin-accent/50 shadow-skin-accent-glow'
                                : 'bg-[#050508]/85 border-white/[0.02] hover:bg-[#0c0c14]/90 opacity-90'
                            } ${isLoadingMedia ? 'cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              {/* Sync and media availability type indicators */}
                              <div className={`p-1.5 rounded-md flex items-center justify-center shrink-0 ${
                                isSelected ? 'bg-skin-accent-dim/50 text-skin-accent' : 'bg-white/5 text-slate-500'
                              }`}>
                                {isSelected && isLoadingMedia ? (
                                  <Loader className="h-3 w-3 animate-spin text-skin-accent" />
                                ) : map.isServerMap ? (
                                  !map.isCached ? (
                                    <Cloud className="h-3 w-3 text-skin-accent" />
                                  ) : (
                                    <Database className="h-3 w-3 text-emerald-400" />
                                  )
                                ) : (
                                  <FileText className="h-3 w-3 text-amber-500/80" />
                                )}
                              </div>

                              <div className="min-w-0 flex-1 flex items-center gap-2">
                                <span className="font-extrabold text-[11px] text-white font-sans tracking-tight truncate leading-none">
                                  {map.difficulty || 'Normal'}
                                </span>
                                {(map as any).originalKeyCount && (
                                  <span className="px-1 py-0.5 bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 text-[7px] font-sans font-black tracking-widest uppercase rounded leading-none shrink-0">
                                    [Mod 4K]
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Center features & specs metrics */}
                            <div className="flex items-center gap-3 shrink-0">
                              {map.isServerPackage ? (
                                <span className="px-1.5 py-0.5 bg-cyan-400/5 text-cyan-300 text-[7px] font-mono rounded uppercase tracking-wider border border-cyan-400/10 shrink-0 leading-none">
                                  CLOUD
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 bg-white/5 text-slate-400 text-[7px] font-mono rounded uppercase tracking-wider border border-white/[0.02] shrink-0 leading-none">
                                  {map.keyCount} KEY
                                </span>
                              )}

                              {!map.isServerPackage && map.bpm && (
                                <span className="text-[10px] text-slate-500 font-mono font-semibold shrink-0">
                                  {map.bpm} BPM
                                </span>
                              )}

                              {/* Two-step prompt for deletion */}
                              <div className="flex items-center justify-center relative pointer-events-auto z-20 shrink-0">
                                {!map.isServerPackage && (isConfirming ? (
                                  <div className="flex gap-1 items-center bg-rose-950/95 border border-rose-500/30 text-[8px] uppercase font-bold text-white px-2 py-1 rounded-md shadow-lg">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (onDeleteCustomMap) onDeleteCustomMap(map.id);
                                        setDeleteConfirmId(null);
                                      }}
                                      className="bg-rose-550 hover:bg-rose-450 text-black font-black rounded px-1.5 py-0.5 cursor-pointer transition leading-none"
                                    >
                                      YES
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteConfirmId(null);
                                      }}
                                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-black rounded px-1.5 py-0.5 cursor-pointer transition leading-none"
                                    >
                                      NO
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    title="Delete Custom Beatmap"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteConfirmId(map.id);
                                    }}
                                    className="p-1.5 rounded bg-white/5 border border-white/5 text-slate-500 hover:text-red-400 hover:bg-rose-500/10 hover:border-red-500/10 transition-all cursor-pointer"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                ))}
                              </div>
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
            <div className="bg-[#08080C]/90 border border-white/5 p-8 rounded-2xl flex flex-col items-center justify-center text-center text-slate-500 backdrop-blur-md">
              <Info className="h-6 w-6 mb-2 text-slate-600" />
              <p className="text-xs font-sans max-w-xs leading-relaxed">No custom beatmaps found in this search filter.</p>
            </div>
          )}
        </div>

        {/* UPLOAD FILE CONTAINER DRAG ZONE */}
        <div 
          id="uploader-drag-container"
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`p-6 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 backdrop-blur-md ${
            isDragActive 
              ? 'border-skin-accent bg-skin-accent-dim shadow-skin-accent-glow' 
              : 'border-white/5 hover:border-skin-accent-dim bg-[#08080C]/80 hover:bg-[#08080C]'
          }`}
        >
          <input 
            ref={fileInputRef}
            type="file" 
            accept=".osu,.osz,.zip"
            onChange={handleFileSelect}
            className="hidden" 
          />
          <Upload className={`h-7 w-7 mb-2.5 transition-all ${isDragActive ? 'text-skin-accent animate-bounce font-black' : 'text-slate-500'}`} />
          <h4 className="text-xs font-extrabold font-sans text-slate-200 uppercase tracking-widest">DRAG & DROP .osu OR .osz FILE</h4>
          <p className="text-[9px] text-slate-550 font-mono mt-1 uppercase tracking-wider">Drag and drop standard Osu! Mania format directly</p>
        </div>

        {/* UPLOADING ALERTS */}
        {importStatus && (
          <div className={`p-3.5 rounded-xl border text-[11px] font-mono flex items-center justify-between shadow ${
            importStatus.type === 'ok' ? 'bg-emerald-950/20 text-emerald-450 border-emerald-900/30' : 'bg-rose-950/20 text-rose-450 border-rose-900/30'
          }`}>
            <span>{importStatus.msg}</span>
          </div>
        )}
      </div>

      {/* RIGHT COL: PERFORMANCE PREVIEW CARD */}
      <div className="lg:col-span-5 flex flex-col gap-6">
        
        {/* PLAY SELECTION PANEL */}
        <div className="bg-[#08080c]/95 border border-white/5 p-6 rounded-2xl flex flex-col gap-5 shadow-2xl backdrop-blur-md">
          {!selectedCustomMap ? (
            <div className="flex flex-col items-center justify-center text-center py-12 px-4 gap-4 opacity-80 min-h-[340px]">
              <span className="p-4 bg-skin-accent-dim text-skin-accent rounded-2xl border border-skin-accent-dim shadow-skin-accent-glow animate-pulse">
                <Music className="h-8 w-8 text-skin-accent" />
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-sm font-black font-sans text-white tracking-widest uppercase italic">
                  NO TRACK SELECTED
                </h3>
                <p className="text-[11px] text-slate-400 leading-relaxed font-sans max-w-xs">
                  Please browse the beatmap catalog on the left and select a song from the library to load its metadata and prepare gameplay audio/video channels.
                </p>
              </div>
            </div>
          ) : (
            <>
              <h4 className="text-[10px] text-slate-500 tracking-widest uppercase font-black flex items-center gap-1.5 border-b border-white/5 pb-3">
                <Sliders className="h-3.5 w-3.5 text-skin-accent" /> Track Panel Config
              </h4>
              
              <div className="border-b border-white/5 pb-4">
                <h3 className="text-lg font-black font-sans text-white tracking-tighter uppercase italic leading-tight flex flex-wrap items-center gap-1.5">
                  <span>{selectedCustomMap.title}</span>
                  {(selectedCustomMap as any).originalKeyCount && (
                    <span className="px-1.5 py-0.5 bg-cyan-400/10 border border-cyan-500/20 text-cyan-400 text-[9px] font-sans font-black tracking-wider rounded normal-case shadow-[0_0_10px_rgba(34,211,238,0.15)] animate-pulse">
                      [Mod 4K]
                    </span>
                  )}
                </h3>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className="text-xs text-skin-accent font-sans tracking-tight font-bold uppercase">
                    by {selectedCustomMap.artist}
                  </span>
                  {!(selectedCustomMap as any).isServerPackage && (
                    <>
                      <span className="text-slate-600 text-xs">•</span>
                      <span className="px-1.5 py-0.5 bg-skin-accent-dim text-skin-accent border border-skin-accent-dim rounded font-mono text-[9px] font-bold uppercase">
                        {selectedCustomMap.difficulty}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {(selectedCustomMap as any).isServerPackage ? (
                  <div className="flex flex-col gap-2 bg-black/40 p-4 rounded-xl border border-white/5">
                    <span className="text-[9px] text-slate-500 font-extrabold tracking-widest uppercase">Difficulties In Package</span>
                    <div className="flex flex-col gap-1.5 mt-1">
                      {(selectedCustomMap as any).difficultiesSummary && (selectedCustomMap as any).difficultiesSummary.length > 0 ? (
                        (selectedCustomMap as any).difficultiesSummary.map((diff: string, idx: number) => {
                          const hasStar = diff.includes('★');
                          const diffName = hasStar ? diff.split('★')[0]?.replace('(', '').trim() : diff;
                          return (
                            <div key={idx} className="flex items-center text-[10px] font-mono border-b border-white/5 pb-1.5 last:border-b-0 last:pb-0">
                              <span className="text-slate-300 font-medium uppercase">{diffName}</span>
                            </div>
                          );
                        })
                      ) : (
                        <span className="text-[9px] text-slate-650 font-mono italic">No preview summaries loaded</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1 bg-black/40 p-3.5 rounded-xl border border-white/5">
                      <span className="text-[9px] text-slate-500 font-extrabold tracking-widest uppercase">KEY REQUIREMENT</span>
                      <span className="text-[10px] font-mono text-skin-accent font-black uppercase mt-0.5">
                        {selectedCustomMap.keyCount || 4} Lanes Required (Verified mapping)
                      </span>
                    </div>

                    {selectedCustomMap.keyCount !== 4 && !(selectedCustomMap as any).isServerPackage && (
                      <button
                        id="convert-to-4k-btn"
                        onClick={() => {
                          const convertedNotes = selectedCustomMap.notes.map(note => ({
                            ...note,
                            column: Math.min(3, Math.max(0, note.column % 4))
                          }));
                          const convertedMap = {
                            ...selectedCustomMap,
                            originalKeyCount: selectedCustomMap.keyCount,
                            originalNotes: selectedCustomMap.notes,
                            keyCount: 4,
                            notes: convertedNotes
                          };
                          // Save in IndexedDB and refresh state in parent App
                          onImportOsuMap(convertedMap);
                        }}
                        className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-cyan-500/10 hover:bg-cyan-500/15 text-cyan-400 font-sans text-[10px] font-black uppercase tracking-wider rounded-xl border border-cyan-500/20 hover:border-cyan-500/35 transition-all cursor-pointer shadow-[0_0_12px_rgba(34,211,238,0.1)] active:scale-95"
                        title="Rewrite note columns from multidimensional lanes into standard 4-key maps"
                      >
                        ✦ Convert lanes to 4 keys (4K)
                      </button>
                    )}

                    {(selectedCustomMap as any).originalKeyCount && (
                      <button
                        id="revert-to-original-btn"
                        onClick={() => {
                          const originalMap = {
                            ...selectedCustomMap,
                            keyCount: (selectedCustomMap as any).originalKeyCount,
                            notes: (selectedCustomMap as any).originalNotes || selectedCustomMap.notes,
                            originalKeyCount: undefined,
                            originalNotes: undefined
                          };
                          // Save in IndexedDB and refresh state in parent App
                          onImportOsuMap(originalMap);
                        }}
                        className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/15 text-amber-400 font-sans text-[10px] font-black uppercase tracking-wider rounded-xl border border-amber-500/20 hover:border-amber-500/35 transition-all cursor-pointer shadow-[0_0_12px_rgba(245,158,11,0.1)] active:scale-95"
                        title="Turn back to original key count layout"
                      >
                        ✦ Revert to {(selectedCustomMap as any).originalKeyCount} Keys ({(selectedCustomMap as any).originalKeyCount}K)
                      </button>
                    )}
                  </div>
                )}

                {/* SCROLL SPEED CONTROL */}
                <div className="flex flex-col gap-2 bg-black/40 p-4 rounded-xl border border-white/5">
                  <div className="flex justify-between items-center text-[9px] font-extrabold tracking-widest uppercase">
                    <span className="text-slate-500">Scroll Multiplier</span>
                    <span className="text-skin-accent font-mono font-black">{settings.scrollSpeed}x</span>
                  </div>
                  
                  <input 
                    type="range" 
                    min="10" 
                    max="40" 
                    step="1"
                    value={settings.scrollSpeed}
                    onChange={(e) => updateSettings({ scrollSpeed: parseInt(e.target.value) })}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                    style={{ accentColor: 'var(--skin-accent)' }}
                  />
                  
                  <div className="flex justify-between font-mono text-[8px] text-slate-550 mt-1">
                    <span>SLOW [10]</span>
                    <span>BALANCED [20]</span>
                    <span>HYPER [40]</span>
                  </div>
                </div>
              </div>

              {/* PROGRESS DOWNLOADER REAL-TIME PROGRESS BAR */}
              {downloadingMapId && downloadProgress && (
                <div className="flex flex-col gap-2 p-4 bg-black/65 border border-skin-accent-dim rounded-xl shadow-skin-accent-glow animate-pulse">
                  <div className="flex justify-between items-center text-[9px] font-black font-mono tracking-wider uppercase text-skin-accent">
                    <span>Downloading Track Assets:</span>
                    <span>{downloadProgress.percentage}%</span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-400">
                    {parseFloat((downloadProgress.loaded / 1024 / 1024).toFixed(1))}MB / {parseFloat((downloadProgress.total / 1024 / 1024).toFixed(1))}MB
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden mt-1 heading-none">
                    <div 
                      className="bg-skin-accent h-full transition-all duration-100 shadow-skin-accent-glow" 
                      style={{ width: `${downloadProgress.percentage}%` }}
                    />
                  </div>
                </div>
              )}

              {/* LAUNCH PREVIEW BUTTON */}
              <button
                id="start-play-btn"
                disabled={isLoadingMedia || downloadingMapId !== null || !isSelectedMapReady}
                onClick={handleStartPlay}
                className={`w-full py-4 bg-skin-accent hover:brightness-110 text-slate-950 font-sans font-black text-xs rounded-xl uppercase tracking-[0.2em] italic shadow-skin-accent-neon active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  (isLoadingMedia || downloadingMapId !== null || !isSelectedMapReady) ? 'opacity-50 cursor-not-allowed saturate-50' : ''
                }`}
              >
                {downloadingMapId ? (
                  <>
                    <Loader className="h-4.5 w-4.5 animate-spin text-black" />
                    DOWNLOADING MAPSET...
                  </>
                ) : (isLoadingMedia || !isSelectedMapReady) && !(selectedCustomMap as any)?.isServerPackage ? (
                  <>
                    <Loader className="h-4.5 w-4.5 animate-spin text-black" />
                    UNPACKING CHANNELS...
                  </>
                ) : (selectedCustomMap as any)?.isServerPackage ? (
                  <>
                    <Cloud className="h-4.5 w-4.5 text-black" />
                    GET BEATMAP SET
                  </>
                ) : (
                  <>
                    <Play className="h-4.5 w-4.5 fill-current" />
                    START GAMEPLAY
                  </>
                )}
              </button>
            </>
          )}
        </div>

        {/* SYSTEM CALIBRATION TIP */}
        <div className="bg-[#08080C]/90 border-l-4 border-skin-accent p-5 rounded-r-2xl shadow-xl backdrop-blur-md">
          <div className="flex items-start gap-3.5">
            <span className="p-2.5 bg-skin-accent-dim text-skin-accent rounded-xl mt-0.5 border border-skin-accent-dim shadow-skin-accent-glow">
              <Sliders className="h-4 w-4" />
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-black uppercase tracking-wider text-slate-100">Synchronized Timing Matrix</span>
              <p className="text-[11px] text-slate-400 leading-relaxed font-sans mt-0.5">
                Observe key taps falling out-of-sync with notes? Calibrate your individual delay timings inside the latency offsets control desk.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
