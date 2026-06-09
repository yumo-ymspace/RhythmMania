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

import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Keyboard, Sliders, Volume2, RefreshCw, Gauge, Zap, Palette, UploadCloud, Check, FileText } from 'lucide-react';
import { GameSettings, KeyBindings } from '../types';

interface SettingsScreenProps {
  settings: GameSettings;
  updateSettings: (s: Partial<GameSettings>) => void;
  onBack: () => void;
}

export default function SettingsScreen({
  settings,
  updateSettings,
  onBack
}: SettingsScreenProps) {
  const [activeRebind, setActiveRebind] = useState<{ keyCount: number; colIndex: number } | null>(null);
  
  const [calibrating, setCalibrating] = useState<boolean>(false);
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [metronomeBpm] = useState<number>(120);
  const [beatProgress, setBeatProgress] = useState<number>(0);
  const [caliOffsetResult, setCaliOffsetResult] = useState<number | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<any>(null);

  const [dragOver, setDragOver] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processSkinIniAndColors = (txt: string, filename: string) => {
    const lines = txt.split(/\r?\n/);
    const colorsFound: string[] = [];
    
    for (const line of lines) {
      const cleanLine = line.trim();
      if (cleanLine.startsWith('//') || cleanLine.startsWith(';')) continue;
      
      const match = cleanLine.match(/^(Colour|Color|KeyColour|KeyColor|NoteImageColor)([0-9]+)\s*:\s*([0-9\s,]+)/i);
      if (match) {
        const idx = parseInt(match[2]);
        const rgbParts = match[3].split(',').map(s => parseInt(s.trim()));
        if (rgbParts.length >= 3 && rgbParts.every(n => !isNaN(n))) {
          const r = Math.min(255, Math.max(0, rgbParts[0]));
          const g = Math.min(255, Math.max(0, rgbParts[1]));
          const b = Math.min(255, Math.max(0, rgbParts[2]));
          const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
          colorsFound[idx - 1] = hex; 
        }
      }
    }

    const finalColors = colorsFound.filter(c => !!c);
    const baseColors = [...(settings.customSkinColors || ['#00e5ff', '#ffeb3b', '#f50057', '#00e676', '#ec4899'])];
    
    if (finalColors.length > 0) {
      for (let i = 0; i < 5; i++) {
        if (finalColors[i]) {
          baseColors[i] = finalColors[i];
        }
      }
      if (finalColors.length >= 1 && !finalColors[4]) {
        baseColors[4] = finalColors[0];
      }
    }

    updateSettings({
      skinId: 'custom',
      customSkinColors: baseColors,
      customSkinName: filename.replace(/\.[^/.]+$/, "")
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await loadSkinFile(file);
  };

  const loadSkinFile = async (file: File) => {
    if (file.name.toLowerCase().endsWith('.ini')) {
      const txt = await file.text();
      processSkinIniAndColors(txt, file.name);
    } else if (file.name.toLowerCase().endsWith('.osk') || file.name.toLowerCase().endsWith('.zip')) {
      try {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(file);
        const skinIniFile = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('skin.ini'));
        if (!skinIniFile) {
          alert('Could not find any "skin.ini" file inside the zip/osk skin file container.');
          return;
        }
        const txt = await skinIniFile.async('text');
        processSkinIniAndColors(txt, file.name);
      } catch (err) {
        console.error('Failed unpacking zip/osk:', err);
        alert('Unsupported ZIP archive schema, or file is corrupted.');
      }
    } else {
      alert('Unsupported file type. Please upload a standard "skin.ini" or a compiled ".osk"/".zip" package.');
    }
  };

  useEffect(() => {
    if (!activeRebind) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      const pressedKey = e.key.toLowerCase();
      
      if (pressedKey === 'escape' || pressedKey === 'tab') {
        setActiveRebind(null);
        return;
      }

      const bindingsCopy = JSON.parse(JSON.stringify(settings.bindings)) as KeyBindings;
      const keyLimit = activeRebind.keyCount;
      const targetCol = activeRebind.colIndex;

      if (bindingsCopy[keyLimit]) {
        bindingsCopy[keyLimit][targetCol] = pressedKey;
        updateSettings({ bindings: bindingsCopy });
      }

      setActiveRebind(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeRebind, settings.bindings]);

  // Calibration metronome sound tickers
  useEffect(() => {
    if (!calibrating) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setBeatProgress(0);
      return;
    }

    const beatDurationMs = 60000 / metronomeBpm;
    let start = Date.now();

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const progress = (elapsed % beatDurationMs) / beatDurationMs;
      setBeatProgress(progress);
      
      if (progress < 0.05) {
        triggerWebBeep(1200, 0.02);
      }
    }, 16);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [calibrating]);

  // Spacebar physical interceptor for metronome tap testing
  useEffect(() => {
    if (!calibrating) return;

    const handleSpacePress = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        registerTapEvent();
      }
    };

    window.addEventListener('keydown', handleSpacePress);
    return () => window.removeEventListener('keydown', handleSpacePress);
  }, [calibrating, tapTimes]);

  const triggerWebBeep = (freq: number, duration: number) => {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtxClass();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch(e) {}
  };

  const registerTapEvent = () => {
    triggerWebBeep(700, 0.04);

    const beatDurationMs = 60000 / metronomeBpm;
    const elapsed = Date.now() % beatDurationMs;
    
    let diff = elapsed;
    if (diff > beatDurationMs / 2) {
      diff = diff - beatDurationMs; 
    }

    const updated = [...tapTimes, diff].slice(-10);
    setTapTimes(updated);

    if (updated.length >= 8) {
      const sum = updated.reduce((a, b) => a + b, 0);
      const mean = Math.round(sum / updated.length);
      setCaliOffsetResult(mean);
    }
  };

  const applyOffsetCalibration = () => {
    if (caliOffsetResult !== null) {
      updateSettings({ audioOffset: caliOffsetResult });
      setCalibrating(false);
      setTapTimes([]);
      setCaliOffsetResult(null);
    }
  };

  const resetAllSettings = () => {
    const verified = window.confirm('Restore default keybindings, volumes, and visual modes?');
    if (verified) {
      updateSettings({
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
      });
    }
  };

  return (
    <div id="settings-screen-container" className="flex flex-col gap-6 w-full max-w-6xl mx-auto h-full p-2 lg:p-4 text-slate-100 pb-12">
      
      {/* HEADER CONTROLS BANNER */}
      <div className="flex justify-between items-center bg-[#08080C]/90 border border-white/5 p-4 rounded-2xl shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-3.5">
          <span className="p-3 bg-skin-accent-dim rounded-xl border border-skin-accent-dim text-skin-accent shadow-skin-accent-glow">
            <Sliders className="h-5 w-5" />
          </span>
          <div>
            <span className="text-[9px] text-slate-500 font-mono tracking-widest uppercase">LATENCY CONTROLS DECK</span>
            <h2 className="text-base font-black font-sans leading-none mt-1 uppercase italic tracking-wider text-white">System Settings</h2>
          </div>
        </div>

        <button
          id="settings-back-btn"
          onClick={onBack}
          className="flex items-center gap-1.5 px-5 py-2.5 bg-skin-accent hover:brightness-110 text-slate-950 font-sans text-xs font-black uppercase tracking-wider rounded-xl italic shadow-skin-accent-neon active:scale-95 transition-all cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4 stroke-[3]" /> Return Selector
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT PANEL: DECIBELS / DIM PANEL PREFERENCES */}
        <div className="lg:col-span-6 flex flex-col gap-6">

          {/* OSU!MANIA GAME SKINS SELECTION */}
          <div className="bg-[#08080C]/90 border border-white/5 p-5 rounded-2xl shadow-xl flex flex-col gap-5 backdrop-blur-md">
            <h3 className="text-[10px] text-slate-500 font-black tracking-widest uppercase flex items-center gap-1.5 border-b border-white/5 pb-3">
              <Palette className="h-4 w-4 text-skin-accent" /> Game Skin Customization
            </h3>

            <p className="text-slate-400 text-xs leading-normal -mt-2">
              Select your customized playfield skin. Different styles modify visual note shapes, target receptor visual states, and track lanes. Visit <a href="https://osuskins.net" target="_blank" rel="noopener noreferrer" className="text-skin-accent font-extrabold hover:underline">osuskins.net</a> for style references.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              {[
                { id: 'neon', name: 'Neon Cyber (Default)', desc: 'Neon flows and styled blue keycaps.', color: '#00b0ff', colorsBox: ['#00b0ff', '#eceff1'] },
                { id: 'classic-bar', name: 'DDR Retro Bar', desc: 'Rigid high-contrast DDR-style flat notes.', color: '#ef4444', colorsBox: ['#ef4444', '#facc15'] },
                { id: 'circles', name: 'osu!mania Circles', desc: 'Beautiful round keys & round pill notes.', color: '#3b82f6', colorsBox: ['#3b82f6', '#ec4899'] },
                { id: 'cyberpunk', name: 'Vaporwave Neon', desc: 'Fluorescent magenta, yellow, and deep purple.', color: '#ec4899', colorsBox: ['#ec4899', '#facc15'] },
                { id: 'emerald', name: 'Acid Emerald', desc: 'Acid toxic green tracks and emerald glows.', color: '#10b981', colorsBox: ['#10b981', '#34d399'] },
                { id: 'minimalist', name: 'Monochrome Plain', desc: 'Plain flat grays & high-speed reading lanes.', color: '#ffffff', colorsBox: ['#ffffff', '#64748b'] },
                { id: 'custom', name: 'Custom Skin Designer', desc: 'Custom colors from uploaded skin.ini or pickers.', color: '#06b6d4', colorsBox: (settings.customSkinColors || ['#00e5ff', '#ffeb3b', '#f50057', '#00e676', '#ec4899']).slice(0, 3) },
              ].map((sk) => {
                const activeSkin = settings.skinId === sk.id || (!settings.skinId && sk.id === 'neon');
                return (
                  <button
                    key={sk.id}
                    id={`skin-select-${sk.id}`}
                    onClick={() => updateSettings({ skinId: sk.id })}
                    className={`flex flex-col gap-2 p-3 text-left bg-black/45 hover:bg-[#11111a]/85 border rounded-xl transition cursor-pointer relative group ${
                      activeSkin 
                        ? 'border-skin-accent shadow-skin-accent-glow' 
                        : 'border-white/5 hover:border-skin-accent-dim'
                    }`}
                  >
                    {/* Active Check Dot */}
                    {activeSkin && (
                      <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-skin-accent animate-pulse shadow-skin-accent-glow" />
                    )}

                    <div className="flex items-center gap-1.5">
                      {/* Note Shape Preview Badge */}
                      <div className="flex gap-0.5 items-center">
                        {sk.colorsBox.map((c, ci) => (
                          <span key={ci} className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c }} />
                        ))}
                      </div>
                      <span className="text-[11px] font-black tracking-tight text-white">{sk.name}</span>
                    </div>

                    <span className="text-[10px] text-slate-400 leading-normal line-clamp-2">
                      {sk.desc}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Custom designer panel renders if the skinId is custom */}
            {settings.skinId === 'custom' && (
              <div id="custom-skin-panel" className="flex flex-col gap-4 p-4 border border-skin-accent-dim bg-skin-accent-dim rounded-xl mt-3 animate-fade-in shadow-skin-accent-glow">
                {/* Drag and Drop Zone */}
                <div
                  id="skin-upload-dropzone"
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={async (e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) await loadSkinFile(file);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-5 text-center flex flex-col items-center justify-center gap-2.5 cursor-pointer transition-colors ${
                    dragOver 
                      ? 'border-skin-accent bg-skin-accent-dim text-skin-accent shadow-skin-accent-glow' 
                      : 'border-white/10 hover:border-skin-accent-dim hover:bg-white/[0.02] text-slate-300'
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".ini,.osk,.zip"
                    className="hidden"
                  />
                  <span className="p-2 bg-skin-accent-dim rounded-full border border-skin-accent-dim text-skin-accent shadow-skin-accent-glow">
                    <UploadCloud className="h-5 w-5" />
                  </span>
                  <div>
                    <span className="text-xs font-black tracking-tight text-white block">
                      {settings.customSkinName 
                        ? `Loaded: ${settings.customSkinName}` 
                        : 'Upload skin.ini or osu! .osk/.zip skin package'}
                    </span>
                    <span className="text-[10px] text-slate-500 leading-normal mt-1 block">
                      Drag & drop your skin files, or click here to browse.
                    </span>
                  </div>
                </div>

                {/* Manual Palette Controls */}
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center bg-black/25 px-2.5 py-1.5 rounded-lg border border-white/5">
                    <span className="text-[9px] text-slate-400 font-extrabold tracking-widest uppercase font-mono">Manual Palette Designer</span>
                    <button
                      type="button"
                      onClick={() => {
                        updateSettings({
                          customSkinColors: ['#00e5ff', '#ffeb3b', '#f50057', '#00e676', '#ec4899'],
                          customSkinName: undefined
                        });
                      }}
                      className="text-[9px] font-black uppercase text-slate-400 hover:text-cyan-400 flex items-center gap-1 transition cursor-pointer"
                    >
                      <RefreshCw className="h-2.5 w-2.5" /> Reset Palette
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {[
                      { index: 0, label: 'Side Keys', desc: 'Outer lanes color' },
                      { index: 1, label: 'Main Keys', desc: 'Standard lanes color' },
                      { index: 2, label: 'Center Key', desc: 'Middle column color' },
                      { index: 3, label: 'Special Key', desc: '8K unique lane color' },
                      { index: 4, label: 'Hold Trail', desc: 'Hold note body color' },
                    ].map((pal) => {
                      const colors = settings.customSkinColors || ['#00e5ff', '#ffeb3b', '#f50057', '#00e676', '#ec4899'];
                      const activeColor = colors[pal.index] || '#ffffff';
                      return (
                        <div key={pal.index} className="flex flex-col gap-1.5 p-2 bg-black/35 border border-white/5 rounded-xl items-center text-center">
                          <span className="text-[10px] font-bold text-slate-300 leading-none">{pal.label}</span>
                          <input
                            type="color"
                            value={activeColor}
                            onChange={(e) => {
                              const updatedColors = [...colors];
                              updatedColors[pal.index] = e.target.value;
                              updateSettings({ customSkinColors: updatedColors });
                            }}
                            className="w-8 h-8 rounded-full border border-white/10 hover:border-cyan-400 bg-transparent shrink-0 cursor-pointer overflow-hidden p-0"
                          />
                          <span className="text-[8px] text-slate-500 font-mono uppercase">{activeColor}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>


          
          {/* DECIBEL SLIDERS */}
          <div className="bg-[#08080C]/90 border border-white/5 p-5 rounded-2xl shadow-xl flex flex-col gap-5 backdrop-blur-md">
            <h3 className="text-[10px] text-slate-500 font-black tracking-widest uppercase flex items-center gap-1.5 border-b border-white/5 pb-3">
              <Volume2 className="h-4 w-4 text-skin-accent" /> Decibel Modifiers
            </h3>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-xs font-bold font-sans">
                  <span className="text-slate-300 uppercase tracking-tight">Main Music Volume</span>
                  <span className="font-mono text-skin-accent shrink-0">{Math.round(settings.musicVolume * 100)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.05"
                  value={settings.musicVolume}
                  onChange={(e) => updateSettings({ musicVolume: parseFloat(e.target.value) })}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                  style={{ accentColor: 'var(--skin-accent)' }}
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-xs font-bold font-sans">
                  <span className="text-slate-300 uppercase tracking-tight">System Hitsounds feedback</span>
                  <span className="font-mono text-skin-accent shrink-0">{Math.round(settings.hitsoundVolume * 100)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.05"
                  value={settings.hitsoundVolume}
                  onChange={(e) => updateSettings({ hitsoundVolume: parseFloat(e.target.value) })}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                  style={{ accentColor: 'var(--skin-accent)' }}
                />
              </div>
            </div>
          </div>

          {/* SCROLLING MECHANICS */}
          <div className="bg-[#08080C]/90 border border-white/5 p-5 rounded-2xl shadow-xl flex flex-col gap-4 backdrop-blur-md">
            <h3 className="text-[10px] text-slate-500 font-black tracking-widest uppercase flex items-center gap-1.5 border-b border-white/5 pb-3">
              <Zap className="h-4 w-4 text-skin-accent" /> Lane & Performance Mechanics
            </h3>

            <div className="flex items-center justify-between py-1 text-xs font-sans">
              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-slate-200">Upsurface scroll mapping</span>
                <span className="text-slate-500 text-[10px]">Lanes move upwards instead of standard default descent</span>
              </div>
              
              <button
                id="upsurface-toggle"
                onClick={() => updateSettings({ upsurfaceNoteMode: !settings.upsurfaceNoteMode })}
                className={`px-3 py-1.5 font-mono font-bold text-[10px] rounded-lg border transition ${
                  settings.upsurfaceNoteMode 
                    ? 'bg-skin-accent-dim text-skin-accent border-skin-accent-dim shadow-skin-accent-glow' 
                    : 'bg-white/5 text-slate-400 border-white/5 hover:bg-white/10'
                }`}
              >
                {settings.upsurfaceNoteMode ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="flex items-center justify-between py-1.5 text-xs font-sans border-t border-white/5 pt-3">
              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-slate-200">Disable Background Video</span>
                <span className="text-slate-500 text-[10px]">Completely disable background rendering of videos to save render cycles</span>
              </div>
              
              <button
                id="disable-video-toggle"
                onClick={() => updateSettings({ disableVideo: !settings.disableVideo })}
                className={`px-3 py-1.5 font-mono font-bold text-[10px] rounded-lg border transition ${
                  settings.disableVideo 
                    ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                    : 'bg-white/5 text-slate-400 border-white/5 hover:bg-white/10'
                }`}
              >
                {settings.disableVideo ? 'DISABLED' : 'ENABLED'}
              </button>
            </div>

            <div className="flex items-center justify-between py-1.5 text-xs font-sans border-t border-white/5 pt-3">
              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-slate-200">Disable Decorative Particles</span>
                <span className="text-slate-550 text-[10px]">Turn off hit Sparks animations to reduce CPU/GPU workload</span>
              </div>
              
              <button
                id="disable-particles-toggle"
                onClick={() => updateSettings({ disableParticles: !settings.disableParticles })}
                className={`px-3 py-1.5 font-mono font-bold text-[10px] rounded-lg border transition ${
                  settings.disableParticles 
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                    : 'bg-white/5 text-slate-400 border-white/5 hover:bg-white/10'
                }`}
              >
                {settings.disableParticles ? 'DISABLED' : 'ENABLED'}
              </button>
            </div>

            <div className="flex items-center justify-between py-1.5 text-xs font-sans border-t border-white/5 pt-3">
              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-slate-200">Cap Screen Resolution</span>
                <span className="text-slate-500 text-[10px]">Cuts canvas pixel ratio to 1.0x to significantly optimize rendering density</span>
              </div>
              
              <button
                id="limit-dpr-toggle"
                onClick={() => updateSettings({ limitDprToOne: !settings.limitDprToOne })}
                className={`px-3 py-1.5 font-mono font-bold text-[10px] rounded-lg border transition ${
                  settings.limitDprToOne 
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                    : 'bg-white/5 text-slate-400 border-white/5 hover:bg-white/10'
                }`}
              >
                {settings.limitDprToOne ? 'ACTIVE (1.0x)' : 'AUTO (HIGH-DPI)'}
              </button>
            </div>

            <div className="flex flex-col gap-2 mt-2 border-t border-white/5 pt-3">
              <div className="flex justify-between text-xs font-bold font-sans">
                <div className="flex flex-col gap-0.5">
                  <span className="text-slate-200">Video Canvas Opacity</span>
                  <span className="text-slate-500 text-[10px] font-normal">Adjust dim settings of background video playback</span>
                </div>
                <span className="font-mono text-skin-accent">{Math.round((settings.videoOpacity !== undefined ? settings.videoOpacity : 0.35) * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.05"
                value={settings.videoOpacity !== undefined ? settings.videoOpacity : 0.35}
                onChange={(e) => updateSettings({ videoOpacity: parseFloat(e.target.value) })}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: 'var(--skin-accent)' }}
              />
            </div>

            <div className="flex flex-col gap-2 mt-2 border-t border-white/5 pt-3">
              <div className="flex justify-between text-xs font-bold font-sans">
                <div className="flex flex-col gap-0.5">
                  <span className="text-slate-200">Playfield Shield Cover opacity</span>
                  <span className="text-slate-500 text-[10px] font-normal">Solid opaque background panel layout behind visual note streams</span>
                </div>
                <span className="font-mono text-skin-accent">{Math.round((settings.backgroundDim !== undefined ? settings.backgroundDim : 0.60) * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.05"
                value={settings.backgroundDim !== undefined ? settings.backgroundDim : 0.60}
                onChange={(e) => updateSettings({ backgroundDim: parseFloat(e.target.value) })}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                style={{ accentColor: 'var(--skin-accent)' }}
              />
            </div>
          </div>

          {/* LATENCY MATRIX */}
          <div className="bg-[#08080C]/90 border border-white/5 p-5 rounded-2xl shadow-xl flex flex-col gap-4 backdrop-blur-md">
            <h3 className="text-[10px] text-slate-500 font-black tracking-widest uppercase flex items-center gap-1.5 border-b border-white/5 pb-3">
              <Gauge className="h-4 w-4 text-skin-accent" /> Latency Timing Sync
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-1">
              <div className="bg-black/45 p-4 rounded-xl border border-white/5 flex flex-col gap-2">
                <span className="text-[9px] text-skin-accent font-black uppercase tracking-wider font-mono">Audio Phase Shift</span>
                <p className="text-[10px] text-slate-500 leading-snug">
                  Compensates for delayed audio outputs (e.g. bluetooth outputs).
                </p>
                <div className="flex items-center gap-2 mt-auto pt-2 justify-between">
                  <input 
                    type="number"
                    value={settings.audioOffset}
                    onChange={(e) => updateSettings({ audioOffset: parseInt(e.target.value) || 0 })}
                    className="w-16 bg-black border border-white/5 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold text-skin-accent focus:outline-none"
                  />
                  <div className="flex gap-1">
                    <button 
                      onClick={() => updateSettings({ audioOffset: settings.audioOffset - 5 })}
                      className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/5 font-mono text-[9px] rounded-lg font-bold transition cursor-pointer"
                    >
                      -5ms
                    </button>
                    <button 
                      onClick={() => updateSettings({ audioOffset: settings.audioOffset + 5 })}
                      className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/5 font-mono text-[9px] rounded-lg font-bold transition cursor-pointer"
                    >
                      +5ms
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-black/45 p-4 rounded-xl border border-white/5 flex flex-col gap-2">
                <span className="text-[9px] text-indigo-400 font-black uppercase tracking-wider font-mono">Visual Rendering Delay</span>
                <p className="text-[10px] text-slate-550 leading-snug font-sans">
                  Aligns visual hit frames with the physical song triggers.
                </p>
                <div className="flex items-center gap-2 mt-auto pt-2 justify-between">
                  <input 
                    type="number"
                    value={settings.visualOffset || 0}
                    onChange={(e) => updateSettings({ visualOffset: parseInt(e.target.value) || 0 })}
                    className="w-16 bg-black border border-white/5 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold text-skin-accent focus:outline-none"
                  />
                  <div className="flex gap-1">
                    <button 
                      onClick={() => updateSettings({ visualOffset: (settings.visualOffset || 0) - 5 })}
                      className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/5 font-mono text-[9px] rounded-lg font-bold transition cursor-pointer"
                    >
                      -5ms
                    </button>
                    <button 
                      onClick={() => updateSettings({ visualOffset: (settings.visualOffset || 0) + 5 })}
                      className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/5 font-mono text-[9px] rounded-lg font-bold transition cursor-pointer"
                    >
                      +5ms
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-black/45 p-4 rounded-xl border border-white/5 flex flex-col gap-2 col-span-1 sm:col-span-2">
                <span className="text-[9px] text-fuchsia-400 font-black uppercase tracking-wider font-mono">Video Render Timing offset</span>
                <p className="text-[10px] text-slate-500 leading-snug font-sans">
                  Sync drift modifier for background video streams. Shifts later if positive, earlier if negative.
                </p>
                <div className="flex items-center gap-2.5 mt-auto pt-2 justify-between">
                  <input 
                    type="number"
                    value={settings.videoOffset || 0}
                    onChange={(e) => updateSettings({ videoOffset: parseInt(e.target.value) || 0 })}
                    className="w-16 bg-black border border-white/5 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold text-skin-accent focus:outline-none"
                  />
                  <div className="flex gap-1 flex-1 justify-end">
                    <button 
                      onClick={() => updateSettings({ videoOffset: (settings.videoOffset || 0) - 10 })}
                      className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/5 font-mono text-[9px] rounded-lg font-bold transition cursor-pointer"
                    >
                      -10ms
                    </button>
                    <button 
                      onClick={() => updateSettings({ videoOffset: (settings.videoOffset || 0) + 10 })}
                      className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/5 font-mono text-[9px] rounded-lg font-bold transition cursor-pointer"
                    >
                      +10ms
                    </button>
                    <button 
                      onClick={() => updateSettings({ videoOffset: 0 })}
                      className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/5 font-mono text-[9px] rounded-lg font-bold transition cursor-pointer text-slate-400"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* METRONOME TIMING TOOL */}
            <div className="border border-white/5 rounded-2xl p-4 flex flex-col gap-3.5 bg-black/40 mt-1">
              <div className="flex justify-between items-center">
                <span className="text-xs font-extrabold uppercase text-slate-200 tracking-wider">Dynamic Metronome Timing</span>
                <button
                  id="metronome-calibrate-btn"
                  onClick={() => {
                    setCalibrating(!calibrating);
                    setTapTimes([]);
                    setCaliOffsetResult(null);
                  }}
                  className={`px-3 py-1.5 font-mono font-bold text-[10px] uppercase tracking-wider rounded-lg transition ${
                    calibrating ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5'
                  }`}
                >
                  {calibrating ? 'STOP TEST' : 'START TEST'}
                </button>
              </div>

              {calibrating && (
                <div className="flex flex-col gap-3.5 shrink-0">
                  <p className="text-[11px] text-slate-400 leading-normal">
                    Press <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded font-mono text-[10px] text-slate-300">Spacebar</kbd> or click the trigger card below matching the visual ticks to calculate hardware sound latencies.
                  </p>

                  <div className="flex items-center justify-center py-5 bg-black/60 rounded-xl border border-white/5 relative">
                    <div 
                      className={`h-12 w-12 rounded-full border-2 transition-all duration-75 flex items-center justify-center ${
                        beatProgress < 0.12 ? 'border-skin-accent bg-skin-accent-dim scale-105 shadow-skin-accent-glow' : 'border-white/5 bg-white/5'
                      }`}
                    >
                      <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider">TICK</span>
                    </div>
                  </div>

                  <button
                    id="calibrate-tap-pad"
                    onClick={registerTapEvent}
                    className="py-3 bg-skin-accent text-slate-950 font-extrabold uppercase tracking-widest text-xs rounded-xl shadow-skin-accent-neon hover:brightness-105 active:scale-[0.99] transition cursor-pointer"
                  >
                    PRESS SPACE OR TAP PAD
                  </button>

                  <div className="flex items-center justify-between text-[10px] font-mono mt-0.5">
                    <span className="text-slate-500">Taps Linked: {tapTimes.length}/8</span>
                    {caliOffsetResult !== null && (
                      <div className="flex items-center gap-2">
                        <span className="text-amber-400 font-bold uppercase">Computed: {caliOffsetResult}ms</span>
                        <button
                          onClick={applyOffsetCalibration}
                          className="px-2.5 py-1 bg-skin-accent text-slate-950 font-sans font-black uppercase rounded-lg text-[9px] shadow-skin-accent-glow"
                        >
                          APPLY OFFSET
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: KEYBOARD MAPPING COLUMNS */}
        <div className="lg:col-span-6 bg-[#08080C]/90 border border-white/5 p-6 rounded-2xl shadow-xl flex flex-col gap-5 backdrop-blur-md">
          <h3 className="text-[10px] text-slate-500 font-black tracking-widest uppercase flex items-center gap-1.5 border-b border-white/5 pb-3">
            <Keyboard className="h-5 w-5 text-skin-accent" /> Lane Rebinding Matrix
          </h3>

          <p className="text-slate-400 text-xs leading-relaxed font-sans">
            Click on any keyboard slot block, then type any letter on your hardware keyboard to bind that key to the respective column.
          </p>

          <div className="flex flex-col gap-4 max-h-[380px] overflow-y-auto pr-1">
            {[2, 3, 4, 5, 6, 7, 8].map((num) => {
              const columns = settings.bindings[num] || [];
              return (
                <div key={num} className="flex flex-col gap-2 bg-black/40 p-4 rounded-xl border border-white/5">
                  <span className="text-[9px] text-slate-500 font-extrabold tracking-widest uppercase font-mono">{num} KEYS - LANE REBINDS</span>
                  
                  <div className="flex gap-2 flex-wrap mt-1">
                    {columns.map((colKey, idx) => {
                      const isRebindingNow = activeRebind?.keyCount === num && activeRebind?.colIndex === idx;
                      return (
                        <button
                          key={idx}
                          onClick={() => setActiveRebind({ keyCount: num, colIndex: idx })}
                          className={`flex-1 py-3 font-mono text-xs font-black rounded-xl transition border flex flex-col items-center justify-center cursor-pointer ${
                            isRebindingNow 
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/35 animate-pulse shadow-[0_0_15px_rgba(244,63,94,0.1)]' 
                              : 'bg-black/30 border-white/[0.03] hover:bg-black/85 text-white hover:border-skin-accent-dim'
                          }`}
                        >
                          <span className={`${isRebindingNow ? 'text-rose-400' : 'text-slate-500'} text-[8px] uppercase font-sans tracking-tight`}>Col {idx + 1}</span>
                          <span className="text-xs uppercase mt-0.5">{isRebindingNow ? '???' : colKey === ' ' ? 'SPACE' : colKey}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-auto pt-4 border-t border-white/5">
            <button
              onClick={resetAllSettings}
              className="w-full py-3 bg-white/5 hover:bg-rose-500/5 border border-white/5 hover:border-rose-500/15 text-slate-400 hover:text-rose-450 font-sans text-[11px] font-extrabold uppercase tracking-widest rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Restore Defaults
            </button>
          </div>
        </div>
      </div>

      {/* ADVANCED PLAYFIELD SKINS STYLE GRAPHICS */}
      <div className="bg-[#08080C]/90 border border-white/5 p-5 rounded-2xl shadow-xl flex flex-col gap-5 backdrop-blur-md w-full">
        <h3 className="text-[10px] text-slate-500 font-black tracking-widest uppercase flex items-center gap-1.5 border-b border-white/5 pb-3">
          <Sliders className="h-4 w-4 text-skin-accent" /> Aesthetic Style Tweaks
        </h3>

        <p className="text-slate-400 text-xs leading-normal -mt-2">
          Transform target receptors and falling notes. Customize corner rounding, transparency, and structure to build your ultimate gaming surface.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls Column 1 & 2 */}
          <div className="lg:col-span-2 flex flex-col gap-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Note style & shape */}
              <div className="flex flex-col gap-3 p-4 bg-black/35 border border-white/5 rounded-xl">
                <span className="text-[10px] text-indigo-400 font-extrabold tracking-wider uppercase font-mono">Falling Note Style</span>
                
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] text-slate-400 font-medium font-sans">Corner Rounding / Shape Preset</span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'rounded', name: 'Rounded Rect' },
                      { id: 'square', name: 'Sharp Square' },
                      { id: 'circle', name: 'Classic Circle' },
                      { id: 'pill', name: 'Elastic Pill' },
                    ].map((ns) => (
                      <button
                        key={ns.id}
                        type="button"
                        onClick={() => updateSettings({ noteStyle: ns.id as any })}
                        className={`py-1.5 px-2 bg-black/45 hover:bg-[#11111a]/85 border text-[10px] uppercase font-black tracking-wide rounded-lg cursor-pointer transition ${
                          (settings.noteStyle || 'rounded') === ns.id 
                            ? 'border-skin-accent text-white shadow-skin-accent-glow' 
                            : 'border-white/5 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {ns.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 mt-2">
                  <div className="flex justify-between text-[10px] font-bold font-sans">
                    <span className="text-slate-350">Note Translucency</span>
                    <span className="font-mono text-skin-accent">{Math.round((settings.noteOpacity ?? 1) * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.1" 
                    max="1" 
                    step="0.05"
                    value={settings.noteOpacity ?? 1}
                    onChange={(e) => updateSettings({ noteOpacity: parseFloat(e.target.value) })}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                    style={{ accentColor: 'var(--skin-accent)' }}
                  />
                </div>
              </div>

              {/* Receptor style & shape */}
              <div className="flex flex-col gap-3 p-4 bg-black/35 border border-white/5 rounded-xl">
                <span className="text-[10px] text-indigo-400 font-extrabold tracking-wider uppercase font-mono">Target Receptor Key Style</span>
                
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] text-slate-400 font-medium font-sans">Receptor Appearance Structure</span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'tactile', name: 'Tactile Glass' },
                      { id: 'square', name: 'Sharp Square' },
                      { id: 'minimal', name: 'Piano Segment' },
                      { id: 'translucent', name: 'Transparent Glow' },
                    ].map((rc) => (
                      <button
                        key={rc.id}
                        type="button"
                        onClick={() => updateSettings({ receptorStyle: rc.id as any })}
                        className={`py-1.5 px-2 bg-black/45 hover:bg-[#11111a]/85 border text-[10px] uppercase font-black tracking-wide rounded-lg cursor-pointer transition ${
                          (settings.receptorStyle || 'tactile') === rc.id 
                            ? 'border-skin-accent text-white shadow-skin-accent-glow' 
                            : 'border-white/5 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {rc.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 mt-2">
                  <div className="flex justify-between text-[10px] font-bold font-sans">
                    <span className="text-slate-350">Key Receptor Translucency</span>
                    <span className="font-mono text-skin-accent">{Math.round((settings.receptorOpacity ?? 1) * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.1" 
                    max="1" 
                    step="0.05"
                    value={settings.receptorOpacity ?? 1}
                    onChange={(e) => updateSettings({ receptorOpacity: parseFloat(e.target.value) })}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                    style={{ accentColor: 'var(--skin-accent)' }}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Performance Indicators (Judgement Popups) Transparency & Scaling */}
              <div className="flex flex-col gap-3 p-4 bg-black/35 border border-white/5 rounded-xl">
                <span className="text-[10px] text-indigo-400 font-extrabold tracking-wider uppercase font-mono">Performance Indicators</span>
                
                <div className="flex flex-col gap-1.5 mt-1">
                  <div className="flex justify-between text-[10px] font-bold font-sans">
                    <span className="text-slate-350">Indicator Transparency</span>
                    <span className="font-mono text-skin-accent">{Math.round((settings.judgementOpacity ?? 1) * 100)}%</span>
                  </div>
                  <p className="text-[9px] text-slate-500 leading-tight">Controls visibility of "PERFECT", "MARVELOUS" & combos blocking the center.</p>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.05"
                    value={settings.judgementOpacity ?? 1}
                    onChange={(e) => updateSettings({ judgementOpacity: parseFloat(e.target.value) })}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer mt-0.5"
                    style={{ accentColor: 'var(--skin-accent)' }}
                  />
                </div>

                <div className="flex flex-col gap-1.5 mt-2">
                  <div className="flex justify-between text-[10px] font-bold font-sans">
                    <span className="text-slate-350">Indicator Size / Scale</span>
                    <span className="font-mono text-skin-accent">{Math.round((settings.judgementSize ?? 1) * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.5" 
                    max="1.5" 
                    step="0.05"
                    value={settings.judgementSize ?? 1}
                    onChange={(e) => updateSettings({ judgementSize: parseFloat(e.target.value) })}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                    style={{ accentColor: 'var(--skin-accent)' }}
                  />
                </div>
              </div>

              {/* Lane Decoration Options */}
              <div className="flex flex-col gap-3 p-4 bg-black/35 border border-white/5 rounded-xl">
                <span className="text-[10px] text-indigo-400 font-extrabold tracking-wider uppercase font-mono">Playfield Deck Structure</span>
                
                <div className="flex flex-col gap-1.5 mt-1">
                  <div className="flex justify-between text-[10px] font-bold font-sans">
                    <span className="text-slate-350">Lane Separator Transparency</span>
                    <span className="font-mono text-skin-accent">{Math.round((settings.laneSeparatorOpacity ?? 0.30) * 100)}%</span>
                  </div>
                  <p className="text-[9px] text-slate-500 leading-tight">Sets clarity of lane boundary columns drawn background rails.</p>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.05"
                    value={settings.laneSeparatorOpacity ?? 0.30}
                    onChange={(e) => updateSettings({ laneSeparatorOpacity: parseFloat(e.target.value) })}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer mt-0.5"
                    style={{ accentColor: 'var(--skin-accent)' }}
                  />
                </div>

                <div className="flex flex-col gap-1.5 mt-2">
                  <div className="flex justify-between text-[10px] font-bold font-sans">
                    <span className="text-slate-350">Deck Background Dimming</span>
                    <span className="font-mono text-skin-accent">{Math.round((settings.backgroundDim ?? 0.60) * 100)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.05"
                    value={settings.backgroundDim ?? 0.60}
                    onChange={(e) => updateSettings({ backgroundDim: parseFloat(e.target.value) })}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                    style={{ accentColor: 'var(--skin-accent)' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* LIVE PLAYFIELD LANE STYLE PREVIEW */}
          <div className="flex flex-col gap-3 p-4 bg-gradient-to-b from-black/55 to-black/25 border border-white/5 rounded-xl justify-between h-auto min-h-[310px]">
            <div className="flex justify-between items-center pb-2 border-b border-white/5">
              <span className="text-[10px] text-indigo-400 font-extrabold tracking-wider uppercase font-mono">Live Style Preview</span>
              <span className="text-[9px] text-slate-500 animate-pulse bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded uppercase font-bold">Active</span>
            </div>

            <div className="relative flex-1 flex flex-col items-center justify-center py-4 bg-slate-950/80 rounded-lg overflow-hidden border border-white/5 h-[190px]">
              {/* 4-Lanes Playfield Track Container */}
              <div className="relative w-[180px] h-full border-l border-r border-slate-800 transition-all flex flex-col justify-between">
                {/* 3 Lane separator lines dividing the 4 lanes */}
                <div className="absolute inset-y-0 left-[25%] border-l border-dashed transition-colors duration-150" style={{ borderColor: `rgba(71,85,105,${settings.laneSeparatorOpacity ?? 0.30})` }} />
                <div className="absolute inset-y-0 left-[50%] border-l border-dashed transition-colors duration-150" style={{ borderColor: `rgba(71,85,105,${settings.laneSeparatorOpacity ?? 0.30})` }} />
                <div className="absolute inset-y-0 left-[75%] border-l border-dashed transition-colors duration-150" style={{ borderColor: `rgba(71,85,105,${settings.laneSeparatorOpacity ?? 0.30})` }} />

                {/* Stage Background Dim tint */}
                <div 
                  className="absolute inset-0 bg-black pointer-events-none transition-all duration-150" 
                  style={{ opacity: settings.backgroundDim ?? 0.60 }}
                />

                {/* Falling Note Render Preview in Lane 2 */}
                <div 
                  className="absolute top-4 transition-all duration-150 flex flex-col items-center select-none pointer-events-none"
                  style={{ left: '25%', width: '25%' }}
                >
                  <div 
                    className={`h-4.5 shadow-lg transition-all duration-150 w-[85%] ${
                      (settings.noteStyle || 'rounded') === 'rounded' ? 'rounded-md border border-white/30 bg-sky-400' :
                      (settings.noteStyle || 'rounded') === 'square' ? 'rounded-none border border-white/30 bg-sky-400' :
                      (settings.noteStyle || 'rounded') === 'circle' ? 'h-5 w-5 rounded-full border border-white/30 bg-sky-450' :
                      'rounded-full border border-white/30 bg-sky-400'
                    }`}
                    style={{ opacity: settings.noteOpacity ?? 1 }}
                  />
                </div>

                {/* Performance Indicator Judgement text Overlay (Centered across playfield) */}
                <div 
                  className="absolute top-[48px] left-0 right-0 z-20 flex flex-col items-center select-none pointer-events-none transition-all duration-150"
                  style={{ 
                    opacity: settings.judgementOpacity ?? 1.0,
                    transform: `scale(${(settings.judgementSize ?? 1.0) * 0.75})` 
                  }}
                >
                  <span className="text-cyan-400 font-extrabold tracking-widest text-[10px] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] [text-shadow:0_0_8px_rgba(34,211,238,0.6)]">PERFECT</span>
                  <span className="text-[12px] font-black tracking-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] -mt-1">142</span>
                </div>

                {/* Bottom Row of 4 Proportional Key Receptors */}
                <div className="absolute bottom-2 left-0 right-0 flex px-1 gap-1 z-10">
                  {[1, 2, 3, 4].map((col) => {
                    const isLaneActive = col === 3;
                    return (
                      <div 
                        key={col}
                        className={`h-6 flex items-center justify-center transition-all duration-150 flex-1 ${
                          (settings.receptorStyle || 'tactile') === 'tactile' ? 'border border-cyan-400/80 bg-slate-900/90 rounded-md shadow-md text-[8px]' :
                          (settings.receptorStyle || 'tactile') === 'square' ? 'p-0.5 border-2 border-indigo-500 bg-slate-950 rounded-none text-[8px]' :
                          (settings.receptorStyle || 'tactile') === 'minimal' ? 'h-2 bg-slate-100/30 border border-slate-100/50 rounded shadow-sm text-[6px]' :
                          'border border-white/40 bg-white/5 rounded-lg text-[8px]'
                        }`}
                        style={{ 
                          opacity: settings.receptorOpacity ?? 1,
                          boxShadow: (settings.receptorStyle || 'tactile') === 'translucent' ? '0 0 10px rgba(255,255,255,0.1)' : undefined
                        }}
                      >
                        {isLaneActive && (
                          <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="text-[9px] text-slate-400 leading-tight text-center px-1">
              Adjust sliders above to preview how roundings, indicators, and transparencies map to the real rhythm field.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
