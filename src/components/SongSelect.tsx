/**
 * @license
 * SPDX-License-Identifier: GPL-3.0-only
 */

import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';
import { Search, Upload, Sliders, Play, Settings, Compass, Info, Trash2, Loader, Cloud, CloudOff, Database, FileText, Sparkles, Music } from 'lucide-react';
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
}

export default function SongSelect({
  settings,
  updateSettings,
  onSelectMap,
  onOpenGlobalSettings,
  customMaps,
  onImportOsuMap,
  onDeleteCustomMap
}: SongSelectProps) {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCustomMapId, setSelectedCustomMapId] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setIsDragActive] = useState<boolean>(false);
  const [importStatus, setImportStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
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
            title: s.title.replace(/\s*[([][1-8]K\s*Mania[\])]/gi, '').trim(),
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
            stars: parseFloat(s.difficulty.replace('★', '')) || 5.0,
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

        const blobCache: { [key: string]: string } = {};

        const resolveFileToUrl = async (filename: string | null, fallbackExts: string[]): Promise<string> => {
          if (!filename) {
            const fallbackObj = await resolver.findLargestFileByExtensions(fallbackExts) || resolver.findFallbackByExtensions(fallbackExts)?.file;
            if (fallbackObj) {
              const fileNameKey = (fallbackObj as any).name || 'unknown_fallback';
              if (blobCache[fileNameKey]) return blobCache[fileNameKey];
              const b = await fallbackObj.async('blob');
              const url = AssetLifecycleManager.registerBlob(b);
              blobCache[fileNameKey] = url;
              return url;
            }
            return '';
          }

          const cachedKey = filename.toLowerCase();
          if (blobCache[cachedKey]) return blobCache[cachedKey];

          const fileObj = resolver.findFile(filename);
          if (fileObj) {
            const b = await fileObj.async('blob');
            const url = AssetLifecycleManager.registerBlob(b);
            blobCache[cachedKey] = url;
            return url;
          }

          const fallbackObj = await resolver.findLargestFileByExtensions(fallbackExts) || resolver.findFallbackByExtensions(fallbackExts)?.file;
          if (fallbackObj) {
            const fileNameKey = (fallbackObj as any).name || 'unknown_fallback';
            if (blobCache[fileNameKey]) return blobCache[fileNameKey];
            const b = await fallbackObj.async('blob');
            const url = AssetLifecycleManager.registerBlob(b);
            blobCache[fileNameKey] = url;
            return url;
          }
          return '';
        };
        
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
            
            const audioUrl = await resolveFileToUrl(media.audioFilename, ['.mp3', '.ogg', '.wav']);
            if (audioUrl) parsedMap.audioUrl = audioUrl;

            const videoUrl = await resolveFileToUrl(media.videoFilename, ['.mp4', '.webm', '.avi', '.mkv', '.mov']);
            if (videoUrl) parsedMap.videoUrl = videoUrl;

            const bgUrl = await resolveFileToUrl(media.bgFilename, ['.jpg', '.jpeg', '.png', '.bmp']);
            if (bgUrl) parsedMap.bgUrl = bgUrl;

            storageManager.lruMediaCache.put(parsedMap.id, {
              audioUrl: audioUrl || '',
              videoUrl: videoUrl || '',
              bgUrl: bgUrl || ''
            });
            
            onImportOsuMap(parsedMap);
            lastId = parsedMap.id;
            lastMap = parsedMap;
            importedCount++;
          }
        }
        
        if (importedCount > 0 && lastMap) {
          await handleSelectCustomMap(lastMap);
          setSelectedCustomMapId(lastId);
          setImportStatus({ 
            type: 'ok', 
            msg: `Successfully imported ${importedCount} beatmaps.` 
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
      setSelectedCustomMapId(parsedMap.id);
      setImportStatus({ 
        type: 'ok', 
        msg: `Loaded single beatmap: "${parsedMap.title}"` 
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
            setImportStatus({ type: 'ok', msg: `Successfully downloaded and cached "${serverMapTitle}"! Please select it from the list to play.` });
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
              <span className="p-3 bg-cyan-400/5 text-cyan-400 rounded-xl border border-cyan-400/10">
                <Compass className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-black uppercase italic tracking-wider text-white">
                  BROWSE <span className="text-cyan-400">BEATMAPS</span>
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
                    ? 'bg-cyan-400/10 hover:bg-cyan-400/15 text-cyan-400 border-cyan-400/20' 
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
                <Settings className="h-3.5 w-3.5 text-cyan-400" /> Settings
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
              className="w-full pl-10 pr-4 py-2.5 bg-black/40 border border-white/5 rounded-xl font-sans text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/40 focus:ring-1 focus:ring-cyan-500/10 transition-all"
            />
          </div>
        </div>

        {/* COMPACT BEATMAP LIST */}
        <div className="flex-1 max-h-[500px] overflow-y-auto pr-1 flex flex-col gap-2.5">
          {filteredCustomMaps.length > 0 ? (
            filteredCustomMaps.map((map) => {
              const isSelected = selectedCustomMapId === map.id;
              const isConfirming = deleteConfirmId === map.id;
              return (
                <div
                  id={`custom-map-card-${map.id}`}
                  key={map.id}
                  onClick={() => {
                    if (isLoadingMedia) return;
                    handleSelectCustomMap(map);
                  }}
                  className={`p-3.5 rounded-xl transition-all duration-150 flex items-center justify-between gap-4 border-l-4 border-l-slate-700 ${
                    isSelected 
                      ? 'bg-gradient-to-r from-cyan-950/20 to-indigo-950/20 border-l-cyan-400 border border-cyan-400/20 shadow-[0_0_15px_rgba(34,211,238,0.05)] scale-[1.01]'
                      : 'bg-[#08080C]/90 border border-white/[0.03] opacity-80 hover:opacity-100 hover:border-white/5'
                  } ${isLoadingMedia ? 'cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}
                >
                  <div className="flex items-center gap-3.5 w-full pr-1 overflow-hidden">
                    <div className={`p-2.5 rounded-lg flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-cyan-400/10 text-cyan-400' : 'bg-white/5 text-slate-500'
                    }`}>
                      {isSelected && isLoadingMedia ? (
                        <Loader className="h-4 w-4 animate-spin text-cyan-400" />
                      ) : map.isServerMap ? (
                        !map.isCached ? (
                          <Cloud className="h-4 w-4 text-cyan-400" />
                        ) : (
                          <Database className="h-4 w-4 text-emerald-400" />
                        )
                      ) : (
                        <FileText className="h-4 w-4 text-amber-500/80" />
                      )}
                    </div>
                    
                    <div className="overflow-hidden w-full">
                      <h4 className="font-extrabold font-sans text-xs text-white tracking-tight block truncate uppercase">
                        {map.title}
                        {!map.isServerPackage && (
                          <span className="text-cyan-400 text-[10px] lowercase normal-case ml-1 font-semibold">[{map.difficulty}]</span>
                        )}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-sans block truncate mt-0.5">{map.artist}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex flex-col items-end gap-1">
                      {map.isServerPackage ? (
                        <span className="px-2 py-0.5 bg-cyan-400/5 text-cyan-400 text-[8px] font-mono rounded uppercase tracking-wider border border-cyan-400/10">
                          CLOUD PACK
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-white/5 text-slate-400 text-[8px] font-mono rounded uppercase tracking-wider border border-white/[0.03]">
                          {map.keyCount} KEY
                        </span>
                      )}
                      
                      <div className="flex gap-1.5 items-center font-mono text-[9px] mt-0.5">
                        {map.isServerPackage ? (
                          <span className="text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1">
                            <Sparkles className="h-2.5 w-2.5" /> MULTI DIFFS
                          </span>
                        ) : (
                          <>
                            <span className="text-rose-450 font-bold uppercase border border-rose-500/10 bg-rose-500/5 px-1.5 py-0.5 rounded text-[8px] tracking-wide inline-block max-w-[80px] truncate" title={map.difficulty}>
                              {map.difficulty}
                            </span>
                            <span className="text-slate-600">•</span>
                            <span className="text-slate-400">{map.bpm} BPM</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* TWO STEP SAFE DELETION */}
                    <div className="flex items-center justify-center relative pointer-events-auto z-10 shrink-0">
                      {!map.isServerPackage && (isConfirming ? (
                        <div className="flex gap-1 items-center bg-rose-950/90 border border-rose-500/30 text-[8px] uppercase font-bold text-white px-2 py-1 rounded-lg shadow-lg">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onDeleteCustomMap) onDeleteCustomMap(map.id);
                              setDeleteConfirmId(null);
                            }}
                            className="bg-rose-500 hover:bg-rose-450 text-black font-black rounded px-2 py-0.5 cursor-pointer transition"
                          >
                            YES
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmId(null);
                            }}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-black rounded px-2 py-0.5 cursor-pointer transition"
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
                          className="p-2 rounded-lg bg-white/5 border border-white/5 text-slate-400 hover:text-red-400 hover:bg-rose-500/10 hover:border-red-500/10 transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ))}
                    </div>
                  </div>
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
              ? 'border-cyan-400 bg-cyan-950/10 shadow-inner' 
              : 'border-white/5 hover:border-cyan-400/15 bg-[#08080C]/80 hover:bg-[#08080C]'
          }`}
        >
          <input 
            ref={fileInputRef}
            type="file" 
            accept=".osu,.osz,.zip"
            onChange={handleFileSelect}
            className="hidden" 
          />
          <Upload className={`h-7 w-7 mb-2.5 transition-all ${isDragActive ? 'text-cyan-450 animate-bounce' : 'text-slate-500'}`} />
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
              <span className="p-4 bg-cyan-400/5 text-cyan-400 rounded-2xl border border-cyan-400/10 animate-pulse">
                <Music className="h-8 w-8 text-cyan-400" />
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
                <Sliders className="h-3.5 w-3.5 text-cyan-400" /> Track Panel Config
              </h4>
              
              <div className="border-b border-white/5 pb-4">
                <h3 className="text-lg font-black font-sans text-white tracking-tighter uppercase italic leading-tight block">
                  {selectedCustomMap.title}
                </h3>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className="text-xs text-cyan-400 font-sans tracking-tight font-bold uppercase">
                    by {selectedCustomMap.artist}
                  </span>
                  {!(selectedCustomMap as any).isServerPackage && (
                    <>
                      <span className="text-slate-600 text-xs">•</span>
                      <span className="px-1.5 py-0.5 bg-cyan-400/15 text-cyan-400 border border-cyan-400/30 rounded font-mono text-[9px] font-bold uppercase">
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
                  <div className="flex flex-col gap-1 bg-black/40 p-3.5 rounded-xl border border-white/5">
                    <span className="text-[9px] text-slate-500 font-extrabold tracking-widest uppercase">KEY REQUIREMENT</span>
                    <span className="text-[10px] font-mono text-cyan-400 font-black uppercase mt-0.5">
                      {selectedCustomMap.keyCount || 4} Lanes Required (Verified mapping)
                    </span>
                  </div>
                )}

                {/* SCROLL SPEED CONTROL */}
                <div className="flex flex-col gap-2 bg-black/40 p-4 rounded-xl border border-white/5">
                  <div className="flex justify-between items-center text-[9px] font-extrabold tracking-widest uppercase">
                    <span className="text-slate-500">Scroll Multiplier</span>
                    <span className="text-cyan-400 font-mono font-black">{settings.scrollSpeed}x</span>
                  </div>
                  
                  <input 
                    type="range" 
                    min="10" 
                    max="40" 
                    step="1"
                    value={settings.scrollSpeed}
                    onChange={(e) => updateSettings({ scrollSpeed: parseInt(e.target.value) })}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
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
                <div className="flex flex-col gap-2 p-4 bg-black/65 border border-cyan-500/20 rounded-xl shadow-lg animate-pulse">
                  <div className="flex justify-between items-center text-[9px] font-black font-mono tracking-wider uppercase text-cyan-400">
                    <span>Downloading Track Assets:</span>
                    <span>{downloadProgress.percentage}%</span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-400">
                    {parseFloat((downloadProgress.loaded / 1024 / 1024).toFixed(1))}MB / {parseFloat((downloadProgress.total / 1024 / 1024).toFixed(1))}MB
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden mt-1 heading-none">
                    <div 
                      className="bg-gradient-to-r from-cyan-400 to-indigo-500 h-full transition-all duration-100" 
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
                className={`w-full py-4 bg-blue-600 hover:bg-blue-550 text-white font-sans font-black text-xs rounded-xl uppercase tracking-[0.2em] italic shadow-[0_0_20px_rgba(37,99,235,0.25)] hover:shadow-[0_0_25px_rgba(37,99,235,0.4)] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 ${
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
        <div className="bg-[#08080C]/90 border-l-4 border-cyan-400 p-5 rounded-r-2xl shadow-xl backdrop-blur-md">
          <div className="flex items-start gap-3.5">
            <span className="p-2.5 bg-cyan-400/5 text-cyan-400 rounded-xl mt-0.5 border border-cyan-400/10">
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
