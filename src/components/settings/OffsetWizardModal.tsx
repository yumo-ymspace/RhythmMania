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

import React, { useState, useEffect, useRef } from 'react';
import { Volume2, Check, X } from 'lucide-react';

interface OffsetWizardModalProps {
  initial: number;
  onApply: (v: number) => void;
  onClose: () => void;
}

export default function OffsetWizardModal({ initial, onApply, onClose }: OffsetWizardModalProps) {
  const [step, setStep] = useState<'start' | 'tap' | 'apply'>('start');
  const [tapTimes, setTapTimesState] = useState<number[]>([]);
  const tapTimesRef = useRef<number[]>([]);
  const [beatProgress, setBeatProgress] = useState<number>(0);
  const [caliOffsetResult, setCaliOffsetResult] = useState<number | null>(null);
  const metronomeBpm = 120;
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<any>(null);
  const sessionStartRef = useRef<number>(0);
  const lastBeepedBeatRef = useRef<number>(-1);

  // Esc closes wizard only
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation(); // prevent drawer from catching it
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Clean up AudioContext on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (step !== 'tap') {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setBeatProgress(0);
      return;
    }

    const beatDurationMs = 60000 / metronomeBpm;

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - sessionStartRef.current;
      const progress = (elapsed % beatDurationMs) / beatDurationMs;
      setBeatProgress(progress);
      
      const currentBeatIndex = Math.floor(elapsed / beatDurationMs);
      if (currentBeatIndex !== lastBeepedBeatRef.current) {
        lastBeepedBeatRef.current = currentBeatIndex;
        triggerWebBeep(1200, 0.02);
      }
    }, 16);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [step]);

  useEffect(() => {
    if (step !== 'tap') return;

    const handleSpacePress = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        registerTapEvent();
      }
    };

    window.addEventListener('keydown', handleSpacePress);
    return () => window.removeEventListener('keydown', handleSpacePress);
  }, [step]);

  const triggerWebBeep = (freq: number, duration: number) => {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtxClass();
      }
      const ctx = audioContextRef.current;
      if (!ctx) return;

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
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
    } catch(e) {
      console.warn('Metronome audio beep error:', e);
    }
  };

  const registerTapEvent = () => {
    triggerWebBeep(700, 0.04);

    const beatDurationMs = 60000 / metronomeBpm;
    const elapsed = Date.now() - sessionStartRef.current;
    const remainder = elapsed % beatDurationMs;
    
    let diff = remainder;
    if (diff > beatDurationMs / 2) {
      diff = diff - beatDurationMs; 
    }

    const currentTimes = tapTimesRef.current;
    const updated = [...currentTimes, diff].slice(-8);
    tapTimesRef.current = updated;
    setTapTimesState(updated);

    if (updated.length >= 8) {
      const sum = updated.reduce((a, b) => a + b, 0);
      const mean = Math.round(sum / updated.length);
      setCaliOffsetResult(mean);
      setStep('apply');
    }
  };

  const startMetronome = () => {
    sessionStartRef.current = Date.now();
    lastBeepedBeatRef.current = -1;
    setStep('tap');
    tapTimesRef.current = [];
    setTapTimesState([]);
    setCaliOffsetResult(null);
  };

  const displayResult = caliOffsetResult !== null ? caliOffsetResult : 0;

  return (
    <div 
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div 
        className="bg-slate-900 border border-slate-700/50 rounded-xl w-[400px] max-w-[90vw] p-6 shadow-2xl flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center pb-3 border-b border-white/10">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-[var(--skin-accent)]" />
            Offset Wizard
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-full text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {step === 'start' && (
          <>
            <p className="text-sm text-slate-300 leading-relaxed">
              When you click Start, you will hear a metronome beat. Tap your <strong>Spacebar</strong> in time with the sound.
              <br/><br/>
              Do this 8 times consistently to calculate your hardware&apos;s audio latency offset.
            </p>
            <div className="flex justify-end pt-2">
              <button 
                onClick={startMetronome}
                className="px-5 py-2 rounded font-semibold bg-[var(--skin-accent)] text-slate-950 hover:bg-[var(--skin-accent)] hover:opacity-90 transition-opacity"
              >
                Start Metronome
              </button>
            </div>
          </>
        )}
        
        {step === 'tap' && (
          <div className="flex flex-col items-center justify-center py-6 gap-6">
            <div className="w-24 h-24 rounded-full border-4 border-slate-700 flex flex-col items-center justify-center relative shadow-[0_0_20px_rgba(0,0,0,0.5)]">
               <div 
                  className="absolute inset-0 rounded-full bg-[var(--skin-accent)] opacity-20"
                  style={{ transform: `scale(${1 + Math.sin(beatProgress * Math.PI) * 0.15})` }}
               />
               <span className="text-3xl font-black text-white relative z-10">{tapTimes.length}</span>
               <span className="text-[10px] text-slate-400 font-bold uppercase relative z-10">of 8 taps</span>
            </div>
            
            <p className="text-sm text-[var(--skin-accent)] font-medium animate-pulse">
              Tap SPACEBAR to the beat!
            </p>
          </div>
        )}
        
        {step === 'apply' && (
          <>
            <div className="flex flex-col items-center py-4 bg-slate-950/50 rounded-lg border border-slate-800">
              <span className="text-sm text-slate-400">Calculated Audio Offset:</span>
              <span className={`text-4xl font-black tracking-tight mt-1 ${
                displayResult > 0 ? 'text-red-400' : 'text-emerald-400'
              }`}>
                {displayResult > 0 ? '+' : ''}{displayResult}ms
              </span>
              <span className="text-xs text-slate-500 mt-2">
                Previous value: {initial > 0 ? '+' : ''}{initial}ms
              </span>
            </div>
            
            <div className="flex justify-end gap-3 pt-2">
              <button 
                onClick={startMetronome}
                className="px-4 py-2 rounded text-sm font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Retry
              </button>
              <button 
                onClick={() => { onApply(displayResult); }}
                className="px-5 py-2 rounded font-semibold bg-[var(--skin-accent)] text-slate-950 flex items-center gap-2 hover:opacity-90 transition-opacity"
              >
                <Check className="w-4 h-4" />
                Apply Offset
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
