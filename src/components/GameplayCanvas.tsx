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

import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, ChevronLeft, RotateCcw, Volume2, ShieldAlert, Maximize, Minimize } from 'lucide-react';
import { mainAudio } from '../audio/AudioEngine';
import { Beatmap, GameSettings, HitObject, JudgementType, JudgementWindow, ScoreState, ReplayFrame } from '../types';
import { VideoSyncController } from '../utils/videoSyncController';
import { PlayZoneOverlay } from './PlayZoneOverlay';
import { executeTeardown } from '../utils/gameplayTeardown';
import { TouchInputAdapter } from '../utils/touchInputAdapter';
import { FullscreenManager } from '../utils/fullscreenManager';
import { GameplayMediaRegistry } from '../utils/mediaRegistry';
import JSZip from 'jszip';
import { RobustZipResolver } from '../utils/zipResolver';
import { AssetLifecycleManager } from '../utils/assetLifecycle';
import { storageManager } from '../utils/storageManager';
import { TempMemoryCache } from '../utils/tempMemoryCache';

export interface ColumnStyle {
  width: number;
  color: string;
}

export function hexToRgba(hex: string, alpha: number): string {
  if (!hex) return `rgba(255,255,255,${alpha})`;
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    const r = parseInt(cleanHex[0] + cleanHex[0], 16);
    const g = parseInt(cleanHex[1] + cleanHex[1], 16);
    const b = parseInt(cleanHex[2] + cleanHex[2], 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  if (cleanHex.length === 6) {
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return hex;
}

export function getColumnStyles(keyCount: number, baseWidth: number, skinId?: string, customSkinColors?: string[]): ColumnStyle[] {
  const styles: ColumnStyle[] = [];
  
  // Standard competitive color maps
  let colors = {
    blue: '#2e6b9e',
    white: '#eceff1',
    accent: '#d32f2f', // Center column color
    cyan: '#00b0ff'
  };

  if (skinId === 'custom' && customSkinColors && customSkinColors.length >= 4) {
    colors = {
      blue: customSkinColors[0] || '#2e6b9e',
      white: customSkinColors[1] || '#eceff1',
      accent: customSkinColors[2] || '#d32f2f',
      cyan: customSkinColors[3] || '#00b0ff'
    };
  } else if (skinId === 'classic-bar') {
    colors = {
      blue: '#00e5ff', // cyan-neon
      white: '#ffc107', // pure gold
      accent: '#f50057', // neon rose
      cyan: '#00e676' // vibrant lime
    };
  } else if (skinId === 'circles') {
    colors = {
      blue: '#2979ff', // bubble blue
      white: '#ff4081', // hot pink
      accent: '#ffeb3b', // electric yellow
      cyan: '#00e5ff' // vibrant ice cyan
    };
  } else if (skinId === 'cyberpunk') {
    colors = {
      blue: '#ec4899', // bubble magenta
      white: '#8b5cf6', // violet
      accent: '#eab308', // cyber tech orange/yellow
      cyan: '#06b6d4' // tech cyan
    };
  } else if (skinId === 'emerald') {
    colors = {
      blue: '#10b981', // emerald green
      white: '#34d399', // bright seafoam
      accent: '#34d399', // Mint highlight
      cyan: '#059669' // deep emerald green
    };
  } else if (skinId === 'minimalist') {
    colors = {
      blue: '#475569', // slate-600
      white: '#f8fafc', // ultra white slate
      accent: '#cbd5e1', // grey slate
      cyan: '#64748b' // dark slate
    };
  } else if (skinId === 'glassy-spheres') {
    colors = {
      blue: '#0284c7', // rich glassy ocean blue
      white: '#ec4899', // polished glassy rose
      accent: '#eab308', // glossy cyber gold yellow
      cyan: '#06b6d4' // rich glassy cyan
    };
  } else if (skinId === 'hollow-rings') {
    colors = {
      blue: '#3b82f6', // picture blue
      white: '#c084fc', // picture purple
      accent: '#f43f5e', // picture red/pink
      cyan: '#14b8a6' // picture teal
    };
  }

  for (let i = 0; i < keyCount; i++) {
    let width = baseWidth;
    let color = colors.white;

    if (keyCount === 5) {
      if (i === 1 || i === 3) color = colors.white;
      else if (i === 0 || i === 4) color = colors.blue;
      else if (i === 2) { 
        width = baseWidth * 1.35; // Wider spacebar column
        color = colors.accent; 
      }
    } else if (keyCount === 7) {
      if (i === 0 || i === 2 || i === 4 || i === 6) color = colors.blue;
      else if (i === 1 || i === 5) color = colors.white;
      else if (i === 3) {
        width = baseWidth * 1.35; // Wider center spacebar
        color = colors.accent;
      }
    } else if (keyCount === 8) {
      // 8K typical layout: 7 standard keys + 1 thumb key on left/right side
      if (i === 0) {
        width = baseWidth * 1.4;
        color = colors.cyan; // Special side-lane
      } else if (i === 1 || i === 3 || i === 5 || i === 7) {
        color = colors.blue;
      } else {
        color = colors.white;
      }
    } else if (keyCount === 6) {
      if (i === 0 || i === 2 || i === 3 || i === 5) color = colors.blue;
      else color = colors.white;
    } else {
      // Standard 4K, 2K, 3K symmetric / alternating
      if (i === 0 || i === keyCount - 1) color = colors.blue;
      else color = colors.white;
    }

    styles.push({ width, color });
  }

  return styles;
}

interface GameplayCanvasProps {
  beatmap: Beatmap;
  settings: GameSettings;
  updateSettings?: (s: Partial<GameSettings>) => void;
  onFinish: (score: ScoreState, replay?: ReplayFrame[]) => void;
  onBack: () => void;
  replayData?: ReplayFrame[] | null;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
}

interface HitErrorTick {
  id: string;
  error: number;
  timestamp: number;
  color: string;
}

export default function GameplayCanvas({
  beatmap,
  settings,
  updateSettings,
  onFinish,
  onBack,
  replayData = null
}: GameplayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const syncControllerRef = useRef<VideoSyncController | null>(null);

  // Replay structures
  const replayFramesRef = useRef<ReplayFrame[]>([]);
  const lastProcessedReplayTimeRef = useRef<number>(-1);

  // Callback ref to register HTMLVideoElement in non-serializable global registry correctly on mount/unmount
  const setVideoRef = React.useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    GameplayMediaRegistry.setVideo(node);
    if (node) {
      try {
        node.load();
      } catch (err) {
        console.warn('Error inside video registration player:', err);
      }
    }
  }, []);
  const animationFrameRef = useRef<number | null>(null);

  const handleExit = () => {
    executeTeardown(
      mainAudio,
      animationFrameRef.current,
      null,
      null
    );
    if (videoRef.current) {
      try { videoRef.current.pause(); } catch (e) {}
    }
    
    // If they failed or are at 0 HP, submit as finished fail record so they see performance telemetry and replay
    if (scoreStateRef.current.failed) {
      onFinish(scoreStateRef.current, replayFramesRef.current);
    } else {
      onBack();
    }
  };
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);

  // Synchronize dynamic focus view modes with the programmatic Fullscreen API
  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = FullscreenManager.isFullscreenActive();
      if (!active) {
        setIsFocusMode((prevActive) => {
          if (prevActive) {
            // Trigger pause because user exited native fullscreen externally
            setIsPaused(true);
            isPlayingRef.current = false;
            mainAudio.pause();
            if (videoRef.current) {
              try { videoRef.current.pause(); } catch (e) {}
            }
          }
          return false;
        });
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  const handleToggleFocus = async () => {
    const container = document.getElementById('gameplay-container');
    if (!container) return;

    if (!isFocusMode) {
      setIsFocusMode(true);
      await FullscreenManager.enterFocusMode(container);
    } else {
      setIsFocusMode(false);
      await FullscreenManager.exitFocusMode();
    }
  };
  const [showKeycountWarning, setShowKeycountWarning] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768 && beatmap.keyCount > 5) {
      setShowKeycountWarning(true);
    }
  }, [beatmap.keyCount]);

  const [showOffsetNotification, setShowOffsetNotification] = useState<boolean>(false);
  const notificationTimeoutRef = useRef<any>(null);

  // Monitor real-time latency offset keys + and - during gameplay
  useEffect(() => {
    const handleOffsetKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      if (e.key === '=' || e.key === '+') {
        const nextOffset = settings.audioOffset + 5;
        if (updateSettings) {
          updateSettings({ audioOffset: nextOffset });
          setShowOffsetNotification(true);
          if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
          notificationTimeoutRef.current = setTimeout(() => {
            setShowOffsetNotification(false);
          }, 1800);
        }
      } else if (e.key === '-' || e.key === '_') {
        const nextOffset = settings.audioOffset - 5;
        if (updateSettings) {
          updateSettings({ audioOffset: nextOffset });
          setShowOffsetNotification(true);
          if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
          notificationTimeoutRef.current = setTimeout(() => {
            setShowOffsetNotification(false);
          }, 1800);
        }
      }
    };

    window.addEventListener('keydown', handleOffsetKeyDown);
    return () => {
      window.removeEventListener('keydown', handleOffsetKeyDown);
      if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
    };
  }, [settings.audioOffset, updateSettings]);
  
  // Game state refs (to avoid stale closures in high-frequency keyboard/requestAnimationFrame loops)
  const isPlayingRef = useRef<boolean>(true);
  const audioTimeRef = useRef<number>(0);
  const smoothOffsetRef = useRef<number>(settings.audioOffset);
  const notesRef = useRef<HitObject[]>([]);
  const scoreStateRef = useRef<ScoreState>({
    score: 0,
    combo: 0,
    maxCombo: 0,
    hp: 100,
    marvelousCount: 0,
    perfectCount: 0,
    greatCount: 0,
    goodCount: 0,
    badCount: 0,
    missCount: 0,
    accuracy: 100,
    completed: false,
    failed: false,
  });

  const [uiScore, setUiScore] = useState<number>(0);
  const [uiCombo, setUiCombo] = useState<number>(0);
  const [uiHp, setUiHp] = useState<number>(100);
  const [uiJudgement, setUiJudgement] = useState<{ text: string; color: string; time: number } | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [showCountdown, setShowCountdown] = useState<number>(0);

  // Active inputs trace
  const keysPressedRef = useRef<boolean[]>([]);
  const activeColumnsRef = useRef<boolean[]>([]);
  
  // Dynamic visual visualizers
  const particlesRef = useRef<Particle[]>([]);
  const screenShakeRef = useRef<number>(0);
  const laneGlowRef = useRef<number[]>([]);
  
  // Judgement popup tracker
  const currentJudgementRef = useRef<{ text: string, color: string, time: number, size: number } | null>(null);

  // Hit error timing logs
  const hitErrorTicksRef = useRef<HitErrorTick[]>([]);

  const [loadingAudioProgress, setLoadingAudioProgress] = useState<number>(0);
  const [isAudioLoaded, setIsAudioLoaded] = useState<boolean>(false);

  // PIPELINE DIAGNOSTICS & DECODING FALLBACK STATES
  const [isPlayingFallback, setIsPlayingFallback] = useState<boolean>(false);
  const [isVideoMissing, setIsVideoMissing] = useState<boolean>(false);
  const [isVideoError, setIsVideoError] = useState<boolean>(false);
  const [diagnosticsErrorLog, setDiagnosticsErrorLog] = useState<string[]>([]);

  // Parse overall difficulty and build dynamic judgement windows in milliseconds
  // In competitive play:
  // OD 0: Marvelous: 18ms, Perfect: 44ms, Great: 74ms, Good: 104ms, Bad: 134ms
  // OD 10: Marvelous: 10ms, Perfect: 20ms, Great: 35ms, Good: 53ms, Bad: 72ms
  const getJudgementWindows = (od: number): JudgementWindow[] => {
    return [
      {
        type: 'marvelous',
        name: 'MARVELOUS',
        windowMs: 16,
        baseScore: 320,
        hpDelta: 3,
        color: '#22d3ee', // Cyan
        glowColor: 'rgba(34,211,238,0.5)',
      },
      {
        type: 'perfect',
        name: 'PERFECT',
        windowMs: Math.max(20, 44 - 2.4 * od),
        baseScore: 300,
        hpDelta: 2,
        color: '#facc15', // Neon Gold
        glowColor: 'rgba(250,204,21,0.4)',
      },
      {
        type: 'great',
        name: 'GREAT',
        windowMs: Math.max(35, 74 - 3.9 * od),
        baseScore: 200,
        hpDelta: 1,
        color: '#4ade80', // Green
        glowColor: 'rgba(74,222,128,0.3)',
      },
      {
        type: 'good',
        name: 'GOOD',
        windowMs: Math.max(53, 104 - 5.1 * od),
        baseScore: 100,
        hpDelta: 0.2,
        color: '#3b82f6', // Indigo
        glowColor: 'rgba(59,130,246,0.2)',
      },
      {
        type: 'bad',
        name: 'BAD',
        windowMs: Math.max(72, 134 - 6.2 * od),
        baseScore: 50,
        hpDelta: -3,
        color: '#ec4899', // Pink
        glowColor: 'rgba(236,72,153,0.1)',
      },
      {
        type: 'miss',
        name: 'MISS',
        windowMs: Math.max(120, 180 - 7 * od),
        baseScore: 0,
        hpDelta: -10, // Harsh HP drain under miss conditions
        color: '#ef4444', // Hot Red
        glowColor: 'rgba(239,68,68,0.3)',
      }
    ];
  };

  const judgementWindows = getJudgementWindows(beatmap.overallDifficulty);
  const marvelousJudg = judgementWindows.find(w => w.type === 'marvelous') || judgementWindows[0];
  const perfectJudg = judgementWindows.find(w => w.type === 'perfect') || judgementWindows[1];
  const greatJudg = judgementWindows.find(w => w.type === 'great') || judgementWindows[2];
  const goodJudg = judgementWindows.find(w => w.type === 'good') || judgementWindows[3];
  const badJudg = judgementWindows.find(w => w.type === 'bad') || judgementWindows[4];
  const missJudg = judgementWindows.find(w => w.type === 'miss') || judgementWindows[judgementWindows.length - 1];

  const initializeGameplay = () => {
    // Deep copy notes from the beatmap, ensuring gameplay properties reset
    notesRef.current = beatmap.notes.map(note => ({
      ...note,
      isHit: false,
      isReleased: false,
      isMissed: false,
      isHoldFailed: false,
      hitTime: undefined,
      releaseTime: undefined
    }));
    
    // Reset key arrays
    keysPressedRef.current = new Array(beatmap.keyCount).fill(false);
    activeColumnsRef.current = new Array(beatmap.keyCount).fill(false);
    laneGlowRef.current = new Array(beatmap.keyCount).fill(0);
    
    // Reset score tracking
    scoreStateRef.current = {
      score: 0,
      combo: 0,
      maxCombo: 0,
      hp: 100,
      marvelousCount: 0,
      perfectCount: 0,
      greatCount: 0,
      goodCount: 0,
      badCount: 0,
      missCount: 0,
      accuracy: 100,
      completed: false,
      failed: false,
    };

    // Reset replay tracking
    replayFramesRef.current = [{ time: 0, keysPressed: new Array(beatmap.keyCount).fill(false) }];

    // Reset hit error timing ticks
    hitErrorTicksRef.current = [];
    lastProcessedReplayTimeRef.current = -1;
    
    syncControllerRef.current = null;
    
    setUiScore(0);
    setUiCombo(0);
    setUiHp(100);
    setUiJudgement(null);
    setIsPaused(false);
    isPlayingRef.current = false;
    
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      } catch (e) {}
    }

    // Automatically scroll the browser/window up, ensuring gameplay elements, focus mode or exit buttons are prominent on mobile viewports
    try {
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Also scroll the container itself into view to ensure it clears any headers/margins
        setTimeout(() => {
          const containerElem = document.getElementById('gameplay-container');
          if (containerElem) {
            containerElem.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          // Reset scroll counters just in case smooth scrolling gets blocked by iframe sandboxing policies
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
        }, 150);
      }
    } catch (scrollErr) {
      console.warn('Silent fallback for scroll transition bounds:', scrollErr);
    }

    // Direct count down before launching music
    setShowCountdown(3);
  };

  // Initialize and load track
  useEffect(() => {
    let active = true;
    setIsAudioLoaded(false);
    
    const loadBgAudio = async () => {
      // Clear stale mutated blob URLs if they are not in the active media cache
      try {
        const cached = storageManager.lruMediaCache.get(beatmap.id);
        if (!cached) {
          if (beatmap.audioUrl?.startsWith('blob:')) beatmap.audioUrl = '';
          if (beatmap.videoUrl?.startsWith('blob:')) beatmap.videoUrl = '';
          if (beatmap.bgUrl?.startsWith('blob:')) beatmap.bgUrl = '';
        } else {
          beatmap.audioUrl = cached.audioUrl || beatmap.audioUrl;
          beatmap.videoUrl = cached.videoUrl || beatmap.videoUrl;
          beatmap.bgUrl = cached.bgUrl || beatmap.bgUrl;
        }
      } catch (err) {
        console.warn('Failed validating current cache refs inside play canvas:', err);
      }

      // Dynamically resolve missing beatmap media from local zip archive if necessary
      const mapWithPkg = beatmap as any;
      if (mapWithPkg.packageId && (!beatmap.audioUrl || !beatmap.bgUrl || (mapWithPkg.videoFilename && !beatmap.videoUrl))) {
        try {
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

            let parsedAudioUrl = beatmap.audioUrl || '';
            let parsedVideoUrl = beatmap.videoUrl || '';
            let parsedBgUrl = beatmap.bgUrl || '';

            if (audioFilename && !parsedAudioUrl) {
              const file = resolver.findFile(audioFilename);
              if (file) {
                const b = await file.async('blob');
                parsedAudioUrl = AssetLifecycleManager.registerBlob(b);
                beatmap.audioUrl = parsedAudioUrl;
              }
            }
            if (videoFilename && !parsedVideoUrl) {
              const file = resolver.findFile(videoFilename);
              if (file) {
                const b = await file.async('blob');
                parsedVideoUrl = AssetLifecycleManager.registerBlob(b);
                beatmap.videoUrl = parsedVideoUrl;
              }
            }
            if (bgFilename && !parsedBgUrl) {
              const file = resolver.findFile(bgFilename);
              if (file) {
                const b = await file.async('blob');
                parsedBgUrl = AssetLifecycleManager.registerBlob(b);
                beatmap.bgUrl = parsedBgUrl;
              }
            }

            // Update LRU memory cache
            storageManager.lruMediaCache.put(beatmap.id, {
              audioUrl: parsedAudioUrl,
              videoUrl: parsedVideoUrl,
              bgUrl: parsedBgUrl
            });
          }
        } catch (mediaErr) {
          console.error('Failed to dynamically resolve missing beatmap media from assets archive:', mediaErr);
        }
      }

      // Direct loading
      mainAudio.init();
      mainAudio.setVolumes(settings.musicVolume, settings.hitsoundVolume);
      mainAudio.setOffset(settings.audioOffset);
      
      const success = await mainAudio.loadTrack(beatmap.audioUrl || '', (p) => {
        if (active) setLoadingAudioProgress(p);
      });
      
      if (active) {
        setIsAudioLoaded(true);
        if (!success) {
          setIsPlayingFallback(true);
          const declaredAudio = (beatmap as any).audioFilename || 'audio.mp3';
          setDiagnosticsErrorLog(prev => [
            ...prev,
            `Audio file "${declaredAudio}" failed to decode. Falling back to Procedural Synth.`
          ]);
        }

        // Check for missing video
        const declaredVideo = (beatmap as any).videoFilename;
        if (declaredVideo && !beatmap.videoUrl) {
          setIsVideoMissing(true);
          setDiagnosticsErrorLog(prev => [
            ...prev,
            `Video track "${declaredVideo}" declared in beatmap but not present in the package.`
          ]);
        }

        initializeGameplay();
      }
    };
    
    loadBgAudio();

    return () => {
      active = false;
      mainAudio.stop();
      if (videoRef.current) {
        try {
          videoRef.current.pause();
        } catch (e) {}
      }
    };
  }, [beatmap, settings]);

  // Handle countdown intervals
  useEffect(() => {
    if (showCountdown > 0) {
      const t = setTimeout(() => {
        setShowCountdown(prev => {
          if (prev === 1) {
            // Play audio as soon as countdown wraps up
            mainAudio.play(beatmap.bpm, settings.audioOffset);
            isPlayingRef.current = true;
            if (videoRef.current) {
              videoRef.current.play().catch(err => {
                console.warn('Video failed to start after countdown elapsed:', err);
              });
            }
          }
          return prev - 1;
        });
      }, 700);
      return () => clearTimeout(t);
    }
  }, [showCountdown]);

  // Unified Keyboard processing & Multi-Touch Input Adapter
  useEffect(() => {
    const keyLayout = settings.bindings[beatmap.keyCount] || [];
    const canvas = canvasRef.current;
    
    // Abstract virtual key trigger handlers to share state updates cleanly between physical keys and screen tactile touches
    const virtualKeyDown = (colIndex: number) => {
      if (showCountdown > 0 || isPaused || scoreStateRef.current.failed) return;
      if (colIndex >= 0 && colIndex < beatmap.keyCount && !keysPressedRef.current[colIndex]) {
        keysPressedRef.current[colIndex] = true;
        activeColumnsRef.current[colIndex] = true;
        laneGlowRef.current[colIndex] = 1.0;
        
        mainAudio.playHitsound();
        triggerHitEvent(colIndex);

        if (!replayData) {
          replayFramesRef.current.push({
            time: audioTimeRef.current,
            keysPressed: [...keysPressedRef.current]
          });
        }
      }
    };

    const virtualKeyUp = (colIndex: number) => {
      if (showCountdown > 0 || isPaused || scoreStateRef.current.failed) return;
      if (colIndex >= 0 && colIndex < beatmap.keyCount) {
        keysPressedRef.current[colIndex] = false;
        activeColumnsRef.current[colIndex] = false;
        
        triggerReleaseEvent(colIndex);

        if (!replayData) {
          replayFramesRef.current.push({
            time: audioTimeRef.current,
            keysPressed: [...keysPressedRef.current]
          });
        }
      }
    };

    // 1. Keyboard event parsing listeners
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isFocusMode) {
          // Programmatically exit focus mode which triggers the fullscreen change listener to exit and pause
          FullscreenManager.exitFocusMode();
        } else {
          togglePause();
        }
        return;
      }

      if (replayData) return; // ignore user key taps in replay mode

      const key = e.key.toLowerCase();
      const colIndex = keyLayout.findIndex((k) => k.toLowerCase() === key);
      if (colIndex !== -1) {
        virtualKeyDown(colIndex);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      
      if (replayData) return; // ignore user key taps in replay mode

      const key = e.key.toLowerCase();
      const colIndex = keyLayout.findIndex((k) => k.toLowerCase() === key);
      if (colIndex !== -1) {
        virtualKeyUp(colIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // 2. Tactile multi-touch adapter tracking (touchstart, touchmove, touchend, touchcancel)
    let touchAdapter: TouchInputAdapter | null = null;
    let handleTouchStart: ((e: TouchEvent) => void) | null = null;
    let handleTouchMove: ((e: TouchEvent) => void) | null = null;
    let handleTouchEnd: ((e: TouchEvent) => void) | null = null;
    let handleTouchCancel: ((e: TouchEvent) => void) | null = null;

    if (canvas) {
      touchAdapter = new TouchInputAdapter(virtualKeyDown, virtualKeyUp);

      handleTouchStart = (e: TouchEvent) => {
        if (replayData) return;
        const rect = canvas.getBoundingClientRect();
        touchAdapter?.handleTouchStart(e, rect, beatmap.keyCount);
      };

      handleTouchMove = (e: TouchEvent) => {
        if (replayData) return;
        const rect = canvas.getBoundingClientRect();
        touchAdapter?.handleTouchMove(e, rect, beatmap.keyCount);
      };

      handleTouchEnd = (e: TouchEvent) => {
        if (replayData) return;
        touchAdapter?.handleTouchEnd(e);
      };

      handleTouchCancel = (e: TouchEvent) => {
        if (replayData) return;
        touchAdapter?.handleTouchCancel(e);
      };

      // Register non-passive events to allow explicit preventDefault override inside raw handlers, blocking system browser zooms
      canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
      canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
      canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
      canvas.addEventListener('touchcancel', handleTouchCancel, { passive: false });
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      
      if (canvas) {
        if (handleTouchStart) canvas.removeEventListener('touchstart', handleTouchStart);
        if (handleTouchMove) canvas.removeEventListener('touchmove', handleTouchMove);
        if (handleTouchEnd) canvas.removeEventListener('touchend', handleTouchEnd);
        if (handleTouchCancel) canvas.removeEventListener('touchcancel', handleTouchCancel);
      }
      touchAdapter?.reset();
    };
  }, [beatmap, settings, isPaused, showCountdown, isFocusMode]);

  // Judgement scoring evaluator
  const triggerHitEvent = (colIndex: number) => {
    const playTime = mainAudio.getCurrentTimeMs();
    
    // Check if we are currently in a grace period for a hold note in this column
    const activeHoldAndReleased = notesRef.current.find(
      (n) => n.column === colIndex && n.type === 'hold' && n.isHit && !n.isReleased && !n.isHoldFailed && n.releaseGraceUntil
    );
    if (activeHoldAndReleased) {
      // Re-keying success! Cancel the grace period, visual feedback continues!
      activeHoldAndReleased.releaseGraceUntil = undefined;
      // Spawn small sparks showing active re-key feedback!
      spawnParticles(colIndex, '#22d3ee');
      return; // Handled re-keying successfully, exit.
    }

    // Find earliest unhit note in target column
    const note = notesRef.current.find(
      (n) => n.column === colIndex && !n.isHit && !n.isMissed
    );
    
    if (!note) return;

    // Absolute distance in timeline
    const diff = playTime - note.time;
    const absDiff = Math.abs(diff);

    // The note must fall within the maximum allowable window (Bad/Miss window boundary)
    const maxWindow = judgementWindows[judgementWindows.length - 1].windowMs;
    
    // If the note is too early to even register, disregard inputs
    if (diff < -maxWindow) {
      return; 
    }

    // Assign judgement
    let resolvedJudgement: JudgementWindow = judgementWindows[judgementWindows.length - 1]; // defaults to Miss
    
    // Loop windows to check matching tolerances
    for (const wind of judgementWindows) {
      if (absDiff <= wind.windowMs) {
        resolvedJudgement = wind;
        break;
      }
    }

    if (resolvedJudgement.type !== 'miss') {
      // Registrations
      note.isHit = true;
      note.hitTime = playTime;
      
      applyJudgement(resolvedJudgement, colIndex);

      // Calculate and store Hit Error details for timing feedback meter
      const hitError = playTime - note.time;
      let tickColor = '#3b82f6'; // Default perfect blue
      if (resolvedJudgement.type === 'marvelous' || resolvedJudgement.type === 'perfect') {
        tickColor = '#3b82f6'; // Blue for 300 range (Osu!)
      } else if (resolvedJudgement.type === 'great') {
        tickColor = '#22c55e'; // Green for 100 range
      } else if (resolvedJudgement.type === 'good' || resolvedJudgement.type === 'bad') {
        tickColor = '#ec9a29'; // Orange for 50 range (using high clarity shade)
      }
      
      hitErrorTicksRef.current.push({
        id: Math.random().toString(36).substring(2, 9),
        error: hitError,
        timestamp: Date.now(),
        color: tickColor
      });
      
      // Spawn feedback particles
      spawnParticles(colIndex, resolvedJudgement.color);
      
      // Screen shake for excellent accuracy
      if (resolvedJudgement.type === 'marvelous') {
        screenShakeRef.current = 4;
      }
    }
  };

  const triggerReleaseEvent = (colIndex: number) => {
    const playTime = mainAudio.getCurrentTimeMs();
    
    // Find active hold note currently marked "Hit" but not yet "Released" or "HoldFailed"
    const holdNote = notesRef.current.find(
      (n) => n.column === colIndex && n.type === 'hold' && n.isHit && !n.isReleased && !n.isHoldFailed
    );
    
    if (!holdNote || !holdNote.endTime) return;

    const endDiff = playTime - holdNote.endTime;
    const absEndDiff = Math.abs(endDiff);

    // If released prematurely (more than 181ms before endTime): trigger a grace re-key window
    if (endDiff < -181) {
      holdNote.releaseGraceUntil = playTime + 180; // 180ms grace
      return;
    }

    // Otherwise, they are releasing near the end (normal release window evaluation)
    const greatWindow = greatJudg.windowMs; // Great window is standard lenient boundary for releases
    const missWindow = missJudg.windowMs;

    holdNote.isReleased = true;
    holdNote.releaseTime = playTime;

    if (absEndDiff <= greatWindow) {
      // Beautiful hold completion!
      applyJudgement(marvelousJudg, colIndex); // counts as Marvelous completion!
    } else if (absEndDiff <= missWindow) {
      // Sluggish release
      applyJudgement(goodJudg, colIndex); // counts as Good
    } else {
      // Released way too early or late
      holdNote.isHoldFailed = true;
      applyJudgement(missJudg, colIndex); // Miss
      screenShakeRef.current = 6;
    }
  };

  // Score counter math accumulator
  const applyJudgement = (judg: JudgementWindow, col: number) => {
    const state = scoreStateRef.current;

    // Upgrades
    if (judg.type === 'miss') {
      state.missCount++;
      state.combo = 0;
    } else {
      state.combo++;
      if (state.combo > state.maxCombo) {
        state.maxCombo = state.combo;
      }
      
      if (judg.type === 'marvelous') state.marvelousCount++;
      else if (judg.type === 'perfect') state.perfectCount++;
      else if (judg.type === 'great') state.greatCount++;
      else if (judg.type === 'good') state.goodCount++;
      else if (judg.type === 'bad') state.badCount++;
    }

    // Direct health modifier (Drain scaling factor)
    // OD increases/decreases HP recovery
    let hpMultiplier = beatmap.hpDrainRate > 5 ? 0.8 : 1.2;
    state.hp = Math.max(0, Math.min(100, state.hp + (judg.hpDelta * hpMultiplier)));

    if (state.hp <= 0) {
      state.failed = true;
      isPlayingRef.current = false;
      mainAudio.pause();
    }

    // Formula: Raw score aggregation + accuracy
    // Acc = Weighted average notes hit division
    const totalHits = state.perfectCount + state.marvelousCount + state.greatCount + state.goodCount + state.badCount + state.missCount;
    
    if (totalHits > 0) {
      const weightedSum = 
        state.marvelousCount * 320 +
        state.perfectCount * 300 +
        state.greatCount * 200 +
        state.goodCount * 100 +
        state.badCount * 50;
      const maxPossibleSum = totalHits * 320;
      state.accuracy = parseFloat(((weightedSum / maxPossibleSum) * 100).toFixed(2));
    }

    // Score scales up to 1,000,000 cap points in competitive mania
    const totalCount = notesRef.current.length * 2; // holds have double weighings (hit & release)
    const baseUnit = 1000000 / notesRef.current.length;
    
    // Accumulate actual score points
    let noteScorePoints = 0;
    if (judg.type === 'marvelous') noteScorePoints = baseUnit;
    else if (judg.type === 'perfect') noteScorePoints = baseUnit * 0.95;
    else if (judg.type === 'great') noteScorePoints = baseUnit * 0.7;
    else if (judg.type === 'good') noteScorePoints = baseUnit * 0.4;
    else if (judg.type === 'bad') noteScorePoints = baseUnit * 0.15;
    
    state.score = Math.floor(Math.min(1000000, state.score + noteScorePoints));

    // Update canvas visual trackers
    currentJudgementRef.current = {
      text: judg.name,
      color: judg.color,
      time: Date.now(),
      size: 1.4 // trigger pulse size scaling
    };

    const now = Date.now();
    setUiJudgement({ text: judg.name, color: judg.color, time: now });
    // Clear judgment text overlay after 600ms
    setTimeout(() => {
      setUiJudgement(curr => {
        if (curr && curr.time === now) return null;
        return curr;
      });
    }, 600);

    // Reflect to fast visual UI hooks (triggered carefully)
    setUiScore(state.score);
    setUiCombo(state.combo);
    setUiHp(state.hp);
  };

  // Sparkles particle engine
  const spawnParticles = (colIndex: number, color: string) => {
    if (settings.disableParticles) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const keyCount = beatmap.keyCount;
    let totalWeight = 0;
    for (let i = 0; i < keyCount; i++) {
       let weight = 1.0;
       if (keyCount === 5 && i === 2) weight = 1.35;
       else if (keyCount === 7 && i === 3) weight = 1.35;
       else if (keyCount === 8 && i === 0) weight = 1.4;
       totalWeight += weight;
    }
    const dpr = settings.limitDprToOne ? 1 : Math.min(1.5, window.devicePixelRatio || 1);
    const logicalWidth = canvas.width / dpr;
    const logicalHeight = canvas.height / dpr;
    const baseWidth = logicalWidth / totalWeight;
    const styles = getColumnStyles(keyCount, baseWidth, settings.skinId, settings.customSkinColors);
    
    let spawnX = 0;
    for (let i = 0; i < colIndex; i++) {
      spawnX += styles[i].width;
    }
    spawnX += styles[colIndex].width / 2;
    
    // Receptor positioning depending on scrolling direction settings (upwards vs downwards)
    const receptorY = settings.upsurfaceNoteMode ? 60 : logicalHeight - 155;

    for (let i = 0; i < 18; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      particlesRef.current.push({
        x: spawnX,
        y: receptorY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (settings.upsurfaceNoteMode ? -3 : 3), // rise or fall particle gravity
        size: 3 + Math.random() * 5,
        color,
        alpha: 1.0,
        decay: 0.03 + Math.random() * 0.04
      });
    }
  };

  // Main rendering loop (RequestAnimationFrame)
  useEffect(() => {
    let requestId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high-dpi monitors for pristine retina canvas crispness with performance caps
    const resizeCanvas = () => {
      const container = containerRef.current;
      if (!container || !canvas) return;
      
      const rect = container.getBoundingClientRect();
      const dpr = settings.limitDprToOne ? 1 : Math.min(1.5, window.devicePixelRatio || 1);
      
      // Custom boundary scaling
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Track notes elapsed to trigger automatic Miss judgments
    const checkAutonomousMisses = (currentTime: number) => {
      const missBound = missJudg.windowMs;
      const state = scoreStateRef.current;

      notesRef.current.forEach((n) => {
        // 1. Normal notes missed
        if (!n.isHit && !n.isMissed && currentTime - n.time > missBound) {
          n.isMissed = true;
          applyJudgement(missJudg, n.column);
        }
        
        // 2. Continuous hold note missed intermediate bounds
        if (n.type === 'hold' && n.isHit && !n.isReleased && !n.isHoldFailed && n.endTime) {
          // If in a release grace period and it expired
          if (n.releaseGraceUntil && currentTime > n.releaseGraceUntil) {
            n.isHoldFailed = true;
            n.isReleased = true; // completed with fail
            applyJudgement(missJudg, n.column);
          }
          // Or if reached end without hit or release failure, and time elapsed past miss boundary.
          else if (!n.releaseGraceUntil && currentTime - n.endTime > missBound) {
            n.isHoldFailed = true;
            n.isReleased = true;
            applyJudgement(missJudg, n.column);
          }
        }
      });
    };

    // Canvas Draw Thread
    const render = () => {
      if (!ctx || !canvas) return;

      const dpr = settings.limitDprToOne ? 1 : Math.min(1.5, window.devicePixelRatio || 1);
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      // Clear canvas with elegant translucent dark overlay to shine video/bg background underneath
      ctx.clearRect(0, 0, width, height);
      const shieldDim = settings.backgroundDim !== undefined ? settings.backgroundDim : 0.60;
      ctx.fillStyle = `rgba(0, 0, 0, ${shieldDim})`; // solid black playfield shield
      ctx.fillRect(0, 0, width, height);

      // Render countdown overlays
      if (showCountdown > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(5,5,5,0.75)';
        ctx.fillRect(0, 0, width, height);
        
        ctx.font = '700 96px system-ui, -apple-system';
        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Pulse effects on numbers
        const clockBeat = (Date.now() % 700) / 700;
        const countScale = 1.0 + Math.sin(clockBeat * Math.PI) * 0.15;
        
        ctx.translate(width / 2, height / 2);
        ctx.scale(countScale, countScale);
        ctx.fillText(showCountdown.toString(), 0, 0);
        ctx.restore();
      }

      // Smoothly slide the rendering offset towards the actual audioOffset to prevent note visual teleportations mid-flight:
      smoothOffsetRef.current += (settings.audioOffset - smoothOffsetRef.current) * 0.08;

      const rawSongTime = mainAudio.getCurrentTimeMs();
      const offsetDiff = settings.audioOffset - smoothOffsetRef.current;
      const songTime = rawSongTime + offsetDiff;
      audioTimeRef.current = songTime;

      // Replay simulation playback
      if (replayData && replayData.length > 0 && isPlayingRef.current && !isPaused && showCountdown === 0) {
        const lastReplayTime = lastProcessedReplayTimeRef.current;
        if (lastReplayTime === -1) {
          lastProcessedReplayTimeRef.current = songTime;
        } else {
          const framesToProcess = replayData.filter(f => f.time > lastReplayTime && f.time <= songTime);
          if (framesToProcess.length > 0) {
            framesToProcess.forEach(frame => {
              for (let col = 0; col < beatmap.keyCount; col++) {
                const wasPressed = keysPressedRef.current[col];
                const isCurrentlyPressed = frame.keysPressed[col];
                
                if (!wasPressed && isCurrentlyPressed) {
                  keysPressedRef.current[col] = true;
                  activeColumnsRef.current[col] = true;
                  laneGlowRef.current[col] = 1.0;
                  mainAudio.playHitsound();
                  triggerHitEvent(col);
                } else if (wasPressed && !isCurrentlyPressed) {
                  keysPressedRef.current[col] = false;
                  activeColumnsRef.current[col] = false;
                  triggerReleaseEvent(col);
                }
              }
            });
          }
          lastProcessedReplayTimeRef.current = songTime;
        }
      }

      if (isPlayingRef.current && !isPaused && showCountdown === 0) {
        checkAutonomousMisses(songTime);
        
        // Throttled Video - Audio Sync alignment check via PLL VideoSyncController
        if (videoRef.current) {
          if (!syncControllerRef.current) {
            syncControllerRef.current = new VideoSyncController(
              videoRef.current,
              () => audioTimeRef.current,
              beatmap.videoStartTime || 0,
              settings
            );
          }
          try {
            syncControllerRef.current.update();
          } catch (e) {
            // Fail-safe warnings ignored safely
          }
        }
      } else if (videoRef.current) {
        // Paused or count down: keep video matched to start or paused
        try {
          if (!videoRef.current.paused) {
            videoRef.current.pause();
          }
        } catch (e) {}
      }

      // 1. Apply visual screen shake matrix
      ctx.save();
      if (screenShakeRef.current > 0) {
        const shakeX = (Math.random() - 0.5) * screenShakeRef.current;
        const shakeY = (Math.random() - 0.5) * screenShakeRef.current;
        ctx.translate(shakeX, shakeY);
        screenShakeRef.current *= 0.9; // decay shake force
        if (screenShakeRef.current < 0.1) screenShakeRef.current = 0;
      }

      // 1. Calculate symmetrical lane widths and cumulative X-coordinates
      const keyCount = beatmap.keyCount;
      let totalWeight = 0;
      for (let i = 0; i < keyCount; i++) {
        let weight = 1.0;
        if (keyCount === 5 && i === 2) weight = 1.35;
        else if (keyCount === 7 && i === 3) weight = 1.35;
        else if (keyCount === 8 && i === 0) weight = 1.4;
        totalWeight += weight;
      }
      const baseWidth = width / totalWeight;
      const colStyles = getColumnStyles(keyCount, baseWidth, settings.skinId, settings.customSkinColors);

      const colX: number[] = [];
      let accumulatedX = 0;
      for (let i = 0; i < keyCount; i++) {
        colX.push(accumulatedX);
        accumulatedX += colStyles[i].width;
      }

      const receptorY = settings.upsurfaceNoteMode ? 60 : height - 155;

      // Draw lane background rails & column glows
      for (let i = 0; i < keyCount; i++) {
        const xPos = colX[i];
        const colW = colStyles[i].width;

        // Subtle lane background separators
        ctx.strokeStyle = `rgba(71,85,105,${settings.laneSeparatorOpacity ?? 0.30})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(xPos, 0);
        ctx.lineTo(xPos, height);
        ctx.stroke();

        // Lane-pressed glowing flashes
        if (laneGlowRef.current[i] > 0) {
          const glowGrad = ctx.createLinearGradient(
            xPos, 
            settings.upsurfaceNoteMode ? 0 : height, 
            xPos, 
            receptorY
          );
          
          glowGrad.addColorStop(0, `rgba(59,130,246,${laneGlowRef.current[i] * 0.3})`);
          glowGrad.addColorStop(1, 'rgba(59,130,246,0)');
          
          ctx.fillStyle = glowGrad;
          ctx.fillRect(xPos, settings.upsurfaceNoteMode ? 0 : receptorY, colW, settings.upsurfaceNoteMode ? receptorY : height - receptorY);
          
          laneGlowRef.current[i] *= 0.88; // decay lane glows
        }
      }

      // Last border outline
      ctx.strokeStyle = `rgba(71,85,105,${(settings.laneSeparatorOpacity ?? 0.30) * 1.5})`;
      ctx.strokeRect(0, 0, width, height);

      // 2. DRAW NOTE PATH CONNECTORS (HOLD NOTE CLIPS AND EXTENSIONS)
      const travelDistance = settings.upsurfaceNoteMode ? (height - receptorY) : receptorY;
      const scrollTimeMs = 1100 - settings.scrollSpeed * 25;
      const speedFactor = travelDistance / scrollTimeMs;
      
      const visualTime = songTime - (settings.visualOffset || 0);

      notesRef.current.forEach((n) => {
        if (n.isMissed && !n.isHit) return;

        let startY = 0;
        let endY = 0;

        if (settings.upsurfaceNoteMode) {
          startY = receptorY + (n.time - visualTime) * speedFactor;
          if (n.endTime) endY = receptorY + (n.endTime - visualTime) * speedFactor;
        } else {
          startY = receptorY - (n.time - visualTime) * speedFactor;
          if (n.endTime) endY = receptorY - (n.endTime - visualTime) * speedFactor;
        }

        // Draw long holds bodies
        if (n.type === 'hold' && n.endTime) {
          const xPos = colX[n.column];
          const colW = colStyles[n.column].width;
          
          let visualStartY = startY;
          if (n.isHit && !n.isReleased && !n.isHoldFailed) {
            visualStartY = receptorY;
          }

          const isOff = settings.upsurfaceNoteMode 
            ? (endY < receptorY && visualStartY < receptorY && n.isReleased)
            : (endY > receptorY && visualStartY > receptorY && n.isReleased);

          if (!isOff) {
            const clipHeight = visualStartY - endY;
            
            ctx.save();
            ctx.globalAlpha = settings.noteOpacity ?? 1.0;
            const holdGrad = ctx.createLinearGradient(xPos, visualStartY, xPos, endY);
            
            const customHoldColor = (settings.skinId === 'custom' && settings.customSkinColors && settings.customSkinColors[4])
              ? settings.customSkinColors[4]
              : '#38bdf8';

            if (n.isHit && !n.isReleased) {
              if (n.releaseGraceUntil) {
                const flicker = (Math.floor(Date.now() / 40) % 2 === 0);
                holdGrad.addColorStop(0, flicker ? 'rgba(234,179,8,0.75)' : 'rgba(234,179,8,0.2)');
                holdGrad.addColorStop(1, 'rgba(161,117,14,0.3)');
              } else {
                holdGrad.addColorStop(0, settings.skinId === 'custom' ? hexToRgba(customHoldColor, 0.8) : 'rgba(34,211,238,0.7)');
                holdGrad.addColorStop(1, settings.skinId === 'custom' ? hexToRgba(customHoldColor, 0.3) : 'rgba(59,130,246,0.3)');
              }
            } else if (n.isHoldFailed) {
              holdGrad.addColorStop(0, 'rgba(100,116,139,0.3)');
              holdGrad.addColorStop(1, 'rgba(71,85,105,0.1)');
            } else {
              holdGrad.addColorStop(0, settings.skinId === 'custom' ? hexToRgba(customHoldColor, 0.6) : 'rgba(59,130,246,0.5)');
              holdGrad.addColorStop(1, settings.skinId === 'custom' ? hexToRgba(customHoldColor, 0.2) : 'rgba(56,189,248,0.2)');
            }
            
            ctx.fillStyle = holdGrad;
            
            const padding = isFocusMode ? 3 : 12;
            const rx = xPos + padding;
            const ry = Math.min(visualStartY, endY);
            const rw = colW - padding * 2;
            const rh = Math.abs(clipHeight);
            
            ctx.beginPath();
            const nStyle = settings.noteStyle || 'rounded';
            const isCircleMode = settings.playfieldStyle === 'circle' || 
                                 settings.skinId === 'circles' || 
                                 settings.skinId === 'glassy-spheres' || 
                                 settings.skinId === 'hollow-rings';
            if (nStyle === 'square') {
              ctx.rect(rx, ry, rw, rh);
            } else if (nStyle === 'circle' || nStyle === 'pill') {
              ctx.roundRect(rx, ry, rw, rh, rw / 2);
            } else {
              if (isCircleMode) {
                ctx.roundRect(rx, ry, rw, rh, rw / 2); // Pill-style capsules
              } else if (settings.skinId === 'classic-bar' || settings.skinId === 'minimalist') {
                ctx.rect(rx, ry, rw, rh); // Pure flat rectangles
              } else {
                ctx.roundRect(rx, ry, rw, rh, 6);
              }
            }
            ctx.fill();
            
            ctx.strokeStyle = n.isHit && !n.isReleased 
              ? (n.releaseGraceUntil ? '#eab308' : '#22d3ee') 
              : 'rgba(56,189,248,0.4)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(xPos + colW / 2, visualStartY);
            ctx.lineTo(xPos + colW / 2, endY);
            ctx.stroke();
            
            ctx.restore();
          }
        }
      });

      // 3. DRAW NOTES INDIVIDUAL BODIES
      notesRef.current.forEach((n) => {
        if (n.isHit && n.type === 'normal') return;
        if (n.isMissed) return;

        let noteY = 0;
        if (settings.upsurfaceNoteMode) {
          noteY = receptorY + (n.time - visualTime) * speedFactor;
        } else {
          noteY = receptorY - (n.time - visualTime) * speedFactor;
        }

        const padding = 60;
        if (noteY < -padding || noteY > height + padding) return;

        const xPos = colX[n.column];
        const colW = colStyles[n.column].width;
        const notePadding = isFocusMode ? 1.5 : 6;
        const rx = xPos + notePadding;
        const ry = noteY - 10;
        const rw = colW - notePadding * 2;
        const rh = 20;

        ctx.save();
        ctx.globalAlpha = settings.noteOpacity ?? 1.0;
        
        // Define a local helper to enforce custom note rounding overrides
        const drawNoteShape = (radiusDefault: number) => {
          ctx.beginPath();
          const nStyle = settings.noteStyle || 'rounded';
          if (nStyle === 'square') {
            ctx.rect(rx, ry, rw, rh);
          } else if (nStyle === 'circle' || nStyle === 'pill') {
            ctx.roundRect(rx, ry, rw, rh, rh / 2);
          } else {
            ctx.roundRect(rx, ry, rw, rh, radiusDefault);
          }
        };

        let noteFill: string = '';
        let noteStroke: string = colStyles[n.column].color;

        if (n.type === 'hold') {
          const holdCol = (settings.skinId === 'custom' && settings.customSkinColors && settings.customSkinColors[4])
            ? settings.customSkinColors[4]
            : (settings.skinId === 'cyberpunk' ? '#eab308' : '#ec4899');
          noteFill = holdCol;
          noteStroke = settings.skinId === 'custom' ? '#ffffff' : (settings.skinId === 'cyberpunk' ? '#fef08a' : '#fbcfe8');
        } else {
          noteFill = colStyles[n.column].color;
          if (settings.skinId === 'custom') {
            noteStroke = '#ffffff';
          } else if (noteFill === '#eceff1') noteStroke = '#cbd5e1';
          else if (noteFill === '#2e6b9e') noteStroke = '#93c5fd';
          else if (noteFill === '#d32f2f') noteStroke = '#fecdd3';
          else if (noteFill === '#00b0ff') noteStroke = '#e0f7fa';
          else noteStroke = '#94a3b8';
        }

        // Apply skin theme aesthetic note gradients
        const grad = ctx.createLinearGradient(rx, ry, rx, ry + rh);
        if (settings.skinId === 'minimalist') {
          ctx.fillStyle = noteFill;
          ctx.strokeStyle = noteStroke;
          ctx.lineWidth = 2;
          
          drawNoteShape(3);
          ctx.fill();
          ctx.stroke();
        } else if (settings.skinId === 'classic-bar') {
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.35, noteFill);
          grad.addColorStop(1, 'rgba(8, 8, 12, 0.9)');
          ctx.fillStyle = grad;
          ctx.strokeStyle = noteStroke;
          ctx.lineWidth = 1.5;

          drawNoteShape(0); // 0 means square if standard
          ctx.fill();
          ctx.stroke();

          // Authentic white target stripe
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(rx, ry + rh / 2 - 1.5, rw, 3);
        } else if (settings.playfieldStyle === 'circle' || settings.skinId === 'circles' || settings.skinId === 'glassy-spheres' || settings.skinId === 'hollow-rings') {
          const effectiveStyle = settings.circleRenderStyle || 
                                 ((settings.skinId === 'glassy-spheres' || settings.skinId === 'hollow-rings') 
                                   ? settings.skinId 
                                   : 'circles');
          
          if (effectiveStyle === 'glassy-spheres') {
            const cx = rx + rw / 2;
            const cy = ry + rh / 2;
            const r = (Math.min(rw - 2, 28) / 2) * (settings.noteSizeMultiplier ?? 1.0);

            const sphereColor = colStyles[n.column].color;

            ctx.shadowColor = sphereColor;
            ctx.shadowBlur = 8;
            
            const sphereGrad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, 0, cx, cy, r);
            sphereGrad.addColorStop(0, '#ffffff');
            sphereGrad.addColorStop(0.25, hexToRgba(sphereColor, 0.9)); 
            sphereGrad.addColorStop(0.8, hexToRgba(sphereColor, 0.55));
            sphereGrad.addColorStop(1, '#050510');
            
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = sphereGrad;
            ctx.fill();
            
            ctx.shadowBlur = 0;

            const sheenGrad = ctx.createLinearGradient(cx, cy - r * 0.8, cx, cy);
            sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
            sheenGrad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
            
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(cx - r * 0.1, cy - r * 0.35, r * 0.5, r * 0.25, -Math.PI / 8, 0, Math.PI * 2);
            ctx.fillStyle = sheenGrad;
            ctx.fill();
            ctx.restore();

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
          } else if (effectiveStyle === 'hollow-rings') {
            const cx = rx + rw / 2;
            const cy = ry + rh / 2;
            const r = (Math.min(rw - 2, 28) / 2) * (settings.noteSizeMultiplier ?? 1.0);

            const noteColor = colStyles[n.column].color;

            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = noteColor;
            ctx.fill();
            
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.8;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.25, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.fill();
          } else {
            // Default osu!mania Circles
            const cx = rx + rw / 2;
            const cy = ry + rh / 2;
            const r = (Math.min(rw - 2, 24) / 2) * (settings.noteSizeMultiplier ?? 1.0);

            const circleGrad = ctx.createRadialGradient(cx - r * 0.15, cy - r * 0.15, 0, cx, cy, r);
            circleGrad.addColorStop(0, '#ffffff');
            circleGrad.addColorStop(0.25, noteStroke);
            circleGrad.addColorStop(0.6, noteFill);
            circleGrad.addColorStop(1, 'rgba(0,0,0,0.85)');

            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = circleGrad;
            ctx.fill();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.3;
            ctx.stroke();

            // Dynamic center bead glow
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.25, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          // Default Neon and Cyberpunk flows
          grad.addColorStop(0, noteStroke);
          grad.addColorStop(0.3, noteFill);
          if (settings.skinId === 'cyberpunk') {
            grad.addColorStop(0.85, 'rgba(15, 23, 42, 0.95)');
          } else {
            grad.addColorStop(1, 'rgba(15,23,42,0.85)');
          }

          ctx.fillStyle = grad;
          ctx.strokeStyle = noteStroke;
          ctx.lineWidth = 1.5;
          
          drawNoteShape(5);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(rx + 4, ry + 4, rw - 8, 3);
        }

        ctx.restore();
      });

      // 4. DRAW GAMEPLAY RECEPTOR BUTTONS (HIT LINE INDICATION)
      const isMobileDevice = typeof window !== 'undefined' && (
        window.innerWidth <= 1024 && (
          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
          window.innerWidth <= 768 ||
          window.innerHeight < 500
        )
      );

      // On mobile standard view, highlight the bottom 40% tap zone with a highly subtle glassmorphism hint
      if (isMobileDevice && !isFocusMode) {
        const hitZoneTop = height * 0.60;
        ctx.save();
        
        // 1. Draw ultra subtle glassmorphism backing (keeps incoming notes fully visible)
        const fillGrad = ctx.createLinearGradient(0, hitZoneTop, 0, height);
        fillGrad.addColorStop(0, 'rgba(8, 8, 12, 0.12)');
        fillGrad.addColorStop(1, 'rgba(5, 5, 8, 0.35)');
        ctx.fillStyle = fillGrad;
        ctx.fillRect(0, hitZoneTop, width, height - hitZoneTop);
        
        // 2. Draw neat, extremely subtle neon-cyan threshold separator line at the 60% mark
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, hitZoneTop);
        ctx.lineTo(width, hitZoneTop);
        ctx.stroke();

        // 3. Draw lane separators in the touch zone for clear finger positioning
        for (let i = 1; i < keyCount; i++) {
          const xPos = colX[i];
          ctx.strokeStyle = 'rgba(71, 85, 105, 0.1)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(xPos, hitZoneTop);
          ctx.lineTo(xPos, height);
          ctx.stroke();
        }

        ctx.restore();
      }

      // Draw beautiful, highly visible receptors (the landing "base") for all columns
      for (let i = 0; i < keyCount; i++) {
        const xPos = colX[i];
        const colW = colStyles[i].width;
        const isPressed = activeColumnsRef.current[i];
        const rcColor = colStyles[i].color;

        ctx.save();
        ctx.globalAlpha = settings.receptorOpacity ?? 1.0;

        {
          // Standard or selected receptor style block
          const rStyle = settings.receptorStyle || 'tactile';
          
          const isCircleMode = settings.playfieldStyle === 'circle' || 
                               settings.skinId === 'circles' || 
                               settings.skinId === 'glassy-spheres' || 
                               settings.skinId === 'hollow-rings';

          if (isCircleMode) {
            const effectiveStyle = settings.circleRenderStyle || 
                                   ((settings.skinId === 'glassy-spheres' || settings.skinId === 'hollow-rings') 
                                     ? settings.skinId 
                                     : 'circles');
            
            const cx = xPos + colW / 2;
            const cy = receptorY;
            const r = (Math.min(colW - 8, 28) / 2) * (settings.circleSize ?? 1.0);

            if (effectiveStyle === 'glassy-spheres') {
              if (isPressed) {
                const bloomGrad = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
                bloomGrad.addColorStop(0, '#ffffff');
                bloomGrad.addColorStop(0.3, hexToRgba(rcColor, 0.9));
                bloomGrad.addColorStop(0.8, hexToRgba(rcColor, 0.4));
                bloomGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = bloomGrad;
                ctx.beginPath();
                ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.stroke();
              } else {
                const baseGrad = ctx.createRadialGradient(cx - r*0.1, cy - r*0.1, 1, cx, cy, r);
                baseGrad.addColorStop(0, '#1e293b');
                baseGrad.addColorStop(0.7, '#0f172a');
                baseGrad.addColorStop(1, '#020617');
                ctx.fillStyle = baseGrad;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.lineWidth = 1.8;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.stroke();
              }
            } else if (effectiveStyle === 'hollow-rings') {
              if (isPressed) {
                ctx.fillStyle = rcColor;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.stroke();

                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
                ctx.fill();
              } else {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.setLineDash([4, 3]);
                ctx.stroke();
                ctx.setLineDash([]);
                
                ctx.fillStyle = 'rgba(15, 23, 42, 0.15)';
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();
              }
            } else {
              // Classic circles
              if (isPressed) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 3;
                ctx.fillStyle = rcColor;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // Feedback inner bead
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
                ctx.fill();
              } else {
                ctx.strokeStyle = hexToRgba(rcColor, 0.7);
                ctx.lineWidth = 1.8;
                ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // Physical center small indicator
                ctx.fillStyle = hexToRgba(rcColor, 0.4);
                ctx.beginPath();
                ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          } else if (rStyle === 'minimal') {
            // ==================== PIANO SEGMENT STYLE ====================
            const rx = xPos + 1;
            const ry = receptorY - 5;
            const rw = colW - 2;
            const rh = 10;

            ctx.fillStyle = isPressed 
              ? 'rgba(255, 255, 255, 0.9)' 
              : hexToRgba(rcColor, 0.15);
            
            ctx.beginPath();
            ctx.roundRect(rx, ry, rw, rh, 3);
            ctx.fill();

            ctx.strokeStyle = isPressed 
              ? '#ffffff' 
              : hexToRgba(rcColor, 0.35);
            ctx.lineWidth = isPressed ? 2.5 : 1.2;
            ctx.stroke();

          } else if (rStyle === 'square') {
            // ==================== SOLID SQUARE STYLE ====================
            const rx = xPos + 4;
            const ry = receptorY - 14;
            const rw = colW - 8;
            const rh = 28;

            ctx.strokeStyle = isPressed ? '#ffffff' : hexToRgba(rcColor, 0.9);
            ctx.lineWidth = isPressed ? 4.0 : 2;
            ctx.fillStyle = isPressed ? hexToRgba(rcColor, 0.6) : 'rgba(10, 10, 15, 0.95)';

            ctx.beginPath();
            ctx.rect(rx, ry, rw, rh); // Pure rigid sharp box
            ctx.fill();
            ctx.stroke();

            // Physical Center feedback square
            ctx.fillStyle = isPressed ? '#ffffff' : rcColor;
            ctx.fillRect(xPos + colW / 2 - (isPressed ? 6 : 4), receptorY - (isPressed ? 6 : 4), isPressed ? 12 : 8, isPressed ? 12 : 8);

          } else if (rStyle === 'translucent') {
            // ==================== TRANSLUCENT GLOW STYLE ====================
            const rx = xPos + 6;
            const ry = receptorY - 14;
            const rw = colW - 12;
            const rh = 28;

            ctx.strokeStyle = isPressed ? '#ffffff' : hexToRgba(rcColor, 0.6);
            ctx.lineWidth = isPressed ? 3.0 : 1.5;
            ctx.fillStyle = isPressed ? hexToRgba(rcColor, 0.35) : 'rgba(255, 255, 255, 0.05)';

            ctx.beginPath();
            ctx.roundRect(rx, ry, rw, rh, 8);
            ctx.fill();
            ctx.stroke();

            // Elegant neon thin glow circle in the middle
            ctx.strokeStyle = isPressed ? '#ffffff' : rcColor;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(xPos + colW / 2, receptorY, isPressed ? 7 : 5, 0, Math.PI * 2);
            ctx.stroke();

          } else {
            // ==================== TACTILE CLASSIC GLASS (DEFAULT) ====================
            const rx = xPos + 6;
            const ry = receptorY - 14;
            const rw = colW - 12;
            const rh = 28;

            ctx.strokeStyle = isPressed ? '#ffffff' : hexToRgba(rcColor, 0.85);
            ctx.lineWidth = isPressed ? 3.5 : 2;
            ctx.fillStyle = isPressed ? hexToRgba(rcColor, 0.45) : 'rgba(15, 23, 42, 0.85)';

            ctx.beginPath();
            ctx.roundRect(rx, ry, rw, rh, 6);
            ctx.fill();
            ctx.stroke();

            // Physical Center feedback dot
            ctx.fillStyle = isPressed ? '#ffffff' : rcColor;
            ctx.beginPath();
            ctx.arc(xPos + colW / 2, receptorY, isPressed ? 5.5 : 3.5, 0, Math.PI * 2);
            ctx.fill();
          }

          // Draw binding character labels underneath each receptor button (PC and Mobile standard layout)
          const layoutKeys = settings.bindings[keyCount];
          if (!isFocusMode && layoutKeys && layoutKeys[i]) {
            ctx.font = '700 11px font-mono, JetBrains Mono, monospace';
            ctx.fillStyle = isPressed ? '#ffffff' : '#94a3b8';
            ctx.textAlign = 'center';
            ctx.fillText(
              layoutKeys[i].toUpperCase(), 
              xPos + colW / 2, 
              settings.upsurfaceNoteMode ? receptorY - 22 : receptorY + 28
            );
          }
        }

        ctx.restore();
      }

      // 5. RENDER PARTICLES BURST GENERATION
      if (!settings.disableParticles) {
        particlesRef.current = particlesRef.current.filter((p) => {
          p.x += p.vx;
          p.y += p.vy;
          p.alpha -= p.decay;
          
          if (p.alpha <= 0) {
            return false;
          }

          ctx.save();
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.alpha;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          return true;
        });
      } else if (particlesRef.current.length > 0) {
        particlesRef.current = [];
      }

      // 6. DRAW PLAYTIME ELAPSED TIMING BAR AND COMBOS
      ctx.restore(); // POP screen shake translations

      // ==================== 5.5 DRAW TIMING (HIT ERROR) METER ====================
      const maxMs = 150; // Max visible millisecond timing boundary
      const barWidth = 300; // Bar horizontal length in pixels (increased from 180 for higher timing visibility)
      const barHeight = 8; // Bar vertical height
      
      const centerX = width / 2;
      const barY = settings.upsurfaceNoteMode ? receptorY - 55 : receptorY + 55;
      
      ctx.save();
      
      // Draw bar container background
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)'; // Slate 900 tint
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.beginPath();
      ctx.roundRect(centerX - barWidth / 2, barY, barWidth, barHeight, 4);
      ctx.fill();
      ctx.stroke();

      // Render judgment color regions
      const orangeColor = 'rgba(236, 154, 41, 0.35)'; // Good / Bad regions (50-range)
      const greenColor = 'rgba(34, 197, 94, 0.5)';    // Great region (100-range)
      const blueColor = 'rgba(59, 130, 246, 0.7)';     // Marvelous & Perfect regions (300-range)
      
      // 1. Bad window region (Orange)
      const badWin = badJudg.windowMs;
      const badX1 = centerX - (badWin / maxMs) * (barWidth / 2);
      const badX2 = centerX + (badWin / maxMs) * (barWidth / 2);
      ctx.fillStyle = orangeColor;
      ctx.fillRect(badX1, barY, badX2 - badX1, barHeight);
      
      // 2. Great window region (Green)
      const greatWin = greatJudg.windowMs;
      const greatX1 = centerX - (greatWin / maxMs) * (barWidth / 2);
      const greatX2 = centerX + (greatWin / maxMs) * (barWidth / 2);
      ctx.fillStyle = greenColor;
      ctx.fillRect(greatX1, barY, greatX2 - greatX1, barHeight);
      
      // 3. Perfect region (Blue)
      const perfectWin = perfectJudg.windowMs;
      const perfectX1 = centerX - (perfectWin / maxMs) * (barWidth / 2);
      const perfectX2 = centerX + (perfectWin / maxMs) * (barWidth / 2);
      ctx.fillStyle = blueColor;
      ctx.fillRect(perfectX1, barY, perfectX2 - perfectX1, barHeight);

      // Centered perfect line (0ms mark)
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(centerX, barY - 3);
      ctx.lineTo(centerX, barY + barHeight + 3);
      ctx.stroke();

      // Render fading active hit ticks
      const currentTimeScale = Date.now();
      hitErrorTicksRef.current = hitErrorTicksRef.current.filter(t => currentTimeScale - t.timestamp < 2000);
      
      hitErrorTicksRef.current.forEach(t => {
        const age = currentTimeScale - t.timestamp;
        const tickAlpha = Math.max(0, 1 - age / 2000);
        
        const clampedError = Math.max(-maxMs, Math.min(maxMs, t.error));
        const tickX = centerX + (clampedError / maxMs) * (barWidth / 2);
        
        ctx.save();
        ctx.globalAlpha = tickAlpha;
        ctx.strokeStyle = t.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tickX, barY - 2);
        ctx.lineTo(tickX, barY + barHeight + 2);
        ctx.stroke();
        ctx.restore();
      });

      // Render simple rolling average white indicator arrow pointer
      const avgErrorValues = hitErrorTicksRef.current.slice(-30).map(t => t.error);
      if (avgErrorValues.length > 0) {
        const avgError = avgErrorValues.reduce((s, v) => s + v, 0) / avgErrorValues.length;
        const clampedAvg = Math.max(-maxMs, Math.min(maxMs, avgError));
        const avgX = centerX + (clampedAvg / maxMs) * (barWidth / 2);
        
        // Draw white arrow head pointing down
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1;
        
        ctx.beginPath();
        ctx.moveTo(avgX, barY - 1);
        ctx.lineTo(avgX - 4, barY - 7);
        ctx.lineTo(avgX + 4, barY - 7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Intersecting fine line inside track
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(avgX, barY - 1);
        ctx.lineTo(avgX, barY + barHeight + 1);
        ctx.stroke();
      }
      
      ctx.restore();

      // Check if song completed naturally or run loops
      const songDurationMs = beatmap.duration * 1000;
      if (songTime >= songDurationMs && !scoreStateRef.current.completed && isPlayingRef.current) {
        scoreStateRef.current.completed = true;
        isPlayingRef.current = false;
        mainAudio.stop();
        
        setTimeout(() => {
          onFinish(scoreStateRef.current, replayFramesRef.current);
        }, 1200);
      }

      if (isPlayingRef.current && !isPaused) {
        requestId = requestAnimationFrame(render);
        animationFrameRef.current = requestId;
      }
    };

    // Begin looping
    if (isPlayingRef.current && !isPaused) {
      requestId = requestAnimationFrame(render);
      animationFrameRef.current = requestId;
    } else {
      render(); // Single tick render on draw pause state
    }

    return () => {
      cancelAnimationFrame(requestId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [beatmap, settings, isPaused, showCountdown]);

  // Pause / Resume Handlers
  const pauseGameplay = () => {
    if (showCountdown > 0 || scoreStateRef.current.failed || isPaused) return;
    setIsPaused(true);
    isPlayingRef.current = false;
    mainAudio.pause();
    if (videoRef.current) {
      try { videoRef.current.pause(); } catch (e) {}
    }
  };

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        pauseGameplay();
      }
    };
    const handleBlur = () => {
      pauseGameplay();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
    };
  }, [isPaused, showCountdown]);

  const togglePause = () => {
    if (showCountdown > 0 || scoreStateRef.current.failed) return;
    
    if (isPaused) {
      lastProcessedReplayTimeRef.current = -1;
      setIsPaused(false);
      isPlayingRef.current = true;
      mainAudio.play(beatmap.bpm, settings.audioOffset);
      if (videoRef.current) {
        videoRef.current.play().catch(err => {
          console.warn('Video failed to play on resume:', err instanceof Error ? err.message : String(err));
        });
      }
    } else {
      setIsPaused(true);
      isPlayingRef.current = false;
      mainAudio.pause();
      if (videoRef.current) {
        try { videoRef.current.pause(); } catch (e) {}
      }
    }
  };

  const restartMap = () => {
    mainAudio.stop();
    initializeGameplay();
  };

  // Safe loader state checking
  if (!isAudioLoaded) {
    return (
      <div id="gameplay-loader" className="flex flex-col items-center justify-center min-h-[500px] h-full bg-slate-950 text-slate-100 p-8 rounded-2xl border border-slate-800 shadow-2xl">
        <div className="relative flex items-center justify-center p-6 bg-slate-900 rounded-full mb-6 border border-slate-700/50 shadow-inner">
          <Volume2 className="h-12 w-12 text-cyan-400 animate-pulse" />
          <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400/10 animate-ping" />
        </div>
        <h3 className="text-xl font-bold font-sans tracking-tight mb-2">Syncing Timing Windows...</h3>
        <p className="text-sm text-slate-400 font-mono tracking-wide max-w-sm text-center mb-6">
          Initializing latency compensators and calibration offsets
        </p>
        
        <div className="w-full max-w-xs bg-slate-900 h-2.5 rounded-full overflow-hidden border border-slate-800">
          <div 
            className="bg-cyan-400 h-full rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(34,211,238,0.5)]"
            style={{ width: `${loadingAudioProgress}%` }}
          />
        </div>
        <span className="text-xs text-slate-500 font-mono mt-2">{loadingAudioProgress}% loaded</span>
      </div>
    );
  }

  return (
    <div 
      id="gameplay-container" 
      className={`flex flex-col lg:flex-row gap-6 w-full mx-auto h-full transition-all duration-300 ${
        isFocusMode ? 'max-w-none justify-center items-center h-screen bg-[#050508] p-0 gap-0' : 'max-w-7xl p-2 lg:p-4'
      }`}
    >
      {/* 1. PRIMARY GAMEPLAY HIGH-PERFORMANCE CANVAS VIEWPORT */}
      <div 
        className={`flex-1 flex flex-col items-center relative bg-slate-950 transition-all duration-300 ${
          isFocusMode ? 'w-full max-w-4xl h-screen rounded-none border-none shadow-none' : 'rounded-2xl border border-slate-800/80 h-[calc(100vh-170px)] min-h-[500px] lg:h-[750px] shadow-2xl'
        }`}
      >
        {/* FLOATING REAL-TIME CALIBRATION HUD TOAST */}
        {showOffsetNotification && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-25 bg-slate-950/95 border border-cyan-500/65 shadow-[0_0_20px_rgba(34,211,238,0.3)] text-cyan-400 font-mono text-xs font-black uppercase tracking-widest px-5 py-2.5 rounded-full flex items-center gap-3 transition-all">
            <span className="animate-pulse">● LATENCY ADJUSTED</span>
            <span className="text-white bg-slate-900 border border-slate-700 px-2 py-0.5 rounded-md">
              {settings.audioOffset > 0 ? `+${settings.audioOffset}` : settings.audioOffset}ms
            </span>
          </div>
        )}

        {showKeycountWarning && (
          <div className="absolute top-24 left-4 right-4 z-40 bg-amber-950/95 border border-amber-500/50 p-4 rounded-xl flex flex-col gap-2 shadow-2xl animate-fade-in text-xs font-sans max-w-sm backdrop-blur-md">
            <div className="flex justify-between items-center text-amber-400 font-bold uppercase tracking-wider">
              <span>⚠️ CROWDED SCREEN ADVISORY</span>
              <button 
                onClick={() => setShowKeycountWarning(false)}
                className="text-amber-500 hover:text-amber-350 font-mono text-base px-2 leading-none font-bold cursor-pointer"
              >
                ×
              </button>
            </div>
            <p className="text-slate-350 leading-relaxed">
              Placing <strong>{beatmap.keyCount} columns</strong> on a mobile screen makes touch columns very thin. We highly recommend playing in <strong>4K or 5K mode</strong> for a tactile mobile layout!
            </p>
            <button 
              onClick={() => setShowKeycountWarning(false)}
              className="mt-1 self-end py-1 px-3 bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-black uppercase tracking-wider rounded transition cursor-pointer"
            >
              Dismiss Notice
            </button>
          </div>
        )}

        {/* PIPELINE DIAGNOSTICS & WARNING HUD PANEL */}
        {(isPlayingFallback || isVideoMissing || isVideoError) && (
          <div className="absolute top-24 right-4 bg-red-950/85 border border-red-500/35 p-3 rounded-lg text-[10px] font-mono text-rose-250 z-50 max-w-xs shadow-2xl animate-fade-in backdrop-blur-sm">
            <h4 className="font-bold mb-1 text-red-400 uppercase tracking-widest flex items-center gap-1.5 text-[10px]">
              <span>⚠️</span> PIPELINE DIAGNOSTICS
            </h4>
            <div className="space-y-1 text-red-200">
              {isPlayingFallback && <p className="font-bold text-red-400">⚠️ PIPELINE DIAGNOSTICS: Audio failed to decode. PLEASE RELOAD THE BROWSER TO RESOLVE.</p>}
              {isVideoMissing && <p>• Video declared in metadata but missing in file archive.</p>}
              {isVideoError && <p>• Video decoding error: Browser unsupported codec handle.</p>}
            </div>
          </div>
        )}
        {/* TOP STATUS BAR: DYNAMIC HIGH-CONTRAST ACCURACY / CONTROLS (z-40 overlay) */}
        <PlayZoneOverlay
          onExit={handleExit}
          onToggleFocus={handleToggleFocus}
          isFocusMode={isFocusMode}
          score={uiScore}
          accuracy={scoreStateRef.current.accuracy}
          isReplay={!!replayData}
        />

        {/* PLAY HIGHWAY HERO BOX */}
        <div 
          className="flex-1 w-full flex justify-center relative overflow-hidden bg-[#050508]"
        >
          {/* STATIC BACKGROUND IMAGE LAYER (Layer -1, z-index: 5) */}
          {beatmap.bgUrl && (!beatmap.videoUrl || settings.disableVideo || isVideoError) && (
            <div 
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 animate-fade-in"
              style={{
                backgroundImage: `radial-gradient(ellipse at center, rgba(10,10,13,0.30), rgba(5,5,8,0.95)), url(${beatmap.bgUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                zIndex: 5,
              }}
            />
          )}

          {/* FALLBACK CHIP GRID LAYER (z-index: 4, used when video is playing or image is absent) */}
          {(!beatmap.bgUrl || (beatmap.videoUrl && !settings.disableVideo && !isVideoError)) && (
            <div 
              className="absolute inset-0 w-full h-full transition-opacity duration-1000 animate-fade-in"
              style={{
                backgroundImage: 'radial-gradient(ellipse at center, rgba(16,24,48,0.2) 0%, rgba(5,5,8,0.98) 100%), linear-gradient(0deg, rgba(255,255,255,0.01) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.01) 1px, transparent 1px)',
                backgroundSize: 'cover, 40px 40px, 40px 40px',
                backgroundPosition: 'center',
                zIndex: 4,
              }}
            />
          )}

          {/* HARDWARE-ACCELERATED SYNCHRONIZED VIDEO LAYER (Layer 0, z-index: 10) */}
          {beatmap.videoUrl && !settings.disableVideo && (
            <video
              ref={setVideoRef}
              key={beatmap.videoUrl}
              src={beatmap.videoUrl}
              muted
              playsInline
              loop
              autoPlay
              onError={(e) => {
                console.warn('Video failed to render or decode');
                setIsVideoError(true);
                setDiagnosticsErrorLog(prev => [
                  ...prev,
                  'Video format decoding failed on the native browser host.'
                ]);
              }}
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 animate-fade-in"
              style={{ 
                opacity: settings.videoOpacity !== undefined ? (isVideoError ? 0 : settings.videoOpacity) : 0.35,
                zIndex: 10
              }}
            />
          )}

          {/* DECOUPLED LEFT SIDE HIGH-PERFORMANCE HEALTH RECEPTACLE (z-index: 30) */}
          <div id="left-gut-health" className="absolute left-4 top-24 bottom-24 z-30 w-3 bg-slate-900/60 rounded-full overflow-hidden border border-slate-800 flex flex-col justify-end shadow-inner">
            <div 
              className={`w-full transition-all duration-100 rounded-full shadow-[0_0_12px_rgba(34,211,238,0.6)] ${
                uiHp > 35 ? 'bg-gradient-to-t from-cyan-500 to-blue-400' : 'bg-gradient-to-t from-red-600 to-rose-400'
              }`}
              style={{ height: `${uiHp}%` }}
            />
          </div>

          <div 
            ref={containerRef} 
            className="h-full relative transition-all duration-205 z-20 playfield-chassis-container" 
            style={{ 
              width: '100%', 
              maxWidth: isFocusMode ? '100%' : `${beatmap.keyCount * (beatmap.keyCount > 6 ? 53 : 60)}px`,
              minWidth: '240px'
            }}
          >
            {/* PIANO TILES ACTIVE TOUCH ZONE BOUNDARY INDICATOR (Invisible / Logical Only) */}

            <canvas ref={canvasRef} className="block w-full h-full cursor-none game-canvas-element touch-none select-none" />

            {/* DYNAMIC HIGH-PERFORMANCE DOM COMBO & JUDGEMENT POPUPS */}
            <div 
              style={{ 
                opacity: settings.judgementOpacity ?? 1.0,
                transform: `scale(${settings.judgementSize ?? 1.0})`
              }}
              className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center select-none z-10 font-sans transition-transform duration-150"
            >
              {/* Combo Visualizer */}
              {uiCombo > 4 && (
                <div key={`combo-${uiCombo}`} className="flex flex-col items-center justify-center animate-combo-pop">
                  <span className="text-6xl font-[900] tracking-tighter text-slate-100 drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]">
                    {uiCombo}
                  </span>
                  <span className="text-[10px] font-black tracking-[0.25em] text-cyan-400 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] uppercase mt-1">
                    COMBO
                  </span>
                </div>
              )}

              {/* Judgement popup */}
              {uiJudgement && (
                <div 
                  key={`judg-${uiJudgement.time}`}
                  className="absolute text-5xl font-[900] tracking-widest uppercase drop-shadow-[0_3px_12px_rgba(0,0,0,0.95)] animate-judgement-pulse"
                  style={{ 
                    color: uiJudgement.color,
                    textShadow: `0 0 15px currentColor`
                  }}
                >
                  {uiJudgement.text}
                </div>
              )}
            </div>
          </div>
          
          {/* FAIL CARD OVERLAY */}
          {scoreStateRef.current.failed && (
            <div id="game-fail-overlay" className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-sm">
              <div className="relative flex items-center justify-center p-4 bg-red-950/40 rounded-full border border-red-500/30 mb-6 font-mono">
                <ShieldAlert className="h-14 w-14 text-rose-500 animate-bounce" />
              </div>
              <h2 className="text-3xl font-black font-sans tracking-tight text-rose-500 mb-2">TRACK FAILED</h2>
              <p className="text-sm text-slate-400 font-mono tracking-wide max-w-xs text-center mb-8">
                Your HP fell to 0. Set scroll speed lower or calibrate timing offset in settings.
              </p>
              
              <div className="flex gap-4">
                <button
                  id="fail-retry-btn"
                  onClick={restartMap}
                  className="flex items-center gap-2 px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-sans text-sm font-bold rounded-xl border border-rose-500 shadow-lg shadow-rose-600/30 transition hover:scale-105 cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" /> Retry Song
                </button>
                <button
                  id="fail-quit-btn"
                  onClick={handleExit}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 font-sans text-sm font-bold rounded-xl border border-slate-800 transition hover:scale-105 cursor-pointer"
                >
                  Back to Select
                </button>
              </div>
            </div>
          )}

          {/* PAUSED DRAWER CARD */}
          {isPaused && (
            <div id="game-paused-overlay" className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm">
              <h2 className="text-4xl font-extrabold font-sans tracking-tight text-slate-100 mb-2">GAME PAUSED</h2>
              <p className="text-sm text-slate-400 font-mono tracking-wider mb-8">
                {beatmap.title} // Mapped by {beatmap.creator}
              </p>
              
              <div className="flex flex-col gap-3 w-48">
                <button
                  id="pause-resume-btn"
                  onClick={togglePause}
                  className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-sans text-sm font-extrabold rounded-xl transition hover:scale-102 cursor-pointer"
                >
                  <Play className="h-4 w-4 fill-current" /> Resume Game
                </button>
                <button
                  id="pause-retry-btn"
                  onClick={restartMap}
                  className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-200 font-sans text-sm font-bold rounded-xl border border-slate-850 transition hover:scale-102 cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" /> Restart Track
                </button>
                <button
                  id="pause-quit-btn"
                  onClick={handleExit}
                  className="w-full px-5 py-2.5 bg-slate-950 hover:bg-red-950/40 text-slate-400 hover:text-red-400 font-sans text-sm font-bold rounded-xl border border-slate-900 hover:border-red-900/40 transition cursor-pointer"
                >
                  Quit Match
                </button>
              </div>
            </div>
          )}
        </div>
        
        {/* BOTTOM ACTIVE METADATA STRIP */}
        <div className="w-full px-6 py-4 bg-slate-900/60 border-t border-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 bg-cyan-950/50 text-cyan-400 font-mono font-bold text-xs rounded-md border border-cyan-900/40">
              {beatmap.keyCount}K Mode
            </span>
            <span className="text-sm font-bold text-slate-200 tracking-tight block max-w-[150px] md:max-w-xs truncate">
              {beatmap.title}
            </span>
            <span className="text-xs text-slate-500 font-sans block truncate max-w-[140px]">
              - {beatmap.artist}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button 
              id="pause-toggle-btn"
              onClick={togglePause}
              className="p-2 text-slate-400 hover:text-slate-100 bg-slate-900 hover:bg-slate-800 rounded-lg border border-slate-800 transition cursor-pointer"
            >
              {isPaused ? <Play className="h-4 w-4 fill-current" /> : <Pause className="h-4 w-4 fill-current" />}
            </button>
          </div>
        </div>

        {/* MOBILE ONLY ADDITIONAL CONTROLS BAR */}
        {!isFocusMode && (
          <div className="w-full md:hidden flex items-center justify-between gap-3 px-6 pb-4 pt-1 bg-slate-900/60 border-t border-slate-950/40 select-none">
            <button
              id="mobile-quit-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleExit();
              }}
              className="flex-1 flex items-center justify-center text-rose-400 hover:text-rose-350 font-sans text-xs font-bold uppercase tracking-wider py-2.5 bg-slate-950 rounded-xl border border-rose-500/10 cursor-pointer active:bg-rose-950/30"
            >
              ✕ Quit Performance
            </button>
            <button
              id="mobile-focus-toggle-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleFocus();
              }}
              className="flex-1 flex items-center justify-center text-cyan-400 hover:text-cyan-350 font-sans text-xs font-bold uppercase tracking-wider py-2.5 bg-slate-950 rounded-xl border border-cyan-500/10 cursor-pointer active:bg-cyan-950/25"
            >
              {isFocusMode ? 'Normal View' : 'Focus Play'}
            </button>
          </div>
        )}
      </div>

      {/* 2. LATENCY HUD / MAP SPECS DASHBOARD */}
      {!isFocusMode && (
        <div id="gameplay-sidebar" className="w-full lg:w-80 flex flex-col gap-5 animate-fade-in">
          
          {/* INTENSIVE MAP OVERVIEW CARD */}
          <div className="bg-slate-950 border border-slate-850 p-5 rounded-2xl flex flex-col gap-4">
            <h4 className="text-xs text-slate-505 tracking-widest uppercase font-bold">LANE CALIBRATORS</h4>
            
            <div className="flex flex-col gap-3 font-mono text-xs">
              <div className="flex justify-between items-center bg-slate-900/50 px-3 py-2 rounded-lg border border-slate-900">
                <span className="text-slate-400 font-sans">Scroll Speed</span>
                <span className="font-bold text-slate-100">SpeedMultiplier // {settings.scrollSpeed}x</span>
              </div>
              
              <div className="flex justify-between items-center bg-slate-900/50 px-3 py-2 rounded-lg border border-slate-900">
                <span className="text-slate-400 font-sans">Input Buffer</span>
                <span className="font-bold text-slate-100">Delta-time Polled</span>
              </div>

              <div className="flex justify-between items-center bg-slate-900/50 px-3 py-2 rounded-lg border border-slate-900">
                <span className="text-slate-400 font-sans">Audio Latency</span>
                <span className="font-bold text-cyan-400">{settings.audioOffset} ms</span>
              </div>
              
              <div className="flex justify-between items-center bg-[#0d0d12] px-3 py-2 rounded-lg border border-slate-900">
                <span className="text-slate-400 font-sans">Difficulty Limit</span>
                <span className="font-bold text-amber-400">OD // {beatmap.overallDifficulty}</span>
              </div>
            </div>
          </div>

          {/* TIMING WINDOWS DIAGRAM PANEL */}
          <div className="bg-slate-950 border border-slate-850 p-5 rounded-2xl flex-1 flex flex-col gap-4">
            <h4 className="text-xs text-slate-505 tracking-widest uppercase font-bold">TIMING WINDOW TACTICS</h4>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              Lower Overall Difficulty (OD) widens judgement parameters. Perfect and Marvelous ratios preserve your HP.
            </p>

            <div className="flex flex-col gap-2.5">
              {judgementWindows.map((wind) => {
                // Extract hits counts from score states
                let count = 0;
                const state = scoreStateRef.current;
                if (wind.type === 'marvelous') count = state.marvelousCount;
                else if (wind.type === 'perfect') count = state.perfectCount;
                else if (wind.type === 'great') count = state.greatCount;
                else if (wind.type === 'good') count = state.goodCount;
                else if (wind.type === 'bad') count = state.badCount;
                else if (wind.type === 'miss') count = state.missCount;

                return (
                  <div key={wind.type} className="flex items-center justify-between border-b border-slate-900/50 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: wind.color }} />
                      <span className="text-[11px] font-extrabold font-sans" style={{ color: wind.color }}>{wind.name}</span>
                    </div>
                    <div className="flex items-center gap-3 font-mono text-[11px]">
                      <span className="text-slate-500">±{wind.windowMs}ms</span>
                      <span className="font-bold text-slate-200">{count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );;
}
