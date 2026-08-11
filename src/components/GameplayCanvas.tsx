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
import { Play, Pause, RotateCcw, ShieldAlert, Maximize, Settings, Info, Home, Sliders, X } from 'lucide-react';
import { mainAudio } from '../audio/AudioEngine';
import { previewPlayer } from '../utils/previewPlayer';
import { Beatmap, GameSettings, HitObject, JudgementWindow, ScoreState, ReplayFrame, PlayHistoryRecord } from '../types';
import { initializeColumnJudgements, incrementColumnJudgement } from '../utils/performanceMetrics';
import { VideoSyncController, computeTargetVideoTimeSec } from '../utils/videoSyncController';
import { executeTeardown } from '../utils/gameplayTeardown';
import { getHoldTailJudgement, isHoldGraceActive, resolveHoldGrace, resolveJudgementForError } from '../utils/judgementTiming';
import { consumeReplayFrames, createReplayCursor, normalizeReplayFrames, resetReplayCursor, type ReplayCursor, upperBoundReplayFrame } from '../utils/replayCursor';
import { UnstableRateAccumulator } from '../utils/unstableRateAccumulator';
import { TouchInputAdapter } from '../utils/touchInputAdapter';
import { FullscreenManager } from '../utils/fullscreenManager';
import { GameplayMediaRegistry } from '../utils/mediaRegistry';
import { getMimeTypeFromFilename, getVideoFormatLabel, isBrowserPlayableVideoFilename } from '../utils/assetLifecycle';
import { storageManager } from '../utils/storageManager';
import type { SavedBeatmap } from '../utils/storageManager';
import { unpackBeatmap } from '../utils/unpackHelper';
import { sanitizeCssUrl } from '../utils/securityLimits';
import {
  ACCURACY_BASE_SCORE,
  computeAccuracyPercent,
  computeMaxComboPortion,
  computeModMultiplier,
  computeTotalScore,
  countMapJudgements,
  countTotalHits,
  getComboScoreChange,
} from '../utils/scoreCalculator';
import metadata from '../../metadata.json';
import { SCROLL_SPEED_MAX, SCROLL_SPEED_MIN } from './settings/defaultSettings';

// HIGH PERFORMANCE INTEGRATED RENDERER IMPORTS
import { IPlayfieldRenderer, ColumnLayout } from '../render/types';
import { Canvas2DRenderer } from '../render/Canvas2DRenderer';
import { getLaneColors } from '../render/skinTheme';
import { calculateScrollSpeedFactor, updateColumnsLayout } from '../render/playfieldLayout';
import { getColumnStyles } from '../render/laneLayout';
import { getVisibleNotes } from '../render/noteVisibility';
import { createScrollModel, ScrollModel } from '../render/scrollVelocity';
import { parseBeatmap } from '../utils/beatmapParser';
import {
  BABYLON_PLAYFIELD_WIDTH_MAX,
  BABYLON_PLAYFIELD_WIDTH_MIN,
  PLAYFIELD_WIDTH_MAX,
  PLAYFIELD_WIDTH_MIN,
} from './settings/defaultSettings';

const COUNTDOWN_DURATION_MS = 2100;

