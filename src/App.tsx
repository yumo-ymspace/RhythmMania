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

import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Gamepad2, Play, ChevronRight, BarChart3, Disc, Music, Shield, Cpu, Sliders } from 'lucide-react';
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

const DEFAULT_SETTINGS: GameSettings = {
  scrollSpeed: 21,
  audioOffset: 0,
  visualOffset: 0,
  hitsoundVolume: 0.60,
  musicVolume: 0.75,
  keyMode: 4,
  bindings: {
    2: ['f', 'j'],
    3: ['f', ' ', 'j'],
    4: ['d', 'f', 'j', 'k'],
    5: ['d', 'f', ' ', 'j', 'k'],
    6: ['s', 'd', 'f', 'j', 'k', 'l'],
    7: ['s', 'd', 'f', ' ', 'j', 'k', 'l'],
    8: ['a', 's', 'd', 'f', 'j', 'k', 'l', ';']
  },
  upsurfaceNoteMode: false,
  videoOpacity: 0.35,
  backgroundDim: 0.60,
  disableVideo: false,
  videoOffset: 0,
  disableParticles: false,
  limitDprToOne: false,
  skinId: 'neon',
  noteStyle: 'rounded',
  receptorStyle: 'tactile',
  noteOpacity: 1.0,
  receptorOpacity: 1.0,
  judgementOpacity: 1.0,
  judgementSize: 1.0,
  laneSeparatorOpacity: 0.30,
  circleSize: 1.0,
  noteSizeMultiplier: 1.0,
  playfieldStyle: 'square',
  circleRenderStyle: 'circles',
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<GameScreen>('menu');
  const [selectedBeatmap, setSelectedBeatmap] = useState<Beatmap | null>(null);
  const [scoreState, setScoreState] = useState<ScoreState | null>(null);
  const [customMaps, setCustomMaps] = useState<Beatmap[]>([]);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);

  // Performance history states
  const [playHistory, setPlayHistory] = useState<PlayHistoryRecord[]>([]);
  const [historyLimit, setHistoryLimit] = useState<number>(50);
  const [activeReplayFrames, setActiveReplayFrames] = useState<ReplayFrame[] | null>(null);

  // Load play history & latency settings on mount
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
      setSelectedBeatmap(targetMap);
      setActiveReplayFrames(record.replayFrames);
      setCurrentScreen('play');
    }
  };

  // Dynamically apply selected skin colors to the site theme/UI elements!
  useEffect(() => {
    let accentHex = '#00b0ff'; // Default Neon Cyber cyan

    if (settings.skinId === 'classic-bar') {
      accentHex = '#ef4444'; // Red DDR
    } else if (settings.skinId === 'circles') {
      accentHex = '#ff4081'; // Pink osu!mania
    } else if (settings.skinId === 'cyberpunk') {
      accentHex = '#ec4899'; // Vaporwave magenta
    } else if (settings.skinId === 'emerald') {
      accentHex = '#10b981'; // Acid emerald
    } else if (settings.skinId === 'minimalist') {
      accentHex = '#94a3b8'; // Monochrome slate
    } else if (settings.skinId === 'custom' && settings.customSkinColors && settings.customSkinColors.length > 0) {
      // Use center key color or side key color for maximum visible identity!
      accentHex = settings.customSkinColors[2] || settings.customSkinColors[0] || '#06b6d4';
    }

    const cleanHex = accentHex.replace('#', '');
    let r = 0, g = 176, b = 255;
    if (cleanHex.length === 3) {
      r = parseInt(cleanHex[0] + cleanHex[0], 16);
      g = parseInt(cleanHex[1] + cleanHex[1], 16);
      b = parseInt(cleanHex[2] + cleanHex[2], 16);
    } else if (cleanHex.length === 6) {
      r = parseInt(cleanHex.slice(0, 2), 16);
      g = parseInt(cleanHex.slice(2, 4), 16);
      b = parseInt(cleanHex.slice(4, 6), 16);
    }

    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--skin-accent', accentHex);
      document.documentElement.style.setProperty('--skin-accent-rgb', `${r}, ${g}, ${b}`);
    }
  }, [settings.skinId, settings.customSkinColors]);

  // Autoscroll to the top of the viewport whenever a page component loads or changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [currentScreen]);

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
        noteStyle: updated.noteStyle || 'rounded',
        receptorStyle: updated.receptorStyle || 'tactile',
        noteOpacity: updated.noteOpacity !== undefined ? Number(updated.noteOpacity) : 1.0,
        receptorOpacity: updated.receptorOpacity !== undefined ? Number(updated.receptorOpacity) : 1.0,
        judgementOpacity: updated.judgementOpacity !== undefined ? Number(updated.judgementOpacity) : 1.0,
        judgementSize: updated.judgementSize !== undefined ? Number(updated.judgementSize) : 1.0,
        laneSeparatorOpacity: updated.laneSeparatorOpacity !== undefined ? Number(updated.laneSeparatorOpacity) : 0.30,
        circleSize: updated.circleSize !== undefined ? Number(updated.circleSize) : 1.0,
        noteSizeMultiplier: updated.noteSizeMultiplier !== undefined ? Number(updated.noteSizeMultiplier) : 1.0,
        playfieldStyle: updated.playfieldStyle || 'square',
        circleRenderStyle: updated.circleRenderStyle || 'circles',
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

  const handleImportOsuMap = async (map: Beatmap) => {
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
    setActiveReplayFrames(null); // Fresh clean live playthrough
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

    // Only commit to performance logs if they are NOT playing a spectator replay
    if (selectedBeatmap && !activeReplayFrames) {
      let gradeChar = 'D';
      const acc = finalScore.accuracy;
      if (finalScore.failed) gradeChar = 'FAIL';
      else if (acc >= 100) gradeChar = 'SS';
      else if (acc >= 95) gradeChar = 'S';
      else if (acc >= 90) gradeChar = 'A';
      else if (acc >= 80) gradeChar = 'B';
      else if (acc >= 70) gradeChar = 'C';

      const newRecord: PlayHistoryRecord = {
        id: `play_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
        replayFrames: replayFrames
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

    // Clear spectator frames to restore normal play state
    setActiveReplayFrames(null);

    setScoreState(finalScore);
    setCurrentScreen('results');
  };

  const handleRetrySong = () => {
    setActiveReplayFrames(null);
    setSelectedBeatmap(null);
    setCurrentScreen('select');
  };

  return (
    <div 
      id="application-container" 
      className="min-h-screen bg-[#050508] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950 relative overflow-x-hidden"
    >
      {/* GLOWING TECH GRADIENTS BACKDROP */}
      <div className="absolute top-[-300px] left-1/4 w-[600px] h-[600px] rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-100px] right-10 w-[500px] h-[500px] rounded-full bg-indigo-500/5 blur-[120px] pointer-events-none" />
      
      {/* GRID OVERLAY ACCENT */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      {/* 1. MASTER HEADER */}
      {currentScreen !== 'play' && (
        <header id="main-header" className="h-16 border-b border-white/5 flex items-center px-6 justify-between bg-[#08080c]/85 backdrop-blur-md sticky top-0 z-30">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
            <div 
              onClick={() => setCurrentScreen('menu')}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <div className="py-1 px-2 bg-skin-accent rounded text-slate-950 font-black tracking-tighter text-xs shadow-skin-accent-glow">
                RM
              </div>
              <div className="flex flex-col">
                <h1 className="text-lg font-black tracking-tight text-white uppercase leading-none">
                  RHYTHM<span className="text-skin-accent">MANIA</span>
                </h1>
                <p className="text-[8px] text-skin-accent font-mono tracking-widest leading-none mt-1 opacity-75">ENGINE VERSION 2.0</p>
              </div>
            </div>

            <nav id="top-nav" className="flex items-center gap-6 text-xs uppercase tracking-widest">
              <button
                id="header-nav-play"
                onClick={() => setCurrentScreen('select')}
                className={`transition-all duration-200 h-16 flex items-center font-bold px-1 relative ${
                  currentScreen === 'select' 
                    ? 'text-white border-b-2 border-skin-accent text-shadow-sm text-skin-accent text-[12px]' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Music Select
              </button>
              
              <button
                id="header-nav-settings"
                onClick={() => setCurrentScreen('settings')}
                className={`transition-all duration-200 h-16 flex items-center font-bold px-1 relative ${
                  currentScreen === 'settings' 
                    ? 'text-white border-b-2 border-skin-accent text-shadow-sm text-skin-accent text-[12px]' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                System Latency
              </button>

              <button
                id="header-nav-history"
                onClick={() => setCurrentScreen('history')}
                className={`transition-all duration-200 h-16 flex items-center font-bold px-1 relative ${
                  currentScreen === 'history' 
                    ? 'text-white border-b-2 border-skin-accent text-shadow-sm text-skin-accent text-[12px]' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Personal Performance
              </button>
            </nav>
          </div>
        </header>
      )}

      {/* 2. CORE VIEWPORTS */}
      <main id="app-main-viewport" className={`flex-1 flex flex-col justify-center ${currentScreen === 'play' ? '' : 'py-6 md:py-12 px-4 md:px-6 relative z-10'}`}>
        <AnimatePresence mode="wait">
          {currentScreen === 'menu' && (
            <motion.div
              key="menu"
              variants={PAGE_TRANSITION_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full flex flex-col items-center"
            >
              <div id="home-menu-inner" className="max-w-5xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-12 py-6 w-full">
                {/* LEFT HERO PANEL */}
                <div className="flex flex-col gap-6 text-left max-w-xl">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-skin-accent-dim border border-skin-accent-dim text-skin-accent text-[10px] font-mono tracking-wider w-fit shadow-skin-accent-glow">
                    <Cpu className="h-3 w-3 animate-pulse" /> PROCEDURAL SCALING MATRIX ACTIVE
                  </div>
                  
                  <div className="flex flex-col gap-3">
                    <h1 className="text-5xl md:text-6xl font-black tracking-tight text-white uppercase italic leading-[1.05]">
                      THE PREMIUM <br/>
                      <span className="bg-gradient-to-r from-skin-accent to-indigo-400 bg-clip-text text-transparent">RHYTHM DECK</span>
                    </h1>
                    <p className="text-sm text-slate-400 font-sans leading-relaxed tracking-wide">
                      Experience a precision-calibrated lane rhythm engine. Complete with customizable scroll multipliers, 2K–8K bindings, real-time .osu parser integrations, and smooth audio transitions.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 mt-2">
                    <button
                      id="launch-game-btn"
                      onClick={() => setCurrentScreen('select')}
                      className="px-8 py-4 bg-skin-accent hover:brightness-110 text-slate-950 font-black text-xs rounded uppercase tracking-[0.2em] italic shadow-skin-accent-neon active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      SELECT TRACK <ChevronRight className="h-4.5 w-4.5 stroke-[2.5]" />
                    </button>
                    
                    <button
                      id="launch-settings-btn"
                      onClick={() => setCurrentScreen('settings')}
                      className="px-8 py-4 bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white font-black text-xs rounded border border-white/10 uppercase tracking-widest hover:border-white/20 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <SettingsIcon className="h-4 w-4 text-skin-accent" /> CALIBRATE OFFSET
                    </button>
                  </div>
                </div>

                {/* RIGHT GRAPHICAL HERO PLATE */}
                <div className="relative flex items-center justify-center w-full max-w-sm lg:max-w-md">
                  <div className="relative p-10 bg-[#08080b]/90 rounded-3xl border border-white/5 shadow-2xl flex items-center justify-center w-full aspect-square max-w-[340px]">
                    {/* CYBER SONIC PORTAL SPIN */}
                    <div className="absolute inset-4 rounded-full border border-dashed border-skin-accent-dim animate-spin" style={{ animationDuration: '40s' }} />
                    <div className="absolute inset-8 rounded-full border border-dashed border-indigo-500/20 animate-spin" style={{ animationDuration: '24s', animationDirection: 'reverse' }} />
                    <div className="absolute inset-1 w-full h-full bg-skin-accent-dim blur-[50px] rounded-full" />
                    
                    {/* FLOATING ABSTRACT LANE INDICATORS */}
                    <div className="absolute top-10 left-5 h-20 w-1 bg-gradient-to-b from-skin-accent to-transparent opacity-60 rounded-full" />
                    <div className="absolute bottom-10 right-5 h-20 w-1 bg-gradient-to-t from-indigo-500 to-transparent opacity-60 rounded-full" />
                    
                    <div className="p-10 bg-[#0c0c12]/95 rounded-full border border-white/10 shadow-[inner_0_0_30px_rgba(255,255,255,0.02)] relative flex items-center justify-center w-[180px] h-[180px] group hover:border-skin-accent-dim transition-all duration-500">
                      <Disc className="h-28 w-28 text-slate-800 animate-spin group-hover:text-slate-700 transition" style={{ animationDuration: '8s' }} />
                      <span className="absolute h-12 w-12 bg-black rounded-full border border-white/10 flex items-center justify-center shadow-2xl">
                        <Music className="h-5 w-5 text-skin-accent" />
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* COMPACT DASHBOARD SWITCHES */}
              <div className="max-w-5xl mx-auto w-full grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 border-t border-white/5 pt-12">
                <div className="flex flex-col p-6 bg-[#08080B]/90 rounded-2xl border border-white/5 hover:border-cyan-400/20 transition-all duration-300">
                  <span className="p-3 bg-cyan-400/5 text-cyan-400 rounded-xl border border-cyan-400/10 mb-4 w-fit">
                    <Gamepad2 className="h-5 w-5" />
                  </span>
                  <h4 className="text-sm font-black uppercase tracking-wider text-slate-200">2K - 8K COMPATIBILITY</h4>
                  <p className="text-xs text-slate-400 mt-2 font-sans leading-relaxed">
                    Seamless scaling modes. Customize key bindings per keyCount to optimize physical response vectors.
                  </p>
                </div>

                <div className="flex flex-col p-6 bg-[#08080B]/90 rounded-2xl border border-white/5 hover:border-cyan-400/20 transition-all duration-300">
                  <span className="p-3 bg-cyan-400/5 text-cyan-400 rounded-xl border border-cyan-400/10 mb-4 w-fit animate-pulse">
                    <Music className="h-5 w-5" />
                  </span>
                  <h4 className="text-sm font-black uppercase tracking-wider text-slate-200">ZIP RESOLVER</h4>
                  <p className="text-xs text-slate-400 mt-2 font-sans leading-relaxed">
                    Drag and drop your standard `.osu` or `.osz` files to instantly ingest charts and start playing immediately.
                  </p>
                </div>

                <div className="flex flex-col p-6 bg-[#08080B]/90 rounded-2xl border border-white/5 hover:border-cyan-400/20 transition-all duration-300">
                  <span className="p-3 bg-cyan-400/5 text-cyan-400 rounded-xl border border-cyan-400/10 mb-4 w-fit">
                    <BarChart3 className="h-5 w-5" />
                  </span>
                  <h4 className="text-sm font-black uppercase tracking-wider text-slate-200">EPIC GRADE FEEDBACK</h4>
                  <p className="text-xs text-slate-400 mt-2 font-sans leading-relaxed">
                    A gorgeous results and post-game telemetry system tracking perfect spreads and overall performance accuracy.
                  </p>
                </div>
              </div>
            </motion.div>
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
                onOpenGlobalSettings={() => setCurrentScreen('settings')}
                customMaps={customMaps}
                onImportOsuMap={handleImportOsuMap}
                onDeleteCustomMap={handleDeleteCustomMap}
                onDeleteSongGroup={handleDeleteSongGroup}
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
                  setActiveReplayFrames(null);
                  setSelectedBeatmap(null);
                  setCurrentScreen('select');
                }}
                replayData={activeReplayFrames}
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
              className="w-full"
            >
              <ResultsScreen
                scoreState={scoreState}
                beatmap={selectedBeatmap}
                onRetry={handleRetrySong}
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
                  setActiveReplayFrames(null);
                  setSelectedBeatmap(null);
                  setCurrentScreen('select');
                }}
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
              className="w-full"
            >
              <PersonalHistoryScreen
                history={playHistory}
                allBeatmaps={customMaps}
                onWatchReplay={handleWatchReplay}
                onClearHistory={handleClearHistory}
                onDeleteRecord={handleDeleteHistoryRecord}
                historyLimit={historyLimit}
                onSetHistoryLimit={handleSetHistoryLimit}
              />
            </motion.div>
          )}

          {currentScreen === 'settings' && (
            <motion.div
              key="settings"
              variants={PAGE_TRANSITION_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full"
            >
              <SettingsScreen
                settings={settings}
                updateSettings={updateSettings}
                onBack={() => setCurrentScreen('select')}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* 3. FOOTER */}
      {currentScreen !== 'play' && (
        <footer id="main-footer" className="border-t border-white/5 bg-[#030305] py-8 text-[10px] text-slate-500 mt-auto relative z-10 font-mono">
          <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <span className="tracking-widest">// RHYTHM PERFORMANCE ENGINE • SYNC_OK</span>
            <span className="flex items-center gap-1 opacity-75">
              Designed with precision mechanics • {new Date().getFullYear()} RHYTHMMANIA
            </span>
          </div>
        </footer>
      )}
    </div>
  );
}
