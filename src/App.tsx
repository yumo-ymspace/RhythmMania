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

import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Gamepad2, Play, ChevronRight, BarChart3, Disc, Music, Shield, Cpu, Sliders, Keyboard, History, CircleDot } from 'lucide-react';
import { MainMenu } from './components/MainMenu';
import { GameScreen, GameSettings, Beatmap, ScoreState, ReplayFrame, PlayHistoryRecord } from './types';
import { AnimatePresence, motion } from 'motion/react';
import SongSelect from './components/SongSelect';
import GameplayCanvas from './components/GameplayCanvas';
import ResultsScreen from './components/ResultsScreen';
import SettingsScreen from './components/SettingsScreen';
import PersonalHistoryScreen from './components/PersonalHistoryScreen';
import { mainAudio } from './audio/AudioEngine';
import { storageManager } from './utils/storageManager';

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
  const [scoreState, setScoreState] = useState<ScoreState | null>(null);
  const [customMaps, setCustomMaps] = useState<Beatmap[]>([]);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [songSelectBgUrl, setSongSelectBgUrl] = useState<string>('/backgrounds/default.svg');
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Performance history states
  const [playHistory, setPlayHistory] = useState<PlayHistoryRecord[]>([]);
  const [historyLimit, setHistoryLimit] = useState<number>(50);
  const [activeReplayRecord, setActiveReplayRecord] = useState<PlayHistoryRecord | null>(null);
  const [viewingHistoryResult, setViewingHistoryResult] = useState(false);

  // Load play history & latency settings on mount
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const storedHistory = localStorage.getItem('rhythm_mania_v1_play_history');
        if (storedHistory) {
          setPlayHistory(JSON.parse(storedHistory));
        }
        
        const storedLimit = localStorage.getItem('rhythm_mania_v1_history_limit');
        if (storedLimit) {
          setHistoryLimit(Number(storedLimit));
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
    // Look up the beatmap in our selection
    const targetMap = [...customMaps].find(m => m.id === record.beatmapId);
    if (targetMap) {
      // Apply unpacked blob cache URLs to targetMap so replay can play back audio & video perfectly!
      const cached = storageManager.lruMediaCache.get(targetMap.id);
      if (cached) {
        targetMap.audioUrl = cached.audioUrl || targetMap.audioUrl;
        targetMap.videoUrl = cached.videoUrl || targetMap.videoUrl;
        targetMap.bgUrl = cached.bgUrl || targetMap.bgUrl;
      }
      setSelectedBeatmap(targetMap);
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

  useEffect(() => {
    const savedSettingsText = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
    if (savedSettingsText) {
      try {
        const parsed = JSON.parse(savedSettingsText);
        const merged = {
          ...DEFAULT_SETTINGS,
          ...parsed,
          bindings: {
            ...DEFAULT_SETTINGS.bindings,
            ...(parsed.bindings || {})
          }
        };
        setSettings(merged);
      } catch (e) {
        console.warn('Failed parsing settings from local storage, fallback applied.');
      }
    }

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

  const updateSettings = (newSettings: Partial<GameSettings>) => {
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
        upsurfaceNoteMode: Boolean(updated.upsurfaceNoteMode),
        videoOpacity: Number(updated.videoOpacity !== undefined ? updated.videoOpacity : 0.35),
        backgroundDim: Number(updated.backgroundDim !== undefined ? updated.backgroundDim : 0.60),
        disableVideo: Boolean(updated.disableVideo),
        videoOffset: Number(updated.videoOffset !== undefined ? updated.videoOffset : 0),
        disableParticles: Boolean(updated.disableParticles),
        limitDprToOne: Boolean(updated.limitDprToOne),
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
        progressBarTop: updated.progressBarTop !== undefined ? Boolean(updated.progressBarTop) : false,
        selectedMods: updated.selectedMods || [],
      };

      if (updated.bindings) {
        for (const k of Object.keys(updated.bindings)) {
          const numKey = Number(k);
          if (!isNaN(numKey) && Array.isArray(updated.bindings[numKey])) {
            safePayload.bindings[numKey] = updated.bindings[numKey].map(bind => String(bind));
          }
        }
      }

      try {
        localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(safePayload));
      } catch (err) {
        console.error("Failed to serialize settings. Pruning circular fields failed:", err instanceof Error ? err.message : String(err));
      }

      return safePayload;
    });
  };

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
    setSelectedBeatmap(map);
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

    // Only commit to performance logs if they are NOT playing a spectator replay and it's a mania map (mode 3)
    if (selectedBeatmap && !activeReplayRecord && selectedBeatmap.mode === 3 && finalScore.completed && !finalScore.failed) {
      let gradeChar = 'D';
      const acc = finalScore.accuracy;
      if (acc >= 100) gradeChar = 'SS';
      else if (acc >= 95) gradeChar = 'S';
      else if (acc >= 90) gradeChar = 'A';
      else if (acc >= 80) gradeChar = 'B';
      else if (acc >= 70) gradeChar = 'C';

      const newRecord: PlayHistoryRecord = {
        id: `play_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        timestamp: Date.now(),
        beatmapId: selectedBeatmap.id,
        beatmapTitle: selectedBeatmap.title,
        beatmapArtist: selectedBeatmap.artist,
        keyCount: selectedBeatmap.keyCount,
        score: finalScore.score,
        accuracy: finalScore.accuracy,
        maxCombo: finalScore.maxCombo,
        grade: gradeChar,
        isFailed: !!finalScore.failed,
        scoreState: finalScore,
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
    setScoreState(finalScore);
    setCurrentScreen('results');
  };

  const handleRetrySong = () => {
    setActiveReplayRecord(null);
    setSelectedBeatmap(null);
    setCurrentScreen('select');
  };

  return (
    <div 
      id="application-container" 
      className={`bg-[#050508] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950 relative h-screen ${
        (currentScreen === 'play' || currentScreen === 'select' || currentScreen === 'history' || currentScreen === 'results') ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'
      }`}
      style={{
        backgroundImage: (currentScreen === 'select') 
          ? `linear-gradient(rgba(10, 8, 16, 0.2), rgba(6, 6, 12, 0.45)), url(${songSelectBgUrl})` 
          : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* GLOWING TECH GRADIENTS BACKDROP & GRID OVERLAY (CONTAINED TO PREVENT DOUBLE SCROLLBARS AND SPACE LEAKS UNDER THE FOOTER) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-300px] left-1/4 w-[600px] h-[600px] rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-100px] right-10 w-[500px] h-[500px] rounded-full bg-indigo-500/5 blur-[120px] pointer-events-none" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      </div>

      {/* 1. MASTER HEADER */}
      {currentScreen !== 'play' && (
        <header 
          id="main-header" 
          className="h-16 flex items-center px-6 justify-between z-30 transition-all bg-[#000000] border-b border-white/10 sticky top-0"
        >
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
            <div 
              onClick={() => setCurrentScreen('menu')}
              className="flex items-center cursor-pointer group select-none"
            >
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white uppercase leading-none group-hover:scale-105 transition-transform duration-150">
                Rhythm<span className="text-pink-500 font-black">Mania</span>
              </h1>
            </div>

            <nav id="top-nav" className="flex items-center gap-4 text-xs uppercase tracking-widest">
              <button
                id="header-nav-play"
                onClick={() => setCurrentScreen('select')}
                className={`p-2.5 rounded-xl transition-all duration-250 cursor-pointer relative group border ${
                  currentScreen === 'select' 
                    ? 'bg-gradient-to-r from-pink-500/20 to-rose-500/20 text-pink-400 border-pink-500/40 shadow-md shadow-pink-500/10' 
                    : 'text-slate-400 hover:text-white hover:bg-white/5 border-transparent'
                }`}
                title="Mania Select (Keys mode)"
              >
                <Keyboard className="h-5 w-5" />
                <span className="absolute bottom-[-32px] left-1/2 -translate-x-1/2 px-2.5 py-1 bg-black/95 border border-white/10 rounded font-mono text-[9px] text-slate-200 tracking-wider uppercase opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
                  Mania mode
                </span>
              </button>
              
              <button
                id="header-nav-settings"
                onClick={() => setShowSettings(prev => !prev)}
                className={`p-2.5 rounded-xl transition-all duration-250 cursor-pointer relative group border ${
                  showSettings 
                    ? 'bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 text-cyan-400 border-cyan-500/40 shadow-md shadow-cyan-500/10' 
                    : 'text-slate-400 hover:text-white hover:bg-white/5 border-transparent'
                }`}
                title="System Settings"
              >
                <SettingsIcon className="h-5 w-5" />
                <span className="absolute bottom-[-32px] left-1/2 -translate-x-1/2 px-2.5 py-1 bg-black/95 border border-white/10 rounded font-mono text-[9px] text-slate-200 tracking-wider uppercase opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
                  Settings
                </span>
              </button>

              <button
                id="header-nav-history"
                onClick={() => setCurrentScreen('history')}
                className={`p-2.5 rounded-xl transition-all duration-250 cursor-pointer relative group border ${
                  currentScreen === 'history' 
                    ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 border-emerald-500/40 shadow-md shadow-emerald-500/10' 
                    : 'text-slate-400 hover:text-white hover:bg-white/5 border-transparent'
                }`}
                title="Personal Performance"
              >
                <History className="h-5 w-5" />
                <span className="absolute bottom-[-32px] left-1/2 -translate-x-1/2 px-2.5 py-1 bg-black/95 border border-white/10 rounded font-mono text-[9px] text-slate-200 tracking-wider uppercase opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
                  History
                </span>
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
              />
            </motion.div>
          )}

          {currentScreen === 'play' && selectedBeatmap && (
            <motion.div
              key="play"
              variants={PAGE_TRANSITION_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full flex-1 flex flex-col"
            >
                <GameplayCanvas
                  beatmap={selectedBeatmap}
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
                      if (selectedBeatmap.audioUrl?.startsWith('blob:')) selectedBeatmap.audioUrl = '';
                      if (selectedBeatmap.videoUrl?.startsWith('blob:')) selectedBeatmap.videoUrl = '';
                      if (selectedBeatmap.bgUrl?.startsWith('blob:')) selectedBeatmap.bgUrl = '';
                    }
                    setSelectedBeatmap(null);
                    setCurrentScreen(returnScreen);
                  }}
                  replayRecord={activeReplayRecord}
                />
            </motion.div>
          )}

          {currentScreen === 'results' && scoreState && selectedBeatmap && (
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
                beatmap={selectedBeatmap}
                playHistory={playHistory}
                onRetry={handleRetrySong}
                onWatchReplay={(record) => {
                  setViewingHistoryResult(false);
                  handleWatchReplay(record);
                }}
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
                    if (selectedBeatmap.audioUrl?.startsWith('blob:')) selectedBeatmap.audioUrl = '';
                    if (selectedBeatmap.videoUrl?.startsWith('blob:')) selectedBeatmap.videoUrl = '';
                    if (selectedBeatmap.bgUrl?.startsWith('blob:')) selectedBeatmap.bgUrl = '';
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
              className="w-full h-full"
            >
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
                  const bm = customMaps.find(m => m.id === record.beatmapId);
                  if (bm) {
                      setSelectedBeatmap(bm);
                      setViewingHistoryResult(true);
                      setCurrentScreen('results');
                  }
                }}
                onClearHistory={handleClearHistory}
                onDeleteRecord={handleDeleteHistoryRecord}
                historyLimit={historyLimit}
                onSetHistoryLimit={handleSetHistoryLimit}
              />
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

      {/* MOBILE WARNING OVERLAY */}
      {isMobile && (
        <div className="fixed inset-0 z-50 bg-[#050508] flex flex-col justify-center items-center p-6 text-center select-none">
          <div className="max-w-md bg-[#0c0c12]/90 border border-white/10 rounded-2xl p-8 backdrop-blur-md shadow-2xl relative">
            <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-pink-500 via-rose-500 to-indigo-500 rounded-t-2xl" />
            <div className="w-16 h-16 rounded-full bg-pink-500/10 border border-pink-500/20 flex items-center justify-center mx-auto mb-6 text-pink-400">
              <span className="text-2xl">📱</span>
            </div>
            <h2 className="text-2xl font-black text-white mb-3 tracking-tight uppercase">Mobile Redesign</h2>
            <div className="h-px bg-white/10 w-16 mx-auto mb-4" />
            <p className="text-slate-300 text-sm leading-relaxed mb-6 font-sans">
              The RhythmMania mobile interface is currently being fully redesigned to bring high-fidelity touch mechanisms and perfect audio synchronizations to portable viewports.
            </p>
            <p className="text-pink-500 text-xs font-mono tracking-widest font-black uppercase">
              Please enter from a Desktop screen
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
