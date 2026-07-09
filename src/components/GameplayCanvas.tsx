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

import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, ChevronLeft, RotateCcw, Volume2, ShieldAlert, Maximize, Minimize, Settings, Info, Home, Sliders, X } from 'lucide-react';
import { mainAudio } from '../audio/AudioEngine';
import { Beatmap, GameSettings, HitObject, JudgementType, JudgementWindow, ScoreState, ReplayFrame, PlayHistoryRecord } from '../types';
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
import metadata from '../../metadata.json';

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

const formatMsToMinSec = (timeMs: number) => {
  const totalSecs = Math.max(0, Math.floor(timeMs / 1000));
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

interface GameplayCanvasProps {
  beatmap: Beatmap;
  settings: GameSettings;
  updateSettings?: (s: Partial<GameSettings>) => void;
  onFinish: (score: ScoreState, replay?: ReplayFrame[]) => void;
  onBack: () => void;
  replayRecord?: PlayHistoryRecord | null;
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
  settings: propSettings,
  updateSettings,
  onFinish,
  onBack,
  replayRecord = null
}: GameplayCanvasProps) {
  // Override settings if we're watching a replay
  const settings = React.useMemo(() => {
    if (replayRecord?.recordedSettings) {
      return {
        ...propSettings,
        ...replayRecord.recordedSettings,
        musicVolume: propSettings.musicVolume,
        hitsoundVolume: propSettings.hitsoundVolume,
        videoOpacity: propSettings.videoOpacity,
        backgroundDim: propSettings.backgroundDim
      };
    }
    return propSettings;
  }, [propSettings, replayRecord]);

  const replayData = replayRecord?.replayFrames || null;
  const replayMods = replayRecord?.mods || [];

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
        node.pause();
        node.currentTime = 0;
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

  const maxRawScoreRef = useRef<number>(1);
  const currentRawScoreRef = useRef<number>(0);

  const [uiScore, setUiScore] = useState<number>(0);
  const [uiCombo, setUiCombo] = useState<number>(0);
  const [uiHp, setUiHp] = useState<number>(100);
  const [uiJudgement, setUiJudgement] = useState<{ text: string; color: string; time: number } | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [showCountdown, setShowCountdown] = useState<number>(0);
  const [unpauseCountdown, setUnpauseCountdown] = useState<number>(0);
  const [isFailed, setIsFailed] = useState<boolean>(false);

  // Active inputs trace
  const keysPressedRef = useRef<boolean[]>([]);
  const activeColumnsRef = useRef<boolean[]>([]);
  const hasKeyPressedOnceRef = useRef<boolean[]>([]);
  const progressBarRef = useRef<any>(null);
  const isScrubbingRef = useRef<boolean>(false);
  const wasPlayingRef = useRef<boolean>(false);
  const timeLabelRef = useRef<HTMLSpanElement>(null);
  const isReplayMode = !!replayRecord;
  
  // Dynamic visual visualizers
  const particlesRef = useRef<Particle[]>([]);
  const screenShakeRef = useRef<number>(0);
  const laneGlowRef = useRef<number[]>([]);
  
  // Judgement popup tracker
  const currentJudgementRef = useRef<{ text: string, color: string, time: number, size: number } | null>(null);

  // Hit error timing logs
  const hitErrorTicksRef = useRef<HitErrorTick[]>([]);
  const countdownStartTimeRef = useRef<number | null>(null);

  const [loadingAudioProgress, setLoadingAudioProgress] = useState<number>(0);
  const [isAudioLoaded, setIsAudioLoaded] = useState<boolean>(false);
  const [isReadyToTransition, setIsReadyToTransition] = useState<boolean>(false);

  // Custom pre-play stage states
  const [isPrePlay, setIsPrePlay] = useState<boolean>(true);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);

  // PIPELINE DIAGNOSTICS & DECODING FALLBACK STATES
  const [isPlayingFallback, setIsPlayingFallback] = useState<boolean>(false);
  const [isVideoMissing, setIsVideoMissing] = useState<boolean>(false);
  const [isVideoError, setIsVideoError] = useState<boolean>(false);
  const [diagnosticsErrorLog, setDiagnosticsErrorLog] = useState<string[]>([]);

  // Parse overall difficulty and build dynamic judgement windows in milliseconds
  // In competitive play (adjusted by adding +- 5ms on top of the original scoring timings):
  // OD 0: Marvelous: 21ms, Perfect: 49ms, Great: 79ms, Good: 109ms, Bad: 139ms
  // OD 10: Marvelous: 21ms, Perfect: 25ms, Great: 40ms, Good: 58ms, Bad: 77ms
  const getJudgementWindows = (od: number): JudgementWindow[] => {
    return [
      {
        type: 'marvelous',
        name: 'MARVELOUS',
        windowMs: 16 + 5,
        baseScore: 320,
        hpDelta: 3,
        color: '#22d3ee', // Cyan
        glowColor: 'rgba(34,211,238,0.5)',
      },
      {
        type: 'perfect',
        name: 'PERFECT',
        windowMs: Math.max(20, 44 - 2.4 * od) + 5,
        baseScore: 300,
        hpDelta: 2,
        color: '#facc15', // Neon Gold
        glowColor: 'rgba(250,204,21,0.4)',
      },
      {
        type: 'great',
        name: 'GREAT',
        windowMs: Math.max(35, 74 - 3.9 * od) + 5,
        baseScore: 200,
        hpDelta: 1,
        color: '#4ade80', // Green
        glowColor: 'rgba(74,222,128,0.3)',
      },
      {
        type: 'good',
        name: 'GOOD',
        windowMs: Math.max(53, 104 - 5.1 * od) + 5,
        baseScore: 100,
        hpDelta: 0.2,
        color: '#3b82f6', // Indigo
        glowColor: 'rgba(59,130,246,0.2)',
      },
      {
        type: 'bad',
        name: 'BAD',
        windowMs: Math.max(72, 134 - 6.2 * od) + 5,
        baseScore: 50,
        hpDelta: -3,
        color: '#ec4899', // Pink
        glowColor: 'rgba(236,72,153,0.1)',
      },
      {
        type: 'miss',
        name: 'MISS',
        windowMs: Math.max(120, 180 - 7 * od) + 5,
        baseScore: 0,
        hpDelta: -10, // Harsh HP drain under miss conditions
        color: '#ef4444', // Hot Red
        glowColor: 'rgba(239,68,68,0.3)',
      }
    ];
  };

  // Apply active mods to Overall Difficulty for Tightness / Easy adjustments
  let effectiveOD = beatmap.overallDifficulty;
  if (settings.selectedMods?.includes('HR')) {
    effectiveOD = Math.min(10, effectiveOD * 1.4);
  } else if (settings.selectedMods?.includes('EZ')) {
    effectiveOD = effectiveOD * 0.5;
  }
  const judgementWindows = getJudgementWindows(effectiveOD);
  const marvelousJudg = judgementWindows.find(w => w.type === 'marvelous') || judgementWindows[0];
  const perfectJudg = judgementWindows.find(w => w.type === 'perfect') || judgementWindows[1];
  const greatJudg = judgementWindows.find(w => w.type === 'great') || judgementWindows[2];
  const goodJudg = judgementWindows.find(w => w.type === 'good') || judgementWindows[3];
  const badJudg = judgementWindows.find(w => w.type === 'bad') || judgementWindows[4];
  const missJudg = judgementWindows.find(w => w.type === 'miss') || judgementWindows[judgementWindows.length - 1];

  const initializeGameplay = (runCountdown: boolean = false) => {
    // Deep copy notes from the beatmap, ensuring gameplay properties reset
    notesRef.current = (beatmap.notes || []).map(note => ({
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
    hasKeyPressedOnceRef.current = new Array(beatmap.keyCount).fill(false);
    
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

    // Calculate maximum possible raw score for the combo-based formula
    const totalJudgements = Math.max(1, (beatmap.notes || []).reduce((sum, note) => sum + (note.type === 'hold' ? 2 : 1), 0));
    const B_val = 1.0;
    const W_val = 0.1;
    maxRawScoreRef.current = totalJudgements * B_val + W_val * (totalJudgements * (totalJudgements + 1)) / 2;
    currentRawScoreRef.current = 0;

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
    setIsFailed(false);
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

    if (runCountdown) {
      setShowCountdown(3);
    } else {
      setShowCountdown(0);
    }
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
              const file = !audioFilename.toLowerCase().endsWith('.wav') ? resolver.findFile(audioFilename) : null;
              if (file) {
                const b = await file.async('blob');
                parsedAudioUrl = AssetLifecycleManager.registerBlob(b);
                beatmap.audioUrl = parsedAudioUrl;
              }
            }
            if (!parsedAudioUrl) {
              const fallbackObj = await resolver.findLargestFileByExtensions(['.mp3', '.ogg']) || resolver.findFallbackByExtensions(['.mp3', '.ogg'])?.file;
              if (fallbackObj) {
                const b = await fallbackObj.async('blob');
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
            if (!parsedBgUrl) {
              const fallbackObj = await resolver.findLargestFileByExtensions(['.jpg', '.jpeg', '.png', '.bmp']) || resolver.findFallbackByExtensions(['.jpg', '.jpeg', '.png', '.bmp'])?.file;
              if (fallbackObj) {
                const b = await fallbackObj.async('blob');
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
      
      // Calculate mod speed scaling factor
      let activeRate = 1.0;
      if (settings.selectedMods?.includes('DT')) {
        activeRate = 1.5;
      } else if (settings.selectedMods?.includes('HT')) {
        activeRate = 0.75;
      }
      mainAudio.playbackRate = activeRate;
      
      const success = await mainAudio.loadTrack(beatmap.audioUrl || '', (p) => {
        if (active) setLoadingAudioProgress(p);
      });
      
      if (active) {
        setIsReadyToTransition(true);
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
  }, [beatmap]);

  // Handle immediate sync of volume and offset values
  useEffect(() => {
    if (isAudioLoaded) {
      mainAudio.setVolumes(settings.musicVolume, settings.hitsoundVolume);
      mainAudio.setOffset(settings.audioOffset);
    }
  }, [isAudioLoaded, settings.musicVolume, settings.hitsoundVolume, settings.audioOffset]);

  // Handle countdown intervals
  useEffect(() => {
    if (showCountdown > 0) {
      if (showCountdown === 3) {
        countdownStartTimeRef.current = performance.now();
      }
      const t = setTimeout(() => {
        setShowCountdown(prev => {
          if (prev === 1) {
            // Play audio as soon as countdown wraps up
            mainAudio.play(beatmap.bpm, settings.audioOffset);
            isPlayingRef.current = true;
            if (videoRef.current) {
              videoRef.current.playbackRate = mainAudio.playbackRate;
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

  // Handle unpause countdown intervals
  useEffect(() => {
    if (unpauseCountdown > 0) {
      const t = setTimeout(() => {
        setUnpauseCountdown(prev => {
          if (prev === 1) {
            // Unpause visual systems
            lastProcessedReplayTimeRef.current = -1;
            setIsPaused(false);
            isPlayingRef.current = true;
            mainAudio.play(beatmap.bpm, settings.audioOffset);
            if (videoRef.current) {
              videoRef.current.playbackRate = mainAudio.playbackRate;
              videoRef.current.play().catch(err => {
                console.warn('Video failed to play on resume:', err instanceof Error ? err.message : String(err));
              });
            }
          }
          return prev - 1;
        });
      }, 1000); // Actual 1-second countdown ticks to give the player optimal physical recovery window
      return () => clearTimeout(t);
    }
  }, [unpauseCountdown]);

  // Unified Keyboard processing & Multi-Touch Input Adapter
  useEffect(() => {
    const keyLayout = settings.bindings[beatmap.keyCount] || [];
    const canvas = canvasRef.current;
    
    // Abstract virtual key trigger handlers to share state updates cleanly between physical keys and screen tactile touches
    const virtualKeyDown = (colIndex: number) => {
      if (isPrePlay || showCountdown > 0 || isPaused || scoreStateRef.current.failed) return;
      if (colIndex >= 0 && colIndex < beatmap.keyCount && !keysPressedRef.current[colIndex]) {
        keysPressedRef.current[colIndex] = true;
        activeColumnsRef.current[colIndex] = true;
        laneGlowRef.current[colIndex] = 1.0;
        if (hasKeyPressedOnceRef.current) {
          hasKeyPressedOnceRef.current[colIndex] = true;
        }
        
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
      if (isPrePlay || showCountdown > 0 || isPaused || scoreStateRef.current.failed) return;
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
      
      if (isPrePlay) {
        if (showSettingsModal || showInfoModal) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          onBack();
        }
        return;
      }

      // 1.1 Quick Retry Check
      const retryKey = (settings.bindRetry || 'r').toLowerCase();
      if (e.key.toLowerCase() === retryKey) {
        e.preventDefault();
        restartMap();
        return;
      }

      // 1.2 Pause/Resume Check
      const pauseKey = (settings.bindPause || 'escape').toLowerCase();
      const isPauseTrigger = e.key.toLowerCase() === pauseKey || e.key === 'Escape';

      if (isPauseTrigger) {
        e.preventDefault();
        if (showCountdown > 0 || unpauseCountdown > 0) {
          return; // Ignore / disable Escape key during active countdowns
        }
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
  }, [beatmap, settings, isPaused, showCountdown, isFocusMode, isPrePlay, showSettingsModal, showInfoModal, unpauseCountdown]);

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
        tickColor = '#3b82f6'; // Blue for 300 range
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

    if (state.hp <= 0 && !settings.selectedMods?.includes('NF') && !isReplayMode) {
      state.failed = true;
      isPlayingRef.current = false;
      setIsFailed(true);
      mainAudio.pause();
      if (videoRef.current) {
        try { videoRef.current.pause(); } catch (e) {}
      }
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

    // Cumulative combo-based scoring formula
    const B_factor = 1.0;
    const W_factor = 0.1;
    const judgementVal = judg.baseScore / 320;
    const scoreGain = judgementVal * (B_factor + W_factor * state.combo);
    currentRawScoreRef.current += scoreGain;

    let modMultiplier = 1.0;
    if (settings.selectedMods && settings.selectedMods.length > 0) {
      settings.selectedMods.forEach(modId => {
        if (modId === 'NF') modMultiplier *= 0.50;
        else if (modId === 'EZ') modMultiplier *= 0.50;
        else if (modId === 'HT') modMultiplier *= 0.30;
        else if (modId === 'HR') modMultiplier *= 1.06;
        else if (modId === 'HD') modMultiplier *= 1.06;
        else if (modId === 'DT') modMultiplier *= 1.12;
      });
    }

    state.score = Math.floor(Math.min(2000000, 1000000 * (currentRawScoreRef.current / maxRawScoreRef.current) * modMultiplier));

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
        // 1. Normal and hold notes missed at start
        if (!n.isHit && !n.isMissed && currentTime - n.time > missBound) {
          n.isMissed = true;
          if (n.type === 'hold') {
            n.isHoldFailed = true;
          }
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

      // Smoothly slide the rendering offset towards the actual audioOffset to prevent note visual teleportations mid-flight:
      smoothOffsetRef.current += (settings.audioOffset - smoothOffsetRef.current) * 0.08;

      const rawSongTime = mainAudio.getCurrentTimeMs();
      const offsetDiff = settings.audioOffset - smoothOffsetRef.current;
      let songTime = rawSongTime + offsetDiff;

      // Enable smooth visual note scrolling during the pre-song countdown period so first notes arrive in tempo
      if (showCountdown > 0 && countdownStartTimeRef.current !== null) {
        const elapsed = performance.now() - countdownStartTimeRef.current;
        // The total countdown ticks count to 3 * 700ms = 2100ms
        songTime = -2100 + elapsed;
      }

      audioTimeRef.current = songTime;

      // Update progress bar
      if (progressBarRef.current) {
        const totalDurationMs = beatmap.duration * 1000;
        const progressPercent = totalDurationMs > 0 ? Math.min(100, Math.max(0, (songTime / totalDurationMs) * 100)) : 0;
        
        if (progressBarRef.current.tagName === 'INPUT') { // It's the replay scrubber
            const inputEl = progressBarRef.current as HTMLInputElement;
            if (!isScrubbingRef.current) {
                inputEl.value = (Math.max(0, songTime)).toString();
                inputEl.style.background = `linear-gradient(to right, #06b6d4 ${progressPercent}%, rgba(255,255,255,0.15) ${progressPercent}%)`;
            }
        } else {
            progressBarRef.current.style.width = `${progressPercent}%`;
        }
      }

      if (timeLabelRef.current && !isScrubbingRef.current) {
        const totalMs = beatmap.duration * 1000;
        timeLabelRef.current.innerText = `${formatMsToMinSec(songTime)} / ${formatMsToMinSec(totalMs)}`;
      }

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
                  if (hasKeyPressedOnceRef.current) {
                    hasKeyPressedOnceRef.current[col] = true;
                  }
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

      // Helper to calculate opacity under Hidden (HD) mod for trails at any Y coordinate
      const getHiddenOpacity = (yVal: number) => {
        if (!settings.selectedMods?.includes('HD')) return 1.0;
        const distancePercent = settings.upsurfaceNoteMode 
          ? (height - yVal) / (height - (receptorY || 500))
          : yVal / (receptorY || 500);

        if (distancePercent < 0.35) {
          return 1.0;
        } else if (distancePercent < 0.70) {
          const fadeFactor = 1 - (distancePercent - 0.35) / 0.35;
          return Math.max(0, fadeFactor);
        } else {
          return 0.0;
        }
      };

      // Helper to dynamically inject alpha into gradient stops based on coordinates
      const applyFade = (colorStr: string, stopOpacity: number) => {
        if (colorStr.startsWith('#')) {
          return hexToRgba(colorStr, stopOpacity);
        }
        if (colorStr.startsWith('rgba(')) {
          const parts = colorStr.substring(5, colorStr.length - 1).split(',');
          if (parts.length === 4) {
            const existingAlpha = parseFloat(parts[3]);
            parts[3] = (existingAlpha * stopOpacity).toFixed(3);
            return `rgba(${parts.join(',')})`;
          }
        }
        if (colorStr.startsWith('rgb(')) {
          const parts = colorStr.substring(4, colorStr.length - 1).split(',');
          return `rgba(${parts.join(',')},${stopOpacity})`;
        }
        return colorStr;
      };

      notesRef.current.forEach((n) => {
        // Keep missed holds visible!
        if (n.isMissed && !n.isHit && n.type !== 'hold') return;

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

            const isCircleMode = settings.playfieldStyle === 'circle' || 
                                 settings.skinId === 'circles' || 
                                 settings.skinId === 'glassy-spheres' || 
                                 settings.skinId === 'hollow-rings';

            const fadeStart = getHiddenOpacity(visualStartY);
            const fadeEnd = getHiddenOpacity(endY);

            if (settings.squareRenderStyle === 'rhythmplus' && !isCircleMode) {
              const rpColor = settings.rhythmplusColor || '#ffff00';
              if (n.isHit && !n.isReleased) {
                if (n.releaseGraceUntil) {
                  const flicker = (Math.floor(Date.now() / 40) % 2 === 0);
                  holdGrad.addColorStop(0, applyFade(flicker ? rpColor : hexToRgba(rpColor, 0.5), fadeStart));
                  holdGrad.addColorStop(1, applyFade(flicker ? rpColor : hexToRgba(rpColor, 0.5), fadeEnd));
                } else {
                  holdGrad.addColorStop(0, applyFade(rpColor, fadeStart));
                  holdGrad.addColorStop(1, applyFade(rpColor, fadeEnd));
                }
              } else if (n.isHoldFailed || n.isMissed) {
                holdGrad.addColorStop(0, applyFade('rgba(100,116,139,0.5)', fadeStart));
                holdGrad.addColorStop(1, applyFade('rgba(100,116,139,0.5)', fadeEnd));
              } else {
                holdGrad.addColorStop(0, applyFade(rpColor, fadeStart));
                holdGrad.addColorStop(1, applyFade(rpColor, fadeEnd));
              }
            } else if (settings.playfieldStyle !== 'circle') {
              const rmColor = settings.rhythmmaniaNoteColor || '#00b0ff';
              if (n.isHit && !n.isReleased) {
                if (n.releaseGraceUntil) {
                  const flicker = (Math.floor(Date.now() / 40) % 2 === 0);
                  holdGrad.addColorStop(0, applyFade(flicker ? hexToRgba(rmColor, 0.8) : hexToRgba(rmColor, 0.2), fadeStart));
                  holdGrad.addColorStop(1, applyFade(hexToRgba(rmColor, 0.3), fadeEnd));
                } else {
                  holdGrad.addColorStop(0, applyFade(hexToRgba(rmColor, 0.8), fadeStart));
                  holdGrad.addColorStop(1, applyFade(hexToRgba(rmColor, 0.3), fadeEnd));
                }
              } else if (n.isHoldFailed || n.isMissed) {
                holdGrad.addColorStop(0, applyFade('rgba(100,116,139,0.3)', fadeStart));
                holdGrad.addColorStop(1, applyFade('rgba(71,85,105,0.1)', fadeEnd));
              } else {
                holdGrad.addColorStop(0, applyFade(hexToRgba(rmColor, 0.6), fadeStart));
                holdGrad.addColorStop(1, applyFade(hexToRgba(rmColor, 0.2), fadeEnd));
              }
            } else {
              if (n.isHit && !n.isReleased) {
                if (n.releaseGraceUntil) {
                  const flicker = (Math.floor(Date.now() / 40) % 2 === 0);
                  holdGrad.addColorStop(0, applyFade(flicker ? 'rgba(234,179,8,0.75)' : 'rgba(234,179,8,0.2)', fadeStart));
                  holdGrad.addColorStop(1, applyFade('rgba(161,117,14,0.3)', fadeEnd));
                } else {
                  holdGrad.addColorStop(0, applyFade(settings.skinId === 'custom' ? hexToRgba(customHoldColor, 0.8) : 'rgba(34,211,238,0.7)', fadeStart));
                  holdGrad.addColorStop(1, applyFade(settings.skinId === 'custom' ? hexToRgba(customHoldColor, 0.3) : 'rgba(59,130,246,0.3)', fadeEnd));
                }
              } else if (n.isHoldFailed || n.isMissed) {
                holdGrad.addColorStop(0, applyFade('rgba(100,116,139,0.3)', fadeStart));
                holdGrad.addColorStop(1, applyFade('rgba(71,85,105,0.1)', fadeEnd));
              } else {
                holdGrad.addColorStop(0, applyFade(settings.skinId === 'custom' ? hexToRgba(customHoldColor, 0.6) : 'rgba(59,130,246,0.5)', fadeStart));
                holdGrad.addColorStop(1, applyFade(settings.skinId === 'custom' ? hexToRgba(customHoldColor, 0.2) : 'rgba(56,189,248,0.2)', fadeEnd));
              }
            }
            
            ctx.fillStyle = holdGrad;
            
            const padding = isFocusMode ? 3 : 12;
            const notePadding = isFocusMode ? 1.5 : 6;
            const useNotePadding = settings.squareRenderStyle === 'rhythmplus' && !isCircleMode;
            
            const rx = xPos + (useNotePadding ? notePadding : padding);
            const rw = colW - (useNotePadding ? notePadding : padding) * 2;
            
            let drawY = Math.min(visualStartY, endY);
            let drawH = Math.abs(clipHeight);
            
            if (useNotePadding) {
              drawY -= 4;
              drawH += 8;
            }
            
            ctx.beginPath();
            if (settings.squareRenderStyle === 'rhythmplus' && !isCircleMode) {
              ctx.rect(rx, drawY, rw, drawH);
            } else {
              if (isCircleMode) {
                ctx.roundRect(rx, drawY, rw, drawH, rw / 2); // Pill-style capsules
              } else if (settings.skinId === 'classic-bar' || settings.skinId === 'minimalist') {
                ctx.rect(rx, drawY, rw, drawH); // Pure flat rectangles
              } else {
                ctx.roundRect(rx, drawY, rw, drawH, 6);
              }
            }
            ctx.fill();
            
            if (!(settings.squareRenderStyle === 'rhythmplus' && !isCircleMode)) {
              const strokeGrad = ctx.createLinearGradient(xPos, visualStartY, xPos, endY);
              const baseStrokeColor = n.isHit && !n.isReleased 
                ? (n.releaseGraceUntil ? '#eab308' : '#22d3ee') 
                : 'rgba(56,189,248,0.4)';
              strokeGrad.addColorStop(0, applyFade(baseStrokeColor, fadeStart));
              strokeGrad.addColorStop(1, applyFade(baseStrokeColor, fadeEnd));
              
              ctx.strokeStyle = strokeGrad;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(xPos + colW / 2, visualStartY);
              ctx.lineTo(xPos + colW / 2, endY);
              ctx.stroke();
            }
            
            ctx.restore();
          }
        }
      });

      // 3. DRAW NOTES INDIVIDUAL BODIES
      const drawEndReceptor = (ey: number, xPosVal: number, colWVal: number, notePaddingVal: number, noteObj: any) => {
        const rx = xPosVal + notePaddingVal;
        const ry = ey - 10;
        const rw = colWVal - notePaddingVal * 2;
        const rh = 20;

        ctx.save();
        
        // Apply Hidden Mod fade factor for the end receptor!
        let currentOpacity = settings.noteOpacity ?? 1.0;
        if (settings.selectedMods?.includes('HD')) {
          const distancePercent = settings.upsurfaceNoteMode 
            ? (height - ey) / (height - (receptorY || 500))
            : ey / (receptorY || 500);

          if (distancePercent < 0.35) {
            currentOpacity = currentOpacity;
          } else if (distancePercent < 0.70) {
            const fadeFactor = 1 - (distancePercent - 0.35) / 0.35;
            currentOpacity *= Math.max(0, fadeFactor);
          } else {
            currentOpacity = 0.0;
          }
        }
        
        // If the hold failed or was missed, make the end receptor look dimmed/faded!
        if (noteObj.isHoldFailed || noteObj.isMissed) {
          currentOpacity *= 0.35;
        }
        
        ctx.globalAlpha = currentOpacity;

        const isNoteCircleMode = settings.playfieldStyle === 'circle' || 
                                 settings.skinId === 'circles' || 
                                 settings.skinId === 'glassy-spheres' || 
                                 settings.skinId === 'hollow-rings';

        if (isNoteCircleMode) {
          // Circle mode end receptor: Concentric target ring with a dashed outer border
          // Very distinct, readable, and aesthetic!
          const cx = rx + rw / 2;
          const cy = ry + rh / 2;
          const r = (colWVal * (settings.noteSizeMultiplier ?? 1.0)) / 3.0;

          const noteColor = colStyles[noteObj.column].color;

          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.strokeStyle = noteColor;
          ctx.lineWidth = 3;
          ctx.setLineDash([4, 4]); // Dashed outer ring for differentiation!
          ctx.stroke();
          ctx.setLineDash([]); // Reset dash

          // Luminous inner circle
          ctx.beginPath();
          ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = noteColor;
          ctx.shadowBlur = 12;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          // Bar mode end receptor: Hollow bar with an elegant inner glowing double-border
          // and diagonal hatch pattern or dashed borders!
          ctx.beginPath();
          if (settings.squareRenderStyle === 'rhythmplus' && settings.playfieldStyle !== 'circle') {
            ctx.strokeStyle = settings.rhythmplusColor || '#ffff00';
            ctx.lineWidth = 4;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(rx, ry + rh / 2);
            ctx.lineTo(rx + rw, ry + rh / 2);
            ctx.stroke();
            ctx.setLineDash([]);
          } else {
            const noteColor = colStyles[noteObj.column].color;
            
            ctx.roundRect(rx, ry, rw, rh, 4);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // Solid inner capsule that has a distinct color & dash pattern
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(rx + 4, ry + 4, rw - 8, rh - 8, 2);
            ctx.fillStyle = noteColor;
            ctx.globalAlpha = currentOpacity * 0.75;
            ctx.fill();
            ctx.restore();

            // Draw distinct cross/hatch lines inside the end receptor for high differentiation!
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            // Left and right side double-stripes to mark unhold/release
            ctx.moveTo(rx + 6, ry + 3);
            ctx.lineTo(rx + 12, ry + rh - 3);
            ctx.moveTo(rx + 10, ry + 3);
            ctx.lineTo(rx + 16, ry + rh - 3);

            ctx.moveTo(rx + rw - 6, ry + 3);
            ctx.lineTo(rx + rw - 12, ry + rh - 3);
            ctx.moveTo(rx + rw - 10, ry + 3);
            ctx.lineTo(rx + rw - 16, ry + rh - 3);
            ctx.stroke();
          }
        }

        ctx.restore();
      };

      notesRef.current.forEach((n) => {
        // Skip normal notes that are hit or missed
        if (n.type === 'normal' && (n.isHit || n.isMissed)) {
          return;
        }

        // Skip completely consumed holds
        if (n.type === 'hold' && n.isHit && n.isReleased) {
          return;
        }

        const xPos = colX[n.column];
        const colW = colStyles[n.column].width;
        const notePadding = isFocusMode ? 1.5 : 6;

        // Draw start head for unhit hold notes or normal notes
        const shouldDrawHead = (n.type === 'normal') || (n.type === 'hold' && !n.isHit);
        
        if (shouldDrawHead) {
          let noteY = 0;
          if (settings.upsurfaceNoteMode) {
            noteY = receptorY + (n.time - visualTime) * speedFactor;
          } else {
            noteY = receptorY - (n.time - visualTime) * speedFactor;
          }

          const padding = 60;
          const isVisible = noteY >= -padding && noteY <= height + padding;

          if (isVisible && !(n.type === 'hold' && settings.squareRenderStyle === 'rhythmplus' && settings.playfieldStyle !== 'circle')) {
            const rx = xPos + notePadding;
            const ry = noteY - 10;
            const rw = colW - notePadding * 2;
            const rh = 20;

            ctx.save();
            let currentOpacity = settings.noteOpacity ?? 1.0;
            if (settings.selectedMods?.includes('HD')) {
              const distancePercent = settings.upsurfaceNoteMode 
                ? (height - noteY) / (height - (receptorY || 500))
                : noteY / (receptorY || 500);

              if (distancePercent < 0.35) {
                currentOpacity = currentOpacity;
              } else if (distancePercent < 0.70) {
                const fadeFactor = 1 - (distancePercent - 0.35) / 0.35;
                currentOpacity *= Math.max(0, fadeFactor);
              } else {
                currentOpacity = 0.0;
              }
            }
            
            // If it's a hold head and has failed / missed, dim it beautifully!
            if (n.type === 'hold' && (n.isHoldFailed || n.isMissed)) {
              currentOpacity *= 0.35;
            }

            ctx.globalAlpha = currentOpacity;
            
            // Define a local helper to enforce custom note rounding overrides
            const drawNoteShape = (radiusDefault: number) => {
              ctx.beginPath();
              if (settings.squareRenderStyle === 'rhythmplus' && settings.playfieldStyle !== 'circle') {
                ctx.rect(rx, ry + rh / 2 - 4, rw, 8); // RhythmPlus style notes are thin lines
              } else {
                ctx.roundRect(rx, ry, rw, rh, radiusDefault);
              }
            };

            let noteFill: string = '';
            let noteStroke: string = colStyles[n.column].color;

            const isNoteCircleMode = settings.playfieldStyle === 'circle' || 
                                     settings.skinId === 'circles' || 
                                     settings.skinId === 'glassy-spheres' || 
                                     settings.skinId === 'hollow-rings';

            if (isNoteCircleMode) {
              noteFill = settings.circleNoteColor || '#00b0ff';
              noteStroke = settings.circleNoteColor || '#00b0ff';
            } else if (settings.squareRenderStyle === 'rhythmplus') {
              noteFill = settings.rhythmplusColor || '#ffff00';
              noteStroke = settings.rhythmplusColor || '#ffff00';
            } else {
              noteFill = settings.rhythmmaniaNoteColor || '#00b0ff';
              noteStroke = settings.rhythmmaniaNoteColor || '#00b0ff';
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
              const cx = rx + rw / 2;
              const cy = ry + rh / 2;
              const r = (colW * (settings.noteSizeMultiplier ?? 1.0)) / 3.0;

              const noteColor = colStyles[n.column].color;

              ctx.beginPath();
              ctx.arc(cx, cy, r, 0, Math.PI * 2);
              
              ctx.fillStyle = noteColor;
              ctx.shadowColor = noteColor;
              ctx.shadowBlur = 10;
              ctx.fill();
              ctx.shadowBlur = 0;

              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 2;
              ctx.stroke();
            } else if (settings.squareRenderStyle === 'rhythmplus' && settings.playfieldStyle !== 'circle') {
              grad.addColorStop(0, noteFill);
              grad.addColorStop(1, noteFill);
              ctx.fillStyle = grad;
              drawNoteShape(0);
              ctx.fill();
            } else if (settings.playfieldStyle !== 'circle') {
              grad.addColorStop(0, noteFill);
              grad.addColorStop(1, noteFill);
              ctx.fillStyle = grad;
              ctx.strokeStyle = noteStroke;
              ctx.lineWidth = 2.5;
              drawNoteShape(4);
              ctx.fill();
              ctx.stroke();
              
              // Subtle glow
              ctx.shadowColor = noteFill;
              ctx.shadowBlur = 8;
              ctx.stroke();
              ctx.shadowBlur = 0;
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
          }
        }

        // Draw end receptor for hold notes
        if (n.type === 'hold' && n.endTime && !n.isReleased) {
          let endNoteY = 0;
          if (settings.upsurfaceNoteMode) {
            endNoteY = receptorY + (n.endTime - visualTime) * speedFactor;
          } else {
            endNoteY = receptorY - (n.endTime - visualTime) * speedFactor;
          }

          const padding = 60;
          const isEndVisible = endNoteY >= -padding && endNoteY <= height + padding;

          if (isEndVisible) {
            drawEndReceptor(endNoteY, xPos, colW, notePadding, n);
          }
        }
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
        
        const isCircleMode = settings.playfieldStyle === 'circle' || 
                             settings.skinId === 'circles' || 
                             settings.skinId === 'glassy-spheres' || 
                             settings.skinId === 'hollow-rings';

        let rcColor = colStyles[i].color;
        if (isCircleMode) {
          rcColor = settings.circleReceptorColor || '#00b0ff';
        } else if (settings.squareRenderStyle !== 'rhythmplus') {
          rcColor = settings.rhythmmaniaReceptorColor || '#00b0ff';
        }

        ctx.save();
        ctx.globalAlpha = settings.receptorOpacity ?? 1.0;

        {
          // Standard or selected receptor style block
          
          if (isCircleMode) {
            const cx = xPos + colW / 2;
            const cy = receptorY;
            const r = (colW * (settings.circleSize ?? 1.0)) / 3.0;

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
          } else if (settings.squareRenderStyle === 'rhythmplus') {
            // ==================== RHYTHMPLUS STYLE ====================
            const rx = xPos + 1;
            const ry = receptorY - 2;
            const rw = colW - 2;
            const rh = 4;

            ctx.fillStyle = isPressed 
              ? '#ffffff' 
              : 'rgba(255, 255, 255, 0.4)';
            
            ctx.beginPath();
            ctx.rect(rx, ry, rw, rh);
            ctx.fill();

            if (isPressed) {
              ctx.shadowColor = '#ffffff';
              ctx.shadowBlur = 10;
              ctx.fillStyle = '#ffffff';
              ctx.fill();
              ctx.shadowBlur = 0;
            }
          } else {
            // ==================== RHYTHMMANIA STYLE (Rounded rectangle) ====================
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
          const hasPressed = hasKeyPressedOnceRef.current && hasKeyPressedOnceRef.current[i];
          if (!hasPressed && layoutKeys && layoutKeys[i]) {
            ctx.font = '900 22px system-ui, -apple-system, sans-serif';
            ctx.fillStyle = isPressed ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.25)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(
              layoutKeys[i].toUpperCase(), 
              xPos + colW / 2, 
              settings.upsurfaceNoteMode ? receptorY + 50 : receptorY - 50
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
    if (showCountdown > 0 || scoreStateRef.current.failed) return;
    setUnpauseCountdown(0); // Safely cancel any active recovery countdown on window focus loss/tab change
    if (isPaused) return;
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
    if (showCountdown > 0 || unpauseCountdown > 0 || scoreStateRef.current.failed) return;

    if (isPaused) {
      if (isReplayMode) {
        setIsPaused(false);
        isPlayingRef.current = true;
        mainAudio.play(beatmap.bpm, settings.audioOffset);
        if (videoRef.current) {
          try { videoRef.current.play(); } catch (e) {}
        }
      } else {
        // Start recovery countdown instead of starting immediately
        setUnpauseCountdown(3);
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

  const simulateGameToTime = (targetTimeMs: number) => {
    // 1. Reset all notes to default states
    notesRef.current = (beatmap.notes || []).map(note => ({
      ...note,
      isHit: false,
      isReleased: false,
      isMissed: false,
      isHoldFailed: false,
      hitTime: undefined,
      releaseTime: undefined,
      releaseGraceUntil: undefined
    }));

    // 2. Reset keyboard arrays
    keysPressedRef.current = new Array(beatmap.keyCount).fill(false);
    activeColumnsRef.current = new Array(beatmap.keyCount).fill(false);
    laneGlowRef.current = new Array(beatmap.keyCount).fill(0);
    hasKeyPressedOnceRef.current = new Array(beatmap.keyCount).fill(false);

    // 3. Reset score tracking
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

    // Reset hit error timing ticks
    hitErrorTicksRef.current = [];

    if (!replayData || replayData.length === 0) {
      setUiScore(0);
      setUiCombo(0);
      setUiHp(100);
      return;
    }

    let simCurrentRawScore = 0;

    // Helper functions for chronological simulation
    const simApplyJudgement = (judg: JudgementWindow) => {
      const state = scoreStateRef.current;
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
      let hpMultiplier = beatmap.hpDrainRate > 5 ? 0.8 : 1.2;
      state.hp = Math.max(0, Math.min(100, state.hp + (judg.hpDelta * hpMultiplier)));

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

      // Replay simulation scoring matching gameplay
      const B_factor = 1.0;
      const W_factor = 0.1;
      const judgementVal = judg.baseScore / 320;
      const scoreGain = judgementVal * (B_factor + W_factor * state.combo);
      simCurrentRawScore += scoreGain;

      let modMultiplier = 1.0;
      if (settings.selectedMods && settings.selectedMods.length > 0) {
        settings.selectedMods.forEach(modId => {
          if (modId === 'NF') modMultiplier *= 0.50;
          else if (modId === 'EZ') modMultiplier *= 0.50;
          else if (modId === 'HT') modMultiplier *= 0.30;
          else if (modId === 'HR') modMultiplier *= 1.06;
          else if (modId === 'HD') modMultiplier *= 1.06;
          else if (modId === 'DT') modMultiplier *= 1.12;
        });
      }

      state.score = Math.floor(Math.min(2000000, 1000000 * (simCurrentRawScore / maxRawScoreRef.current) * modMultiplier));
    };

    const simTriggerHit = (colIndex: number, frameTime: number) => {
      const activeHoldAndReleased = notesRef.current.find(
        (n) => n.column === colIndex && n.type === 'hold' && n.isHit && !n.isReleased && !n.isHoldFailed && n.releaseGraceUntil
      );
      if (activeHoldAndReleased) {
        activeHoldAndReleased.releaseGraceUntil = undefined;
        return;
      }
      const note = notesRef.current.find(
        (n) => n.column === colIndex && !n.isHit && !n.isMissed
      );
      if (!note) return;
      const diff = frameTime - note.time;
      const absDiff = Math.abs(diff);
      const maxWindow = judgementWindows[judgementWindows.length - 1].windowMs;
      if (diff < -maxWindow) {
        return; 
      }
      let resolvedJudgement = judgementWindows[judgementWindows.length - 1]; // Miss
      for (const wind of judgementWindows) {
        if (absDiff <= wind.windowMs) {
          resolvedJudgement = wind;
          break;
        }
      }
      if (resolvedJudgement.type !== 'miss') {
        note.isHit = true;
        note.hitTime = frameTime;
        simApplyJudgement(resolvedJudgement);
      }
    };

    const simTriggerRelease = (colIndex: number, frameTime: number) => {
      const holdNote = notesRef.current.find(
        (n) => n.column === colIndex && n.type === 'hold' && n.isHit && !n.isReleased && !n.isHoldFailed
      );
      if (!holdNote || !holdNote.endTime) return;
      const endDiff = frameTime - holdNote.endTime;
      const absEndDiff = Math.abs(endDiff);
      if (endDiff < -181) {
        holdNote.releaseGraceUntil = frameTime + 180;
        return;
      }
      const greatWindow = greatJudg.windowMs;
      const missWindow = missJudg.windowMs;
      holdNote.isReleased = true;
      holdNote.releaseTime = frameTime;
      if (absEndDiff <= greatWindow) {
        simApplyJudgement(marvelousJudg);
      } else if (absEndDiff <= missWindow) {
        simApplyJudgement(goodJudg);
      } else {
        holdNote.isHoldFailed = true;
        simApplyJudgement(missJudg);
      }
    };

    const simCheckAutonomousMisses = (currentTime: number) => {
      notesRef.current.forEach((n) => {
        if (!n.isHit && !n.isMissed && currentTime - n.time > missJudg.windowMs) {
          n.isMissed = true;
          if (n.type === 'hold') {
            n.isHoldFailed = true;
          }
          simApplyJudgement(missJudg);
        }
        if (n.type === 'hold' && n.isHit && !n.isReleased && !n.isHoldFailed && n.endTime && currentTime - n.endTime > missJudg.windowMs) {
          if (n.releaseGraceUntil && currentTime > n.releaseGraceUntil) {
             n.isHoldFailed = true;
             simApplyJudgement(missJudg);
          } else if (!n.releaseGraceUntil) {
             n.isHoldFailed = true;
             simApplyJudgement(missJudg);
          }
        }
      });
    };

    // Play chronological replay frames up to targetTimeMs
    const historicalFrames = replayData.filter(f => f.time <= targetTimeMs);
    let prevKeys = new Array(beatmap.keyCount).fill(false);

    historicalFrames.forEach(frame => {
      // 1. Check autonomous misses at this frame time
      simCheckAutonomousMisses(frame.time);

      // 2. Process keyboard changes
      for (let col = 0; col < beatmap.keyCount; col++) {
        const wasPressed = prevKeys[col];
        const isCurrentlyPressed = frame.keysPressed[col];
        if (!wasPressed && isCurrentlyPressed) {
          simTriggerHit(col, frame.time);
        } else if (wasPressed && !isCurrentlyPressed) {
          simTriggerRelease(col, frame.time);
        }
        prevKeys[col] = isCurrentlyPressed;
      }
    });

    // 3. Sweep up to targetTimeMs
    simCheckAutonomousMisses(targetTimeMs);

    // Sync key states to the last frame if available
    if (historicalFrames.length > 0) {
      const lastFrame = historicalFrames[historicalFrames.length - 1];
      keysPressedRef.current = [...lastFrame.keysPressed];
      activeColumnsRef.current = [...lastFrame.keysPressed];
    } else {
      keysPressedRef.current.fill(false);
      activeColumnsRef.current.fill(false);
    }

    lastProcessedReplayTimeRef.current = targetTimeMs;

    // Synchronize UI view hooks
    setUiScore(scoreStateRef.current.score);
    setUiCombo(scoreStateRef.current.combo);
    setUiHp(scoreStateRef.current.hp);
  };

  const handleSeek = (newTimeMs: number) => {
    mainAudio.seekTo(newTimeMs / 1000);
    audioTimeRef.current = newTimeMs;
    smoothOffsetRef.current = settings.audioOffset;
    if (videoRef.current) {
       videoRef.current.currentTime = newTimeMs / 1000;
    }
    
    // reset visuals
    hitErrorTicksRef.current = [];
    currentJudgementRef.current = null;
    particlesRef.current = [];
    laneGlowRef.current.fill(0);
    screenShakeRef.current = 0;
    
    if (isReplayMode) {
      simulateGameToTime(newTimeMs);
    } else {
      // Normal playing seek
      // Hide or miss nodes prior to the seek point so they don't pile up on screen
      notesRef.current.forEach(n => {
         if (n.time < newTimeMs - 200) {
             n.isHit = true; 
             n.isMissed = false;
             n.isReleased = true; // Complete any hold notes
             n.isHoldFailed = false;
         } else {
             n.isHit = false;
             n.isMissed = false;
             n.isReleased = false;
             n.isHoldFailed = false;
             n.hitTime = undefined;
             n.releaseTime = undefined;
             n.releaseGraceUntil = undefined;
         }
      });
      lastProcessedReplayTimeRef.current = newTimeMs;
    }
  };

  const restartMap = () => {
    mainAudio.stop();
    setIsPrePlay(true);
    initializeGameplay(false);
  };

  const handleStartGameplay = () => {
    setIsPrePlay(false);
    setShowCountdown(3);
  };

  // Handle keys while loading
  useEffect(() => {
    if (isReadyToTransition && !isAudioLoaded) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.repeat) return;
        if (e.code === 'Escape') {
          e.preventDefault();
          handleExit();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isReadyToTransition, isAudioLoaded]);

  // Handle keys in PrePlay
  useEffect(() => {
    if (isPrePlay && isAudioLoaded) {
      const mountTime = Date.now();
      const handlePrePlayKeyDown = (e: KeyboardEvent) => {
        if (e.repeat) return;
        if (e.code === 'Escape') {
          e.preventDefault();
          handleExit();
        } else if (e.code === 'Space' || e.code === 'Enter') {
          // Ignore keydown if it happens within 300ms of entering Pre-Play (prevents bleed from Loading page inputs)
          if (Date.now() - mountTime < 300) return;
          e.preventDefault();
          handleStartGameplay();
        }
      };
      window.addEventListener('keydown', handlePrePlayKeyDown);
      return () => window.removeEventListener('keydown', handlePrePlayKeyDown);
    }
  }, [isPrePlay, isAudioLoaded]);

  // Safe loader state checking with high-fidelity themed presentation
  if (!isAudioLoaded) {
    const hasBg = !!beatmap.bgUrl;
    return (
      <div 
        id="gameplay-loader" 
        onClick={() => {
          if (isReadyToTransition) {
            setIsAudioLoaded(true);
          }
        }}
        className="flex flex-col items-center justify-center w-full h-screen bg-[#050508] text-slate-100 p-6 relative overflow-hidden select-none cursor-pointer"
        style={{
          backgroundImage: hasBg ? `linear-gradient(rgba(5, 5, 8, 0.88), rgba(5, 5, 8, 0.98)), url("${beatmap.bgUrl}")` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute bottom-2 left-4 z-[100] text-[10px] text-white/30 font-mono font-bold pointer-events-none select-none">
          {metadata.version}
        </div>
        {/* Subtle decorative background noise or radial lighting */}
        <div className="absolute inset-0 bg-radial-gradient from-transparent to-[#030305]/80 pointer-events-none" />

        <div className="w-full max-w-xl flex flex-col items-center relative z-10 p-8 rounded-2xl bg-[#09090e]/92 border border-white/10 backdrop-blur-xl shadow-2xl animate-fade-in">
          {/* Circular pulsing vinyl loader item */}
          <div className="relative flex items-center justify-center p-6 bg-white/[0.02] rounded-full mb-6 border border-white/10 shadow-lg">
            <Volume2 className="h-10 w-10 text-skin-accent animate-pulse" />
            <span className="absolute inset-0 rounded-full border-2 border-skin-accent/25 animate-ping" />
          </div>

          {/* Loading core title & metadata header */}
          <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-skin-accent font-black mb-1.5">
            SYNCING SOUNDS & COMPENSATORS
          </span>
          <h2 className="text-xl md:text-2xl font-black tracking-tight text-white font-sans text-center leading-tight mb-4">
            {beatmap.title || 'Loading Beatmap...'}
          </h2>

          {/* Metadata Grid Card */}
          <div className="w-full grid grid-cols-2 gap-3 px-4 py-3 bg-white/[0.02] border border-white/5 rounded-xl text-left text-xs mb-6 font-sans">
            <div>
              <span className="text-slate-500 font-mono block text-[10px] uppercase">Artist</span>
              <span className="text-slate-200 font-bold truncate block">{beatmap.artist || 'Unknown'}</span>
            </div>
            <div>
              <span className="text-slate-500 font-mono block text-[10px] uppercase">Creator</span>
              <span className="text-slate-200 font-bold truncate block">{beatmap.creator || 'Unknown'}</span>
            </div>
            <div>
              <span className="text-slate-500 font-mono block text-[10px] uppercase">Keys Mode</span>
              <span className="text-skin-accent font-black block">{beatmap.keyCount || 4} Keys</span>
            </div>
            <div>
              <span className="text-slate-500 font-mono block text-[10px] uppercase">Difficulty</span>
              <span className="text-pink-400 font-bold truncate block">{beatmap.difficulty || 'Normal'}</span>
            </div>
          </div>

          {/* Ingestion Pipeline Logs (Tells the exact unzipping and WAV clearing story nicely!) */}
          <div className="w-full flex flex-col gap-1.5 mb-6 text-[11px] font-mono text-left text-slate-400 border-t border-b border-white/5 py-4 px-1">
            <div className="flex justify-between items-center">
              <span>🗜️ Decompressed OSZ (ZIP) Archive</span>
              <span className="text-emerald-400 font-bold">SUCCESS</span>
            </div>
            <div className="flex justify-between items-center">
              <span>🧹 Purged uncompressed WAV audio</span>
              <span className="text-emerald-400 font-bold">SUCCESS</span>
            </div>
            <div className="flex justify-between items-center">
              <span>📊 Parsed chart matrices</span>
              <span className="text-emerald-400 font-bold">READY</span>
            </div>
            <div className="flex justify-between items-center">
              <span>🔊 Preloading high-fidelity MP3 track</span>
              <span className={`${loadingAudioProgress === 100 ? 'text-emerald-400' : 'text-skin-accent'} font-bold animate-pulse`}>
                {loadingAudioProgress === 100 ? 'COMPLETE' : `${loadingAudioProgress}%`}
              </span>
            </div>
          </div>

          {/* Real Audio Buffer Progress Bar */}
          <div className="w-full bg-white/[0.05] h-2.5 rounded-full overflow-hidden border border-white/10 relative shadow-inner mb-2">
            <div 
              className="bg-skin-accent h-full rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(235,13,115,0.4)]"
              style={{ width: `${loadingAudioProgress}%` }}
            />
          </div>
          {isReadyToTransition ? (
            <span className="text-[10px] text-skin-accent animate-pulse font-mono font-black uppercase tracking-widest mt-2 bg-skin-accent/10 px-3 py-1.5 rounded-lg border border-skin-accent/20 cursor-pointer text-center">
              CLICK ANYWHERE TO CONTINUE
            </span>
          ) : (
            <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">{loadingAudioProgress}% BUFFERED</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div 
      id="gameplay-container" 
      className="w-full h-screen max-w-none bg-[#050508] p-0 flex flex-col justify-between overflow-hidden relative select-none animate-fade-in"
    >
      {/* PRE-PLAY STAGE OVERLAY */}
      {isPrePlay && (
        <div 
          className="absolute inset-0 z-50 bg-[#050508] flex flex-col justify-between p-6 select-none animate-fade-in"
          style={{ borderRadius: '0px' }}
          onClick={(e) => {
            e.stopPropagation();
            // Removed handleStartGameplay() so they must click the button
          }}
        >
          {/* Dynamic background image layer */}
          {beatmap.bgUrl && (
            <div 
              className="absolute inset-0 bg-cover bg-center pointer-events-none"
              style={{
                backgroundImage: `url("${beatmap.bgUrl}")`,
                zIndex: 0
              }}
            />
          )}
          {/* Dynamic real-time background dim layer */}
          <div 
            className="absolute inset-0 bg-black pointer-events-none transition-opacity duration-150"
            style={{ 
              opacity: settings.backgroundDim !== undefined ? settings.backgroundDim : 0.60,
              zIndex: 1
            }}
          />
          {/* Backdrop blur layer */}
          <div 
            className="absolute inset-0 backdrop-blur-md bg-black/10 pointer-events-none"
            style={{ zIndex: 2 }}
          />

          {/* Top Row: Navigation and Fullscreen Controls */}
          <div className="w-full flex justify-between items-center z-10 relative">
            <div className="flex items-center bg-[#10101a]/95 p-1.5 rounded-xl border border-white/10 shadow-xl gap-1">
              <button
                id="preplay-home-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onBack();
                }}
                className="flex items-center justify-center p-2.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                title="Return to selection"
              >
                <Home className="h-5 w-5" />
              </button>
              
              <button
                id="preplay-fullscreen-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleFocus();
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 active:scale-95 text-xs font-black uppercase tracking-wider transition-all cursor-pointer border-l border-white/10 pl-3"
                title="Toggle Fullscreen"
              >
                <Maximize className="h-4 w-4" />
                <span>Full</span>
              </button>
            </div>

            <div className="text-right">
              <span className="text-[9px] text-zinc-500 font-mono tracking-widest font-black uppercase">
                {replayData ? "PRE-REPLAY ENGINE STAGE" : "PRE-PLAY ENGINE STAGE"}
              </span>
            </div>
          </div>

          {/* Middle Row: Start and Calibration popups */}
          <div className="flex-1 flex flex-col items-center justify-center gap-10 max-w-lg mx-auto w-full z-10 relative">
            {/* Beatmap details snippet */}
            <div className="text-center space-y-2">
              <span className="px-3 py-1 bg-cyan-950/40 text-cyan-400 font-mono text-xs font-bold rounded-full border border-cyan-500/20 shadow-sm shadow-cyan-500/5">
                {beatmap.keyCount}K Mode
              </span>
              <h2 className="text-3xl md:text-4xl font-extrabold font-sans text-slate-100 tracking-tight leading-tight mt-2">{beatmap.title}</h2>
              <p className="text-sm font-sans text-slate-400 font-normal">by {beatmap.artist}</p>
            </div>

            {/* Core Buttons Layout: Left Gear, Center Large Play, Right Info */}
            <div className="flex items-center justify-center gap-6 md:gap-8 w-full">
              {/* Settings button */}
              <button
                id="preplay-settings-link"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSettingsModal(true);
                }}
                className="p-5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-full border border-white/5 transition-all active:scale-95 cursor-pointer flex items-center justify-center shadow-2xl"
                title="Adjust settings"
              >
                <Settings className="h-6 w-6" />
              </button>

              {/* Start Game Button */}
              <button
                id="preplay-start-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartGameplay();
                }}
                className={`flex items-center justify-center gap-4 px-12 py-5 hover:bg-slate-750 text-white rounded-xl border border-white/10 transition-all active:scale-95 cursor-pointer shadow-xl hover:shadow-[0_0_30px_rgba(255,255,255,0.07)] ${replayData ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-slate-800'}`}
              >
                <Play className="h-6 w-6 fill-current text-white" />
                <span className="font-sans font-black text-lg tracking-wider uppercase">
                  {replayData ? "Watch" : "Start"}
                </span>
              </button>

              {/* Beatmap metadata button */}
              <button
                id="preplay-info-link"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowInfoModal(true);
                }}
                className="p-5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-full border border-white/5 transition-all active:scale-95 cursor-pointer flex items-center justify-center shadow-2xl"
                title="View map details"
              >
                <Info className="h-6 w-6" />
              </button>
            </div>

            <div className="text-zinc-500 font-mono text-[10px] tracking-widest text-center uppercase">
              {replayData ? "CLICK 'WATCH' TO BEGIN REPLAY" : "CLICK 'START' TO BEGIN PERFORMANCE"}
            </div>
          </div>

          {/* Bottom info */}
          <div className="w-full flex justify-between text-[10px] text-zinc-500 font-mono px-2 relative z-10">
            <div className="absolute -bottom-6 left-2 font-bold pointer-events-none text-white/30">{metadata.version}</div>
            <span>BPM: {beatmap.bpm}</span>
            <span>DIFFICULTY: {beatmap.difficulty}</span>
          </div>

          {/* INSTANT SETTINGS MODAL POPUP */}
          {showSettingsModal && (
            <div 
              className="fixed inset-0 z-55 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
              onClick={(e) => {
                e.stopPropagation();
                setShowSettingsModal(false);
              }}
            >
              <div 
                className="bg-[#0f0f1c] border border-white/10 rounded-2xl p-6 shadow-2xl max-w-sm w-full space-y-5 animate-scale-up"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2">
                    <Sliders className="h-4 w-4 text-cyan-400" />
                    <span className="font-sans font-bold text-slate-200 uppercase tracking-wider text-xs">CALIBRATION ROOM</span>
                  </div>
                  <button 
                    onClick={() => setShowSettingsModal(false)}
                    className="p-1 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-4 font-sans text-xs text-left">
                  {/* Scroll speed */}
                  {!replayData && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-slate-400">
                        <span>Scroll Speed</span>
                        <span className="font-mono text-cyan-400 font-extrabold">{settings.scrollSpeed}x</span>
                      </div>
                      <input 
                        type="range" min="5" max="40" step="1"
                        value={settings.scrollSpeed} 
                        onChange={(e) => updateSettings?.({ scrollSpeed: Number(e.target.value) })}
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onTouchMove={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="w-full accent-cyan-400 h-1 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>
                  )}

                  {/* Audio latency offset */}
                  {!replayData && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-slate-400 font-sans">
                        <span>Audio Offset / Latency</span>
                        <span className="font-mono text-cyan-400 font-extrabold">
                          {settings.audioOffset > 0 ? `+${settings.audioOffset}` : settings.audioOffset}ms
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => updateSettings?.({ audioOffset: Math.max(-500, settings.audioOffset - 5) })}
                          className="px-2 py-0.5 bg-slate-900 hover:bg-slate-850 text-slate-300 border border-white/5 hover:border-white/10 rounded font-mono text-[10px] font-bold cursor-pointer"
                        >
                          -5
                        </button>
                        <input 
                          type="range" min="-300" max="300" step="5"
                          value={settings.audioOffset} 
                          onChange={(e) => updateSettings?.({ audioOffset: Number(e.target.value) })}
                          onMouseDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onTouchMove={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="flex-1 accent-cyan-400 h-1 bg-slate-800 rounded-lg cursor-pointer"
                        />
                        <button 
                          onClick={() => updateSettings?.({ audioOffset: Math.min(500, settings.audioOffset + 5) })}
                          className="px-2 py-0.5 bg-slate-900 hover:bg-slate-850 text-slate-300 border border-white/5 hover:border-white/10 rounded font-mono text-[10px] font-bold cursor-pointer"
                        >
                          +5
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Lane Background Dim */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-slate-400">
                      <span>Background Shield Dim</span>
                      <span className="font-mono text-cyan-400 font-extrabold">{Math.round((settings.backgroundDim ?? 0.60) * 100)}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="1" step="0.05"
                      value={settings.backgroundDim ?? 0.60} 
                      onChange={(e) => updateSettings?.({ backgroundDim: Number(e.target.value) })}
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onTouchMove={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="w-full accent-cyan-400 h-1 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Music Volume */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-slate-400">
                      <span>Music Volume</span>
                      <span className="font-mono text-cyan-400 font-extrabold">{Math.round((settings.musicVolume ?? 0.75) * 100)}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="1" step="0.05"
                      value={settings.musicVolume} 
                      onChange={(e) => updateSettings?.({ musicVolume: Number(e.target.value) })}
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onTouchMove={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="w-full accent-cyan-400 h-1 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Hitsound Volume */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-slate-400">
                      <span>Hitsound Volume</span>
                      <span className="font-mono text-cyan-400 font-extrabold">{Math.round((settings.hitsoundVolume ?? 0.60) * 100)}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="1" step="0.05"
                      value={settings.hitsoundVolume} 
                      onChange={(e) => updateSettings?.({ hitsoundVolume: Number(e.target.value) })}
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onTouchMove={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="w-full accent-cyan-400 h-1 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Playfield Width */}
                  {!replayData && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-slate-400">
                        <span>Lane Playfield Width</span>
                        <span className="font-mono text-cyan-400 font-extrabold">{settings.playfieldWidthPercent ?? 40}%</span>
                      </div>
                      <input 
                        type="range" min="20" max="50" step="1"
                        value={settings.playfieldWidthPercent ?? 40} 
                        onChange={(e) => updateSettings?.({ playfieldWidthPercent: Number(e.target.value) })}
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onTouchMove={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="w-full accent-cyan-400 h-1 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>
                  )}

                  {/* Upsurface note mode */}
                  {!replayData && (
                    <div className="pt-2 flex justify-between items-center border-t border-white/5">
                      <span className="text-slate-400">Scroll Direction</span>
                      <button
                        onClick={() => updateSettings?.({ upsurfaceNoteMode: !settings.upsurfaceNoteMode })}
                        className={`px-3 py-1 text-[10px] font-bold font-mono tracking-wider rounded uppercase border transition cursor-pointer ${
                          settings.upsurfaceNoteMode 
                            ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.3)]' 
                            : 'bg-slate-900 text-slate-400 border-white/5 hover:text-white animate-pulse'
                        }`}
                      >
                        {settings.upsurfaceNoteMode ? 'Upward Scroll' : 'Downward Scroll'}
                      </button>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black uppercase tracking-wider text-[10px] rounded-xl transition cursor-pointer"
                >
                  Confirm calibrators
                </button>
              </div>
            </div>
          )}

          {/* BEATMAP INFO POPUP */}
          {showInfoModal && (
            <div 
              className="fixed inset-0 z-55 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
              onClick={(e) => {
                e.stopPropagation();
                setShowInfoModal(false);
              }}
            >
              <div 
                className="bg-[#0f0f1c] border border-white/10 rounded-2xl p-6 shadow-2xl max-w-sm w-full space-y-5 animate-scale-up"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-cyan-400" />
                    <span className="font-sans font-bold text-slate-200 uppercase tracking-wider text-xs">BEATMAP METRICS</span>
                  </div>
                  <button 
                    onClick={() => setShowInfoModal(false)}
                    className="p-1 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-2.5 font-sans text-xs text-left">
                  <div className="flex justify-between items-center bg-[#050510] border border-white/5 px-3 py-1.5 rounded-lg">
                    <span className="text-slate-400">Song Title</span>
                    <span className="text-slate-100 font-bold max-w-[170px] truncate" title={beatmap.title}>
                      {beatmap.title}
                    </span>
                  </div>

                  <div className="flex justify-between items-center bg-[#050510] border border-white/5 px-3 py-1.5 rounded-lg">
                    <span className="text-slate-400">Artist Name</span>
                    <span className="text-slate-100 font-bold max-w-[170px] truncate" title={beatmap.artist}>
                      {beatmap.artist}
                    </span>
                  </div>

                  <div className="flex justify-between items-center bg-[#050510] border border-white/5 px-3 py-1.5 rounded-lg font-mono">
                    <span className="text-slate-400 font-sans">BPM Clock Rate</span>
                    <span className="text-cyan-400 font-black">{beatmap.bpm} BPM</span>
                  </div>

                  <div className="flex justify-between items-center bg-[#050510] border border-white/5 px-3 py-1.5 rounded-lg font-mono">
                    <span className="text-slate-400 font-sans">Song Length</span>
                    <span className="text-slate-100 font-bold">
                      {Math.floor(beatmap.duration / 60)}m {Math.floor(beatmap.duration % 60)}s
                    </span>
                  </div>

                  <div className="flex justify-between items-center bg-[#050510] border border-white/5 px-3 py-1.5 rounded-lg font-mono">
                    <span className="text-slate-400 font-sans">Creator</span>
                    <span className="text-slate-200 font-bold">{beatmap.creator}</span>
                  </div>

                  <div className="flex justify-between items-center bg-[#050510] border border-white/5 px-3 py-1.5 rounded-lg font-mono">
                    <span className="text-slate-400 font-sans">HP Drain Intensity</span>
                    <span className="text-right flex items-center gap-1.5">
                      <span className="text-amber-400 font-black">{beatmap.hpDrainRate}/10</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    </span>
                  </div>

                  <div className="flex justify-between items-center bg-[#050510] border border-white/5 px-3 py-1.5 rounded-lg font-mono">
                    <span className="text-slate-400 font-sans">Overall Accuracy Window</span>
                    <span className="text-right flex items-center gap-1.5">
                      <span className="text-cyan-400 font-black">{beatmap.overallDifficulty}/10</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setShowInfoModal(false)}
                  className="w-full py-2.5 bg-slate-900 border border-white/5 text-slate-300 hover:text-white font-bold uppercase tracking-wider text-[10px] rounded-xl transition cursor-pointer"
                >
                  Dismiss metrics
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 1. PRIMARY GAMEPLAY HIGH-PERFORMANCE CANVAS VIEWPORT */}
      <div 
        className="flex-1 w-full h-full flex flex-col items-center relative bg-slate-950 overflow-hidden text-slate-100"
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

        {/* TOP STATUS BAR: DYNAMIC HIGH-CONTRAST FLOATING CONTROLS (z-40 overlay) */}
        {!isPrePlay && (
          <div className="absolute top-5 left-6 z-40 flex items-center gap-2 pointer-events-auto select-none">
            {/* Quit/Exit button */}
            <button
              onClick={handleExit}
              className="flex items-center justify-center p-2.5 bg-slate-900/80 hover:bg-rose-950/20 text-slate-400 hover:text-rose-400 rounded-xl border border-white/5 hover:border-rose-500/10 transition active:scale-95 cursor-pointer shadow-lg"
              title="Quit Performance"
            >
              <Home className="h-4 w-4" />
            </button>

            {/* Fullscreen button */}
            <button
              onClick={handleToggleFocus}
              className="flex items-center justify-center p-2.5 bg-slate-900/80 hover:bg-cyan-950/15 text-slate-400 hover:text-cyan-400 rounded-xl border border-white/5 hover:border-cyan-500/10 transition active:scale-95 cursor-pointer shadow-lg"
              title="Toggle Fullscreen"
            >
              <Maximize className="h-4 w-4" />
            </button>

            {/* Pause button */}
            <button
              onClick={togglePause}
              className="flex items-center justify-center p-2.5 bg-slate-900/80 hover:bg-slate-800/80 text-slate-400 hover:text-white rounded-xl border border-white/5 transition active:scale-95 cursor-pointer shadow-lg"
              title={isPaused ? "Resume" : "Pause"}
            >
              {isPaused ? <Play className="h-4 w-4 fill-current animate-pulse" /> : <Pause className="h-4 w-4 fill-current" />}
            </button>

            {/* Replay Cinematic indicator */}
            {!!replayData && (
              <div className="ml-3 flex items-center gap-2 bg-cyan-950/70 border border-cyan-400/40 text-cyan-400 px-3 py-1.5 rounded-full shadow-[0_0_15px_rgba(34,211,238,0.25)] text-[10px] font-extrabold uppercase tracking-[0.2em]">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                <span>REPLAY</span>
              </div>
            )}
          </div>
        )}

        {/* GET READY COUNTDOWN OVERLAY */}
        {showCountdown > 0 && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#050508]/85 pointer-events-none select-none animate-fade-in font-sans">
            {!replayData && (
              <div className="text-4xl md:text-5xl font-black text-white tracking-widest uppercase mb-4 drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] animate-pulse">
                Get Ready...
              </div>
            )}
            <div className="text-6xl md:text-8xl font-black text-cyan-400 drop-shadow-[0_4px_16px_rgba(34,211,238,0.5)]">
              {showCountdown}
            </div>
          </div>
        )}

        {/* UNPAUSE RESUME RECOVERY COUNTDOWN OVERLAY */}
        {unpauseCountdown > 0 && (
          <div className="absolute inset-0 z-45 flex items-center justify-center bg-black/45 select-none pointer-events-none animate-fade-in">
            <div className="relative flex items-center justify-center">
              {/* Glowing, high-performance circular tick HUD */}
              <svg className="w-40 h-40 transform -rotate-90">
                <circle
                  cx="80"
                  cy="80"
                  r="64"
                  className="stroke-slate-800"
                  strokeWidth="5"
                  fill="transparent"
                />
                <circle
                  cx="80"
                  cy="80"
                  r="64"
                  stroke="#f59e0b"
                  className="stroke-amber-500 unpause-circle-animation"
                  strokeWidth="7"
                  fill="transparent"
                  strokeDasharray="402.12"
                  strokeLinecap="round"
                  style={{
                    filter: 'drop-shadow(0 0 10px rgba(245, 158, 11, 0.65))',
                  }}
                />
              </svg>
              {/* Countdown Tick Value */}
              <div className="absolute font-sans font-[900] text-5xl text-white tracking-widest drop-shadow-[0_4px_12px_rgba(0,0,0,0.85)]">
                {unpauseCountdown}
              </div>
            </div>
          </div>
        )}

        {/* SONG TIMING PROGRESS BAR OR REPLAY SCRUBBER */}
        {!isPrePlay && (
          <div className={`absolute left-0 right-0 z-35 ${
            isReplayMode ? (settings.progressBarTop ? 'top-0' : 'bottom-0 flex flex-col justify-end') :
            (settings.progressBarTop ? 'top-0 h-1.5' : 'bottom-0 h-1.5')
          } pointer-events-none transition-all duration-300`}
          >
            {isReplayMode ? (
              <div className="w-full flex flex-col items-center px-4 md:px-8 py-4 bg-slate-950/95 border-t border-white/10 pointer-events-auto backdrop-blur-2xl shadow-[0_-15px_35px_rgba(0,0,0,0.95)] z-40">
                <div className="w-full max-w-5xl flex flex-col gap-2.5">
                     
                     {/* Slider track + Time stamp row */}
                     <div className="w-full flex items-center justify-between gap-4">
                        
                        {/* Play/Pause Button */}
                        <button
                           onClick={togglePause}
                           className="text-white hover:text-cyan-400 hover:bg-white/10 active:scale-95 transition-all bg-white/5 rounded-full cursor-pointer h-10 w-10 flex items-center justify-center shrink-0 border border-white/10"
                        >
                           {isPaused ? <Play className="w-5 h-5 fill-current ml-0.5" /> : <Pause className="w-5 h-5 fill-current" />}
                        </button>

                        <div className="flex-1 w-full relative group py-2">
                           <input 
                              ref={progressBarRef as React.Ref<HTMLInputElement>}
                              type="range"
                              min="0"
                              max={beatmap.duration * 1000}
                              step="1"
                              defaultValue={0}
                              onPointerDown={() => {
                                  isScrubbingRef.current = true;
                                  wasPlayingRef.current = isPlayingRef.current && !isPaused;
                                  mainAudio.pause();
                                  if (videoRef.current) {
                                      try { videoRef.current.pause(); } catch (e) {}
                                  }
                              }}
                              onPointerUp={(e) => { 
                                  isScrubbingRef.current = false; 
                                  const newTime = Number((e.target as HTMLInputElement).value);
                                  handleSeek(newTime);
                                  if (wasPlayingRef.current) {
                                      mainAudio.play(beatmap.bpm, settings.audioOffset);
                                      if (videoRef.current) {
                                          try { videoRef.current.play(); } catch (e) {}
                                      }
                                  }
                              }}
                              onChange={(e) => {
                                  const newTime = Number(e.target.value);
                                  const totalMs = beatmap.duration * 1000;
                                  const progressPercent = totalMs > 0 ? (newTime / totalMs) * 100 : 0;
                                  e.target.style.background = `linear-gradient(to right, #06b6d4 ${progressPercent}%, rgba(255,255,255,0.15) ${progressPercent}%)`;
                                  
                                  if (timeLabelRef.current) {
                                      timeLabelRef.current.innerText = `${formatMsToMinSec(newTime)} / ${formatMsToMinSec(totalMs)}`;
                                  }
                                  simulateGameToTime(newTime);
                                  audioTimeRef.current = newTime;
                                  if (videoRef.current) {
                                      videoRef.current.currentTime = newTime / 1000;
                                  }
                              }}
                              className="w-full h-2 rounded-full appearance-none outline-none cursor-pointer group-hover:h-2.5 transition-all z-10 block bg-white/20"
                              style={{
                                 background: `linear-gradient(to right, #06b6d4 0%, rgba(255,255,255,0.15) 0%)`,
                                 WebkitAppearance: 'none',
                              }}
                           />
                           <style dangerouslySetInnerHTML={{__html: `
                              input[type=range]::-webkit-slider-thumb {
                                -webkit-appearance: none;
                                appearance: none;
                                width: 14px;
                                height: 14px;
                                border-radius: 50%;
                                background: #ffffff;
                                box-shadow: 0 0 10px rgba(6, 182, 212, 0.9), 0 0 4px rgba(255, 255, 255, 0.5);
                                border: 2px solid #06b6d4;
                                cursor: pointer;
                                transition: transform 0.15s ease-in-out, background-color 0.1s;
                              }
                              input[type=range]:hover::-webkit-slider-thumb, 
                              input[type=range]:active::-webkit-slider-thumb {
                                transform: scale(1.4);
                                background: #06b6d4;
                                border-color: #ffffff;
                              }
                           `}} />
                        </div>

                        {/* Direct readable Time Stamp HUD */}
                        <span 
                           ref={timeLabelRef}
                           className="font-mono text-sm text-slate-300 font-bold shrink-0 min-w-[110px] text-right"
                        >
                           00:00 / 00:00
                        </span>

                        <div className="flex items-center gap-2.5 shrink-0 border-l border-white/10 pl-4 h-8">
                            <span className="text-[10px] font-black text-slate-400 tracking-wider uppercase">Speed</span>
                            <select 
                               onChange={(e) => {
                                   const spd = Number(e.target.value);
                                   mainAudio.setPlaybackRate(spd);
                                   if (videoRef.current) videoRef.current.playbackRate = spd;
                               }} 
                               defaultValue={mainAudio.playbackRate || 1} 
                               className="bg-white/10 hover:bg-white/15 text-white rounded-md px-2.5 py-1 outline-none font-mono text-xs border border-white/10 cursor-pointer transition-all font-semibold"
                            >
                              <option value={0.5}>0.5x</option>
                              <option value={0.75}>0.75x</option>
                              <option value={1}>1.0x</option>
                              <option value={1.5}>1.5x</option>
                              <option value={2}>2.0x</option>
                            </select>
                        </div>

                     </div>
                </div>
              </div>
            ) : (
              <div 
                ref={progressBarRef as React.Ref<HTMLDivElement>}
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 shadow-[0_0_8px_rgba(34,211,238,0.7)]"
                style={{ width: '0%' }}
              />
            )}
          </div>
        )}

        {/* FLOATING ACCURACY AND SCORE (Bottom Left) */}
        {!isPrePlay && (
          <div className={`absolute left-6 ${isReplayMode ? 'bottom-28' : 'bottom-8'} z-30 flex flex-col items-start select-none font-sans pointer-events-none text-left drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]`}>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">ACCURACY</span>
            <span className="text-2xl md:text-3xl font-black text-cyan-400 font-mono tracking-tight leading-none mb-1">
              {scoreStateRef.current.accuracy.toFixed(2)}%
            </span>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-2">SCORE</span>
            <span className="text-3xl md:text-4xl font-extrabold text-white font-mono tracking-tighter leading-none">
              {uiScore.toLocaleString('en-US', { minimumIntegerDigits: 7, useGrouping: false })}
            </span>
          </div>
        )}

        {/* PLAY HIGHWAY HERO BOX */}
        <div 
          className="flex-1 w-full flex justify-center relative overflow-hidden bg-[#050508]"
        >
          {/* STATIC BACKGROUND IMAGE LAYER (Layer -1, z-index: 5) */}
          {beatmap.bgUrl && (!beatmap.videoUrl || settings.disableVideo || isVideoError) && (
            <div 
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 animate-fade-in"
              style={{
                backgroundImage: `radial-gradient(ellipse at center, rgba(10,10,13,0.30), rgba(5,5,8,0.95)), url("${beatmap.bgUrl}")`,
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

          {/* REAL-TIME DYNAMIC BACKGROUND DIM OVERLAY LAYER (z-index: 15) */}
          <div 
            className="absolute inset-0 bg-black pointer-events-none transition-opacity duration-150"
            style={{ 
              opacity: settings.backgroundDim !== undefined ? settings.backgroundDim : 0.60,
              zIndex: 15
            }}
          />

          <div 
            ref={containerRef} 
            className="h-full relative transition-all duration-205 z-20 playfield-chassis-container" 
            style={{ 
              width: `${settings.playfieldWidthPercent ?? 40}%`, 
              minWidth: '280px',
              maxWidth: '100%'
            }}
          >
            {/* DECOUPLED RIGHT SIDE HIGH-PERFORMANCE HEALTH RECEPTACLE (z-index: 30) */}
            <div 
              id="right-gut-health" 
              className="absolute top-24 bottom-24 z-30 w-3 bg-slate-900/60 rounded-full overflow-hidden border border-slate-800 flex flex-col justify-end shadow-inner"
              style={{ left: 'calc(100% + 16px)' }}
            >
              <div 
                className={`w-full transition-all duration-100 rounded-full shadow-[0_0_12px_rgba(34,211,238,0.6)] ${
                  uiHp > 35 ? 'bg-gradient-to-t from-cyan-500 to-blue-400' : 'bg-gradient-to-t from-red-600 to-rose-400'
                }`}
                style={{ height: `${uiHp}%` }}
              />
            </div>

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
          {(isFailed || scoreStateRef.current.failed) && (
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
          {isPaused && unpauseCountdown === 0 && (
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
      </div>
    </div>
  );
}
