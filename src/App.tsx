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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Settings as SettingsIcon, Gamepad2, Play, ChevronRight, BarChart3, Disc, Music, Shield, Cpu, Sliders, Keyboard, History, CircleDot, Compass } from 'lucide-react';
import { MainMenu } from './components/MainMenu';
import { GameScreen, GameSettings, Beatmap, ScoreState, ReplayFrame, PlayHistoryRecord } from './types';
import { AnimatePresence, motion } from 'motion/react';
import SongSelect from './components/SongSelect';
import GameplayCanvas from './components/GameplayCanvas';
import ResultsScreen from './components/ResultsScreen';
import SettingsScreen from './components/SettingsScreen';
import PersonalHistoryScreen from './components/PersonalHistoryScreen';
import OnlineBeatmapCatalog from './components/OnlineBeatmapCatalog';
import { mainAudio } from './audio/AudioEngine';
import { storageManager } from './utils/storageManager';
import { convertBeatmapKeyCount } from './utils/beatmapParser';
import { TermsOfServicePage, PrivacyPolicyPage } from './components/LegalPages';
import { sanitizeSettings, sanitizeHistoryRecord, sanitizeCssUrl } from './utils/securityLimits';
import { AssetLifecycleManager } from './utils/assetLifecycle';


const PAGE_TRANSITION_VARIANTS = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.25, 1, 0.5, 1] } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.2, ease: [0.25, 1, 0.5, 1] } }
};

const LOCAL_STORAGE_SETTINGS_KEY = 'rhythm_mania_v1_settings';
const LOCAL_STORAGE_CUSTOM_MAPS_KEY = 'rhythm_mania_v1_custom_maps';