export function checkNotesAutonomousMisses(
  notes: HitObject[],
  currentTime: number,
  missBound: number,
  onMiss: (n: HitObject, isDoubleMiss: boolean) => void,
  keysPressed?: boolean[]
) {
  notes.forEach((n) => {
    // 1. Head window expired: normal notes miss fully; holds only miss the head and stay salvageable for the tail
    if (!n.isHit && !n.isMissed && currentTime - n.time > missBound) {
      n.isMissed = true;
      if (n.type === 'hold') {
        onMiss(n, false); // Head miss only — body/tail remain active
        // If the lane is already held when the head times out, engage the LN for tail scoring
        if (keysPressed && keysPressed[n.column]) {
          n.isHit = true;
          n.hitTime = currentTime;
        }
      } else {
        onMiss(n, false);
      }
    }

    // 1b. Head already missed, never engaged: tail times out separately
    if (
      n.type === 'hold' &&
      n.isMissed &&
      !n.isHit &&
      !n.isReleased &&
      !n.isHoldFailed &&
      n.endTime &&
      currentTime - n.endTime > missBound
    ) {
      n.isHoldFailed = true;
      n.isReleased = true;
      onMiss(n, false);
    }
    
    // 2. Continuous hold note missed intermediate bounds (engaged holds, including post-head-miss salvage)
    if (n.type === 'hold' && n.isHit && !n.isReleased && !n.isHoldFailed && n.endTime) {
      const stillHeld = !!(keysPressed && keysPressed[n.column]);

      // Spurious early release: if the lane is still logically held, heal grace
      // Resolve grace against the event clock, not RAF timing. A re-press at
      // the exact deadline is valid; anything later resolves before input.
      if (n.releaseGraceUntil !== undefined) {
        if (isHoldGraceActive(currentTime, n.releaseGraceUntil) && stillHeld) {
          n.releaseGraceUntil = undefined;
        } else if (!isHoldGraceActive(currentTime, n.releaseGraceUntil)) {
          const transition = resolveHoldGrace(n, currentTime);
          n.releaseGraceUntil = transition.releaseGraceUntil;
          n.isHoldFailed = transition.isHoldFailed;
          n.isReleased = transition.isReleased;
          onMiss(n, false);
        }
      }
      // Or if reached end without release, and time elapsed past miss boundary.
      else if (n.releaseGraceUntil === undefined && currentTime - n.endTime > missBound) {
        n.isHoldFailed = true;
        n.isReleased = true;
        onMiss(n, false);
      }
    }
  });
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
  onFinish: (score: ScoreState, replay?: ReplayFrame[], hitErrors?: number[]) => void;
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
  beatmap: originalBeatmap,
  settings: propSettings,
  updateSettings,
  onFinish,
  onBack,
  replayRecord = null
}: GameplayCanvasProps) {
  const beatmap = React.useMemo(() => {
    let baseMap: SavedBeatmap = originalBeatmap as SavedBeatmap;
    const legacy = originalBeatmap as SavedBeatmap;
    // Re-parse from .osu source when available so timing/SV matches the current parser
    // (negative/zero SV, uninherited reset). Full merge when timingPoints were never stored.
    if (legacy.originalContent) {
      try {
        const parsed = parseBeatmap(legacy.originalContent, baseMap.id);
        if (!baseMap.timingPoints || baseMap.timingPoints.length === 0) {
          baseMap = {
            ...legacy,
            ...parsed,
            audioUrl: legacy.audioUrl,
            videoUrl: legacy.videoUrl,
            bgUrl: legacy.bgUrl,
            videoStartTime: legacy.videoStartTime !== undefined ? legacy.videoStartTime : parsed.videoStartTime,
            packageId: legacy.packageId,
            parentPackageId: legacy.parentPackageId,
            audioFilename: legacy.audioFilename,
            videoFilename: legacy.videoFilename,
            bgFilename: legacy.bgFilename,
            originalContent: legacy.originalContent,
            isServerMap: legacy.isServerMap,
          } as unknown as SavedBeatmap;
        } else {
          baseMap = {
            ...baseMap,
            timingPoints: parsed.timingPoints,
          } as SavedBeatmap;
        }
      } catch (err) {
        console.error('Failed to auto-repair/re-parse legacy beatmap timing points:', err);
      }
    }
    return {
      ...baseMap,
      notes: baseMap.notes ? baseMap.notes.map(n => ({ ...n })) : []
    };
  }, [originalBeatmap]);

  // Override settings if we're watching a replay
  const settings = React.useMemo(() => {
    if (replayRecord?.recordedSettings) {
      return {
        ...propSettings,
        ...replayRecord.recordedSettings,
        musicVolume: propSettings.musicVolume,
        hitsoundVolume: propSettings.hitsoundVolume,
        masterVolume: propSettings.masterVolume,
        videoOpacity: propSettings.videoOpacity,
        backgroundDim: propSettings.backgroundDim
      };
    }
    return propSettings;
  }, [propSettings, replayRecord]);

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const scrollModelRef = useRef<ScrollModel | null>(null);
  useEffect(() => {
    const enableMapSV = settings.enableMapSV !== false;
    scrollModelRef.current = createScrollModel(beatmap, enableMapSV);
  }, [beatmap, settings.enableMapSV]);

  const updateSettingsRef = useRef(updateSettings);
  useEffect(() => {
    updateSettingsRef.current = updateSettings;
  }, [updateSettings]);

  // Find earliest note time in the beatmap
  const firstNoteTime = React.useMemo(() => {
    const notes = beatmap.notes || [];
    if (notes.length === 0) return 0;
    return Math.min(...notes.map(n => n.time));
  }, [beatmap]);

  const startDelayMs = React.useMemo(() => {
    // If the first note starts in less than 2000ms, provide a lead-in delay of up to 2000ms.
    return Math.max(0, 2000 - firstNoteTime);
  }, [firstNoteTime]);

  const replayData = React.useMemo(
    () => normalizeReplayFrames(replayRecord?.replayFrames, beatmap.keyCount),
    [replayRecord?.replayFrames, beatmap.keyCount]
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hitErrorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const syncControllerRef = useRef<VideoSyncController | null>(null);

  // Replay structures
  const replayFramesRef = useRef<ReplayFrame[]>([]);
  const lastProcessedReplayTimeRef = useRef<number>(-1);
  const replayCursorRef = useRef<ReplayCursor>(createReplayCursor());

  // Callback ref to register HTMLVideoElement in non-serializable global registry correctly on mount/unmount
  const setVideoRef = React.useCallback((node: HTMLVideoElement | null) => {
    const previousNode = videoRef.current;
    if (previousNode && previousNode !== node) {
      try { previousNode.pause(); } catch (_e) {}
      syncControllerRef.current?.destroy();
      syncControllerRef.current = null;
      GameplayMediaRegistry.setVideo(null);
    }
    videoRef.current = node;
    GameplayMediaRegistry.setVideo(node);
    if (node) {
      try {
        node.muted = true;
        node.playsInline = true;
        node.preload = 'auto';
        if (node.readyState < 1) {
          node.load();
        }
      } catch (err) {
        console.warn('Error inside video registration player:', err);
      }
    }
  }, []);
  const animationFrameRef = useRef<number | null>(null);
  const isPrePlayRef = useRef<boolean>(true);

  const handleExit = () => {
    if (finishTimeoutRef.current) {
      clearTimeout(finishTimeoutRef.current);
      finishTimeoutRef.current = null;
    }
    executeTeardown(
      mainAudio,
      animationFrameRef.current,
      null,
      null,
      null,
      {
        timers: [
          finishTimeoutRef.current,
          uiJudgementTimeoutRef.current,
          comboBurstTimeoutRef.current,
          countdownTimeoutRef.current,
          unpauseTimeoutRef.current,
          scrollTimeoutRef.current,
          notificationTimeoutRef.current,
        ].filter((timer): timer is ReturnType<typeof setTimeout> => timer !== null),
        video: videoRef.current,
        videoSync: syncControllerRef.current,
      }
    );
    if (videoRef.current) {
      try { videoRef.current.pause(); } catch (e) {}
    }
    
    // If they failed or are at 0 HP, submit as finished fail record so they see performance telemetry and replay
    if (scoreStateRef.current.failed) {
      if (isMountedRef.current) {
        onFinish(scoreStateRef.current, replayFramesRef.current, hitErrorSamplesRef.current);
      }
    } else {
      onBack();
    }
  };
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);
  const isFocusModeRef = useRef<boolean>(false);

  useEffect(() => {
    isFocusModeRef.current = isFocusMode;
  }, [isFocusMode]);

  // Synchronize dynamic focus view modes with the programmatic Fullscreen API
  useEffect(() => {
    const handleFullscreenChange = () => {
        const active = FullscreenManager.isFullscreenActive();
      if (!active) {
        setIsFocusMode((prevActive) => {
          if (prevActive) {
            // Leaving fullscreen before the player starts must not create a
            // pause state underneath the pre-play screen.
            if (isPrePlayRef.current) return false;
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
  const notificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const audioStartPendingRef = useRef<boolean>(false);
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
    unstableRate: null,
    hitErrorSampleCount: 0,
    columnJudgements: initializeColumnJudgements(beatmap.keyCount),
  });

  const hitErrorSamplesRef = useRef<number[]>([]);
  const unstableRateAccumulatorRef = useRef(new UnstableRateAccumulator());

  const recordHitErrorSample = (error: number) => {
    if (typeof error !== 'number' || !Number.isFinite(error)) return;
    hitErrorSamplesRef.current.push(error);
    unstableRateAccumulatorRef.current.add(error);
    scoreStateRef.current.unstableRate = unstableRateAccumulatorRef.current.unstableRate;
    scoreStateRef.current.hitErrorSampleCount = hitErrorSamplesRef.current.length;
  };

  const maxComboPortionRef = useRef<number>(1);
  const currentComboPortionRef = useRef<number>(0);
  const totalJudgementsRef = useRef<number>(1);

  const [uiScore, setUiScore] = useState<number>(0);
  const [uiCombo, setUiCombo] = useState<number>(0);
  const [uiHp, setUiHp] = useState<number>(100);
  const [uiJudgement, setUiJudgement] = useState<{ text: string; color: string; time: number } | null>(null);
  const [comboBurst, setComboBurst] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [showCountdown, setShowCountdown] = useState<number>(0);
  const [unpauseCountdown, setUnpauseCountdown] = useState<number>(0);
  const [isFailed, setIsFailed] = useState<boolean>(false);

  // Active inputs trace (boolean edge + refcount for multi-source keyboard/touch)
  const keysPressedRef = useRef<boolean[]>([]);
  const lanePressCountRef = useRef<number[]>([]);
  const activeColumnsRef = useRef<boolean[]>([]);
  const hasKeyPressedOnceRef = useRef<boolean[]>([]);
  const progressBarRef = useRef<HTMLElement | HTMLInputElement | null>(null);
  const isScrubbingRef = useRef<boolean>(false);
  const lastVideoSeekTimeRef = useRef<number>(0);
  const wasPlayingRef = useRef<boolean>(false);
  const timeLabelRef = useRef<HTMLSpanElement>(null);
  const breakLabelRef = useRef<HTMLSpanElement>(null);
  const fpsLabelRef = useRef<HTMLSpanElement>(null);
  const fpsFramesRef = useRef<number>(0);
  const fpsLastSampleRef = useRef<number>(0);
  const isReplayMode = !!replayRecord;
  const isAutoplay = !isReplayMode && (settings.selectedMods || []).includes('AT');
  const finishTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uiJudgementTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const comboBurstTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unpauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const isPausedRef = useRef<boolean>(false);
  const showCountdownRef = useRef<number>(0);
  const unpauseCountdownRef = useRef<number>(0);
  const showSettingsModalRef = useRef<boolean>(false);
  const showInfoModalRef = useRef<boolean>(false);

  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { showCountdownRef.current = showCountdown; }, [showCountdown]);
  useEffect(() => { unpauseCountdownRef.current = unpauseCountdown; }, [unpauseCountdown]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      executeTeardown(mainAudio, animationFrameRef.current, null, null, null, {
        timers: [
          finishTimeoutRef.current,
          uiJudgementTimeoutRef.current,
          comboBurstTimeoutRef.current,
          countdownTimeoutRef.current,
          unpauseTimeoutRef.current,
          scrollTimeoutRef.current,
          notificationTimeoutRef.current,
        ].filter((timer): timer is ReturnType<typeof setTimeout> => timer !== null),
        video: videoRef.current,
        videoSync: syncControllerRef.current,
      });
    };
  }, []);
  
  // Dynamic visual visualizers
  const particlesRef = useRef<Particle[]>([]);
  const screenShakeRef = useRef<number>(0);
  const laneGlowRef = useRef<number[]>([]);
  
  // Judgement popup tracker
  const currentJudgementRef = useRef<{ text: string, color: string, time: number, size: number } | null>(null);

  // Hit error timing logs
  const hitErrorTicksRef = useRef<HitErrorTick[]>([]);
  const colsLayoutBufferRef = useRef<ColumnLayout[]>([]);
  const countdownStartTimeRef = useRef<number | null>(null);

  const [loadingAudioProgress, setLoadingAudioProgress] = useState<number>(0);
  const [isAudioLoaded, setIsAudioLoaded] = useState<boolean>(false);
  const [rendererLoading, setRendererLoading] = useState<boolean>(false);

  // Custom pre-play stage states
  const [isPrePlay, setIsPrePlay] = useState<boolean>(true);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  useEffect(() => { isPrePlayRef.current = isPrePlay; }, [isPrePlay]);
  useEffect(() => { showSettingsModalRef.current = showSettingsModal; }, [showSettingsModal]);
  useEffect(() => { showInfoModalRef.current = showInfoModal; }, [showInfoModal]);

  // PIPELINE DIAGNOSTICS & DECODING FALLBACK STATES
  const [isPlayingFallback, setIsPlayingFallback] = useState<boolean>(false);
  const [isVideoMissing, setIsVideoMissing] = useState<boolean>(false);
  const [isVideoError, setIsVideoError] = useState<boolean>(false);
  /** Soft notice for AVI/MKV/etc — not a hard error; static bg is used. */
  const [videoFormatWarning, setVideoFormatWarning] = useState<string | null>(null);
  const [showVideoFormatWarning, setShowVideoFormatWarning] = useState(true);
  // Resolved media URLs must live in React state — mutating beatmap.videoUrl does not re-render <video>
  const [mediaUrls, setMediaUrls] = useState({
    audioUrl: originalBeatmap.audioUrl || '',
    videoUrl: originalBeatmap.videoUrl || '',
    bgUrl: originalBeatmap.bgUrl || '',
  });

  // Playfield Renderer References
  const rendererCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const playfieldSurfaceRef = useRef<HTMLDivElement | null>(null);
  const activeRendererRef = useRef<IPlayfieldRenderer | null>(null);

  useEffect(() => {
    let active = true;

    const initRenderer = async () => {
      // 1. Destroy existing renderer if any
      if (activeRendererRef.current) {
        try {
          activeRendererRef.current.destroy();
        } catch (e) {
          console.warn('Error destroying active playfield renderer:', e);
        }
        activeRendererRef.current = null;
      }

      const engine = settings.renderEngine || 'canvas';
      const isBabylon = engine === 'babylon';
      const canvas = isBabylon ? rendererCanvasRef.current : canvasRef.current;
      if (!canvas) return;

      try {
        let renderer: IPlayfieldRenderer;
        if (engine === 'babylon') {
          setRendererLoading(true);
          const { BabylonPlayfieldRenderer } = await import('../render/babylon/BabylonPlayfieldRenderer');
          renderer = new BabylonPlayfieldRenderer();
        } else {
          renderer = new Canvas2DRenderer();
        }
        setRendererLoading(false);
        const keyCount = beatmap.keyCount;
        await renderer.init(canvas, { settings, keyCount });
        
        if (!active) {
          renderer.destroy();
          return;
        }

        activeRendererRef.current = renderer;

        // Force initial resize
        const container = containerRef.current;
        const canvasRect = canvas.getBoundingClientRect();
        const width = canvasRect.width || (container ? container.getBoundingClientRect().width : 400);
        const height = canvasRect.height || (container ? container.getBoundingClientRect().height : 700);
        const dpr = settings.limitDprToOne ? 1 : Math.min(1.5, window.devicePixelRatio || 1);
        renderer.resize(width, height, dpr);
      } catch (err) {
        console.error('Failed to initialize playfield renderer:', err);
        setRendererLoading(false);
        // Fallback to canvas
        if (engine === 'babylon' && updateSettingsRef.current) {
          console.warn('WebGL renderer initialization failed. Falling back to 2D Canvas engine...');
          updateSettingsRef.current({ renderEngine: 'canvas', skinId: 'custom', squareRenderStyle: 'rhythmmania' });
        }
      }
    };

    initRenderer();

    return () => {
      active = false;
      if (activeRendererRef.current) {
        try {
          activeRendererRef.current.destroy();
        } catch (e) {}
        activeRendererRef.current = null;
      }
    };
  }, [settings.renderEngine, settings.limitDprToOne, beatmap.keyCount, isAudioLoaded]);

  // osu!lazer ManiaHitWindows DifficultyRange. DT/HT do not change windows.
  const difficultyRange = (od: number, min: number, mid: number, max: number): number => {
    if (od > 5) return mid + (max - mid) * ((od - 5) / 5);
    if (od < 5) return mid + (mid - min) * ((od - 5) / 5);
    return mid;
  };
  const lazerWindowMs = (
    od: number,
    min: number,
    mid: number,
    max: number,
    difficultyMultiplier = 1,
  ): number => Math.floor(difficultyRange(od, min, mid, max) / difficultyMultiplier) + 0.5;

  const getJudgementWindows = (od: number, difficultyMultiplier: number): JudgementWindow[] => {
    return [
      {
        type: 'marvelous',
        name: 'MARVELOUS',
        windowMs: lazerWindowMs(od, 22.4, 19.4, 13.9, difficultyMultiplier),
        baseScore: ACCURACY_BASE_SCORE.marvelous,
        hpDelta: 3,
        color: '#22d3ee', // Cyan
        glowColor: 'rgba(34,211,238,0.5)',
      },
      {
        type: 'perfect',
        name: 'PERFECT',
        windowMs: lazerWindowMs(od, 64, 49, 34, difficultyMultiplier),
        baseScore: ACCURACY_BASE_SCORE.perfect,
        hpDelta: 2,
        color: '#facc15', // Neon Gold
        glowColor: 'rgba(250,204,21,0.4)',
      },
      {
        type: 'great',
        name: 'GREAT',
        windowMs: lazerWindowMs(od, 97, 82, 67, difficultyMultiplier),
        baseScore: ACCURACY_BASE_SCORE.great,
        hpDelta: 1,
        color: '#4ade80', // Green
        glowColor: 'rgba(74,222,128,0.3)',
      },
      {
        type: 'good',
        name: 'GOOD',
        windowMs: lazerWindowMs(od, 127, 112, 97, difficultyMultiplier),
        baseScore: ACCURACY_BASE_SCORE.good,
        hpDelta: 0.2,
        color: '#3b82f6', // Indigo
        glowColor: 'rgba(59,130,246,0.2)',
      },
      {
        type: 'bad',
        name: 'BAD',
        windowMs: lazerWindowMs(od, 151, 136, 121, difficultyMultiplier),
        baseScore: ACCURACY_BASE_SCORE.bad,
        hpDelta: -3,
        color: '#ec4899', // Pink
        glowColor: 'rgba(236,72,153,0.1)',
      },
      {
        type: 'miss',
        name: 'MISS',
        windowMs: lazerWindowMs(od, 188, 173, 158, difficultyMultiplier),
        baseScore: ACCURACY_BASE_SCORE.miss,
        hpDelta: -10,
        color: '#ef4444', // Hot Red
        glowColor: 'rgba(239,68,68,0.3)',
      }
    ];
  };

  // Lazer Mania EZ/HR scale hit-window difficulty rather than changing OD.
  const windowDifficultyMultiplier = settings.selectedMods?.includes('HR')
    ? 1.4
    : settings.selectedMods?.includes('EZ')
      ? 1 / 1.4
      : 1;
  const judgementWindows = getJudgementWindows(beatmap.overallDifficulty, windowDifficultyMultiplier);
  const marvelousJudg = judgementWindows.find(w => w.type === 'marvelous') || judgementWindows[0];
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
    lanePressCountRef.current = new Array(beatmap.keyCount).fill(0);
    activeColumnsRef.current = new Array(beatmap.keyCount).fill(false);
    laneGlowRef.current = new Array(beatmap.keyCount).fill(0);
    hasKeyPressedOnceRef.current = new Array(beatmap.keyCount).fill(false);
    
    hitErrorSamplesRef.current = [];
    unstableRateAccumulatorRef.current.reset();
    
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
      unstableRate: null,
      hitErrorSampleCount: 0,
      columnJudgements: initializeColumnJudgements(beatmap.keyCount),
      isAutoplay: isAutoplay,
    };

    // osu!lazer mania standardised score: max combo portion for all-Marvelous FC
    const totalJudgements = countMapJudgements(beatmap.notes);
    totalJudgementsRef.current = totalJudgements;
    maxComboPortionRef.current = computeMaxComboPortion(totalJudgements);
    currentComboPortionRef.current = 0;

    // Reset replay tracking
    replayFramesRef.current = [{ time: 0, keysPressed: new Array(beatmap.keyCount).fill(false) }];

    // Reset hit error timing ticks
    hitErrorTicksRef.current = [];
    hitErrorSamplesRef.current = [];
    unstableRateAccumulatorRef.current.reset();
    lastProcessedReplayTimeRef.current = -1;
    resetReplayCursor(replayCursorRef.current, replayData);
    
    syncControllerRef.current?.destroy();
    syncControllerRef.current = null;
    audioStartPendingRef.current = false;
    
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
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => {
          scrollTimeoutRef.current = null;
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

  // Initialize and load track + background media
  useEffect(() => {
    previewPlayer.stopImmediately();
    let active = true;
    const loadGeneration = mainAudio.beginLoadGeneration();
    setIsAudioLoaded(false);
    setIsVideoError(false);
    setIsVideoMissing(false);
    setVideoFormatWarning(null);
    setShowVideoFormatWarning(true);
    setIsPlayingFallback(false);
    syncControllerRef.current?.destroy();
    syncControllerRef.current = null;

    const loadBgAudio = async () => {
      const mapWithPkg = beatmap as SavedBeatmap;
      try {
        // Prefer shared unpacker (typed blobs + video fallback + package id cache key)
        await unpackBeatmap(mapWithPkg, false);
      } catch (mediaErr) {
        console.error('Failed to resolve beatmap media from package:', mediaErr);
      }

      if (!active) return;

      const cached = storageManager.lruMediaCache.get(beatmap.id);
      const resolved = {
        audioUrl: cached?.audioUrl || beatmap.audioUrl || '',
        videoUrl: cached?.videoUrl || beatmap.videoUrl || '',
        bgUrl: cached?.bgUrl || beatmap.bgUrl || '',
      };
      beatmap.audioUrl = resolved.audioUrl;
      beatmap.videoUrl = resolved.videoUrl;
      beatmap.bgUrl = resolved.bgUrl;
      setMediaUrls(resolved);

      mainAudio.init();
      mainAudio.setVolumes(settings.musicVolume, settings.hitsoundVolume, settings.masterVolume);
      mainAudio.setOffset(settings.audioOffset);

      let activeRate = 1.0;
      if (settings.selectedMods?.includes('DT')) {
        activeRate = 1.5;
      } else if (settings.selectedMods?.includes('HT')) {
        activeRate = 0.75;
      }
      mainAudio.playbackRate = activeRate;

       const success = await mainAudio.loadTrack(resolved.audioUrl || '', (p) => {
         if (active && mainAudio.isLoadGenerationCurrent(loadGeneration)) setLoadingAudioProgress(p);
       }, loadGeneration);
       await mainAudio.loadBeatmapHitsounds(beatmap.hitSoundUrls || {}, loadGeneration);

       if (!active || !mainAudio.isLoadGenerationCurrent(loadGeneration)) return;

       setIsAudioLoaded(true);
      if (!success) {
        setIsPlayingFallback(true);
      }

      const declaredVideo = mapWithPkg.videoFilename as string | undefined;
      if (declaredVideo && !resolved.videoUrl) {
        if (!isBrowserPlayableVideoFilename(declaredVideo)) {
          const fmt = getVideoFormatLabel(declaredVideo);
          setVideoFormatWarning(fmt);
          setShowVideoFormatWarning(true);
        } else {
          setIsVideoMissing(true);
        }
      }

      initializeGameplay();
    };

    loadBgAudio();

    return () => {
      active = false;
      mainAudio.beginLoadGeneration();
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
      mainAudio.setVolumes(settings.musicVolume, settings.hitsoundVolume, settings.masterVolume);
      mainAudio.setOffset(settings.audioOffset);
    }
  }, [isAudioLoaded, settings.musicVolume, settings.hitsoundVolume, settings.masterVolume, settings.audioOffset]);

  const snapVideoToAudio = (audioTimeMs?: number, playIfReady: boolean = true) => {
    const video = videoRef.current;
    if (!video) return;
    const tMs = audioTimeMs ?? audioTimeRef.current;
    const target = computeTargetVideoTimeSec(
      tMs,
      beatmap.videoStartTime || 0,
      settingsRef.current.videoOffset || 0
    );
    try {
      video.playbackRate = mainAudio.playbackRate;
      if (target < 0) {
        if (video.currentTime > 0.001) video.currentTime = 0;
        if (!video.paused) video.pause();
        return;
      }
      if (Math.abs(video.currentTime - target) > 0.012) {
        video.currentTime = target;
      }
      if (playIfReady && video.paused) {
        video.play().catch(() => {});
      }
      syncControllerRef.current?.snapToAudio(playIfReady);
    } catch (_e) {}
  };

  // Handle countdown intervals
  useEffect(() => {
    if (showCountdown > 0) {
      if (showCountdown === 3) {
        countdownStartTimeRef.current = performance.now();
      }
       const t = setTimeout(() => {
         countdownTimeoutRef.current = null;
        setShowCountdown(prev => {
          if (prev === 1) {
            // Play audio as soon as countdown wraps up; hard-align video to master clock
            audioStartPendingRef.current = true;
            void mainAudio.playAsync(beatmap.bpm, settings.audioOffset, startDelayMs).then(() => {
              audioStartPendingRef.current = false;
              isPlayingRef.current = true;
              audioTimeRef.current = mainAudio.getCurrentTimeMs();
              snapVideoToAudio(audioTimeRef.current, true);
            }).catch(() => {
              audioStartPendingRef.current = false;
            });
          }
          return prev - 1;
        });
       }, 700);
       countdownTimeoutRef.current = t;
       return () => clearTimeout(t);
    }
  }, [showCountdown, beatmap.bpm, settings.audioOffset, startDelayMs]);

  // Handle unpause countdown intervals
  useEffect(() => {
    if (unpauseCountdown > 0) {
       const t = setTimeout(() => {
         unpauseTimeoutRef.current = null;
        setUnpauseCountdown(prev => {
          if (prev === 1) {
            // Unpause visual systems — snap A/V phase before free-run
            lastProcessedReplayTimeRef.current = -1;
            setIsPaused(false);
            isPlayingRef.current = true;
            void mainAudio.playAsync(beatmap.bpm, settings.audioOffset).then(() => {
              audioTimeRef.current = mainAudio.getCurrentTimeMs();
              snapVideoToAudio(audioTimeRef.current, true);
            });
          }
          return prev - 1;
        });
       }, 1000); // Actual 1-second countdown ticks to give the player optimal physical recovery window
       unpauseTimeoutRef.current = t;
       return () => clearTimeout(t);
    }
  }, [unpauseCountdown]);

  // Unified Keyboard processing & Multi-Touch Input Adapter
  // Listeners stay mounted for the play session; gate state is read from refs to avoid
  // teardown/reset mid-hold when pause/countdown/modals flip.
  useEffect(() => {
    const touchTarget = settings.renderEngine === 'babylon'
      ? playfieldSurfaceRef.current
      : containerRef.current;
    const keyCount = beatmap.keyCount;

    if (lanePressCountRef.current.length !== keyCount) {
      lanePressCountRef.current = new Array(keyCount).fill(0);
    }
    
    // Refcounted lane press so keyboard + touch on the same column do not fight.
    const virtualKeyDown = (colIndex: number) => {
      if (isPrePlayRef.current || showCountdownRef.current > 0 || isPausedRef.current || scoreStateRef.current.failed || isAutoplay) return;
      if (colIndex < 0 || colIndex >= keyCount) return;

      const counts = lanePressCountRef.current;
      counts[colIndex] = (counts[colIndex] || 0) + 1;
      if (counts[colIndex] !== 1) return;

      keysPressedRef.current[colIndex] = true;
      activeColumnsRef.current[colIndex] = true;
      laneGlowRef.current[colIndex] = 1.0;
      if (hasKeyPressedOnceRef.current) {
        hasKeyPressedOnceRef.current[colIndex] = true;
      }
      
      triggerHitEvent(colIndex);

      if (!isReplayMode) {
        replayFramesRef.current.push({
          time: audioTimeRef.current,
          keysPressed: [...keysPressedRef.current]
        });
      }
    };

    const virtualKeyUp = (colIndex: number) => {
      if (isPrePlayRef.current || showCountdownRef.current > 0 || isPausedRef.current || scoreStateRef.current.failed || isAutoplay) return;
      if (colIndex < 0 || colIndex >= keyCount) return;

      const counts = lanePressCountRef.current;
      if ((counts[colIndex] || 0) <= 0) return;
      counts[colIndex] -= 1;
      if (counts[colIndex] > 0) return;

      keysPressedRef.current[colIndex] = false;
      activeColumnsRef.current[colIndex] = false;
      
      triggerReleaseEvent(colIndex);

      if (!isReplayMode) {
        replayFramesRef.current.push({
          time: audioTimeRef.current,
          keysPressed: [...keysPressedRef.current]
        });
      }
    };

    // 1. Keyboard event parsing listeners
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.repeat) return;
      
      if (isPrePlayRef.current) {
        if (showSettingsModalRef.current || showInfoModalRef.current) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          onBack();
        }
        return;
      }

      const currentSettings = settingsRef.current;

      // 1.1 Quick Retry Check
      const retryKey = (currentSettings.bindRetry || 'r').toLowerCase();
      if (e.key.toLowerCase() === retryKey) {
        e.preventDefault();
        restartMap();
        return;
      }

      // 1.2 Pause/Resume Check
      const pauseKey = (currentSettings.bindPause || 'escape').toLowerCase();
      const isPauseTrigger = e.key.toLowerCase() === pauseKey || e.key === 'Escape';

      if (isPauseTrigger) {
        e.preventDefault();
        if (showCountdownRef.current > 0 || unpauseCountdownRef.current > 0) {
          return; // Ignore / disable Escape key during active countdowns
        }
        if (isFocusModeRef.current) {
          // Programmatically exit focus mode which triggers the fullscreen change listener to exit and pause
          FullscreenManager.exitFocusMode();
        } else {
          togglePause();
        }
        return;
      }

      if (isReplayMode || isAutoplay) return; // ignore user key taps in replay mode or autoplay

      const keyLayout = currentSettings.bindings[keyCount] || [];
      const key = e.key.toLowerCase();
      const colIndex = keyLayout.findIndex((k) => k.toLowerCase() === key);
      if (colIndex !== -1) {
        virtualKeyDown(colIndex);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      
      if (isReplayMode || isAutoplay) return; // ignore user key taps in replay mode or autoplay

      const currentSettings = settingsRef.current;
      const keyLayout = currentSettings.bindings[keyCount] || [];
      const key = e.key.toLowerCase();
      const colIndex = keyLayout.findIndex((k) => k.toLowerCase() === key);
      if (colIndex !== -1) {
        virtualKeyUp(colIndex);
      }
    };

    // On focus restore after blur/pause, drop stale press counts so holds do not stick forever
    const reconcileInputOnFocus = () => {
      if (isPausedRef.current || showCountdownRef.current > 0 || unpauseCountdownRef.current > 0) return;
      lanePressCountRef.current.fill(0);
      for (let i = 0; i < keyCount; i++) {
        if (keysPressedRef.current[i]) {
          keysPressedRef.current[i] = false;
          activeColumnsRef.current[i] = false;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('focus', reconcileInputOnFocus);

    // 2. Tactile multi-touch adapter tracking (touchstart, touchmove, touchend, touchcancel)
    let touchAdapter: TouchInputAdapter | null = null;
    let handleTouchStart: ((e: TouchEvent) => void) | null = null;
    let handleTouchMove: ((e: TouchEvent) => void) | null = null;
    let handleTouchEnd: ((e: TouchEvent) => void) | null = null;
    let handleTouchCancel: ((e: TouchEvent) => void) | null = null;

    if (touchTarget) {
      touchAdapter = new TouchInputAdapter(
        virtualKeyDown,
        virtualKeyUp,
        settings.renderEngine === 'babylon'
      );

      handleTouchStart = (e: TouchEvent) => {
        if (isReplayMode || isAutoplay) return;
        const rect = touchTarget.getBoundingClientRect();
        touchAdapter?.handleTouchStart(e, rect, keyCount, settingsRef.current.upsurfaceNoteMode);
      };

      handleTouchMove = (e: TouchEvent) => {
        if (isReplayMode || isAutoplay) return;
        const rect = touchTarget.getBoundingClientRect();
        touchAdapter?.handleTouchMove(e, rect, keyCount, settingsRef.current.upsurfaceNoteMode);
      };

      handleTouchEnd = (e: TouchEvent) => {
        if (isReplayMode || isAutoplay) return;
        touchAdapter?.handleTouchEnd(e);
      };

      handleTouchCancel = (e: TouchEvent) => {
        if (isReplayMode || isAutoplay) return;
        touchAdapter?.handleTouchCancel(e);
      };

      // Register non-passive events to allow explicit preventDefault override inside raw handlers, blocking system browser zooms
      touchTarget.addEventListener('touchstart', handleTouchStart, { passive: false });
      touchTarget.addEventListener('touchmove', handleTouchMove, { passive: false });
      touchTarget.addEventListener('touchend', handleTouchEnd, { passive: false });
      touchTarget.addEventListener('touchcancel', handleTouchCancel, { passive: false });
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('focus', reconcileInputOnFocus);
      
      if (touchTarget) {
        if (handleTouchStart) touchTarget.removeEventListener('touchstart', handleTouchStart);
        if (handleTouchMove) touchTarget.removeEventListener('touchmove', handleTouchMove);
        if (handleTouchEnd) touchTarget.removeEventListener('touchend', handleTouchEnd);
        if (handleTouchCancel) touchTarget.removeEventListener('touchcancel', handleTouchCancel);
      }
      touchAdapter?.reset();
    };
  }, [beatmap.keyCount, replayData, isAudioLoaded, settings.renderEngine]);

  // Judgement scoring evaluator
  const triggerHitEvent = (colIndex: number) => {
    const playTime = audioTimeRef.current;
    
    // Check if we are currently in a grace period for a hold note in this column
    const activeHoldAndReleased = notesRef.current.find(
      (n) => n.column === colIndex && n.type === 'hold' && n.isHit && !n.isReleased && !n.isHoldFailed && n.releaseGraceUntil !== undefined
    );
    if (activeHoldAndReleased) {
      if (isHoldGraceActive(playTime, activeHoldAndReleased.releaseGraceUntil)) {
        activeHoldAndReleased.releaseGraceUntil = undefined;
        spawnParticles(colIndex, '#22d3ee');
        return;
      }
      const transition = resolveHoldGrace(activeHoldAndReleased, playTime);
      activeHoldAndReleased.releaseGraceUntil = transition.releaseGraceUntil;
      activeHoldAndReleased.isHoldFailed = transition.isHoldFailed;
      activeHoldAndReleased.isReleased = transition.isReleased;
      applyJudgement(missJudg, colIndex);
    }

    // Find earliest hittable note, or a head-missed LN that can still be salvaged for the tail
    const note = notesRef.current.find(
      (n) =>
        n.column === colIndex &&
        (
          (!n.isHit && !n.isMissed) ||
          (n.type === 'hold' && n.isMissed && !n.isHit && !n.isReleased && !n.isHoldFailed)
        )
    );
    
    if (!note) return;

    const missWindow = judgementWindows[judgementWindows.length - 1].windowMs;

    // Head already missed: pressing during the body/tail engages the LN for end scoring only
    if (note.type === 'hold' && note.isMissed && !note.isHit) {
      if (note.endTime && playTime - note.endTime > missWindow) {
        return;
      }
      note.isHit = true;
      note.hitTime = playTime;
      spawnParticles(colIndex, '#22d3ee');
      return;
    }

    // Absolute distance in timeline
    const diff = playTime - note.time;

    // The note must fall within the maximum allowable window (Bad/Miss window boundary)
    const maxWindow = missWindow;
    
    // If the note is too early to even register, disregard inputs
    if (diff < -maxWindow) {
      return; 
    }

    // Assign judgement
    const resolvedJudgement = resolveJudgementForError(diff, judgementWindows);

    if (resolvedJudgement.type !== 'miss') {
      // Registrations
      note.isHit = true;
      note.hitTime = playTime;
      
      applyJudgement(resolvedJudgement, colIndex);
      mainAudio.playBeatmapHitsound(note.hitSound, note.hitSample?.filename);

      // Calculate and store Hit Error details for timing feedback meter
      const hitError = playTime - note.time;
      recordHitErrorSample(hitError);

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
      if (resolvedJudgement.type === 'marvelous' && !settingsRef.current.disableLaneShake) {
        screenShakeRef.current = 4;
      }
    } else {
      // Tap in miss band (bad < |err| <= miss): head miss only; holds stay alive for tail salvage
      note.isMissed = true;
      if (note.type === 'hold') {
        applyJudgement(resolvedJudgement, colIndex); // Head miss only
        note.isHit = true; // Engage body/tail while key is down
        note.hitTime = playTime;
      } else {
        applyJudgement(resolvedJudgement, colIndex);
      }
    }
  };

  const triggerReleaseEvent = (colIndex: number) => {
    const playTime = audioTimeRef.current;
    
    // Find active hold note currently marked "Hit" but not yet "Released" or "HoldFailed"
    const holdNote = notesRef.current.find(
      (n) => n.column === colIndex && n.type === 'hold' && n.isHit && !n.isReleased && !n.isHoldFailed
    );
    
    if (!holdNote || !holdNote.endTime) return;

    const endDiff = playTime - holdNote.endTime;
    const graceThreshold = -missJudg.windowMs;
    const graceDuration = missJudg.windowMs;

    // If released prematurely: trigger a grace re-key window
    if (endDiff < graceThreshold) {
      holdNote.releaseGraceUntil = playTime + graceDuration; // derived grace window
      return;
    }

    // Otherwise, they are releasing near the end (normal release window evaluation)
    holdNote.isReleased = true;
    holdNote.releaseTime = playTime;
    const tailJudgement = getHoldTailJudgement(endDiff, judgementWindows);
    applyJudgement(tailJudgement, colIndex);
    if (tailJudgement.type !== 'miss') {
      recordHitErrorSample(endDiff);
      mainAudio.playBeatmapHitsound(holdNote.hitSound, holdNote.hitSample?.filename);
    } else {
      holdNote.isHoldFailed = true;
      if (!settingsRef.current.disableLaneShake) {
        screenShakeRef.current = 6;
      }
    }
  };

  // Score counter math accumulator
  const applyJudgement = (judg: JudgementWindow, col: number) => {
    const state = scoreStateRef.current;
    if (!state.columnJudgements || state.columnJudgements.length === 0) {
      state.columnJudgements = initializeColumnJudgements(beatmap.keyCount);
    }
    if (typeof col === 'number' && col >= 0) {
      incrementColumnJudgement(state.columnJudgements, col, judg.type);
    }

    // Upgrades
    if (judg.type === 'miss') {
      state.missCount++;
      state.combo = 0;
    } else {
      state.combo++;
      if (state.combo > state.maxCombo) {
        state.maxCombo = state.combo;
      }
      if (state.combo >= 50 && state.combo % 50 === 0 && !settingsRef.current.disableParticles) {
        const burstCombo = state.combo;
        setComboBurst(burstCombo);
        if (comboBurstTimeoutRef.current) clearTimeout(comboBurstTimeoutRef.current);
        comboBurstTimeoutRef.current = setTimeout(() => {
          comboBurstTimeoutRef.current = null;
          if (isMountedRef.current) {
            setComboBurst(current => current === burstCombo ? null : current);
          }
        }, 900);
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

    // osu!lazer mania accuracy (Perfect=305) + standardised total score
    const counts = {
      marvelousCount: state.marvelousCount,
      perfectCount: state.perfectCount,
      greatCount: state.greatCount,
      goodCount: state.goodCount,
      badCount: state.badCount,
      missCount: state.missCount,
    };
    state.accuracy = computeAccuracyPercent(counts);

    currentComboPortionRef.current += getComboScoreChange(judg.type, state.combo);
    const modMultiplier = computeModMultiplier(settings.selectedMods);
    state.score = computeTotalScore({
      currentComboPortion: currentComboPortionRef.current,
      maxComboPortion: maxComboPortionRef.current,
      accuracyPercent: state.accuracy,
      judgedCount: countTotalHits(counts),
      totalJudgements: totalJudgementsRef.current,
      modMultiplier,
    });

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
    if (uiJudgementTimeoutRef.current) {
      clearTimeout(uiJudgementTimeoutRef.current);
    }
    uiJudgementTimeoutRef.current = setTimeout(() => {
      uiJudgementTimeoutRef.current = null;
      if (isMountedRef.current) {
        setUiJudgement(curr => {
          if (curr && curr.time === now) return null;
          return curr;
        });
      }
    }, 600);

    // Reflect to fast visual UI hooks (triggered carefully)
    setUiScore(state.score);
    setUiCombo(state.combo);
    setUiHp(state.hp);
  };

  // Sparkles particle engine
  const spawnParticles = (colIndex: number, color: string) => {
    if (settings.disableParticles) return;
    const canvas = settings.renderEngine === 'babylon' ? rendererCanvasRef.current : canvasRef.current;
    if (!canvas) return;
    
    const keyCount = beatmap.keyCount;
     const totalWeight = keyCount;
    const dpr = settings.limitDprToOne ? 1 : Math.min(1.5, window.devicePixelRatio || 1);
    const logicalWidth = canvas.width / dpr;
    const logicalHeight = canvas.height / dpr;
    const baseWidth = logicalWidth / totalWeight;
      const styles = getColumnStyles(keyCount, baseWidth, settings.skinId, settings.customSkinColors, getLaneColors(settings, keyCount));
    
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
    const canvas = settings.renderEngine === 'babylon' ? rendererCanvasRef.current : canvasRef.current;
    if (!canvas) return;

    // Handle high-dpi monitors for pristine retina canvas crispness with performance caps
    const resizeCanvas = () => {
      const container = containerRef.current;
      if (!container || !canvas) return;
      
       const rect = canvas.getBoundingClientRect();
      const currentSettings = settingsRef.current;
      const dpr = currentSettings.limitDprToOne ? 1 : Math.min(1.5, window.devicePixelRatio || 1);
      
      if (activeRendererRef.current) {
           activeRendererRef.current.resize(rect.width || container.getBoundingClientRect().width, rect.height || container.getBoundingClientRect().height, dpr);
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Track notes elapsed to trigger automatic Miss judgments
    const checkAutonomousMisses = (currentTime: number) => {
      checkNotesAutonomousMisses(
        notesRef.current,
        currentTime,
        missJudg.windowMs,
        (n, isDoubleMiss) => {
          if (isDoubleMiss) {
            applyJudgement(missJudg, n.column);
            applyJudgement(missJudg, n.column);
          } else {
            applyJudgement(missJudg, n.column);
          }
        },
        keysPressedRef.current
      );
    };

    // Canvas Draw Thread
    const render = () => {
      const activeCanvas = settings.renderEngine === 'babylon' ? rendererCanvasRef.current : canvasRef.current;
      if (!activeCanvas) return;

      const dpr = settings.limitDprToOne ? 1 : Math.min(1.5, window.devicePixelRatio || 1);
      const width = activeCanvas.clientWidth || activeCanvas.width / dpr;
      const height = activeCanvas.clientHeight || activeCanvas.height / dpr;

      // Smoothly slide the rendering offset towards the actual audioOffset to prevent note visual teleportations mid-flight:
      smoothOffsetRef.current += (settings.audioOffset - smoothOffsetRef.current) * 0.08;

      let songTime;
      if (isScrubbingRef.current) {
        songTime = audioTimeRef.current;
      } else {
        const offsetDiff = settings.audioOffset - smoothOffsetRef.current;

        // Keep the countdown clock until AudioContext resume/start has completed.
        // Otherwise getCurrentTimeMs() briefly reports 0 and notes jump forward,
        // then snap back to the delayed audio start position.
        if ((showCountdown > 0 || audioStartPendingRef.current) && countdownStartTimeRef.current !== null) {
          const elapsed = performance.now() - countdownStartTimeRef.current;
          // Freeze at the handoff point if audio startup takes longer than a frame.
          songTime = -startDelayMs - COUNTDOWN_DURATION_MS + Math.min(elapsed, COUNTDOWN_DURATION_MS);
        } else {
          const rawSongTime = mainAudio.getCurrentTimeMs();
          songTime = rawSongTime + offsetDiff;
        }

        audioTimeRef.current = songTime;
      }

      if (breakLabelRef.current) {
        const inBreak = (beatmap.breaks || []).some(
          section => songTime >= section.startTime && songTime < section.endTime
        );
        breakLabelRef.current.style.opacity = inBreak ? '1' : '0';
      }

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

      // FPS readout (updated twice per second to avoid layout churn)
      if (fpsLabelRef.current) {
        const fpsNow = performance.now();
        if (fpsLastSampleRef.current === 0) {
          fpsLastSampleRef.current = fpsNow;
          fpsFramesRef.current = 0;
        }
        fpsFramesRef.current++;
        const elapsed = fpsNow - fpsLastSampleRef.current;
        if (elapsed >= 500) {
          fpsLabelRef.current.innerText = `${Math.round((fpsFramesRef.current * 1000) / elapsed)} FPS`;
          fpsFramesRef.current = 0;
          fpsLastSampleRef.current = fpsNow;
        }
      }

      // Replay simulation playback
      if (replayData && replayData.length > 0 && isPlayingRef.current && !isPaused && showCountdown === 0) {
        consumeReplayFrames(replayData, replayCursorRef.current, songTime, frame => {
          audioTimeRef.current = frame.time;
          checkNotesAutonomousMisses(
            notesRef.current,
            frame.time,
            missJudg.windowMs,
            (note) => applyJudgement(missJudg, note.column),
            keysPressedRef.current
          );
          for (let col = 0; col < beatmap.keyCount; col++) {
            const wasPressed = keysPressedRef.current[col];
            const isCurrentlyPressed = frame.keysPressed[col];
            if (!wasPressed && isCurrentlyPressed) {
              keysPressedRef.current[col] = true;
              activeColumnsRef.current[col] = true;
              laneGlowRef.current[col] = 1.0;
              hasKeyPressedOnceRef.current[col] = true;
              triggerHitEvent(col);
            } else if (wasPressed && !isCurrentlyPressed) {
              keysPressedRef.current[col] = false;
              activeColumnsRef.current[col] = false;
              triggerReleaseEvent(col);
            }
          }
        });
        audioTimeRef.current = songTime;
        checkNotesAutonomousMisses(
          notesRef.current,
          songTime,
          missJudg.windowMs,
          (note) => applyJudgement(missJudg, note.column),
          keysPressedRef.current
        );
      }

      if (isPlayingRef.current && !isPaused && showCountdown === 0) {
        if (isAutoplay) {
          const dueEvents: { type: 'head' | 'tail'; note: HitObject; eventTime: number }[] = [];

          for (const note of notesRef.current) {
            if (!note.isHit && !note.isMissed && note.time <= songTime) {
              dueEvents.push({ type: 'head', note, eventTime: note.time });
            }
            if (note.type === 'hold' && note.isHit && !note.isReleased && !note.isHoldFailed && note.endTime !== undefined && note.endTime <= songTime) {
              dueEvents.push({ type: 'tail', note, eventTime: note.endTime });
            }
          }

          if (dueEvents.length > 0) {
            dueEvents.sort((a, b) => a.eventTime - b.eventTime);

            for (const evt of dueEvents) {
              const n = evt.note;
              if (evt.type === 'head') {
                if (n.isHit || n.isMissed) continue;
                n.isHit = true;
                n.hitTime = n.time;

                applyJudgement(marvelousJudg, n.column);
                recordHitErrorSample(0);

                hitErrorTicksRef.current.push({
                  id: Math.random().toString(36).substring(2, 9),
                  error: 0,
                  timestamp: Date.now(),
                  color: '#3b82f6'
                });

                mainAudio.playBeatmapHitsound(n.hitSound, n.hitSample?.filename);
                laneGlowRef.current[n.column] = 1.0;
                spawnParticles(n.column, marvelousJudg.color);
                if (!settingsRef.current.disableLaneShake) {
                  screenShakeRef.current = 4;
                }
              } else if (evt.type === 'tail') {
                if (n.isReleased || n.isHoldFailed) continue;
                n.isReleased = true;
                n.releaseTime = n.endTime!;

                applyJudgement(marvelousJudg, n.column);
                recordHitErrorSample(0);

                spawnParticles(n.column, marvelousJudg.color);
              }
            }
          }

          // Maintain active receptor/lane state for holds, including chords
          for (let col = 0; col < beatmap.keyCount; col++) {
            const isHolding = notesRef.current.some(
              n => n.column === col && n.type === 'hold' && n.isHit && !n.isReleased && !n.isHoldFailed
            );
            keysPressedRef.current[col] = isHolding;
            activeColumnsRef.current[col] = isHolding;
            if (isHolding) {
              laneGlowRef.current[col] = Math.max(laneGlowRef.current[col] || 0, 0.8);
            }
          }
        }

        if (!isReplayMode) checkAutonomousMisses(songTime);
        
        // Continuous Video-Audio phase lock (PI PLL + transport snaps elsewhere)
        if (videoRef.current) {
          if (!syncControllerRef.current) {
            syncControllerRef.current = new VideoSyncController(
              videoRef.current,
              () => audioTimeRef.current,
              beatmap.videoStartTime || 0,
              () => settingsRef.current,
              () => mainAudio.playbackRate
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

      const currentSettings = settingsRef.current;
      const receptorY = currentSettings.upsurfaceNoteMode ? 60 : height - 155;

      // --- HIGH PERFORMANCE RENDERER HANDLER ---
      if (activeRendererRef.current) {
        const keyCount = beatmap.keyCount;
        const speedFactor = calculateScrollSpeedFactor(height, receptorY, currentSettings);

        // Calculate dynamic layouts
        const colsLayout = updateColumnsLayout(
          colsLayoutBufferRef.current,
          keyCount,
          width,
          currentSettings,
          activeColumnsRef.current,
          laneGlowRef.current
        );

        const visualTime = songTime - (currentSettings.visualOffset || 0);

        // Cull and fetch visible notes
        const visibleNotes = getVisibleNotes(
          notesRef.current,
          currentSettings,
          height,
          receptorY,
          visualTime,
          speedFactor,
          scrollModelRef.current
        );

        // Decay lane glows
        for (let i = 0; i < keyCount; i++) {
          if (laneGlowRef.current[i] > 0) {
            laneGlowRef.current[i] *= 0.88;
          }
        }

        // Build running hit error average
        let hitErrorAvgMs: number | null = null;
        const avgErrorValues = hitErrorTicksRef.current.slice(-30).map(t => t.error);
        if (avgErrorValues.length > 0) {
          hitErrorAvgMs = avgErrorValues.reduce((s, v) => s + v, 0) / avgErrorValues.length;
        }

        // Filter expired hit ticks (> 2000ms old)
        const currentTimeScale = Date.now();
        hitErrorTicksRef.current = hitErrorTicksRef.current.filter(t => currentTimeScale - t.timestamp < 2000);

        // Filter particles
        if (!currentSettings.disableParticles) {
          particlesRef.current = particlesRef.current.filter((p) => {
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= p.decay;
            return p.alpha > 0;
          });
        } else if (particlesRef.current.length > 0) {
          particlesRef.current = [];
        }

        // Map key bindings for labels
        const layoutKeys = currentSettings.bindings[keyCount] || [];
        const keyLabelsMapped = layoutKeys.map((key, i) => {
          const hasPressed = hasKeyPressedOnceRef.current && hasKeyPressedOnceRef.current[i];
          return !hasPressed ? key : '';
        });

        // Check if on a mobile touchscreen device
        const isMobileDevice = typeof window !== 'undefined' && (
          window.innerWidth <= 1024 && (
            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
            window.innerWidth <= 768 ||
            window.innerHeight < 500
          )
        );

        // Execute drawing call
        activeRendererRef.current.render({
          width,
          height,
          timeMs: visualTime,
          receptorY,
          columns: colsLayout,
          notes: visibleNotes,
          particles: particlesRef.current,
          hitErrorTicks: hitErrorTicksRef.current,
          hitErrorAvgMs,
          shake: currentSettings.disableLaneShake ? 0 : screenShakeRef.current,
          settingsSlice: currentSettings,
          showKeyLabels: true,
          keyLabels: keyLabelsMapped,
          isFocusMode: isFocusModeRef.current,
          isMobile: isMobileDevice
        });

        // Decay screen shake
        if (screenShakeRef.current > 0) {
          screenShakeRef.current *= 0.9;
          if (screenShakeRef.current < 0.1) screenShakeRef.current = 0;
        }

        if (currentSettings.renderEngine === 'babylon') {
          const heCanvas = hitErrorCanvasRef.current;
          if (heCanvas) {
            const ctx2d = heCanvas.getContext('2d');
            if (ctx2d) {
              const w = heCanvas.width;
              const h = heCanvas.height;
              ctx2d.clearRect(0, 0, w, h);

              const centerX = w / 2;
              const maxMs = 150;
              const scale = (w / 2) / maxMs;

               ctx2d.fillStyle = 'rgba(15, 23, 42, 0.75)';
               ctx2d.strokeStyle = 'rgba(255, 255, 255, 0.15)';
               ctx2d.lineWidth = 1;
               ctx2d.beginPath();
               ctx2d.roundRect(0, 0, w, h, 4);
               ctx2d.fill();
               ctx2d.stroke();

               const regions = [
                 { ms: 135, color: 'rgba(236, 154, 41, 0.35)' },
                 { ms: 75, color: 'rgba(34, 197, 94, 0.5)' },
                 { ms: 40, color: 'rgba(59, 130, 246, 0.7)' },
               ];
               for (const region of regions) {
                 const leftX = centerX - (region.ms / maxMs) * (w / 2);
                 const rightX = centerX + (region.ms / maxMs) * (w / 2);
                 ctx2d.fillStyle = region.color;
                 ctx2d.fillRect(leftX, 0, rightX - leftX, h);
               }

              ctx2d.strokeStyle = 'rgba(255, 255, 255, 0.5)';
              ctx2d.lineWidth = 2;
              ctx2d.beginPath();
              ctx2d.moveTo(centerX, 0);
              ctx2d.lineTo(centerX, h);
              ctx2d.stroke();

               hitErrorTicksRef.current.forEach((tick) => {
                 const age = Date.now() - tick.timestamp;
                 ctx2d.globalAlpha = Math.max(0, 1 - age / 2000);
                 const tickX = centerX + (Math.max(-maxMs, Math.min(maxMs, tick.error)) / maxMs) * (w / 2);
                 ctx2d.strokeStyle = tick.color;
                 ctx2d.lineWidth = 1.5;
                 ctx2d.beginPath();
                 ctx2d.moveTo(tickX, -2);
                 ctx2d.lineTo(tickX, h + 2);
                 ctx2d.stroke();
                 ctx2d.globalAlpha = 1;
               });

               if (hitErrorAvgMs !== null) {
                 const avgX = centerX + hitErrorAvgMs * scale;
                 const clampedX = Math.max(4, Math.min(w - 4, avgX));
                 ctx2d.fillStyle = '#ffffff';
                 ctx2d.strokeStyle = 'rgba(0, 0, 0, 0.6)';
                 ctx2d.lineWidth = 1;
                 ctx2d.beginPath();
                 ctx2d.moveTo(clampedX, -1);
                 ctx2d.lineTo(clampedX - 4, -7);
                 ctx2d.lineTo(clampedX + 4, -7);
                 ctx2d.closePath();
                 ctx2d.fill();
                 ctx2d.stroke();
                 ctx2d.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                 ctx2d.lineWidth = 1;
                 ctx2d.beginPath();
                 ctx2d.moveTo(clampedX, -1);
                 ctx2d.lineTo(clampedX, h + 1);
                 ctx2d.stroke();
               }

              ctx2d.beginPath();
              ctx2d.rect(0, 0, w, h);
              ctx2d.strokeStyle = 'rgba(148, 163, 184, 0.3)';
              ctx2d.lineWidth = 1;
              ctx2d.stroke();
            }
          }
        }
      }

      // Check if song completed naturally or run loops
      const songDurationMs = beatmap.duration * 1000;
      if (songTime >= songDurationMs && !scoreStateRef.current.completed && isPlayingRef.current) {
        scoreStateRef.current.completed = true;
        isPlayingRef.current = false;
        mainAudio.stop();
        if (videoRef.current) {
          try { videoRef.current.pause(); } catch (e) {}
        }
        
        if (finishTimeoutRef.current) {
          clearTimeout(finishTimeoutRef.current);
        }
        finishTimeoutRef.current = setTimeout(() => {
          finishTimeoutRef.current = null;
          if (isMountedRef.current) {
            onFinish(scoreStateRef.current, replayFramesRef.current, hitErrorSamplesRef.current);
          }
        }, 1200);
      }

      if ((isPlayingRef.current && !isPaused) || audioStartPendingRef.current || showCountdown > 0 || unpauseCountdown > 0) {
        requestId = requestAnimationFrame(render);
        animationFrameRef.current = requestId;
      }
    };

    // Begin looping
    if ((isPlayingRef.current && !isPaused) || audioStartPendingRef.current || showCountdown > 0 || unpauseCountdown > 0) {
      requestId = requestAnimationFrame(render);
      animationFrameRef.current = requestId;
    } else {
      render(); // Single tick render on draw pause state
    }

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [beatmap, settings.renderEngine, isPaused, showCountdown, unpauseCountdown, startDelayMs]);

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
    // Drop in-flight hold grace and input edges so resume does not auto-fail LNs
    notesRef.current.forEach((n) => {
      if (n.releaseGraceUntil !== undefined) n.releaseGraceUntil = undefined;
    });
    lanePressCountRef.current.fill(0);
    keysPressedRef.current.fill(false);
    activeColumnsRef.current.fill(false);
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
        void mainAudio.playAsync(beatmap.bpm, settings.audioOffset).then(() => {
          audioTimeRef.current = mainAudio.getCurrentTimeMs();
          snapVideoToAudio(audioTimeRef.current, true);
        });
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
      notesRef.current.forEach((n) => {
        if (n.releaseGraceUntil !== undefined) n.releaseGraceUntil = undefined;
      });
      lanePressCountRef.current.fill(0);
      keysPressedRef.current.fill(false);
      activeColumnsRef.current.fill(false);
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
    lanePressCountRef.current = new Array(beatmap.keyCount).fill(0);
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
      unstableRate: null,
      hitErrorSampleCount: 0,
      columnJudgements: initializeColumnJudgements(beatmap.keyCount),
    };

    totalJudgementsRef.current = countMapJudgements(beatmap.notes);
    maxComboPortionRef.current = computeMaxComboPortion(totalJudgementsRef.current);

    // Reset hit error timing ticks
    hitErrorTicksRef.current = [];

    if (replayData.length === 0) {
      setUiScore(0);
      setUiCombo(0);
      setUiHp(100);
      return;
    }

    let simCurrentComboPortion = 0;

    // Helper functions for chronological simulation
    const simApplyJudgement = (judg: JudgementWindow, col: number) => {
      const state = scoreStateRef.current;
      if (!state.columnJudgements || state.columnJudgements.length === 0) {
        state.columnJudgements = initializeColumnJudgements(beatmap.keyCount);
      }
      if (typeof col === 'number' && col >= 0) {
        incrementColumnJudgement(state.columnJudgements, col, judg.type);
      }

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

      const counts = {
        marvelousCount: state.marvelousCount,
        perfectCount: state.perfectCount,
        greatCount: state.greatCount,
        goodCount: state.goodCount,
        badCount: state.badCount,
        missCount: state.missCount,
      };
      state.accuracy = computeAccuracyPercent(counts);

      simCurrentComboPortion += getComboScoreChange(judg.type, state.combo);
      const modMultiplier = computeModMultiplier(settings.selectedMods);
      state.score = computeTotalScore({
        currentComboPortion: simCurrentComboPortion,
        maxComboPortion: maxComboPortionRef.current,
        accuracyPercent: state.accuracy,
        judgedCount: countTotalHits(counts),
        totalJudgements: totalJudgementsRef.current,
        modMultiplier,
      });
    };

    const simTriggerHit = (colIndex: number, frameTime: number) => {
      const activeHoldAndReleased = notesRef.current.find(
        (n) => n.column === colIndex && n.type === 'hold' && n.isHit && !n.isReleased && !n.isHoldFailed && n.releaseGraceUntil !== undefined
      );
      if (activeHoldAndReleased) {
        if (isHoldGraceActive(frameTime, activeHoldAndReleased.releaseGraceUntil)) {
          activeHoldAndReleased.releaseGraceUntil = undefined;
          return;
        }
        const transition = resolveHoldGrace(activeHoldAndReleased, frameTime);
        activeHoldAndReleased.releaseGraceUntil = transition.releaseGraceUntil;
        activeHoldAndReleased.isHoldFailed = transition.isHoldFailed;
        activeHoldAndReleased.isReleased = transition.isReleased;
        simApplyJudgement(missJudg, colIndex);
      }
      const note = notesRef.current.find(
        (n) =>
          n.column === colIndex &&
          (
            (!n.isHit && !n.isMissed) ||
            (n.type === 'hold' && n.isMissed && !n.isHit && !n.isReleased && !n.isHoldFailed)
          )
      );
      if (!note) return;
      const maxWindow = judgementWindows[judgementWindows.length - 1].windowMs;

      if (note.type === 'hold' && note.isMissed && !note.isHit) {
        if (note.endTime && frameTime - note.endTime > maxWindow) {
          return;
        }
        note.isHit = true;
        note.hitTime = frameTime;
        return;
      }

      const diff = frameTime - note.time;
      if (diff < -maxWindow) {
        return; 
      }
      const resolvedJudgement = resolveJudgementForError(diff, judgementWindows);
      if (resolvedJudgement.type !== 'miss') {
        note.isHit = true;
        note.hitTime = frameTime;
        simApplyJudgement(resolvedJudgement, colIndex);
        recordHitErrorSample(frameTime - note.time);
      } else {
        note.isMissed = true;
        if (note.type === 'hold') {
          simApplyJudgement(resolvedJudgement, colIndex);
          note.isHit = true;
          note.hitTime = frameTime;
        } else {
          simApplyJudgement(resolvedJudgement, colIndex);
        }
      }
    };

    const simTriggerRelease = (colIndex: number, frameTime: number) => {
      const holdNote = notesRef.current.find(
        (n) => n.column === colIndex && n.type === 'hold' && n.isHit && !n.isReleased && !n.isHoldFailed
      );
      if (!holdNote || !holdNote.endTime) return;
      const endDiff = frameTime - holdNote.endTime;
      const graceThreshold = -missJudg.windowMs;
      const graceDuration = missJudg.windowMs;
      if (endDiff < graceThreshold) {
        holdNote.releaseGraceUntil = frameTime + graceDuration;
        return;
      }
      holdNote.isReleased = true;
      holdNote.releaseTime = frameTime;
      const tailJudgement = getHoldTailJudgement(endDiff, judgementWindows);
      simApplyJudgement(tailJudgement, colIndex);
      if (tailJudgement.type !== 'miss') {
        recordHitErrorSample(endDiff);
      } else {
        holdNote.isHoldFailed = true;
      }
    };

    const simCheckAutonomousMisses = (currentTime: number, keysPressed?: boolean[]) => {
      checkNotesAutonomousMisses(
        notesRef.current,
        currentTime,
        missJudg.windowMs,
        (n, isDoubleMiss) => {
          if (isDoubleMiss) {
            simApplyJudgement(missJudg, n.column);
            simApplyJudgement(missJudg, n.column);
          } else {
            simApplyJudgement(missJudg, n.column);
          }
        },
        keysPressed
      );
    };

    // Binary-search the normalized frame list for a responsive scrub start.
    const historicalFrameCount = upperBoundReplayFrame(replayData, targetTimeMs);
    let prevKeys = new Array(beatmap.keyCount).fill(false);

    for (let frameIndex = 0; frameIndex < historicalFrameCount; frameIndex++) {
      const frame = replayData[frameIndex];
      // 1. Check autonomous misses at this frame time
      simCheckAutonomousMisses(frame.time, prevKeys);

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
    }

    // 3. Sweep up to targetTimeMs
    simCheckAutonomousMisses(targetTimeMs, prevKeys);

    // Sync key states to the last frame if available
    if (historicalFrameCount > 0) {
      const lastFrame = replayData[historicalFrameCount - 1];
      keysPressedRef.current = [...lastFrame.keysPressed];
      activeColumnsRef.current = [...lastFrame.keysPressed];
      lanePressCountRef.current = lastFrame.keysPressed.map((p) => (p ? 1 : 0));
    } else {
      keysPressedRef.current.fill(false);
      activeColumnsRef.current.fill(false);
      lanePressCountRef.current.fill(0);
    }

    lastProcessedReplayTimeRef.current = targetTimeMs;
    resetReplayCursor(replayCursorRef.current, replayData, targetTimeMs);

    // Synchronize UI view hooks
    setUiScore(scoreStateRef.current.score);
    setUiCombo(scoreStateRef.current.combo);
    setUiHp(scoreStateRef.current.hp);
  };

  const handleSeek = (newTimeMs: number) => {
    mainAudio.seekGameplayTimeMs(newTimeMs);
    audioTimeRef.current = newTimeMs;
    smoothOffsetRef.current = settings.audioOffset;
    snapVideoToAudio(newTimeMs, false);
    
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
    if (finishTimeoutRef.current) {
      clearTimeout(finishTimeoutRef.current);
      finishTimeoutRef.current = null;
    }
    for (const timer of [
      uiJudgementTimeoutRef.current,
      comboBurstTimeoutRef.current,
      countdownTimeoutRef.current,
      unpauseTimeoutRef.current,
      scrollTimeoutRef.current,
    ]) {
      if (timer !== null) clearTimeout(timer);
    }
    uiJudgementTimeoutRef.current = null;
    comboBurstTimeoutRef.current = null;
    countdownTimeoutRef.current = null;
    unpauseTimeoutRef.current = null;
    scrollTimeoutRef.current = null;
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    syncControllerRef.current?.destroy();
    syncControllerRef.current = null;
    mainAudio.stop();
    setIsPrePlay(true);
    initializeGameplay(false);
  };

  const handleStartGameplay = () => {
    if (!isAudioLoaded || rendererLoading) return;
    // Clear any stale pause state caused by a fullscreen transition while the
    // pre-play screen was mounted. The countdown is the single start gate.
    setIsPaused(false);
    isPausedRef.current = false;
    setUnpauseCountdown(0);
    setIsPrePlay(false);
    setShowCountdown(3);
  };

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
  }, [isPrePlay, isAudioLoaded, rendererLoading]);

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
          {mediaUrls.bgUrl && (
            <div 
              className="absolute inset-0 bg-cover bg-center pointer-events-none"
              style={{
                backgroundImage: `url("${sanitizeCssUrl(mediaUrls.bgUrl)}")`,
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
                {isReplayMode ? "PRE-REPLAY ENGINE STAGE" : "PRE-PLAY ENGINE STAGE"}
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
                 disabled={!isAudioLoaded || rendererLoading}
                 className={`flex items-center justify-center gap-4 px-12 py-5 hover:bg-slate-750 text-white rounded-xl border border-white/10 transition-all active:scale-95 cursor-pointer shadow-xl hover:shadow-[0_0_30px_rgba(255,255,255,0.07)] ${isReplayMode ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-slate-800'} ${!isAudioLoaded || rendererLoading ? 'opacity-60 cursor-wait' : ''}`}
               >
                 {!isAudioLoaded || rendererLoading ? (
                  <>
                    <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span className="font-sans font-black text-lg tracking-wider uppercase">Loading</span>
                  </>
                ) : (
                  <>
                    <Play className="h-6 w-6 fill-current text-white" />
                    <span className="font-sans font-black text-lg tracking-wider uppercase">
                      {isReplayMode ? "Watch" : "Start"}
                    </span>
                  </>
                )}
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
               {!isAudioLoaded || rendererLoading
                 ? `${loadingAudioProgress}% LOADING PLAY ENGINE`
                 : isReplayMode ? "CLICK 'WATCH' TO BEGIN REPLAY" : "CLICK 'START' TO BEGIN PERFORMANCE"}
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
                  {!isReplayMode && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-slate-400">
                        <span>Scroll Speed</span>
                        <span className="font-mono text-cyan-400 font-extrabold">{settings.scrollSpeed}x</span>
                      </div>
                      <input 
                        type="range" min={SCROLL_SPEED_MIN} max={SCROLL_SPEED_MAX} step="1"
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
                  {!isReplayMode && (
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
                  {!isReplayMode && (
                    <div className="space-y-1.5">
                      {(() => {
                        const isBabylon = settings.renderEngine === 'babylon';
                        const widthMin = isBabylon ? BABYLON_PLAYFIELD_WIDTH_MIN : PLAYFIELD_WIDTH_MIN;
                        const widthMax = isBabylon ? BABYLON_PLAYFIELD_WIDTH_MAX : PLAYFIELD_WIDTH_MAX;
                        const width = Math.max(widthMin, Math.min(widthMax, settings.playfieldWidthPercent ?? 40));
                        return (
                          <>
                      <div className="flex justify-between text-slate-400">
                        <span>Lane Playfield Width</span>
                        <span className="font-mono text-cyan-400 font-extrabold">{width}%</span>
                      </div>
                      <input 
                        type="range" min={widthMin} max={widthMax} step="1"
                        value={width}
                        onChange={(e) => updateSettings?.({ playfieldWidthPercent: Number(e.target.value) })}
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onTouchMove={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="w-full accent-cyan-400 h-1 bg-slate-800 rounded-lg cursor-pointer"
                      />
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {/* Upsurface note mode */}
                  {!isReplayMode && (
                    <div className="pt-2 flex justify-between items-center border-t border-white/5">
                      <span className="text-slate-400">Scroll Direction</span>
                      <button
                        onClick={() => {
                          if (settings.renderEngine === 'babylon') return;
                          updateSettings?.({ upsurfaceNoteMode: !settings.upsurfaceNoteMode });
                        }}
                        disabled={settings.renderEngine === 'babylon'}
                        className={`px-3 py-1 text-[10px] font-bold font-mono tracking-wider rounded uppercase border transition cursor-pointer ${
                          settings.renderEngine === 'babylon'
                            ? 'bg-slate-800 text-slate-500 border-white/5 cursor-not-allowed'
                            : settings.upsurfaceNoteMode
                              ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.3)]'
                              : 'bg-slate-900 text-slate-400 border-white/5 hover:text-white animate-pulse'
                        }`}
                        title={settings.renderEngine === 'babylon' ? 'Scroll direction is locked while using Babylon.js 3D' : undefined}
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

        {/* VIDEO FORMAT WARNING (soft notice — not a pipeline error) */}
        {videoFormatWarning && showVideoFormatWarning && !isPrePlay && (
          <div className="absolute top-24 right-4 bg-amber-950/80 border border-amber-500/40 p-3 rounded-lg text-[11px] font-sans text-amber-100 z-50 max-w-sm shadow-2xl animate-fade-in backdrop-blur-sm">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <h4 className="font-bold text-amber-300 uppercase tracking-widest text-[10px] flex items-center gap-1.5">
                <span>⚠️</span> Video notice
              </h4>
              <button
                type="button"
                onClick={() => setShowVideoFormatWarning(false)}
                className="text-amber-400/80 hover:text-amber-200 font-mono text-base leading-none px-1 cursor-pointer"
                title="Dismiss"
              >
                ×
              </button>
            </div>
            <p className="leading-relaxed text-amber-50/95">
              The video format <span className="font-black text-amber-200">({videoFormatWarning})</span> is not supported on browsers.
              Gameplay will resume with a JPG/PNG background.
            </p>
          </div>
        )}

        {/* PIPELINE DIAGNOSTICS (hard failures only) */}
        {(isPlayingFallback || isVideoMissing) && (
          <div className="absolute top-24 right-4 bg-red-950/85 border border-red-500/35 p-3 rounded-lg text-[10px] font-mono text-rose-250 z-50 max-w-xs shadow-2xl animate-fade-in backdrop-blur-sm"
            style={videoFormatWarning && showVideoFormatWarning ? { top: '12.5rem' } : undefined}
          >
            <h4 className="font-bold mb-1 text-red-400 uppercase tracking-widest flex items-center gap-1.5 text-[10px]">
              <span>⚠️</span> PIPELINE DIAGNOSTICS
            </h4>
            <div className="space-y-1 text-red-200">
              {isPlayingFallback && <p className="font-bold text-red-400">⚠️ Audio failed to decode. PLEASE RELOAD THE BROWSER TO RESOLVE.</p>}
              {isVideoMissing && <p>• Video declared in metadata but missing in file archive.</p>}
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
            {isReplayMode && (
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
            {!isReplayMode && (
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

        {/* FPS counter overlay (direct DOM updates from the render loop) */}
        {(propSettings.showFpsCounter ?? settings.showFpsCounter) && (
          <span
            ref={fpsLabelRef}
            className="absolute top-2 right-3 z-40 font-mono text-[11px] font-bold text-emerald-300/90 bg-black/50 px-2 py-0.5 rounded pointer-events-none select-none"
          />
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
                                      void mainAudio.playAsync(beatmap.bpm, settings.audioOffset).then(() => {
                                        snapVideoToAudio(newTime, true);
                                      });
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
                                  const now = performance.now();
                                  if (now - lastVideoSeekTimeRef.current > 80) {
                                      snapVideoToAudio(newTime, false);
                                      lastVideoSeekTimeRef.current = now;
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
                              <option value={1.25}>1.25x</option>
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
            <span className="text-3xl md:text-4xl font-extrabold text-white font-mono tracking-tighter leading-none mb-1">
              {uiScore.toLocaleString('en-US', { minimumIntegerDigits: 7, useGrouping: false })}
            </span>
          </div>
        )}

        {/* PLAY HIGHWAY HERO BOX */}
         <div
           ref={playfieldSurfaceRef}
           className="flex-1 w-full flex justify-center relative overflow-hidden bg-[#050508]"
        >
          {/* STATIC BACKGROUND IMAGE LAYER (Layer -1, z-index: 5) */}
          {mediaUrls.bgUrl && (!mediaUrls.videoUrl || settings.disableVideo || isVideoError) && (
            <div 
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 animate-fade-in"
              style={{
                backgroundImage: `radial-gradient(ellipse at center, rgba(10,10,13,0.30), rgba(5,5,8,0.95)), url("${sanitizeCssUrl(mediaUrls.bgUrl)}")`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                zIndex: 5,
              }}
            />
          )}

          {/* FALLBACK CHIP GRID LAYER (z-index: 4, used when video is playing or image is absent) */}
          {(!mediaUrls.bgUrl || (mediaUrls.videoUrl && !settings.disableVideo && !isVideoError)) && (
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
          {mediaUrls.videoUrl && !settings.disableVideo && !isVideoError && (
            <video
              ref={setVideoRef}
              key={mediaUrls.videoUrl}
              muted
              playsInline
              preload="auto"
              onError={() => {
                const mediaErr = videoRef.current?.error;
                const code = mediaErr?.code;
                const detail =
                  code === 4
                    ? 'unsupported container/codec or missing MIME type on blob'
                    : code === 3
                      ? 'decode failure'
                      : mediaErr?.message || `media error code ${code ?? '?'}`;
                console.warn('Video failed to render or decode:', detail, mediaUrls.videoUrl);
                setIsVideoError(true);
              }}
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 animate-fade-in"
              style={{ 
                opacity: settings.videoOpacity !== undefined ? settings.videoOpacity : 0.35,
                zIndex: 10
              }}
            >
              <source
                src={mediaUrls.videoUrl}
               type={getMimeTypeFromFilename((beatmap as SavedBeatmap).videoFilename || '') || 'video/mp4'}
              />
            </video>
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

            {settings.renderEngine === 'babylon' ? (
               <canvas
                  ref={rendererCanvasRef}
                 className="block w-full h-full cursor-none game-canvas-element touch-none select-none"
                 style={settings.renderEngine === 'babylon' ? {
                   position: 'absolute',
                   left: '50%',
                   width: '100vw',
                   maxWidth: 'none',
                   transform: 'translateX(-50%)',
                 } : undefined}
               />
            ) : (
              <canvas ref={canvasRef} className="block w-full h-full cursor-none game-canvas-element touch-none select-none" />
            )}

            {settings.renderEngine === 'babylon' && (
              <canvas
                ref={hitErrorCanvasRef}
                className="absolute left-1/2 z-30 pointer-events-none"
                style={{ bottom: '8px', transform: 'translateX(-50%)', width: '280px', height: '24px' }}
                width={280}
                height={24}
              />
            )}

            <span
              ref={breakLabelRef}
              className="absolute top-1/3 left-1/2 -translate-x-1/2 z-20 rounded-full border border-cyan-300/30 bg-slate-950/70 px-5 py-2 font-mono text-xs font-black uppercase tracking-[0.3em] text-cyan-200 shadow-lg transition-opacity duration-300 pointer-events-none"
              style={{ opacity: 0 }}
            >
              Break
            </span>

            {/* DYNAMIC HIGH-PERFORMANCE DOM COMBO & JUDGEMENT POPUPS */}
            <div 
              className="absolute inset-0 pointer-events-none flex flex-col items-center select-none z-10 font-sans transition-transform duration-150"
              style={{
                opacity: settings.judgementOpacity ?? 1.0,
                transform: `scale(${settings.judgementSize ?? 1.0})`,
              }}
            >
              {/* Keep the combo stack attached to the judgement instead of the playfield top. */}
              {uiCombo > 4 && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 -translate-y-full pb-2 flex flex-col items-center justify-end gap-1 whitespace-nowrap"
                  style={{ top: `${settings.judgementPositionY ?? 50}%` }}
                >
                  {comboBurst !== null && (
                    <div key={`burst-${comboBurst}`} className="rounded-full border-2 border-amber-300/70 bg-amber-400/20 px-8 py-3 text-2xl font-black uppercase tracking-[0.35em] text-amber-200 shadow-[0_0_35px_rgba(251,191,36,0.65)] animate-combo-pop">
                      {comboBurst}x
                    </div>
                  )}
                  <div key={`combo-${uiCombo}`} className="flex flex-col items-center justify-center animate-combo-pop">
                    <span className="text-6xl font-[900] tracking-tighter text-slate-100 drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]">
                      {uiCombo}
                    </span>
                    <span className="text-[10px] font-black tracking-[0.25em] text-cyan-400 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] uppercase mt-1">
                      COMBO
                    </span>
                  </div>
                </div>
              )}

              {/* Judgement popup */}
              {uiJudgement && (
                <div 
                  key={`judg-${uiJudgement.time}`}
                   className="absolute inset-x-0 text-center text-5xl font-[900] tracking-widest uppercase drop-shadow-[0_3px_12px_rgba(0,0,0,0.95)] animate-judgement-pulse"
                  style={{ 
                    color: uiJudgement.color,
                    textShadow: `0 0 15px currentColor`,
                    top: `${settings.judgementPositionY ?? 50}%`,
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
          {!isPrePlay && isPaused && unpauseCountdown === 0 && (
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
