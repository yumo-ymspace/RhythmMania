/**
 * @license
 * SPDX-License-Identifier: GPL-3.0-only
 */

import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Gamepad2, Play, ChevronRight, BarChart3, Disc, Music, Shield, Cpu, Sliders } from 'lucide-react';
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

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<GameScreen>('menu');
  const [selectedBeatmap, setSelectedBeatmap] = useState<Beatmap | null>(null);
  const [scoreState, setScoreState] = useState<ScoreState | null>(null);
  const [customMaps, setCustomMaps] = useState<Beatmap[]>([]);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);

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

  const handleSelectMap = (map: Beatmap) => {
    setSelectedBeatmap(map);
    setCurrentScreen('play');
  };

  const handleGameplayFinish = (finalScore: ScoreState) => {
    setScoreState(finalScore);
    setCurrentScreen('results');
  };

  const handleRetrySong = () => {
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
              <div className="py-1 px-2 bg-gradient-to-br from-cyan-400 to-indigo-500 rounded text-slate-950 font-black tracking-tighter text-xs">
                RM
              </div>
              <div className="flex flex-col">
                <h1 className="text-lg font-black tracking-tight text-white uppercase leading-none">
                  RHYTHM<span className="text-cyan-400">MANIA</span>
                </h1>
                <p className="text-[8px] text-cyan-400/60 font-mono tracking-widest leading-none mt-1">ENGINE VERSION 2.0</p>
              </div>
            </div>

            <nav id="top-nav" className="flex items-center gap-6 text-xs uppercase tracking-widest">
              <button
                id="header-nav-play"
                onClick={() => setCurrentScreen('select')}
                className={`transition-all duration-200 h-16 flex items-center font-bold px-1 relative ${
                  currentScreen === 'select' 
                    ? 'text-white border-b-2 border-cyan-400 text-shadow-sm' 
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
                    ? 'text-white border-b-2 border-cyan-400 text-shadow-sm' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                System Latency
              </button>
            </nav>
          </div>
        </header>
      )}

      {/* 2. CORE VIEWPORTS */}
      <main id="app-main-viewport" className={`flex-1 flex flex-col justify-center ${currentScreen === 'play' ? '' : 'py-6 md:py-12 px-4 md:px-6 relative z-10'}`}>
        {currentScreen === 'menu' && (
          <div id="home-menu-inner" className="max-w-5xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-12 py-6 w-full">
            {/* LEFT HERO PANEL */}
            <div className="flex flex-col gap-6 text-left max-w-xl">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-400/5 border border-cyan-400/20 text-cyan-400 text-[10px] font-mono tracking-wider w-fit">
                <Cpu className="h-3 w-3 animate-pulse" /> PROCEDURAL SCALING MATRIX ACTIVE
              </div>
              
              <div className="flex flex-col gap-3">
                <h1 className="text-5xl md:text-6xl font-black tracking-tight text-white uppercase italic leading-[1.05]">
                  THE PREMIUM <br/>
                  <span className="bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">RHYTHM DECK</span>
                </h1>
                <p className="text-sm text-slate-400 font-sans leading-relaxed tracking-wide">
                  Experience a precision-calibrated lane rhythm engine. Complete with customizable scroll multipliers, 2K–8K bindings, real-time .osu parser integrations, and smooth audio transitions.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 mt-2">
                <button
                  id="launch-game-btn"
                  onClick={() => setCurrentScreen('select')}
                  className="px-8 py-4 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs rounded uppercase tracking-[0.2em] italic shadow-[0_0_30px_rgba(34,211,238,0.3)] hover:shadow-[0_0_35px_rgba(34,211,238,0.5)] active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  SELECT TRACK <ChevronRight className="h-4.5 w-4.5 stroke-[2.5]" />
                </button>
                
                <button
                  id="launch-settings-btn"
                  onClick={() => setCurrentScreen('settings')}
                  className="px-8 py-4 bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white font-black text-xs rounded border border-white/10 uppercase tracking-widest hover:border-white/20 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <SettingsIcon className="h-4 w-4 text-cyan-400" /> CALIBRATE OFFSET
                </button>
              </div>
            </div>

            {/* RIGHT GRAPHICAL HERO PLATE */}
            <div className="relative flex items-center justify-center w-full max-w-sm lg:max-w-md">
              <div className="relative p-10 bg-[#08080b]/90 rounded-3xl border border-white/5 shadow-2xl flex items-center justify-center w-full aspect-square max-w-[340px]">
                {/* CYBER SONIC PORTAL SPIN */}
                <div className="absolute inset-4 rounded-full border border-dashed border-cyan-400/20 animate-spin" style={{ animationDuration: '40s' }} />
                <div className="absolute inset-8 rounded-full border border-dashed border-indigo-500/20 animate-spin" style={{ animationDuration: '24s', animationDirection: 'reverse' }} />
                <div className="absolute inset-1 w-full h-full bg-cyan-500/5 blur-[50px] rounded-full" />
                
                {/* FLOATING ABSTRACT LANE INDICATORS */}
                <div className="absolute top-10 left-5 h-20 w-1 bg-gradient-to-b from-cyan-400 to-transparent opacity-60 rounded-full" />
                <div className="absolute bottom-10 right-5 h-20 w-1 bg-gradient-to-t from-indigo-500 to-transparent opacity-60 rounded-full" />
                
                <div className="p-10 bg-[#0c0c12]/95 rounded-full border border-white/10 shadow-[inner_0_0_30px_rgba(255,255,255,0.02)] relative flex items-center justify-center w-[180px] h-[180px] group hover:border-cyan-400/30 transition-all duration-500">
                  <Disc className="h-28 w-28 text-slate-800 animate-spin group-hover:text-slate-700 transition" style={{ animationDuration: '8s' }} />
                  <span className="absolute h-12 w-12 bg-black rounded-full border border-white/10 flex items-center justify-center shadow-2xl">
                    <Music className="h-5 w-5 text-cyan-400" />
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* COMPACT DASHBOARD SWITCHES */}
        {currentScreen === 'menu' && (
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
            onBack={() => {
              setSelectedBeatmap(null);
              setCurrentScreen('select');
            }}
          />
        )}

        {currentScreen === 'results' && scoreState && selectedBeatmap && (
          <ResultsScreen
            scoreState={scoreState}
            beatmap={selectedBeatmap}
            onRetry={handleRetrySong}
            onBack={() => {
              setSelectedBeatmap(null);
              setCurrentScreen('select');
            }}
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
        <footer id="main-footer" className="border-t border-white/5 bg-[#030305] py-8 text-[10px] text-slate-500 mt-auto relative z-10 font-mono">
          <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <span className="tracking-widest">// RHYTHM PERFORMANCE ENGINE • SYNC_OK v0.3.4</span>
            <span className="flex items-center gap-1 opacity-75">
              Designed with precision mechanics • {new Date().getFullYear()} RHYTHMMANIA
            </span>
          </div>
        </footer>
      )}
    </div>
  );
}
