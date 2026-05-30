/**
 * @license
 * SPDX-License-Identifier: GPL-3.0-only
 */

import React, { useState, useRef } from 'react';
import JSZip from 'jszip';
import { Search, Music, Upload, Gauge, Calendar, Sliders, Play, Settings, Compass, Info, FilePlus, Trash2, Loader, Cloud, CloudOff, Database, FileText } from 'lucide-react';
import { PredefinedSong, PREDEFINED_SONGS, generateProceduralBeatmap } from '../data/songs';
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

  // Server hosted manifest & automated downloader states
  const [serverManifest, setServerManifest] = useState<any[]>([]);
  const [showServerPackages, setShowServerPackages] = useState<boolean>(true);
  const [downloadingMapId, setDownloadingMapId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ loaded: number; total: number; percentage: number } | null>(null);

  React.useEffect(() => {
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
        console.warn('Offline mode or failed to fetch official server-hosted manifest. Gracefully falling back.', err);
      }
    };
    fetchManifest();
  }, []);

  // Dynamic on-demand extraction from IndexedDB via LRU caching
  const handleSelectCustomMap = async (map: Beatmap) => {
    setSelectedCustomMapId(map.id);
    const mapWithPkg = map as any;
    if (mapWithPkg.isServerMap && !mapWithPkg.isCached) {
      return; // Bypasses DB fetch since we need to download it first or start progressive stream
    }
    if (mapWithPkg.packageId) {
      setIsLoadingMedia(true);
      try {
        // Query memory-warm asset cache first to save main-thread operations
        const cacheKey = mapWithPkg.packageId || map.id;
        const cached = storageManager.lruMediaCache.get(cacheKey);
        if (cached) {
          map.audioUrl = cached.audioUrl || map.audioUrl;
          map.videoUrl = cached.videoUrl || map.videoUrl;
          map.bgUrl = cached.bgUrl || map.bgUrl;
          return;
        }

        // Check memory-bridge cache first (Instant load bypass)
        let zipBuffer: ArrayBuffer | Blob | null = TempMemoryCache.get(mapWithPkg.packageId);
        if (zipBuffer) {
          console.log(`Bypassing IndexedDB read. Loading package ${mapWithPkg.packageId} directly from memory cache.`);
        } else {
          // Fallback to reading from IndexedDB if not freshly downloaded
          console.log(`Memory cache miss. Fetching package ${mapWithPkg.packageId} from IndexedDB.`);
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

          // File matching fallbacks with LARGEST-FILE wildcard heuristic if targets mismatch
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

          // Only parse/extract background imagery if no video track is resolved (Optimized Asset Processing)
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

          // Register resolved URLs in Least-Recently-Used caching list (Capacity: 3)
          storageManager.lruMediaCache.put(cacheKey, {
            audioUrl: parsedAudioUrl,
            videoUrl: parsedVideoUrl,
            bgUrl: parsedBgUrl
          });

          // Mount to current map context for direct active routing
          if (parsedAudioUrl) map.audioUrl = parsedAudioUrl;
          if (parsedVideoUrl) map.videoUrl = parsedVideoUrl;
          if (parsedBgUrl) map.bgUrl = parsedBgUrl;
        }
      } catch (err) {
        console.error('Error unpacking file media from database:', err);
      } finally {
        setIsLoadingMedia(false);
      }
    }
  };

  const getMergedCustomMaps = () => {
    // 1. Differentiate existing stored custom maps.
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

    // 2. Add "virtual" server packages in the manifest that are NOT downloaded yet (local count == 0).
    const virtualServerPackages: any[] = [];
    if (showServerPackages) {
      // Find package ids currently present in local storage to hide the server download card
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
            title: s.title,
            artist: s.artist,
            creator: s.creator,
            oszUrl: s.oszUrl,
            hash: s.hash,
            difficultiesSummary: s.difficultiesSummary || [],
            isServerPackage: true,
            isServerMap: true,
            isCached: false,
            // placeholders so they satisfy Beatmap interface minimally
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

  // Automatically select the first map if none is selected
  React.useEffect(() => {
    if (!selectedCustomMapId && mergedCustomMaps.length > 0) {
      setSelectedCustomMapId(mergedCustomMaps[0].id);
    }
  }, [mergedCustomMaps, selectedCustomMapId]);

  const filteredCustomMaps = mergedCustomMaps.filter(map => 
    map.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    map.artist.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Active Map details calculations
  const selectedCustomMap = mergedCustomMaps.find(m => m.id === selectedCustomMapId) || mergedCustomMaps[0];

  // Drag and Drop mapping handlers
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
      setImportStatus({ type: 'err', msg: 'Only standard .osu mania beatmaps or .osz archives are readable.' });
      return;
    }

    if (isZip) {
      try {
        setImportStatus({ type: 'ok', msg: 'Decompressing and parsing .osz archive safely...' });
        
        // Setup transaction-safe bundle package ID inside DB
        const packageId = `pkg_${Date.now()}`;
        await storageManager.savePackage(packageId, file.name, file);

        // Revoke active Object URLs of unselected items to optimize memory
        const selectedMap = customMaps.find(m => m.id === selectedCustomMapId);
        const selectedCacheKey = selectedMap ? ((selectedMap as any).packageId || selectedMap.id) : '';

        customMaps.forEach(map => {
          const cacheKey = (map as any).packageId || map.id;
          if (cacheKey === selectedCacheKey) return; // Maintain selected active package
          storageManager.lruMediaCache.evict(cacheKey);
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
          setImportStatus({ type: 'err', msg: 'Invalid .osz package: No .osu difficulty files found.' });
          return;
        }

        // Cache resolved blobs so we don't extract the exact same file multiple times across diff difficulties
        const blobCache: { [key: string]: string } = {};

         const resolveFileToUrl = async (filename: string | null, fallbackExts: string[]): Promise<string> => {
          if (!filename) {
            // Check fallback directly using the LARGEST-FILE wildcard heuristic
            const fallbackObj = await resolver.findLargestFileByExtensions(fallbackExts) || resolver.findFallbackByExtensions(fallbackExts)?.file;
            if (fallbackObj) {
              const fileNameKey = (fallbackObj as any).name || 'unknown_fallback';
              if (blobCache[fileNameKey]) return blobCache[fileNameKey];
              const blob = await fallbackObj.async('blob');
              const url = AssetLifecycleManager.registerBlob(blob);
              blobCache[fileNameKey] = url;
              return url;
            }
            return '';
          }

          const cachedKey = filename.toLowerCase();
          if (blobCache[cachedKey]) {
            return blobCache[cachedKey];
          }

          const fileObj = resolver.findFile(filename);
          if (fileObj) {
            const blob = await fileObj.async('blob');
            const url = AssetLifecycleManager.registerBlob(blob);
            blobCache[cachedKey] = url;
            return url;
          }

          // Case-insensitive/nested lookup failed, try matching by falling back to the LARGEST-FILE search
          const fallbackObj = await resolver.findLargestFileByExtensions(fallbackExts) || resolver.findFallbackByExtensions(fallbackExts)?.file;
          if (fallbackObj) {
            const fileNameKey = (fallbackObj as any).name || 'unknown_fallback';
            if (blobCache[fileNameKey]) return blobCache[fileNameKey];
            const blob = await fallbackObj.async('blob');
            const url = AssetLifecycleManager.registerBlob(blob);
            blobCache[fileNameKey] = url;
            return url;
          }

          return '';
        };
        
        let importedCount = 0;
        let lastImportedId = '';
        let lastImportedMap: Beatmap | null = null;
        
        for (let i = 0; i < osuFiles.length; i++) {
          const osu = osuFiles[i];
          const mapId = `custom_${Date.now()}_idx${i}`;
          const parsedMap = parseOsuBeatmap(osu.content, mapId);
          
          if (parsedMap.notes.length > 0) {
            // Extract media paths for this specific difficulty using regex
            const media = parseMediaPaths(osu.content);
            
            // Assign DB lookup metadata and fallback content references
            const mapWithMeta = parsedMap as any;
            mapWithMeta.packageId = packageId;
            mapWithMeta.audioFilename = media.audioFilename;
            mapWithMeta.videoFilename = media.videoFilename;
            mapWithMeta.bgFilename = media.bgFilename;
            mapWithMeta.originalOsuContent = osu.content;
            
            // Resolve music track
            const audioUrl = await resolveFileToUrl(media.audioFilename, ['.mp3', '.ogg', '.wav']);
            if (audioUrl) {
              parsedMap.audioUrl = audioUrl;
            }

            // Resolve video
            const videoUrl = await resolveFileToUrl(media.videoFilename, ['.mp4', '.webm', '.avi', '.mkv', '.mov']);
            if (videoUrl) {
              parsedMap.videoUrl = videoUrl;
            }

            // Resolve background
            const bgUrl = await resolveFileToUrl(media.bgFilename, ['.jpg', '.jpeg', '.png', '.bmp']);
            if (bgUrl) {
              parsedMap.bgUrl = bgUrl;
            }

            const cacheKey = (parsedMap as any).packageId || parsedMap.id;
            // Prefilter into Least-Recently-Used caching to optimize access speed
            storageManager.lruMediaCache.put(cacheKey, {
              audioUrl: audioUrl || '',
              videoUrl: videoUrl || '',
              bgUrl: bgUrl || ''
            });
            
            onImportOsuMap(parsedMap);
            lastImportedId = parsedMap.id;
            lastImportedMap = parsedMap;
            importedCount++;
          }
        }
        
        if (importedCount > 0 && lastImportedMap) {
          await handleSelectCustomMap(lastImportedMap);
          setSelectedCustomMapId(lastImportedId);
          TempMemoryCache.remove(packageId);
          setImportStatus({ 
            type: 'ok', 
            msg: `Successfully imported ${importedCount} difficulties from "${file.name}".` 
          });
        } else {
          setImportStatus({ type: 'err', msg: 'Failed to find valid mania beatmaps inside this archive.' });
        }
        setTimeout(() => setImportStatus(null), 6000);
      } catch (err) {
        setImportStatus({ type: 'err', msg: 'Critical decompression error loading .osz package.' });
      }
      return;
    }

    // Standard .osu file import
    try {
      const text = await file.text();
      const mapId = `custom_${Date.now()}`;
      const parsedMap = parseOsuBeatmap(text, mapId);

      if (parsedMap.notes.length === 0) {
        setImportStatus({ type: 'err', msg: 'The file has no notes or is not formatted for mania.' });
        return;
      }

      onImportOsuMap(parsedMap);
      setSelectedCustomMapId(parsedMap.id);
      setImportStatus({ 
        type: 'ok', 
        msg: `Successfully loaded map: "${parsedMap.title}" (${parsedMap.keyCount}K).` 
      });
      
      setTimeout(() => setImportStatus(null), 5000);
    } catch (err) {
      setImportStatus({ type: 'err', msg: 'Critical parsing failure reading .osu structure.' });
    }
  };

  // Trigger play on select map
  const handleStartPlay = async () => {
    if (selectedCustomMap) {
        const isVirtual = (selectedCustomMap as any).isServerMap && !(selectedCustomMap as any).isCached;

        if (isVirtual) {
          const oszUrl = (selectedCustomMap as any).oszUrl;
          const serverMapId = selectedCustomMap.id;
          const serverMapTitle = selectedCustomMap.title;

          setDownloadingMapId(serverMapId);
          setDownloadProgress({ loaded: 0, total: 0, percentage: 0 });
          setImportStatus({ type: 'ok', msg: `Initializing download for "${serverMapTitle}"...` });

          try {
            const response = await fetch(oszUrl);
            if (!response.ok) {
              throw new Error(`Failed to retrieve mapset. Status: ${response.status}`);
            }

            const contentLength = response.headers.get('content-length');
            const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

            const reader = response.body?.getReader();
            if (!reader) {
              throw new Error('ReadableStream reader is not supported in this browser.');
            }

            let loadedBytes = 0;
            const chunks: BlobPart[] = [];

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

            setImportStatus({ type: 'ok', msg: 'Storing package and parsing difficulties...' });

            const blob = new Blob(chunks, { type: 'application/octet-stream' });
            const packageId = `pkg_${serverMapId}`;

            // Save raw OSZ (ZIP) bytes to IndexedDB first
            await storageManager.savePackage(packageId, `${serverMapTitle}.osz`, blob);

            // Yield thread control back to the browser to prevent UI freeze
            await new Promise(resolve => setTimeout(resolve, 15));

            // Dynamically unzip and extract map contents
            const zip = await JSZip.loadAsync(blob);
            const resolver = new RobustZipResolver(zip);
            const fileNames = Object.keys(zip.files);
            const osuFiles: { name: string; content: string }[] = [];

            for (const name of fileNames) {
              if (name.toLowerCase().endsWith('.osu') && !zip.files[name].dir) {
                const content = await zip.files[name].async('text');
                osuFiles.push({ name, content });
                // Yield to keep UI smooth during large file scanning
                await new Promise(resolve => setTimeout(resolve, 4));
              }
            }

            if (osuFiles.length === 0) {
              throw new Error('Invalid package: No .osu files inside.');
            }

            // Cache resolved resources
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
            const parsedDifficulties: Beatmap[] = [];

            for (let i = 0; i < osuFiles.length; i++) {
              const osu = osuFiles[i];
              // Give cached difficulties a stable custom ID referencing their index & server id
              const mapId = `${serverMapId}_idx${i}`;
              const parsedMap = parseOsuBeatmap(osu.content, mapId);

              // Yield thread control back to the browser between extractions to guarantee smooth layout rendering
              await new Promise(resolve => setTimeout(resolve, 10));

              if (parsedMap.notes.length > 0) {
                const media = parseMediaPaths(osu.content);
                const mapWithMeta = parsedMap as any;

                mapWithMeta.packageId = packageId;
                mapWithMeta.parentPackageId = serverMapId; // Store explicit relational link
                mapWithMeta.audioFilename = media.audioFilename;
                mapWithMeta.videoFilename = media.videoFilename;
                mapWithMeta.bgFilename = media.bgFilename;
                mapWithMeta.originalOsuContent = osu.content;
                mapWithMeta.isServerMap = true;
                mapWithMeta.isCached = true;
                mapWithMeta.oszUrl = oszUrl;

                const audUrl = await resolveFileToUrl(media.audioFilename, ['.mp3', '.ogg', '.wav']);
                if (audUrl) parsedMap.audioUrl = audUrl;

                const vidUrl = await resolveFileToUrl(media.videoFilename, ['.mp4', '.webm', '.avi', '.mkv', '.mov']);
                if (vidUrl) parsedMap.videoUrl = vidUrl;

                const bgAssetUrl = await resolveFileToUrl(media.bgFilename, ['.jpg', '.jpeg', '.png', '.bmp']);
                if (bgAssetUrl) parsedMap.bgUrl = bgAssetUrl;

                const cacheKey = (parsedMap as any).packageId || parsedMap.id;
                storageManager.lruMediaCache.put(cacheKey, {
                  audioUrl: audUrl || '',
                  videoUrl: vidUrl || '',
                  bgUrl: bgAssetUrl || ''
                });

                onImportOsuMap(parsedMap);
                parsedDifficulties.push(parsedMap);
                importedCount++;
              }
            }

            if (importedCount > 0 && parsedDifficulties.length > 0) {
              setImportStatus({ type: 'ok', msg: `Successfully cached "${serverMapTitle}"!` });

              // Automatic Difficulty Focus Selector: Identify lowest star rating first
              parsedDifficulties.sort((a, b) => a.stars - b.stars);
              const easiestMap = parsedDifficulties[0];
              
              // Select the easiest map in the list view without starting gameplay automatically
              await handleSelectCustomMap(easiestMap);
              setSelectedCustomMapId(easiestMap.id);
              TempMemoryCache.remove(packageId);
            } else {
              throw new Error('No valid playable difficulties found inside downloaded package.');
            }

          } catch (err: any) {
            console.error('Progressive downloader failed:', err);
            // Clear any partial references
            try {
              await storageManager.deleteBeatmapAndCleanup(serverMapId);
            } catch (cleanupErr) {
              console.warn('Partial cleanup ignorable:', cleanupErr);
            }
            setImportStatus({ type: 'err', msg: err?.message || 'Download and caching failed mid-stream.' });
          } finally {
            setDownloadingMapId(null);
            setDownloadProgress(null);
            setTimeout(() => setImportStatus(null), 6000);
          }
          return;
        }

        setIsLoadingMedia(true);
        try {
          // Robust pre-extraction and verification check before initiating canvas and routing
          await handleSelectCustomMap(selectedCustomMap);
        } catch (e) {
          console.error('Failed to unpack custom map media prior starting:', e);
        } finally {
          setIsLoadingMedia(false);
        }
        onSelectMap(selectedCustomMap);
      }
  };

  return (
    <div id="song-select-container" className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full max-w-7xl mx-auto h-full p-2 lg:p-4 animate-fade-in">
      
      {/* LEFT COL: SONGS BROWSER */}
      <div className="lg:col-span-7 flex flex-col gap-4">
        
        {/* UPPER TITLE SEARCH */}
        <div className="bg-[#0a0a0c] border border-white/10 p-4 rounded flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="p-2 bg-white/5 text-cyan-400 rounded border border-white/10">
                <Compass className="h-4.5 w-4.5 animate-pulse" />
              </span>
              <div>
                <h2 className="text-base font-black uppercase italic tracking-wider text-slate-100 flex items-center gap-2">
                  BROWSE <span className="text-cyan-400">BEATMAPS</span>
                </h2>
                <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Select official server maps or custom-imported charts // {mergedCustomMaps.length} total</p>
              </div>
            </div>

            <div className="flex gap-2 items-center justify-end w-full sm:w-auto">
              <button
                id="toggle-server-packages-btn"
                onClick={() => setShowServerPackages(prev => !prev)}
                className={`flex items-center gap-1.5 px-3 py-1.5 font-sans text-[11px] font-bold uppercase tracking-wider rounded border transition cursor-pointer ${
                  showServerPackages 
                    ? 'bg-cyan-500/10 hover:bg-cyan-500/15 text-cyan-400 border-cyan-500/30' 
                    : 'bg-white/5 hover:bg-white/10 text-slate-400 border-white/10'
                }`}
                title={showServerPackages ? "Hide Server Map Download Cards" : "Show Server Map Download Cards"}
              >
                {showServerPackages ? <CloudOff className="h-3.5 w-3.5" /> : <Cloud className="h-3.5 w-3.5" />}
                <span className="hidden md:inline">{showServerPackages ? "Hide Cloud Sets" : "Show Cloud Sets"}</span>
              </button>

              <button
                id="global-settings-btn"
                onClick={onOpenGlobalSettings}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 font-sans text-[11px] font-bold uppercase tracking-widest rounded border border-white/10 transition cursor-pointer"
              >
                <Settings className="h-3.5 w-3.5 text-cyan-400" /> Options [F3]
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input 
              id="song-search-input"
              type="text"
              placeholder="Search title, artist or genre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded font-sans text-xs text-white placeholder-slate-550 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/20"
            />
          </div>
        </div>

        {/* SONG LIST BOX */}
        <div className="flex-1 max-h-[480px] overflow-y-auto pr-1 flex flex-col gap-2">
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
                  className={`p-3 rounded-r transition-all duration-150 flex items-center justify-between gap-4 border-l-4 ${
                    isSelected 
                      ? 'bg-gradient-to-r from-cyan-600/25 to-indigo-600/25 border-cyan-400 shadow-xl scale-[1.01] ring-1 ring-white/15'
                      : 'bg-[#121216] border-slate-700 opacity-80 hover:opacity-100'
                  } ${isLoadingMedia ? 'cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}
                >
                  <div className="flex items-center gap-3 w-full pr-1 overflow-hidden">
                    <div className={`p-2 rounded flex items-center justify-center ${
                      isSelected ? 'bg-cyan-500/25 text-cyan-400' : 'bg-white/5 text-slate-500'
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
                      <h4 className="font-bold font-sans text-xs text-slate-100 tracking-tight block truncate uppercase">{map.title}</h4>
                      <p className="text-[11px] text-slate-400 font-sans block truncate">{map.artist}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex flex-col items-end gap-1">
                      {map.isServerPackage ? (
                        <span className="px-1.5 py-0.5 bg-cyan-950/40 text-[9px] font-mono text-cyan-400 rounded uppercase tracking-wider border border-cyan-500/20">
                          CLOUD PACKAGE
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 bg-black/40 text-[9px] font-mono text-cyan-400 rounded uppercase tracking-wider border border-white/5">
                          {map.keyCount}K Mode
                        </span>
                      )}
                      <div className="flex gap-1.5 items-center font-mono text-[9px] text-slate-550">
                        {map.isServerPackage ? (
                          <span className="text-cyan-400 font-bold">★ MULTI-DIFF</span>
                        ) : (
                          <>
                            <span className="text-red-400 font-black">★ {map.stars}</span>
                            <span>•</span>
                            <span>{map.bpm} BPM</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* DOUBLE CONFIRM ACCIDENTAL DELETION SAFEGUARD */}
                    <div className="flex items-center justify-center relative pointer-events-auto z-15">
                      {!map.isServerPackage && (isConfirming ? (
                        <div className="flex gap-1 items-center bg-rose-955 border border-rose-500 text-[9px] uppercase font-bold text-white px-2 py-1 rounded shadow-lg animate-pulse">
                          <span className="text-rose-200">DELETE?</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onDeleteCustomMap) onDeleteCustomMap(map.id);
                              setDeleteConfirmId(null);
                            }}
                            className="bg-rose-600 hover:bg-rose-500 text-white rounded px-1.5 py-0.5 text-[8px] font-black cursor-pointer"
                          >
                            YES
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmId(null);
                            }}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-300 rounded px-1.5 py-0.5 text-[8px] font-black cursor-pointer"
                          >
                            NO
                          </button>
                        </div>
                      ) : (
                        <button
                          title="Delete this custom beatmap difficulty safely"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(map.id);
                          }}
                          className="p-1 px-1.5 rounded bg-white/5 border border-white/5 text-slate-400 hover:text-red-400 hover:bg-rose-500/10 hover:border-red-500/20 active:scale-95 transition"
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
            <div className="bg-[#121216] border border-white/5 p-6 rounded flex flex-col items-center justify-center text-center text-slate-500">
              <Info className="h-5 w-5 mb-1.5 text-slate-600" />
              <p className="text-xs font-sans max-w-xs leading-relaxed">No custom maps imported yet. Check upload drop zone below.</p>
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
          className={`p-4 rounded border-2 border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-155 ${
            isDragActive 
              ? 'border-cyan-400 bg-cyan-950/20 shadow-inner' 
              : 'border-white/10 hover:border-white/20 bg-[#0a0a0c]/80 hover:bg-[#0a0a0c]'
          }`}
        >
          <input 
            ref={fileInputRef}
            type="file" 
            accept=".osu,.osz,.zip"
            onChange={handleFileSelect}
            className="hidden" 
          />
          <Upload className={`h-6 w-6 mb-2 transition ${isDragActive ? 'text-cyan-400 animate-bounce' : 'text-slate-500'}`} />
          <h4 className="text-xs font-bold font-sans text-slate-200 uppercase tracking-widest">Drag & Drop .osu or .osz File</h4>
          <p className="text-[10px] text-slate-500 font-mono mt-0.5 uppercase tracking-wide">Accepts standard Osu! Mania file formats or zipped archives directly</p>
        </div>

        {/* UPLOADING ALERTS SYSTEM */}
        {importStatus && (
          <div className={`p-3 rounded border text-xs font-mono flex items-center justify-between shadow ${
            importStatus.type === 'ok' ? 'bg-emerald-950/20 text-emerald-400 border-emerald-900/40' : 'bg-rose-950/20 text-rose-400 border-rose-900/40'
          }`}>
            <span>{importStatus.msg}</span>
          </div>
        )}
      </div>

      {/* RIGHT COL: PERFORMANCE PREVIEW AND CONFIG GRAPH */}
      <div className="lg:col-span-5 flex flex-col gap-4">
        
        {/* CURRENT TRACK PREVIEW BOARD */}
        <div className="bg-[#0a0a0d] border border-white/10 p-5 rounded flex flex-col gap-4">
          <h4 className="text-[10px] text-slate-500 tracking-widest uppercase font-black flex items-center gap-1.5 border-b border-white/5 pb-2">
            <Sliders className="h-3.5 w-3.5 text-cyan-400" /> Track Configurations
          </h4>
          
          <div className="border-b border-white/5 pb-3">
            <h3 className="text-base font-black font-sans text-slate-100 tracking-tighter uppercase italic leading-tight block">
              {selectedCustomMap?.title || 'No map selected'}
            </h3>
            <p className="text-xs text-cyan-200 mt-0.5 tracking-tight font-medium">
              by {selectedCustomMap?.artist || 'Unknown'}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {(selectedCustomMap as any)?.isServerPackage ? (
              <div className="flex flex-col gap-1.5 bg-[#050505] p-2.5 rounded border border-white/5">
                <span className="text-[9px] text-slate-500 font-bold tracking-widest uppercase mb-1">Difficulties In Package</span>
                <div className="flex flex-col gap-1">
                  {(selectedCustomMap as any).difficultiesSummary && (selectedCustomMap as any).difficultiesSummary.length > 0 ? (
                    (selectedCustomMap as any).difficultiesSummary.map((diff: string, idx: number) => {
                      const hasStar = diff.includes('★');
                      const starText = hasStar ? '★' + diff.split('★')[1]?.replace(')', '') : '';
                      const diffName = hasStar ? diff.split('★')[0]?.replace('(', '').trim() : diff;
                      return (
                        <div key={idx} className="flex justify-between items-center text-[11px] font-mono border-b border-white/5 pb-1 last:border-b-0 last:pb-0">
                          <span className="text-slate-300 font-medium">{diffName}</span>
                          <span className="text-red-400 font-bold text-xs">{starText || 'Starred'}</span>
                        </div>
                      );
                    })
                  ) : (
                    <span className="text-[10px] text-slate-650 font-mono italic">No preview available</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 bg-[#050505] p-2.5 rounded border border-white/5">
                <span className="text-[9px] text-slate-500 font-bold tracking-widest uppercase">KEY REQUIREMENT</span>
                <span className="text-[11px] font-mono text-cyan-400 font-bold uppercase">
                  {selectedCustomMap?.keyCount || 4} Lanes Required (Mapping dynamically verified)
                </span>
              </div>
            )}

            {/* SCROLL SPEED ADJUSTMENTS */}
            <div className="flex flex-col gap-1.5 bg-[#050505] p-3 rounded border border-white/5">
              <div className="flex justify-between items-center text-[9px] font-bold tracking-widest uppercase">
                <span className="text-slate-500">Scroll Speed factor</span>
                <span className="text-cyan-400 font-mono font-black">{settings.scrollSpeed}x</span>
              </div>
              
              <input 
                type="range" 
                min="10" 
                max="40" 
                step="1"
                value={settings.scrollSpeed}
                onChange={(e) => updateSettings({ scrollSpeed: parseInt(e.target.value) })}
                className="w-full h-1 bg-white/10 rounded appearance-none cursor-pointer accent-cyan-400"
              />
              
              <div className="flex justify-between font-sans text-[9px] text-slate-600">
                <span>SLOW // 10</span>
                <span>BALANCED // 20</span>
                <span>HYPER // 40</span>
              </div>
            </div>
          </div>

          {/* PROGRESSIVE DOWNLOADER REAL-TIME PROGRESS BAR */}
          {downloadingMapId && downloadProgress && (
            <div className="flex flex-col gap-1.5 p-3.5 bg-black/50 border border-cyan-500/20 rounded-md shadow-inner">
              <div className="flex justify-between items-center text-[10px] font-bold font-mono tracking-wider uppercase text-cyan-400">
                <span>Downloading Map:</span>
                <span>{downloadProgress.percentage}%</span>
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                {parseFloat((downloadProgress.loaded / 1024 / 1024).toFixed(1))}MB / {parseFloat((downloadProgress.total / 1024 / 1024).toFixed(1))}MB ({downloadProgress.percentage}%)
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-cyan-400 to-indigo-500 h-full transition-all duration-150" 
                  style={{ width: `${downloadProgress.percentage}%` }}
                />
              </div>
            </div>
          )}

          {/* LARGE PLAY ACT COMPONENT */}
          <button
            id="start-play-btn"
            disabled={isLoadingMedia || downloadingMapId !== null || !selectedCustomMap}
            onClick={handleStartPlay}
            className={`w-full py-3 bg-gradient-to-r from-cyan-400 to-indigo-500 hover:brightness-110 text-black font-sans font-black text-xs rounded uppercase tracking-[0.25em] italic shadow-[0_0_20px_rgba(34,211,238,0.4)] active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 ${
              (isLoadingMedia || downloadingMapId !== null) ? 'opacity-70 cursor-not-allowed filter saturate-50' : ''
            }`}
          >
            {downloadingMapId ? (
              <>
                <Loader className="h-4 w-4 animate-spin text-black" />
                DOWNLOADING MAPSET...
              </>
            ) : isLoadingMedia ? (
              <>
                <Loader className="h-4 w-4 animate-spin text-black" />
                UNPACKING TRACK MEDIA...
              </>
            ) : (selectedCustomMap as any)?.isServerPackage ? (
              <>
                <Cloud className="h-4 w-4 text-black animate-pulse" />
                DOWNLOAD BEATMAPSET
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-current" />
                START PERFORMANCE
              </>
            )}
          </button>
        </div>

        {/* CALIBRATION OFFSET TIPS */}
        <div className="bg-[#0a0a0d] border-l-4 border-cyan-400 p-4 rounded-r">
          <div className="flex items-start gap-3">
            <span className="p-1 bg-white/5 text-cyan-400 rounded mt-0.5">
              <Gauge className="h-4.5 w-4.5" />
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-black uppercase tracking-wider text-slate-200">Audio Jitter Buffer</span>
              <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
                Notice notes hitting slightly out-of-phase with beats? Go to settings options and adjust the custom **Audio Offset ms** calibration dynamically inside the latency compensator.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