import { DEFAULT_SETTINGS } from './components/settings/defaultSettings';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<GameScreen>('menu');
  const [selectedBeatmap, setSelectedBeatmap] = useState<Beatmap | null>(null);
  const [path, setPath] = useState<string>(() => typeof window !== 'undefined' ? window.location.pathname : '/');

  // Listen to popstate for browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Globally intercept local link clicks to enable single-page transitions
  useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      if (anchor) {
        const href = anchor.getAttribute('href');
        if (href && href.startsWith('/')) {
          e.preventDefault();
          window.history.pushState({}, '', href);
          setPath(href);
        }
      }
    };
    document.addEventListener('click', handleAnchorClick);
    return () => document.removeEventListener('click', handleAnchorClick);
  }, []);
  const [scoreState, setScoreState] = useState<ScoreState | null>(null);
  const [customMaps, setCustomMaps] = useState<Beatmap[]>([]);
  const [settings, setSettings] = useState<GameSettings>(() => {
    if (typeof window !== 'undefined') {
      const savedSettingsText = localStorage.getItem('rhythm_mania_v1_settings');
      if (savedSettingsText) {
        try {
          const parsed = JSON.parse(savedSettingsText);
          return sanitizeSettings(parsed, DEFAULT_SETTINGS);
        } catch (e) {
          console.warn('Failed parsing settings from local storage, fallback applied.');
        }
      }
    }
    return DEFAULT_SETTINGS;
  });
  const [songSelectBgUrl, setSongSelectBgUrl] = useState<string>('/backgrounds/Ferineon.webp');
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [isMobileLandscape, setIsMobileLandscape] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showFindBeatmapOverlay, setShowFindBeatmapOverlay] = useState<boolean>(false);

  // Performance history states
  const [playHistory, setPlayHistory] = useState<PlayHistoryRecord[]>([]);
  const [historyLimit, setHistoryLimit] = useState<number>(50);
  const [activeReplayRecord, setActiveReplayRecord] = useState<PlayHistoryRecord | null>(null);
  const [viewingHistoryResult, setViewingHistoryResult] = useState(false);

  const activePlayBeatmap = React.useMemo(() => {
    if (!selectedBeatmap) return null;
    
    const activeMods = activeReplayRecord
      ? (activeReplayRecord.mods || activeReplayRecord.recordedSettings?.selectedMods || [])
      : (settings.selectedMods || []);
    const activeKeyChangeMod = activeMods.find(m => /^K[2-8]$/.test(m));
    
    if (activeKeyChangeMod) {
      const targetKeys = parseInt(activeKeyChangeMod.substring(1), 10);
      if (targetKeys >= 2 && targetKeys <= 8 && targetKeys !== selectedBeatmap.keyCount) {
        return convertBeatmapKeyCount(selectedBeatmap, targetKeys);
      }
    }
    return selectedBeatmap;
  }, [selectedBeatmap, settings.selectedMods, activeReplayRecord]);


  // Load play history & latency settings on mount
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Monitor landscape orientation on mobile devices
  useEffect(() => {
    const checkOrientation = () => {
      const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
      const isLandscape = window.innerWidth > window.innerHeight;
      const isSmallScreen = Math.min(window.innerWidth, window.innerHeight) < 600;
      setIsMobileLandscape(isTouch && isLandscape && isSmallScreen);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  // Preload default backgrounds for instant, low-latency visual performance
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const defaultBgs = [
        '/backgrounds/Arushii.webp',
        '/backgrounds/Ferineon.webp',
        '/backgrounds/Kourihase.webp',
        '/backgrounds/MPDisplay.webp',
        '/backgrounds/Porukana.webp',
        '/backgrounds/RedcXca.webp',
        '/backgrounds/Sm0llBanana.webp',
        '/backgrounds/THICC Jeff.webp',
        '/backgrounds/mimile1606.webp',
        '/backgrounds/nikio.webp',
        '/backgrounds/tehfire.webp',
        '/backgrounds/wxyz.webp'
      ];
      defaultBgs.forEach(src => {
        const img = new Image();
        img.src = src;
      });
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const storedHistory = localStorage.getItem('rhythm_mania_v1_play_history');
        if (storedHistory) {
          const parsed = JSON.parse(storedHistory);
          if (Array.isArray(parsed)) {
            const sanitized = parsed
              .map(item => sanitizeHistoryRecord(item, DEFAULT_SETTINGS))
              .filter((item): item is PlayHistoryRecord => item !== null);
            setPlayHistory(sanitized);
          }
        }
        
        const storedLimit = localStorage.getItem('rhythm_mania_v1_history_limit');
        if (storedLimit) {
          const parsedLimit = Number(storedLimit);
          if (!isNaN(parsedLimit) && parsedLimit >= 5 && parsedLimit <= 500) {
            setHistoryLimit(parsedLimit);
          } else {
            setHistoryLimit(50);
          }
        }
      } catch (e) {
        console.error('Failed to load local history logs:', e);
      }
    }
  }, []);

  const handleClearHistory = () => {
    setPlayHistory([]);
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('rhythm_mania_v1_play_history');
      } catch (e) {
        console.error('Failed to wipe local history logs:', e);
      }
    }
  };

  const handleDeleteHistoryRecord = (id: string) => {
    setPlayHistory(prev => {
      const updated = prev.filter(r => r.id !== id);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('rhythm_mania_v1_play_history', JSON.stringify(updated));
        } catch (e) {
          console.error('Failed to persist history deleted state:', e);
        }
      }
      return updated;
    });
  };

  const handleSetHistoryLimit = (limit: number) => {
    setHistoryLimit(limit);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('rhythm_mania_v1_history_limit', String(limit));
        
        // Trim current logs that overflow the threshold
        setPlayHistory(prev => {
          if (prev.length > limit) {
            const truncated = prev.slice(0, limit);
            localStorage.setItem('rhythm_mania_v1_play_history', JSON.stringify(truncated));
            return truncated;
          }
          return prev;
        });
      } catch (e) {
        console.error('Failed to update history retention policy:', e);
      }
    }
  };

  const handleWatchReplay = (record: PlayHistoryRecord) => {
    const baseId = record.beatmapId.includes('_converted_')
      ? record.beatmapId.split('_converted_')[0]
      : record.beatmapId;
    // Look up the beatmap in our selection
    const targetMap = [...customMaps].find(m => m.id === record.beatmapId || m.id === baseId);
    if (targetMap) {
      // Create a shallow copy + notes clone (session clone)
      const cloned = {
        ...targetMap,
        notes: targetMap.notes ? targetMap.notes.map(n => ({ ...n })) : []
      };
      // Apply unpacked blob cache URLs to cloned so replay can play back audio & video perfectly!
      const cached = storageManager.lruMediaCache.get(targetMap.id);
      if (cached) {
        cloned.audioUrl = cached.audioUrl || cloned.audioUrl;
        cloned.videoUrl = cached.videoUrl || cloned.videoUrl;
        cloned.bgUrl = cached.bgUrl || cloned.bgUrl;
      }
      setSelectedBeatmap(cloned);
      setActiveReplayRecord(record);
      setCurrentScreen('play');
    }
  };

  // Dynamically apply selected skin colors to the site theme/UI elements!
  useEffect(() => {
    // Fixed default RhythmMania color
    const accentHex = '#00b0ff';
    const r = 0, g = 176, b = 255;

    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--skin-accent', accentHex);
      document.documentElement.style.setProperty('--skin-accent-rgb', `${r}, ${g}, ${b}`);
    }
  }, [settings.skinId, settings.customSkinColors, activeReplayRecord]);

  // Autoscroll to the top of the viewport whenever a page component loads or changes
  // Lock body overflow on gameplay screen to prevent any unwanted scrolling context
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.getElementById('application-container')?.scrollTo({ top: 0, behavior: 'auto' });
    if (currentScreen === 'play' || showSettings) {
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100vh';
      document.documentElement.style.overflow = 'hidden';
      document.documentElement.style.height = '100vh';
    } else {
      document.body.style.overflow = '';
      document.body.style.height = '';
      document.documentElement.style.overflow = '';
      document.documentElement.style.height = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.height = '';
      document.documentElement.style.overflow = '';
      document.documentElement.style.height = '';
    };
  }, [currentScreen, showSettings]);

  useEffect(() => {
    if (!showSettings) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSettings(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showSettings]);

  // Debounced settings persistence to local storage
  const isInitialSettingsLoad = useRef(true);
  useEffect(() => {
    if (isInitialSettingsLoad.current) {
      isInitialSettingsLoad.current = false;
      return;
    }
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(settings));
      } catch (err) {
        console.error("Failed to serialize settings:", err instanceof Error ? err.message : String(err));
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [settings]);

  useEffect(() => {
    const loadMapsFromIndexedDB = async () => {
      try {
        const maps = await storageManager.getAllBeatmaps();
        if (maps && maps.length > 0) {
          setCustomMaps(maps);
        } else {
          const savedCustomMapsText = localStorage.getItem(LOCAL_STORAGE_CUSTOM_MAPS_KEY);
          if (savedCustomMapsText) {
            const parsed = JSON.parse(savedCustomMapsText) as Beatmap[];
            if (Array.isArray(parsed) && parsed.length > 0) {
              setCustomMaps(parsed);
              for (const map of parsed) {
                await storageManager.saveBeatmap(map as any);
              }
            }
          }
        }
      } catch (err) {
        console.warn('Could not retrieve custom maps from IndexedDB:', err instanceof Error ? err.message : String(err));
      }
    };
    loadMapsFromIndexedDB();
  }, []);

  const updateSettings = useCallback((newSettings: Partial<GameSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      const safePayload: GameSettings = {
        scrollSpeed: Number(updated.scrollSpeed !== undefined ? updated.scrollSpeed : 21),
        audioOffset: Number(updated.audioOffset !== undefined ? updated.audioOffset : 0),
        visualOffset: Number(updated.visualOffset !== undefined ? updated.visualOffset : 0),
        hitsoundVolume: Number(updated.hitsoundVolume !== undefined ? updated.hitsoundVolume : 0.60),
        musicVolume: Number(updated.musicVolume !== undefined ? updated.musicVolume : 0.75),
        keyMode: Number(updated.keyMode !== undefined ? updated.keyMode : 4),
        bindings: {},
        upsurfaceNoteMode: updated.upsurfaceNoteMode === true || String(updated.upsurfaceNoteMode) === 'true',
        videoOpacity: 1.0,
        backgroundDim: Number(updated.backgroundDim !== undefined ? updated.backgroundDim : 0.60),
        disableVideo: Boolean(updated.disableVideo),
        videoOffset: Number(updated.videoOffset !== undefined ? updated.videoOffset : 0),
        disableParticles: Boolean(updated.disableParticles),
        limitDprToOne: false,
        skinId: updated.skinId || 'neon',
        customSkinColors: updated.customSkinColors,
        customSkinName: updated.customSkinName,
        squareRenderStyle: updated.squareRenderStyle || 'rhythmmania',
        rhythmplusColor: updated.rhythmplusColor || '#ffff00',
        rhythmmaniaNoteColor: updated.rhythmmaniaNoteColor || '#00b0ff',
        rhythmmaniaReceptorColor: updated.rhythmmaniaReceptorColor || '#00b0ff',
        circleNoteColor: updated.circleNoteColor || '#00b0ff',
        circleReceptorColor: updated.circleReceptorColor || '#00b0ff',
        noteOpacity: updated.noteOpacity !== undefined ? Number(updated.noteOpacity) : 1.0,
        receptorOpacity: updated.receptorOpacity !== undefined ? Number(updated.receptorOpacity) : 1.0,
        judgementOpacity: updated.judgementOpacity !== undefined ? Number(updated.judgementOpacity) : 1.0,
        judgementSize: updated.judgementSize !== undefined ? Number(updated.judgementSize) : 1.0,
        laneSeparatorOpacity: updated.laneSeparatorOpacity !== undefined ? Number(updated.laneSeparatorOpacity) : 0.30,
        circleSize: updated.circleSize !== undefined ? Number(updated.circleSize) : 1.0,
        noteSizeMultiplier: updated.noteSizeMultiplier !== undefined ? Number(updated.noteSizeMultiplier) : 1.0,
        playfieldStyle: updated.playfieldStyle || 'square',
        playfieldWidthPercent: updated.playfieldWidthPercent !== undefined ? Number(updated.playfieldWidthPercent) : 40,
        progressBarTop: updated.progressBarTop === true || String(updated.progressBarTop) === 'true',
        selectedMods: updated.selectedMods || [],
        bindPause: updated.bindPause !== undefined ? String(updated.bindPause) : 'escape',
        bindRetry: updated.bindRetry !== undefined ? String(updated.bindRetry) : 'r',
        renderEngine: updated.renderEngine === 'pixi' ? 'pixi' : 'canvas',
        enableMapSV: updated.enableMapSV !== false,
        disableLaneShake: Boolean(updated.disableLaneShake),
      };

      if (updated.bindings) {
        for (const k of Object.keys(updated.bindings)) {
          const numKey = Number(k);
          if (!isNaN(numKey) && Array.isArray(updated.bindings[numKey])) {
            safePayload.bindings[numKey] = updated.bindings[numKey].map(bind => String(bind));
          }
        }
      }

      return safePayload;
    });
  }, []);

  const handleImportBeatmap = async (map: Beatmap) => {
    setCustomMaps(prev => {
      const filtered = prev.filter(m => m.id !== map.id);
      return [map, ...filtered];
    });
    try {
      await storageManager.saveBeatmap(map as any);
    } catch (e) {
      console.error('Failed to persist imported beatmap to IndexedDB:', e instanceof Error ? e.message : String(e));
    }
  };

  const handleDeleteCustomMap = async (mapId: string) => {
    try {
      await storageManager.deleteBeatmapAndCleanup(mapId);
      setCustomMaps(prev => prev.filter(m => m.id !== mapId));
      setSelectedBeatmap(prev => prev && prev.id === mapId ? null : prev);
    } catch (e) {
      console.error('Failed to delete custom map:', e instanceof Error ? e.message : String(e));
    }
  };

  const handleDeleteSongGroup = async (mapIds: string[]) => {
    try {
      for (const mapId of mapIds) {
        await storageManager.deleteBeatmapAndCleanup(mapId);
      }
      setCustomMaps(prev => prev.filter(m => !mapIds.includes(m.id)));
      setSelectedBeatmap(prev => prev && mapIds.includes(prev.id) ? null : prev);
    } catch (e) {
      console.error('Failed to delete song group:', e instanceof Error ? e.message : String(e));
    }
  };

  const handleSelectMap = (map: Beatmap) => {
    setActiveReplayRecord(null); // Fresh clean live playthrough
    const cloned = {
      ...map,
      notes: map.notes ? map.notes.map(n => ({ ...n })) : []
    };
    setSelectedBeatmap(cloned);
    setCurrentScreen('play');
  };

  const handleGameplayFinish = (finalScore: ScoreState, replayFrames: ReplayFrame[] = []) => {
    try {
      if (typeof document !== 'undefined' && (document.fullscreenElement || (document as any).webkitFullscreenElement)) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(err => console.log('Exit fullscreen failed:', err));
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        }
      }
    } catch (e) {
      console.log('Fullscreen exit error:', e);
    }

    // Only commit to performance logs if they are NOT playing a spectator replay and it's a mania map (mode 3, or undefined/null/keyCount in mania range)
    const isMania = selectedBeatmap && (
      selectedBeatmap.mode === 3 ||
      selectedBeatmap.mode === undefined ||
      selectedBeatmap.mode === null ||
      (selectedBeatmap.keyCount >= 2 && selectedBeatmap.keyCount <= 8)
    );

    const newRecordId = `play_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    if (selectedBeatmap && !activeReplayRecord && isMania && finalScore.completed && !finalScore.failed && !finalScore.isAutoplay) {
      let gradeChar = 'D';
      const acc = finalScore.accuracy;
      if (acc >= 100) gradeChar = 'SS';
      else if (acc >= 95) gradeChar = 'S';
      else if (acc >= 90) gradeChar = 'A';
      else if (acc >= 80) gradeChar = 'B';
      else if (acc >= 70) gradeChar = 'C';

      const targetBm = activePlayBeatmap || selectedBeatmap;
      const newRecord: PlayHistoryRecord = {
        id: newRecordId,
        timestamp: Date.now(),
        beatmapId: targetBm.id,
        beatmapTitle: targetBm.title,
        beatmapArtist: targetBm.artist,
        keyCount: targetBm.keyCount,

        score: finalScore.score,
        accuracy: finalScore.accuracy,
        maxCombo: finalScore.maxCombo,
        grade: gradeChar,
        isFailed: !!finalScore.failed,
        scoreState: { ...finalScore, recordId: newRecordId },
        replayFrames: replayFrames,
        recordedSettings: { ...settings },
        mods: settings.selectedMods ? [...settings.selectedMods] : []
      };

      setPlayHistory(prev => {
        const appended = [newRecord, ...prev].slice(0, historyLimit);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('rhythm_mania_v1_play_history', JSON.stringify(appended));
          } catch (e) {
            console.error('History save error:', e);
          }
        }
        return appended;
      });
    }

    if (!finalScore.completed || finalScore.failed) {
      // "pre exited or failed maps will not get the score screen/ will just replay the song/ go back to the song select"
      setActiveReplayRecord(null);
      setSelectedBeatmap(null);
      setScoreState(null);
      setCurrentScreen('select');
      return;
    }

    // Do NOT clear spectator frames here so that the results selection knows we are in replay mode
    setScoreState({ ...finalScore, recordId: newRecordId });
    setCurrentScreen('results');
  };

  const handleRetrySong = () => {
    setActiveReplayRecord(null);
    setSelectedBeatmap(null);
    setCurrentScreen('select');
  };

  if (path === '/tos') {
    return (
      <TermsOfServicePage 
        onBack={() => { 
          window.history.pushState({}, '', '/'); 
          setPath('/'); 
        }} 
      />
    );
  }

  if (path === '/privacypolicy') {
    return (
      <PrivacyPolicyPage 
        onBack={() => { 
          window.history.pushState({}, '', '/'); 
          setPath('/'); 
        }} 
      />
    );
  }

  return (
    <div 
      id="application-container" 
      className={`bg-[#050508] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950 relative h-screen ${
        (currentScreen === 'play' || currentScreen === 'select' || currentScreen === 'history' || currentScreen === 'results') ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'
      }`}
    >
      {/* LANDSCAPE ORIENTATION WARNING BLOCKER FOR MOBILE PHONES */}
      <div className="mobile-landscape-blocker fixed inset-0 bg-[#050508]/95 backdrop-blur-xl z-[9999] hidden flex-col items-center justify-center p-6 text-center select-none">
        <div className="relative flex flex-col items-center justify-center p-8 bg-slate-950/60 border border-white/5 rounded-3xl max-w-sm shadow-2xl">
          {/* Pulsing glow background decoration */}
          <div className="absolute inset-0 bg-cyan-500/5 rounded-3xl blur-2xl pointer-events-none" />
          
          {/* Rotating phone graphic container */}
          <div className="w-14 h-24 border-[3px] border-cyan-400 rounded-2xl relative flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(34,211,238,0.25)] animate-phone-rotate">
            {/* Speaker Notch */}
            <div className="absolute top-2.5 w-6 h-1 bg-cyan-400/50 rounded-full" />
            {/* Home bar */}
            <div className="absolute bottom-2.5 w-5 h-1 bg-cyan-400/50 rounded-full" />
            {/* Screen simulation */}
            <div className="w-9 h-14 bg-cyan-400/10 rounded-lg flex items-center justify-center">
              <div className="w-4 h-4 bg-cyan-400/40 rounded-full animate-ping" />
            </div>
          </div>

          <h2 className="text-xl font-sans font-black text-white uppercase tracking-wider mb-2 animate-pulse">
            Portrait Mode Required
          </h2>
          <p className="text-xs text-slate-400 font-mono leading-relaxed uppercase">
            Please turn your phone into portrait mode to continue playing RhythmMania as normal.
          </p>
        </div>
      </div>

      {/* Disable old blocker block */}
      {false && (
        <AnimatePresence>
          {isMobileLandscape && (
            <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-[#050508]/95 backdrop-blur-xl z-[9999] flex flex-col items-center justify-center p-6 text-center select-none"
          >
            <div className="relative flex flex-col items-center justify-center p-8 bg-slate-950/60 border border-white/5 rounded-3xl max-w-sm shadow-2xl">
              {/* Pulsing glow background decoration */}
              <div className="absolute inset-0 bg-cyan-500/5 rounded-3xl blur-2xl pointer-events-none" />
              
              {/* Rotating phone graphic container */}
              <motion.div
                animate={{ rotate: [90, 0, 0, 90, 90] }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  repeatDelay: 0.5,
                  ease: "easeInOut"
                }}
                className="w-14 h-24 border-[3px] border-cyan-400 rounded-2xl relative flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(34,211,238,0.25)]"
              >
                {/* Speaker Notch */}
                <div className="absolute top-2.5 w-6 h-1 bg-cyan-400/50 rounded-full" />
                {/* Home bar */}
                <div className="absolute bottom-2.5 w-5 h-1 bg-cyan-400/50 rounded-full" />
                {/* Screen simulation */}
                <div className="w-9 h-14 bg-cyan-400/10 rounded-lg flex items-center justify-center">
                  <motion.div 
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    className="w-4 h-4 bg-cyan-400/30 rounded-full" 
                  />
                </div>
              </motion.div>

              <h2 className="text-xl font-sans font-black text-white uppercase tracking-wider mb-2 animate-pulse">
                Portrait Mode Required
              </h2>
              <p className="text-xs text-slate-400 font-mono leading-relaxed uppercase">
                Please turn your phone into portrait mode to continue playing RhythmMania as normal.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      )}

      {/* DYNAMIC CROSS-FADING BACKGROUND LAYERS */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden select-none">
        <AnimatePresence initial={false}>
          {currentScreen === 'select' && (
            <motion.div
              key={songSelectBgUrl}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.85 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: "easeInOut" }}
              className="absolute inset-0 bg-cover bg-center bg-no-repeat bg-fixed"
              style={{
                backgroundImage: `linear-gradient(rgba(10, 8, 16, 0.4), rgba(6, 6, 12, 0.65)), url("${sanitizeCssUrl(songSelectBgUrl)}")`
              }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* GLOWING TECH GRADIENTS BACKDROP & GRID OVERLAY (CONTAINED TO PREVENT DOUBLE SCROLLBARS AND SPACE LEAKS UNDER THE FOOTER) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-1">
        <div className="absolute top-[-300px] left-1/4 w-[600px] h-[600px] rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-100px] right-10 w-[500px] h-[500px] rounded-full bg-indigo-500/5 blur-[120px] pointer-events-none" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      </div>

      {/* 1. MASTER HEADER */}
      {currentScreen !== 'play' && (
        <header 
          id="main-header" 
          className="h-16 flex items-center px-4 md:px-6 justify-between z-30 transition-all bg-[#000000] border-b border-white/10 sticky top-0"
        >
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-4">
            <div 
              onClick={() => setCurrentScreen('menu')}
              className="flex items-center cursor-pointer group select-none shrink-0"
            >
              <h1 className="text-xl md:text-3xl font-bold font-sans tracking-tight text-white leading-none group-hover:scale-105 transition-transform duration-150">
                Rhythm<span className="text-[#ff4da6] font-bold">Mania</span>
              </h1>
            </div>

            {/* TOP MIDDLE: Find Online Beatmaps Button */}
            {!isMobile && (
              <div className="flex-1 flex justify-center">
                <button
                  id="header-find-beatmap-button"
                  onClick={() => {
                    setShowFindBeatmapOverlay(true);
                  }}
                  className="group relative overflow-hidden px-2.5 py-1.5 md:px-5 md:py-2 bg-[#12121a] text-white rounded-full border border-pink-500/35 hover:border-pink-500 hover:brightness-115 transition hover:scale-[1.03] active:scale-95 cursor-pointer uppercase font-sans font-extrabold text-[9px] md:text-xs tracking-wider flex items-center gap-1 shadow-xl"
                >
                  <Compass className="h-3.5 w-3.5 text-pink-500 animate-pulse shrink-0" />
                  <span className="tracking-wide">FIND ONLINE BEATMAPS</span>
                  <span className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              </div>
            )}

            <nav id="top-nav" className="flex items-center gap-2 md:gap-4 text-xs uppercase tracking-widest shrink-0">
              <button
                id="header-nav-play"
                onClick={() => setCurrentScreen('select')}
                className={`p-1.5 md:p-2.5 rounded-xl transition-all duration-250 cursor-pointer relative group border ${
                  currentScreen === 'select' 
                    ? 'bg-gradient-to-r from-pink-500/20 to-rose-500/20 text-pink-400 border-pink-500/40 shadow-md shadow-pink-500/10' 
                    : `${isMobile ? 'text-slate-200 border-transparent font-sans' : 'text-slate-400 hover:text-white hover:bg-white/5 border-transparent'}`
                }`}
                title="Mania Select (Keys mode)"
              >
                <Keyboard className="h-5 w-5" />
                {!isMobile && (
                  <span className="absolute bottom-[-32px] left-1/2 -translate-x-1/2 px-2.5 py-1 bg-black/95 border border-white/10 rounded font-mono text-[9px] text-slate-200 tracking-wider uppercase opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
                    Mania mode
                  </span>
                )}
              </button>
              
              <button
                id="header-nav-settings"
                onClick={() => setShowSettings(prev => !prev)}
                className={`p-1.5 md:p-2.5 rounded-xl transition-all duration-250 cursor-pointer relative group border ${
                  showSettings 
                    ? 'bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 text-cyan-400 border-cyan-500/40 shadow-md shadow-cyan-500/10' 
                    : `${isMobile ? 'text-slate-200 border-transparent font-sans' : 'text-slate-400 hover:text-white hover:bg-white/5 border-transparent'}`
                }`}
                title="System Settings"
              >
                <SettingsIcon className="h-5 w-5" />
                {!isMobile && (
                  <span className="absolute bottom-[-32px] left-1/2 -translate-x-1/2 px-2.5 py-1 bg-black/95 border border-white/10 rounded font-mono text-[9px] text-slate-200 tracking-wider uppercase opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
                    Settings
                  </span>
                )}
              </button>

              <button
                id="header-nav-history"
                onClick={() => setCurrentScreen('history')}
                className={`p-1.5 md:p-2.5 rounded-xl transition-all duration-250 cursor-pointer relative group border ${
                  currentScreen === 'history' 
                    ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 border-emerald-500/40 shadow-md shadow-emerald-500/10' 
                    : `${isMobile ? 'text-slate-200 border-transparent font-sans' : 'text-slate-400 hover:text-white hover:bg-white/5 border-transparent'}`
                }`}
                title="Personal Performance"
              >
                <History className="h-5 w-5" />
                {!isMobile && (
                  <span className="absolute bottom-[-32px] left-1/2 -translate-x-1/2 px-2.5 py-1 bg-black/95 border border-white/10 rounded font-mono text-[9px] text-slate-200 tracking-wider uppercase opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
                    History
                  </span>
                )}
              </button>
            </nav>
          </div>
        </header>
      )}

      {/* 2. CORE VIEWPORTS */}
      <main 
        id="app-main-viewport" 
        className={`flex-1 flex flex-col min-h-0 relative ${
          (currentScreen === 'play' || currentScreen === 'select' || currentScreen === 'history' || currentScreen === 'results') 
            ? 'w-full h-full' 
            : 'py-6 md:py-12 px-4 md:px-6 z-10'
        }`}
      >
        <AnimatePresence mode="wait">
          {currentScreen === 'menu' && (
            <MainMenu 
              onNavigate={(screen) => setCurrentScreen(screen as any)} 
              onOpenSettings={() => setShowSettings(true)}
            />
          )}

          {currentScreen === 'select' && (
            <motion.div
              key="select"
              variants={PAGE_TRANSITION_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full"
            >
              <SongSelect
                settings={settings}
                updateSettings={updateSettings}
                onSelectMap={handleSelectMap}
                onOpenSettings={() => setShowSettings(true)}
                customMaps={customMaps}
                onImportBeatmap={handleImportBeatmap}
                onDeleteCustomMap={handleDeleteCustomMap}
                onDeleteSongGroup={handleDeleteSongGroup}
                filterMode={3}
                setSongSelectBgUrl={setSongSelectBgUrl}
                onBack={() => setCurrentScreen('menu')}
                onOpenOnlineCatalog={() => setShowFindBeatmapOverlay(true)}
              />
            </motion.div>
          )}

          {currentScreen === 'play' && selectedBeatmap && activePlayBeatmap && (
            <motion.div
              key="play"
              variants={PAGE_TRANSITION_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full flex-1 flex flex-col"
            >
                <GameplayCanvas
                  beatmap={activePlayBeatmap}
                  settings={settings}
                  updateSettings={updateSettings}
                  onFinish={handleGameplayFinish}
                  onBack={() => {
                    try {
                      if (typeof document !== 'undefined' && (document.fullscreenElement || (document as any).webkitFullscreenElement)) {
                        if (document.exitFullscreen) {
                          document.exitFullscreen().catch(err => console.log(err));
                        } else if ((document as any).webkitExitFullscreen) {
                          (document as any).webkitExitFullscreen();
                        }
                      }
                    } catch (e) {}
                    const returnScreen = activeReplayRecord ? 'history' : 'select';
                    setActiveReplayRecord(null);
                    if (selectedBeatmap) {
                      const cached = storageManager.lruMediaCache.get(selectedBeatmap.id);
                      if (!cached) {
                        AssetLifecycleManager.releaseSpecific(selectedBeatmap.audioUrl);
                        AssetLifecycleManager.releaseSpecific(selectedBeatmap.videoUrl);
                        AssetLifecycleManager.releaseSpecific(selectedBeatmap.bgUrl);
                      } else {
                        if (selectedBeatmap.audioUrl && selectedBeatmap.audioUrl !== cached.audioUrl) {
                          AssetLifecycleManager.releaseSpecific(selectedBeatmap.audioUrl);
                        }
                        if (selectedBeatmap.videoUrl && selectedBeatmap.videoUrl !== cached.videoUrl) {
                          AssetLifecycleManager.releaseSpecific(selectedBeatmap.videoUrl);
                        }
                        if (selectedBeatmap.bgUrl && selectedBeatmap.bgUrl !== cached.bgUrl) {
                          AssetLifecycleManager.releaseSpecific(selectedBeatmap.bgUrl);
                        }
                      }
                    }
                    setSelectedBeatmap(null);
                    setCurrentScreen(returnScreen);
                  }}
                  replayRecord={activeReplayRecord}
                />
            </motion.div>
          )}

          {currentScreen === 'results' && scoreState && selectedBeatmap && activePlayBeatmap && (
            <motion.div
              key="results"
              variants={PAGE_TRANSITION_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full h-full overflow-hidden bg-zinc-950 flex items-center justify-center"
            >
              <ResultsScreen
                scoreState={scoreState}
                beatmap={activePlayBeatmap}
                playHistory={playHistory}
                currentMods={settings.selectedMods}
                onRetry={handleRetrySong}
                onWatchReplay={(record) => {
                  setViewingHistoryResult(false);
                  handleWatchReplay(record);
                }}
                onDeleteRecord={handleDeleteHistoryRecord}
                onBack={() => {
                  try {
                    if (typeof document !== 'undefined' && (document.fullscreenElement || (document as any).webkitFullscreenElement)) {
                      if (document.exitFullscreen) {
                        document.exitFullscreen().catch(err => console.log(err));
                      } else if ((document as any).webkitExitFullscreen) {
                        (document as any).webkitExitFullscreen();
                      }
                    }
                  } catch (e) {}
                  const returnScreen = activeReplayRecord ? 'history' : (viewingHistoryResult ? 'history' : 'select');
                  setActiveReplayRecord(null);
                  setViewingHistoryResult(false);
                  if (selectedBeatmap) {
                    const cached = storageManager.lruMediaCache.get(selectedBeatmap.id);
                    if (!cached) {
                      AssetLifecycleManager.releaseSpecific(selectedBeatmap.audioUrl);
                      AssetLifecycleManager.releaseSpecific(selectedBeatmap.videoUrl);
                      AssetLifecycleManager.releaseSpecific(selectedBeatmap.bgUrl);
                    } else {
                      if (selectedBeatmap.audioUrl && selectedBeatmap.audioUrl !== cached.audioUrl) {
                        AssetLifecycleManager.releaseSpecific(selectedBeatmap.audioUrl);
                      }
                      if (selectedBeatmap.videoUrl && selectedBeatmap.videoUrl !== cached.videoUrl) {
                        AssetLifecycleManager.releaseSpecific(selectedBeatmap.videoUrl);
                      }
                      if (selectedBeatmap.bgUrl && selectedBeatmap.bgUrl !== cached.bgUrl) {
                        AssetLifecycleManager.releaseSpecific(selectedBeatmap.bgUrl);
                      }
                    }
                  }
                  setSelectedBeatmap(null);
                  setCurrentScreen(returnScreen);
                }}
                onBackToHistory={viewingHistoryResult ? () => {
                  setViewingHistoryResult(false);
                  setScoreState(null);
                  setCurrentScreen('history');
                } : undefined}
              />
            </motion.div>
          )}

          {currentScreen === 'history' && (
            <motion.div
              key="history"
              variants={PAGE_TRANSITION_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full h-full overflow-hidden"
            >
              {isMobile ? (
                <div className="w-full h-full flex items-center justify-center p-4">
                  <div className="flex flex-col items-center justify-center text-center p-8 w-full max-w-md bg-slate-950/60 backdrop-blur-md rounded-2xl border border-white/5 shadow-2xl">
                    <div className="p-4 rounded-full bg-pink-500/10 border border-pink-500/20 mb-5 animate-pulse">
                      <History className="h-8 w-8 text-pink-500" />
                    </div>
                    <h2 className="text-xl font-sans font-black text-white uppercase tracking-wider">Work in Progress</h2>
                    <p className="text-xs text-slate-400 font-mono mt-3 max-w-xs leading-relaxed uppercase">
                      The detailed personal performance history is currently being optimized for mobile devices. Please check back soon!
                    </p>
                    <button
                      onClick={() => setCurrentScreen('menu')}
                      className="mt-6 px-6 py-2.5 bg-pink-500 text-slate-950 font-sans font-black text-xs uppercase tracking-widest rounded-xl hover:bg-pink-600 active:scale-95 transition"
                    >
                      Back to Menu
                    </button>
                  </div>
                </div>
              ) : (
                <PersonalHistoryScreen
                  history={playHistory}
                  allBeatmaps={customMaps}
                  onWatchReplay={(record) => {
                    setViewingHistoryResult(false);
                    handleWatchReplay(record);
                  }}
                  onViewResult={(record) => {
                    setActiveReplayRecord(null);
                    setScoreState(record.scoreState);
                    const baseId = record.beatmapId.includes('_converted_')
                      ? record.beatmapId.split('_converted_')[0]
                      : record.beatmapId;
                    const bm = customMaps.find(m => m.id === record.beatmapId || m.id === baseId);
                    if (bm) {
                        const cloned = {
                          ...bm,
                          notes: bm.notes ? bm.notes.map(n => ({ ...n })) : []
                        };
                        setSelectedBeatmap(cloned);
                        setViewingHistoryResult(true);
                        setCurrentScreen('results');
                    }
                  }}
                  onClearHistory={handleClearHistory}
                  onDeleteRecord={handleDeleteHistoryRecord}
                  historyLimit={historyLimit}
                  onSetHistoryLimit={handleSetHistoryLimit}
                />
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      <SettingsScreen
        open={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        updateSettings={updateSettings}
      />

      <OnlineBeatmapCatalog
        open={showFindBeatmapOverlay}
        onClose={() => setShowFindBeatmapOverlay(false)}
        customMaps={customMaps}
        onImportBeatmap={handleImportBeatmap}
      />


    </div>
  );
}
