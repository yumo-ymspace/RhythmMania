/**
 * @license
 * SPDX-License-Identifier: GPL-3.0-only
 */

import React, { useState, useEffect } from 'react';
import { Compass, Settings as SettingsIcon, ShieldQuestion, HelpCircle, Gamepad2, Play, ChevronRight, BarChart3, Disc } from 'lucide-react';
import { GameScreen, GameSettings, Beatmap, ScoreState } from './types';
import SongSelect from './components/SongSelect';
import GameplayCanvas from './components/GameplayCanvas';
import ResultsScreen from './components/ResultsScreen';
import SettingsScreen from './components/SettingsScreen';
import { mainAudio } from './audio/AudioEngine';
import { storageManager } from './utils/storageManager';

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
};

// Add this helper function outside the component to deep-sanitize beatmaps before saving to IndexedDB
const sanitizeBeatmapForStorage = (map: any): any => {
  if (!map) return map;
  // Destructure only known-safe serializable scalar properties
  const {
    id, title, artist, creator, version, audioUrl, videoUrl, bgUrl,
    bpm, duration, stars, keyCount, notes, timingPoints
  } = map;

  // Re-build a clean serializable structure
  const cleanNotes = Array.isArray(notes) ? notes.map((note: any) => {
    const { time, column, duration, isLongNote } = note;
    return {
      time: Number(time),
      column: Number(column),
      duration: duration !== undefined ? Number(duration) : undefined,
      isLongNote: isLongNote !== undefined ? Boolean(isLongNote) : undefined
    };
  }) : [];

  const cleanTimingPoints = Array.isArray(timingPoints) ? timingPoints.map((tp: any) => {
    const { time, beatLength, bpmSpeedMultiplier } = tp;
    return {
      time: Number(time),
      beatLength: Number(beatLength),
      bpmSpeedMultiplier: bpmSpeedMultiplier !== undefined ? Number(bpmSpeedMultiplier) : undefined
    };
  }) : undefined;

  return {
    id: String(id),
    title: String(title || ''),
    artist: String(artist || ''),
    creator: String(creator || ''),
    version: String(version || ''),
    audioUrl: typeof audioUrl === 'string' ? audioUrl : undefined,
    videoUrl: typeof videoUrl === 'string' ? videoUrl : undefined,
    bgUrl: typeof bgUrl === 'string' ? bgUrl : undefined,
    bpm: Number(bpm || 120),
    duration: Number(duration || 0),
    stars: Number(stars || 0),
    keyCount: Number(keyCount || 4),
    notes: cleanNotes,
    timingPoints: cleanTimingPoints,
    // Safely whitelist meta properties, verifying primitive types
    packageId: typeof map.packageId === 'string' ? map.packageId : undefined,
    parentPackageId: typeof map.parentPackageId === 'string' ? map.parentPackageId : undefined,
    audioFilename: typeof map.audioFilename === 'string' ? map.audioFilename : undefined,
    videoFilename: typeof map.videoFilename === 'string' ? map.videoFilename : undefined,
    bgFilename: typeof map.bgFilename === 'string' ? map.bgFilename : undefined,
    originalOsuContent: typeof map.originalOsuContent === 'string' ? map.originalOsuContent : undefined,
    isServerMap: typeof map.isServerMap === 'boolean' ? map.isServerMap : undefined,
    isCached: typeof map.isCached === 'boolean' ? map.isCached : undefined,
    oszUrl: typeof map.oszUrl === 'string' ? map.oszUrl : undefined,
  };
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<GameScreen>('menu');
  const [selectedBeatmap, setSelectedBeatmap] = useState<Beatmap | null>(null);
  const [scoreState, setScoreState] = useState<ScoreState | null>(null);
  
  // Custom imported osu! maps
  const [customMaps, setCustomMaps] = useState<Beatmap[]>([]);
  
  // Game settings
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);

  // Initialize and retrieve state parameters from LocalStorage
  useEffect(() => {
    // 1. Settings load
    const savedSettingsText = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
    if (savedSettingsText) {
      try {
        const parsed = JSON.parse(savedSettingsText);
        // Deep merge with defaults to capture missing fields elegantly
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

    // 2. Custom Maps load from IndexedDB with LocalStorage fallback / migration support
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
              // Safely migrate them into IndexedDB for persistent reload support
              for (const map of parsed) {
                const clean = sanitizeBeatmapForStorage(map);
                await storageManager.saveBeatmap(clean);
              }
            }
          }
        }
      } catch (err) {
        console.warn('Could not retrieve custom maps from IndexedDB:', err);
      }
    };
    loadMapsFromIndexedDB();
  }, []);

  const updateSettings = (newSettings: Partial<GameSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      
      // Perform defensive primitive-only sanitization of the merged settings object
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
        console.error("Failed to serialize settings. Pruning circular fields failed:", err);
      }

      return safePayload;
    });
  };

  const handleImportOsuMap = async (map: Beatmap) => {
    const cleanMap = sanitizeBeatmapForStorage(map);
    setCustomMaps(prev => {
      const filtered = prev.filter(m => m.id !== cleanMap.id);
      return [cleanMap, ...filtered];
    });
    try {
      await storageManager.saveBeatmap(cleanMap);
    } catch (e) {
      console.error('Failed to persist imported beatmap to IndexedDB:', e);
    }
  };

  const handleDeleteCustomMap = async (mapId: string) => {
    try {
      await storageManager.deleteBeatmapAndCleanup(mapId);
      setCustomMaps(prev => prev.filter(m => m.id !== mapId));
      setSelectedBeatmap(prev => prev && prev.id === mapId ? null : prev);
    } catch (e) {
      console.error('Failed to delete custom map:', e);
    }
  };

  const handleSelectMap = (map: Beatmap) => {
    setSelectedBeatmap(map);
    setCurrentScreen('play');
  };

  const handleGameplayFinish = (finalScore: ScoreState) => {
    setScoreState(finalScore);
    setCurrentScreen('results');
  };

  const handleRetrySong = () => {
    if (selectedBeatmap) {
      setCurrentScreen('play');
    }
  };

  // Render Screens
  return (
    <div id="application-container" className="min-h-screen bg-[#050505] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950 selection:bg-opacity-80">
      
      {/* 1. COMPACT MASTER HEADER FOR NON-GAMEPLAY VIEWS */}
      {currentScreen !== 'play' && (
        <header id="main-header" className="h-14 border-b border-white/10 flex items-center px-6 justify-between bg-[#0a0a0c] sticky top-0 z-30">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
            <div 
              onClick={() => setCurrentScreen('menu')}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <div className="py-1 px-2.5 bg-gradient-to-br from-cyan-500 to-indigo-600 rounded flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition font-black tracking-tighter text-black text-xs">
                RM
              </div>
              <div className="flex flex-col">
                <h1 className="text-lg font-black tracking-tighter italic text-white uppercase leading-none">
                  RHYTHM<span className="text-cyan-400">MANIA</span>
                </h1>
                <p className="text-[9px] text-slate-500 font-mono tracking-wider leading-none mt-0.5">HIGH DENSITY MATRIX</p>
              </div>
            </div>

            <nav id="top-nav" className="flex items-center gap-6 text-xs font-semibold uppercase tracking-widest text-slate-400">
              <button
                id="header-nav-play"
                onClick={() => setCurrentScreen('select')}
                className={`transition-colors h-14 flex items-center font-bold px-1 relative ${
                  currentScreen === 'select' 
                    ? 'text-white border-b-2 border-cyan-400' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Song Select
              </button>
              
              <button
                id="header-nav-settings"
                onClick={() => setCurrentScreen('settings')}
                className={`transition-colors h-14 flex items-center font-bold px-1 relative ${
                  currentScreen === 'settings' 
                    ? 'text-white border-b-2 border-cyan-400' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Settings
              </button>
            </nav>
          </div>
        </header>
      )}

      {/* 2. CORE ROUTING MATRIX VIEWPORTS */}
      <main id="app-main-viewport" className={`flex-1 ${currentScreen === 'play' ? '' : 'py-6 md:py-8 px-4 md:px-6'}`}>
        {currentScreen === 'menu' && (
          <div id="home-menu-inner" className="max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[580px] text-center gap-8 py-10">
            {/* LARGE ROTATING VINYL TURNTABLE COMPONENT */}
            <div className="relative group max-w-sm">
              <div className="p-8 bg-[#0a0a0c] rounded-full border border-white/10 shadow-2xl relative flex items-center justify-center">
                <Disc className="h-32 w-32 md:h-40 md:w-40 text-slate-800 animate-spin" style={{ animationDuration: '10s' }} />
                <span className="absolute h-10 w-10 md:h-12 md:w-12 bg-black rounded-full border border-white/10 flex items-center justify-center shadow-inner">
                  <span className="h-4.5 w-4.5 bg-cyan-400 rounded-full animate-ping" />
                </span>
              </div>
              
              {/* Pulsing Back Glow */}
              <div className="absolute inset-0 bg-cyan-500/5 rounded-full filter blur-2xl animate-pulse -z-10" />
            </div>

            <div className="flex flex-col gap-3">
              <h1 className="text-4xl md:text-5xl font-black font-sans tracking-tighter text-slate-100 uppercase italic">
                RHYTHM GAMING <br />
                <span className="bg-gradient-to-r from-cyan-400 to-indigo-500 bg-clip-text text-transparent p-1">HIGH DENSITY MATRIX</span>
              </h1>
              <p className="text-xs md:text-sm text-slate-400 max-w-lg font-sans mx-auto leading-relaxed tracking-wider">
                Experience precision-designed sub-millisecond scrolling columns matching community formats. Create procedural maps, adjust offsets, or load custom `.osu` maps instantly.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
              <button
                id="launch-game-btn"
                onClick={() => setCurrentScreen('select')}
                className="px-8 py-3.5 bg-gradient-to-r from-cyan-400 to-indigo-500 hover:brightness-110 text-black font-sans font-black text-sm rounded uppercase tracking-[0.2em] italic shadow-[0_0_20px_rgba(34,211,238,0.4)] active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                SELECT PLAYBACK TRACK <ChevronRight className="h-5 w-5 fill-current" />
              </button>
              
              <button
                id="launch-settings-btn"
                onClick={() => setCurrentScreen('settings')}
                className="px-8 py-3.5 bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white font-sans text-xs font-black rounded border border-white/10 uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <SettingsIcon className="h-4 w-4 text-cyan-400" /> CALIBRATE OFFSET
              </button>
            </div>

            {/* LOWER HARD-FACTS INFORMATIVE BENTO GRID */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-4xl mt-12 border-t border-white/5 pt-10">
              <div className="flex flex-col items-center p-5 bg-[#08080a] rounded border border-white/5">
                <span className="p-2.5 bg-white/5 text-cyan-400 rounded border border-white/10 mb-3">
                  <Gamepad2 className="h-4 w-4" />
                </span>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-200">Lane Mechanics 4K-7K</h4>
                <p className="text-[11px] text-slate-500 mt-1.5 max-w-[220px]" style={{ textWrap: 'balance' }}>
                  Customizable lanes, colors, and speeds to fit your individual performance patterns.
                </p>
              </div>

              <div className="flex flex-col items-center p-5 bg-[#08080a] rounded border border-white/5">
                <span className="p-2.5 bg-white/5 text-cyan-400 rounded border border-white/10 mb-3">
                  <Disc className="h-4 w-4 animate-pulse" />
                </span>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-200">Drag & Drop .osu Maps</h4>
                <p className="text-[11px] text-slate-500 mt-1.5 max-w-[220px]" style={{ textWrap: 'balance' }}>
                  Drop any mania file or map into the engine to parse tracks instantly in browser mode.
                </p>
              </div>

              <div className="flex flex-col items-center p-5 bg-[#08080a] rounded border border-white/5">
                <span className="p-2.5 bg-white/5 text-cyan-400 rounded border border-white/10 mb-3">
                  <BarChart3 className="h-4 w-4" />
                </span>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-200">Esports Analytics</h4>
                <p className="text-[11px] text-slate-500 mt-1.5 max-w-[220px]" style={{ textWrap: 'balance' }}>
                  A post-analysis results board showing accuracy scores and comprehensive hit categories spreads.
                </p>
              </div>
            </div>
          </div>
        )}

        {currentScreen === 'select' && (
          <SongSelect
            settings={settings}
            updateSettings={updateSettings}
            onSelectMap={handleSelectMap}
            onOpenGlobalSettings={() => setCurrentScreen('settings')}
            customMaps={customMaps}
            onImportOsuMap={handleImportOsuMap}
            onDeleteCustomMap={handleDeleteCustomMap}
          />
        )}

        {currentScreen === 'play' && selectedBeatmap && (
          <GameplayCanvas
            beatmap={selectedBeatmap}
            settings={settings}
            updateSettings={updateSettings}
            onFinish={handleGameplayFinish}
            onBack={() => setCurrentScreen('select')}
          />
        )}

        {currentScreen === 'results' && scoreState && selectedBeatmap && (
          <ResultsScreen
            scoreState={scoreState}
            beatmap={selectedBeatmap}
            onRetry={handleRetrySong}
            onBack={() => setCurrentScreen('select')}
          />
        )}

        {currentScreen === 'settings' && (
          <SettingsScreen
            settings={settings}
            updateSettings={updateSettings}
            onBack={() => setCurrentScreen('select')}
          />
        )}
      </main>

      {/* 3. FOOTER */}
      {currentScreen !== 'play' && (
        <footer id="main-footer" className="border-t border-slate-900 bg-slate-950/40 py-6 font-mono text-[10px] text-slate-600 mt-12 dark:bg-transparent">
          <div className="max-w-7xl mx-auto px-4 md:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <span>RHYTHM_MANIA_ENGINE_LIVE // v1.0.0 (Built: 30/5/2026) // BUFFER_STABLE</span>
            <span className="flex items-center gap-1">
              Crafted by Yumo(yumo-ymspace) • Respecting Competitive Integrity & Game Feel
            </span>
          </div>
        </footer>
      )}
    </div>
  );
}
