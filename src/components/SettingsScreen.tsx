/**
 * @license
 * SPDX-License-Identifier: GPL-3.0-only
 */

import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Keyboard, Sliders, Volume2, HelpCircle, RefreshCw, Gauge, Zap } from 'lucide-react';
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
  // Mapping state: Keep track of which key/slot we are rebinding
  const [activeRebind, setActiveRebind] = useState<{ keyCount: number; colIndex: number } | null>(null);
  
  // Metronome tap calibration submode visualizers
  const [calibrating, setCalibrating] = useState<boolean>(false);
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [metronomeBpm] = useState<number>(120);
  const [beatProgress, setBeatProgress] = useState<number>(0);
  const [caliOffsetResult, setCaliOffsetResult] = useState<number | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextBeatTimeRef = useRef<number>(0);
  const intervalRef = useRef<any>(null);

  // Keyboard interceptor relative to rebindings
  useEffect(() => {
    if (!activeRebind) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      const pressedKey = e.key.toLowerCase();
      
      // Prohibit escape, tab
      if (pressedKey === 'escape' || pressedKey === 'tab') {
        setActiveRebind(null);
        return;
      }

      const bindingsCopy = JSON.parse(JSON.stringify(settings.bindings)) as KeyBindings;
      const keyLimit = activeRebind.keyCount;
      const targetCol = activeRebind.colIndex;

      if (bindingsCopy[keyLimit]) {
        // Enforce rebind override
        bindingsCopy[keyLimit][targetCol] = pressedKey;
        updateSettings({ bindings: bindingsCopy });
      }

      setActiveRebind(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeRebind, settings.bindings]);

  // Calibration metronome loops
  useEffect(() => {
    if (!calibrating) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setBeatProgress(0);
      return;
    }

    // Set interactive visual flash ticking alongside elapsed BPM
    const beatDurationMs = 60000 / metronomeBpm;
    let start = Date.now();

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const progress = (elapsed % beatDurationMs) / beatDurationMs;
      setBeatProgress(progress);
      
      // Periodic clicks procedurally
      if (progress < 0.05) {
        // Play minimal beep hitsound metronomes to assist timing calculations
        triggerWebBeep(1200, 0.02);
      }
    }, 16);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [calibrating]);

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

  // Keyboard interceptor relative to tapping calibrators
  const handleCalibrateTap = (e: React.KeyboardEvent | React.MouseEvent) => {
    if (!calibrating) return;
    
    // Play localized low-latency hitsounds on user taps
    triggerWebBeep(700, 0.04);

    const beatDurationMs = 60000 / metronomeBpm;
    const elapsed = Date.now() % beatDurationMs;
    
    // Ideal target is either at 0 (downbeat) or at beatDurationMs
    let diff = elapsed;
    if (diff > beatDurationMs / 2) {
      diff = diff - beatDurationMs; // should be negative indicating tapped slightly early
    }

    // Accumulate diffs
    const updated = [...tapTimes, diff].slice(-10); // keep final 10 taps max
    setTapTimes(updated);

    if (updated.length >= 8) {
      // Calculate mean offset absolute deviation in ms
      const sum = updated.reduce((a, b) => a + b, 0);
      const mean = Math.round(sum / updated.length);
      setCaliOffsetResult(mean);
    }
  };

  const applyOffsetCalibration = () => {
    if (caliOffsetResult !== null) {
      // Offset matches positive calibration direction: Positive offset moves music into future
      updateSettings({ audioOffset: caliOffsetResult });
      setCalibrating(false);
      setTapTimes([]);
      setCaliOffsetResult(null);
    }
  };

  const resetAllSettings = () => {
    const verified = window.confirm('Are you sure you want to restore default keybindings and volumes?');
    if (verified) {
      updateSettings({
        scrollSpeed: 20,
        audioOffset: 0,
        hitsoundVolume: 0.65,
        musicVolume: 0.8,
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
      });
    }
  };

  return (
    <div id="settings-screen-container" className="flex flex-col gap-6 w-full max-w-5xl mx-auto h-full p-2 lg:p-4 animate-fade-in text-slate-100 pb-12">
      
      {/* HEADER PANELS */}
      <div className="flex justify-between items-center bg-[#0a0a0c] border border-white/10 p-3 rounded">
        <div className="flex items-center gap-3">
          <span className="p-2 bg-white/5 rounded border border-white/10 text-cyan-400">
            <Sliders className="h-4.5 w-4.5" />
          </span>
          <div>
            <span className="text-[10px] text-slate-505 font-mono tracking-widest uppercase">CALIBRATION MATRIX</span>
            <h2 className="text-base font-black font-sans leading-none mt-0.5 uppercase italic tracking-tighter text-slate-200">System Options</h2>
          </div>
        </div>

        <button
          id="settings-back-btn"
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-cyan-400 to-indigo-500 hover:brightness-110 text-black font-sans text-xs font-black uppercase tracking-wider rounded italic shadow-[0_0_15px_rgba(34,211,238,0.25)] transition-all cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4 stroke-[3]" /> Save Options
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        
        {/* LEFT PANEL: CORE VOLUMES / MAP GRAPH OPTIONS */}
        <div className="md:col-span-6 flex flex-col gap-4">
          
          {/* AUDIO ENGINE CONTROLLER RANGE SLIDERS */}
          <div className="bg-[#0a0a0d] border border-white/10 p-4 rounded flex flex-col gap-4">
            <h3 className="text-[10px] text-slate-500 font-black tracking-widest uppercase flex items-center gap-1.5 border-b border-white/5 pb-2">
              <Volume2 className="h-4 w-4 text-cyan-400" /> Decibel Settings
            </h3>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[11px] font-bold">
                  <span className="text-slate-400">Track Sound Decibel Volume</span>
                  <span className="font-mono text-cyan-400">{Math.round(settings.musicVolume * 100)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.05"
                  value={settings.musicVolume}
                  onChange={(e) => updateSettings({ musicVolume: parseFloat(e.target.value) })}
                  className="w-full h-1 bg-white/10 rounded appearance-none cursor-pointer accent-cyan-400"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[11px] font-bold">
                  <span className="text-slate-400">Hitsound Feedback Decibel Volume</span>
                  <span className="font-mono text-cyan-400">{Math.round(settings.hitsoundVolume * 100)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.05"
                  value={settings.hitsoundVolume}
                  onChange={(e) => updateSettings({ hitsoundVolume: parseFloat(e.target.value) })}
                  className="w-full h-1 bg-white/10 rounded appearance-none cursor-pointer accent-cyan-400"
                />
              </div>
            </div>
          </div>

          {/* GAMEPLAY LAYOUT PREFERENCES */}
          <div className="bg-[#0a0a0d] border border-white/10 p-4 rounded flex flex-col gap-3">
            <h3 className="text-[10px] text-slate-500 font-black tracking-widest uppercase flex items-center gap-1.5 border-b border-white/5 pb-2">
              <Zap className="h-4 w-4 text-cyan-400" /> Scrolling Mechanics
            </h3>

            <div className="flex items-center justify-between py-1 text-xs">
              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-slate-200">Upsurface scrolling preference</span>
                <span className="text-slate-500 font-sans text-[11px]">Notes slide upwards from the bottom</span>
              </div>
              
              <button
                id="upsurface-toggle"
                onClick={() => updateSettings({ upsurfaceNoteMode: !settings.upsurfaceNoteMode })}
                className={`px-3 py-1 font-mono font-bold text-[11px] rounded border transition ${
                  settings.upsurfaceNoteMode 
                    ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' 
                    : 'bg-white/5 text-slate-400 border-white/5'
                }`}
              >
                {settings.upsurfaceNoteMode ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="flex items-center justify-between py-1 text-xs border-t border-white/5 pt-2">
              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-slate-200">Disable Background Video</span>
                <span className="text-slate-500 font-sans text-[11px]">Completely disable and hide loaded MP4 background video files</span>
              </div>
              
              <button
                id="disable-video-toggle"
                onClick={() => updateSettings({ disableVideo: !settings.disableVideo })}
                className={`px-3 py-1 font-mono font-bold text-[11px] rounded border transition ${
                  settings.disableVideo 
                    ? 'bg-red-500/15 text-red-400 border-red-500/30' 
                    : 'bg-white/5 text-slate-400 border-white/5'
                }`}
              >
                {settings.disableVideo ? 'DISABLED' : 'ENABLED'}
              </button>
            </div>

            <div className="flex flex-col gap-1.5 mt-2 border-t border-white/5 pt-2">
              <div className="flex justify-between text-[11px] font-bold">
                <div className="flex flex-col gap-0.5">
                  <span className="text-slate-200">Background Video Opacity</span>
                  <span className="text-slate-500 font-sans text-[11px]">Dim or adjust background playback video brightness</span>
                </div>
                <span className="font-mono text-cyan-400">{Math.round((settings.videoOpacity !== undefined ? settings.videoOpacity : 0.35) * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.05"
                value={settings.videoOpacity !== undefined ? settings.videoOpacity : 0.35}
                onChange={(e) => updateSettings({ videoOpacity: parseFloat(e.target.value) })}
                className="w-full h-1 bg-white/10 rounded appearance-none cursor-pointer accent-cyan-400"
              />
            </div>

            <div className="flex flex-col gap-1.5 mt-2 border-t border-white/5 pt-2">
              <div className="flex justify-between text-[11px] font-bold">
                <div className="flex flex-col gap-0.5">
                  <span className="text-slate-200">Playfield Shield Dim</span>
                  <span className="text-slate-500 font-sans text-[11px]">Solid black backplate opacity behind notes (100% = fully black layout)</span>
                </div>
                <span className="font-mono text-cyan-400">{Math.round((settings.backgroundDim !== undefined ? settings.backgroundDim : 0.60) * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.05"
                value={settings.backgroundDim !== undefined ? settings.backgroundDim : 0.60}
                onChange={(e) => updateSettings({ backgroundDim: parseFloat(e.target.value) })}
                className="w-full h-1 bg-white/10 rounded appearance-none cursor-pointer accent-cyan-400"
              />
            </div>
          </div>

          {/* METRONOME TIMING OFFSET CALIBRATION TOOLBOX */}
          <div className="bg-[#0a0a0d] border border-white/10 p-4 rounded flex flex-col gap-3">
            <h3 className="text-[10px] text-slate-500 font-black tracking-widest uppercase flex items-center gap-1.5 border-b border-white/5 pb-2">
              <Gauge className="h-4 w-4 text-cyan-400" /> Latency & Calibration Matrix
            </h3>

            <p className="text-slate-400 text-[11px] leading-relaxed">
              Correct timing discrepancies by calibrating your auditory and visual offsets independently.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
              {/* 1. AUDIO PLAYBACK OFFSET */}
              <div className="bg-[#050505] p-3 rounded border border-white/5 flex flex-col gap-2">
                <span className="text-[9px] text-cyan-400 font-black uppercase tracking-wider font-mono">Audio Output Offset</span>
                <p className="text-[10px] text-slate-500 leading-snug">
                  Compensates for delayed audio output hardware (e.g. bluetooth audio latency).
                </p>
                <div className="flex items-center gap-2 mt-auto pt-2">
                  <input 
                    type="number"
                    value={settings.audioOffset}
                    onChange={(e) => updateSettings({ audioOffset: parseInt(e.target.value) || 0 })}
                    className="w-16 bg-black border border-white/10 px-2 py-1 rounded text-xs font-mono font-bold text-cyan-400 focus:outline-none focus:border-cyan-400"
                  />
                  <div className="flex gap-1 flex-0 flex-1">
                    <button 
                      onClick={() => updateSettings({ audioOffset: settings.audioOffset - 5 })}
                      className="flex-1 py-1 bg-white/5 hover:bg-white/10 border border-white/10 font-mono text-[9px] rounded font-bold transition cursor-pointer"
                    >
                      -5ms
                    </button>
                    <button 
                      onClick={() => updateSettings({ audioOffset: settings.audioOffset + 5 })}
                      className="flex-1 py-1 bg-white/5 hover:bg-white/10 border border-white/10 font-mono text-[9px] rounded font-bold transition cursor-pointer"
                    >
                      +5ms
                    </button>
                  </div>
                </div>
              </div>

              {/* 2. VISUAL RENDER FLASH OFFSET */}
              <div className="bg-[#050505] p-3 rounded border border-white/5 flex flex-col gap-2">
                <span className="text-[9px] text-indigo-400 font-black uppercase tracking-wider font-mono">Visual Rendering Offset</span>
                <p className="text-[10px] text-slate-505 leading-snug">
                  Aligns scrolling notes dynamically on screen relative to hardware rendering delays.
                </p>
                <div className="flex items-center gap-2 mt-auto pt-2">
                  <input 
                    type="number"
                    value={settings.visualOffset || 0}
                    onChange={(e) => updateSettings({ visualOffset: parseInt(e.target.value) || 0 })}
                    className="w-16 bg-black border border-white/10 px-2 py-1 rounded text-xs font-mono font-bold text-cyan-400 focus:outline-none focus:border-cyan-400"
                  />
                  <div className="flex gap-1 flex-1">
                    <button 
                      onClick={() => updateSettings({ visualOffset: (settings.visualOffset || 0) - 5 })}
                      className="flex-1 py-1 bg-white/5 hover:bg-white/10 border border-white/10 font-mono text-[9px] rounded font-bold transition cursor-pointer"
                    >
                      -5ms
                    </button>
                    <button 
                      onClick={() => updateSettings({ visualOffset: (settings.visualOffset || 0) + 5 })}
                      className="flex-1 py-1 bg-white/5 hover:bg-white/10 border border-white/10 font-mono text-[9px] rounded font-bold transition cursor-pointer"
                    >
                      +5ms
                    </button>
                  </div>
                </div>
              </div>

              {/* 3. VIDEO START OFFSET */}
              <div className="bg-[#050505] p-3 rounded border border-white/5 flex flex-col gap-2 col-span-1 sm:col-span-2">
                <span className="text-[9px] text-fuchsia-400 font-black uppercase tracking-wider font-mono">Video Sync Offset</span>
                <p className="text-[10px] text-slate-505 leading-snug">
                  Compensates for device-specific background video decoding overhead/audio phase delays. Positive shifts later; negative shifts earlier.
                </p>
                <div className="flex items-center gap-2 mt-auto pt-2">
                  <input 
                    type="number"
                    value={settings.videoOffset || 0}
                    onChange={(e) => updateSettings({ videoOffset: parseInt(e.target.value) || 0 })}
                    className="w-16 bg-black border border-white/10 px-2 py-1 rounded text-xs font-mono font-bold text-cyan-400 focus:outline-none focus:border-cyan-400"
                  />
                  <div className="flex gap-1 flex-1">
                    <button 
                      onClick={() => updateSettings({ videoOffset: (settings.videoOffset || 0) - 10 })}
                      className="flex-1 py-1 bg-white/5 hover:bg-white/10 border border-white/10 font-mono text-[9px] rounded font-bold transition cursor-pointer"
                    >
                      -10ms
                    </button>
                    <button 
                      onClick={() => updateSettings({ videoOffset: (settings.videoOffset || 0) + 10 })}
                      className="flex-1 py-1 bg-white/5 hover:bg-white/10 border border-white/10 font-mono text-[9px] rounded font-bold transition cursor-pointer"
                    >
                      +10ms
                    </button>
                    <button 
                      onClick={() => updateSettings({ videoOffset: 0 })}
                      className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 font-mono text-[9px] rounded font-bold transition cursor-pointer text-slate-400"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            </div>
            {/* METRONOME CALIBRATION TESTBED INTERFACE */}
            <div className="border border-white/5 rounded p-3 flex flex-col gap-3 bg-white/5 mt-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-black uppercase text-slate-300 tracking-wider">Metronome Calibrator</span>
                <button
                  id="metronome-calibrate-btn"
                  onClick={() => {
                    setCalibrating(!calibrating);
                    setTapTimes([]);
                    setCaliOffsetResult(null);
                  }}
                  className={`px-3 py-1 font-mono font-bold text-[10px] uppercase tracking-wider rounded transition ${
                    calibrating ? 'bg-red-500/25 text-red-400 border border-red-500/30' : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                  }`}
                >
                  {calibrating ? 'STOP TEST' : 'START TEST'}
                </button>
              </div>

              {calibrating && (
                <div className="flex flex-col gap-3 shrink-0 animate-fade-in">
                  <p className="text-[10.5px] text-slate-400">
                    Tap Spacebar or the pad below in beat with the visual pulse to compute optimal compensation offset.
                  </p>

                  <div className="flex items-center justify-center py-4 bg-black/80 rounded border border-white/5 relative">
                    {/* Pulsing Visual Loop */}
                    <div 
                      className={`h-11 w-11 rounded-full border-2 transition-all duration-75 flex items-center justify-center ${
                        beatProgress < 0.12 ? 'border-cyan-400 bg-cyan-400/30 scale-105 shadow-[0_0_15px_rgba(34,211,238,0.4)]' : 'border-white/5 bg-white/5'
                      }`}
                    >
                      <span className="text-[9px] font-mono text-slate-500 uppercase">PULSE</span>
                    </div>
                  </div>

                  {/* ACTIVE TAP ELEMENT */}
                  <button
                    id="calibrate-tap-pad"
                    onClick={handleCalibrateTap}
                    className="py-2.5 bg-[#121216] hover:bg-[#1a1a22] border border-white/5 rounded text-xs font-black uppercase tracking-widest text-cyan-400 shadow-inner cursor-pointer"
                  >
                    TAP / PRESS SPACEBAR
                  </button>

                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-550 uppercase">Taps Linked: {tapTimes.length}/8</span>
                    {caliOffsetResult !== null && (
                      <div className="flex items-center gap-2">
                        <span className="text-amber-400 font-bold">CALI: {caliOffsetResult}ms</span>
                        <button
                          onClick={applyOffsetCalibration}
                          className="px-2 py-0.5 bg-cyan-400 text-black font-black uppercase rounded text-[9px]"
                        >
                          APPLY
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: KEYBOARD GRAPH REBINDS */}
        <div className="md:col-span-6 bg-[#0a0a0d] border border-white/10 p-5 rounded flex flex-col gap-4">
          <h3 className="text-[10px] text-slate-500 font-black tracking-widest uppercase flex items-center gap-1.5 border-b border-white/5 pb-2">
            <Keyboard className="h-4.5 w-4.5 text-cyan-400" /> Keyboard Column Mapping
          </h3>

          <p className="text-slate-400 text-xs leading-relaxed font-sans">
            Choose a key count mode and modify your preferences. Click any button to rebind, then press any key on your keyboard to register it instantly.
          </p>

          <div className="flex flex-col gap-4 max-h-[360px] overflow-y-auto pr-1">
            {[2, 3, 4, 5, 6, 7, 8].map((num) => {
              const columns = settings.bindings[num] || [];
              return (
                <div key={num} className="flex flex-col gap-1.5 bg-[#050505] p-3 rounded border border-white/5">
                  <span className="text-[9px] text-slate-505 font-black tracking-widest uppercase font-mono">{num}K KEY-LANE REBINDS</span>
                  
                  <div className="flex gap-2 flex-wrap">
                    {columns.map((colKey, idx) => {
                      const isRebindingNow = activeRebind?.keyCount === num && activeRebind?.colIndex === idx;
                      return (
                        <button
                          key={idx}
                          onClick={() => setActiveRebind({ keyCount: num, colIndex: idx })}
                          className={`flex-1 py-2 font-mono text-xs font-black rounded transition border flex flex-col items-center justify-center ${
                            isRebindingNow 
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30 animate-pulse' 
                              : 'bg-[#121216] border-white/5 hover:bg-[#1a1a22] text-slate-100'
                          }`}
                        >
                          <span className={`${isRebindingNow ? 'text-rose-400' : 'text-slate-500'} text-[9px] uppercase font-sans tracking-tighter`}>C{idx + 1}</span>
                          <span className="text-xs uppercase">{isRebindingNow ? '???' : colKey}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* DANGEROUS RESETTERS BUTTON */}
          <div className="mt-auto pt-4 border-t border-white/5">
            <button
              onClick={resetAllSettings}
              className="w-full py-2 bg-white/5 hover:bg-rose-500/10 border border-white/5 hover:border-rose-500/20 text-slate-500 hover:text-rose-400 font-sans text-xs font-bold uppercase tracking-widest rounded flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Restore Defaults Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
