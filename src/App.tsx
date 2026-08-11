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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Settings as SettingsIcon,
  Music2,
  RotateCcw,
  Hammer,
  Swords,
  Compass,
  UserRound,
  MessageSquareWarning,
  LogOut,
  ChevronDown,
  Loader2,
  LogIn,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Paintbrush,
} from 'lucide-react';
import { MainMenu } from './components/MainMenu';
import { GameScreen, GameSettings, Beatmap, ScoreState, ReplayFrame, PlayHistoryRecord, UploadStatus } from './types';
import { AnimatePresence, motion, type Variants } from 'motion/react';
import SongSelect from './components/SongSelect';
import GameplayCanvas from './components/GameplayCanvas';
import ResultsScreen from './components/ResultsScreen';
import SettingsScreen from './components/SettingsScreen';
import PersonalHistoryScreen from './components/PersonalHistoryScreen';
import ProfileScreen from './components/ProfileScreen';
import EditProfileScreen from './components/EditProfileScreen';
import OnlineBeatmapCatalog from './components/OnlineBeatmapCatalog';
import SkinScreen from './components/SkinScreen';
import JSZip from 'jszip';
import { storageManager } from './utils/storageManager';
import { convertBeatmapKeyCount, parseBeatmap } from './utils/beatmapParser';
import { unpackBeatmap } from './utils/unpackHelper';
import { TermsOfServicePage, PrivacyPolicyPage } from './components/LegalPages';
import { sanitizeSettings, sanitizeHistoryRecord, sanitizeCssUrl, MAX_COMPRESSED_SIZE_BYTES, validateZipLimits, createZipExtractionBudget, decodeBoundedUtf8 } from './utils/securityLimits';
import { createPlayHistoryRecord, migrateAndNormalizeBeatmaps } from './utils/replayManager';
import { extractZipEntry } from './utils/zipResolver';
import { uploadReplayRecord } from './utils/replayClient';
import { AssetLifecycleManager } from './utils/assetLifecycle';
import { AuthUser, fetchCurrentUser, logoutUser, initiateGoogleSignIn } from './utils/authClient';
import { FullscreenManager } from './utils/fullscreenManager';
import { previewPlayer } from './utils/previewPlayer';
import type { ProfileTarget, ProfileTargetInput } from './utils/profileClient';


const PAGE_TRANSITION_VARIANTS = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.2, ease: 'easeOut' } }
} satisfies Variants;

const LOCAL_STORAGE_SETTINGS_KEY = 'rhythm_mania_v1_settings';
const LOCAL_STORAGE_CUSTOM_MAPS_KEY = 'rhythm_mania_v1_custom_maps';

import {
  BABYLON_PLAYFIELD_WIDTH_MAX,
  BABYLON_PLAYFIELD_WIDTH_MIN,
  DEFAULT_SETTINGS,
  PLAYFIELD_WIDTH_MAX,
  PLAYFIELD_WIDTH_MIN,
  HISTORY_LIMIT_UNLIMITED,
  SCROLL_SPEED_MAX,
  SCROLL_SPEED_MIN,
} from './components/settings/defaultSettings';

type AppRoute = {
  screen: GameScreen;
  profileTarget: ProfileTarget | null;
  settingsOpen: boolean;
};

function resolveRoute(pathname: string): AppRoute {
  if (pathname === '/profile/edit' || pathname === '/profile/edit/') {
    return { screen: 'editprofile', profileTarget: null, settingsOpen: false };
  }
  const profilePath = pathname.match(/^\/profile\/([^/]+)\/?$/);
  if (profilePath) {
    let value = profilePath[1];
    try { value = decodeURIComponent(value); } catch { /* keep the encoded route value for the API error */ }
    const kind = /^[A-Za-z0-9]{16}$/.test(value) ? 'userId' : 'handle';
    return { screen: 'profile', profileTarget: { kind, value }, settingsOpen: false };
  }
  if (pathname === '/profile' || pathname === '/profile/') {
    return { screen: 'profile', profileTarget: null, settingsOpen: false };
  }
  const paths: Record<string, GameScreen> = {
    '/select': 'select',
    '/play': 'play',
    '/results': 'results',
    '/history': 'history',
    '/settings': 'menu',
    '/skins': 'skins',
  };
  return {
    screen: paths[pathname] || 'menu',
    profileTarget: null,
    settingsOpen: pathname === '/settings',
  };
}

export default function App() {
  const [path, setPath] = useState<string>(() => typeof window !== 'undefined' ? window.location.pathname : '/');
  const initialRoute = resolveRoute(typeof window !== 'undefined' ? window.location.pathname : '/');
  const [profileTarget, setProfileTarget] = useState<ProfileTarget | null>(initialRoute.profileTarget);
  const [currentScreen, setCurrentScreen] = useState<GameScreen>(initialRoute.screen);
  const [selectedBeatmap, setSelectedBeatmap] = useState<Beatmap | null>(null);

  // Song Select can remain mounted during the page transition, so cut its
  // independent HTMLAudio preview before gameplay takes over audio focus.
  useEffect(() => {
    if (currentScreen === 'play') {
      previewPlayer.stopImmediately();
    }
  }, [currentScreen]);

  const navigateToPath = useCallback((href: string) => {
    if (typeof window !== 'undefined' && window.location.pathname !== href) {
      window.history.pushState({}, '', href);
    }
    setPath(href);
  }, []);

  const navigateScreen = useCallback((screen: GameScreen) => {
    const href = screen === 'menu' ? '/' : `/${screen}`;
    navigateToPath(href);
  }, [navigateToPath]);

  const openSettings = useCallback(() => setShowSettings(true), []);

  const openProfile = useCallback((target: ProfileTargetInput) => {
    const resolved: ProfileTarget = typeof target === 'string' ? { kind: 'userId', value: target } : target;
    navigateToPath(`/profile/${encodeURIComponent(resolved.value)}`);
  }, [navigateToPath]);

  const openEditProfile = useCallback(() => {
    navigateToPath('/profile/edit');
  }, [navigateToPath]);

  const leaveProfilePath = useCallback((screen: GameScreen = 'menu') => {
    navigateScreen(screen);
  }, [navigateScreen]);

  // Listen to popstate for browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      setPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Sync profile route from URL path
  useEffect(() => {
    const route = resolveRoute(path);
    if ((route.screen === 'play' || route.screen === 'results') && !selectedBeatmap) {
      setProfileTarget(null);
      setCurrentScreen('menu');
      setShowSettings(false);
      if (typeof window !== 'undefined' && window.location.pathname === path) {
        window.history.replaceState({}, '', '/');
      }
      if (path !== '/') setPath('/');
      return;
    }
    setProfileTarget(route.profileTarget);
    setCurrentScreen(route.screen);
    setShowSettings(route.settingsOpen);
  }, [path, selectedBeatmap]);

  // Globally intercept local link clicks to enable single-page transitions
  useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      if (anchor) {
        const href = anchor.getAttribute('href');
        if (href && href.startsWith('/')) {
          e.preventDefault();
          window.history.pushState({}, '', href);
          setPath(new URL(href, window.location.origin).pathname);
        }
      }
    };
    document.addEventListener('click', handleAnchorClick);
    return () => document.removeEventListener('click', handleAnchorClick);
  }, []);
  const [scoreState, setScoreState] = useState<ScoreState | null>(null);
  const [lastHitErrors, setLastHitErrors] = useState<number[] | null>(null);
  const [customMaps, setCustomMaps] = useState<Beatmap[]>([]);
  const [settings, setSettings] = useState<GameSettings>(() => {
    if (typeof window !== 'undefined') {
      const savedSettingsText = localStorage.getItem('rhythm_mania_v1_settings');
      if (savedSettingsText) {
        try {
          const parsed = JSON.parse(savedSettingsText);
          return sanitizeSettings(parsed, DEFAULT_SETTINGS);
        } catch (e) {
          console.warn('Failed parsing settings from local storage, fallback applied.');
        }
      }
    }
    return DEFAULT_SETTINGS;
  });
  const [songSelectBgUrl, setSongSelectBgUrl] = useState<string>('/backgrounds/Ferineon.webp');
  const [isMobileLandscape, setIsMobileLandscape] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showFindBeatmapOverlay, setShowFindBeatmapOverlay] = useState<boolean>(false);

  // Performance history states
  const [playHistory, setPlayHistory] = useState<PlayHistoryRecord[]>([]);
  const [historyLimit, setHistoryLimit] = useState<number>(50);

  // User account & auth state
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const previousMasterVolumeRef = useRef<number | null>(null);

  // Bootstrap current user session on mount
  useEffect(() => {
    fetchCurrentUser().then((user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
  }, []);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    await initiateGoogleSignIn(
      (user) => {
        setCurrentUser(user);
        setAuthError(null);
      },
      (errMsg) => {
        setAuthError(errMsg);
      }
    );
  };

  const requestSignOut = () => {
    setIsAccountMenuOpen(false);
    setShowLogoutConfirm(true);
  };

  const handleSignOut = async () => {
    setShowLogoutConfirm(false);
    await logoutUser();
    setCurrentUser(null);
  };

  useEffect(() => {
    if (!isAccountMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsAccountMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAccountMenuOpen]);

  useEffect(() => {
    setIsAccountMenuOpen(false);
  }, [path]);

  useEffect(() => {
    const syncFullscreenState = () => setIsFullscreen(FullscreenManager.isFullscreenActive());
    syncFullscreenState();
    document.addEventListener('fullscreenchange', syncFullscreenState);
    document.addEventListener('webkitfullscreenchange', syncFullscreenState);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState);
      document.removeEventListener('webkitfullscreenchange', syncFullscreenState);
    };
  }, []);

  const toggleFullscreen = async () => {
    if (FullscreenManager.isFullscreenActive()) {
      await FullscreenManager.exitFocusMode();
    } else {
      await FullscreenManager.enterFocusMode(document.documentElement);
    }
    setIsFullscreen(FullscreenManager.isFullscreenActive());
  };

  const toggleMute = () => {
    if (isMuted) {
      updateSettings({ masterVolume: previousMasterVolumeRef.current ?? DEFAULT_SETTINGS.masterVolume });
      previousMasterVolumeRef.current = null;
      setIsMuted(false);
      return;
    }

    previousMasterVolumeRef.current = settings.masterVolume > 0
      ? settings.masterVolume
      : DEFAULT_SETTINGS.masterVolume;
    updateSettings({ masterVolume: 0 });
    setIsMuted(true);
  };
  const [activeReplayRecord, setActiveReplayRecord] = useState<PlayHistoryRecord | null>(null);
  const [viewingHistoryResult, setViewingHistoryResult] = useState(false);
  // Tracks whether the user has played a map this browser session. Used to
  // decide whether Song Select should auto-resume the last selected map: only
  // post-gameplay returns auto-select; fresh app loads do not.
  const [hasPlayedThisSession, setHasPlayedThisSession] = useState(false);

  const activePlayBeatmap = React.useMemo(() => {
    if (!selectedBeatmap) return null;
    
    const activeMods = activeReplayRecord
      ? (activeReplayRecord.mods || activeReplayRecord.recordedSettings?.selectedMods || [])
      : (settings.selectedMods || []);
    const activeKeyChangeMod = activeMods.find(m => /^K[2-8]$/.test(m));
    
    if (activeKeyChangeMod) {
      const targetKeys = parseInt(activeKeyChangeMod.substring(1), 10);
      if (targetKeys >= 2 && targetKeys <= 8 && targetKeys !== selectedBeatmap.keyCount) {
        return convertBeatmapKeyCount(selectedBeatmap, targetKeys);
      }
    }
    return selectedBeatmap;
  }, [selectedBeatmap, settings.selectedMods, activeReplayRecord]);


  // Monitor landscape orientation on mobile devices
  useEffect(() => {
    const checkOrientation = () => {
      const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
      const isLandscape = window.innerWidth > window.innerHeight;
      const isSmallScreen = Math.min(window.innerWidth, window.innerHeight) < 600;
      setIsMobileLandscape(isTouch && isLandscape && isSmallScreen);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  // Preload default backgrounds for instant, low-latency visual performance
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const defaultBgs = [
        '/backgrounds/Arushii.webp',
        '/backgrounds/Ferineon.webp',
        '/backgrounds/Kourihase.webp',
        '/backgrounds/MPDisplay.webp',
        '/backgrounds/Porukana.webp',
        '/backgrounds/RedcXca.webp',
        '/backgrounds/Sm0llBanana.webp',
        '/backgrounds/THICC Jeff.webp',
        '/backgrounds/mimile1606.webp',
        '/backgrounds/nikio.webp',
        '/backgrounds/tehfire.webp',
        '/backgrounds/wxyz.webp'
      ];
      defaultBgs.forEach(src => {
        const img = new Image();
        img.src = src;
      });
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const storedHistory = localStorage.getItem('rhythm_mania_v1_play_history');
        if (storedHistory) {
          const parsed = JSON.parse(storedHistory);
          if (Array.isArray(parsed)) {
            const sanitized = parsed
              .map(item => sanitizeHistoryRecord(item, DEFAULT_SETTINGS, customMaps))
              .filter((item): item is PlayHistoryRecord => item !== null);
            setPlayHistory(sanitized);
            if (sanitized.length !== parsed.length) {
              localStorage.setItem('rhythm_mania_v1_play_history', JSON.stringify(sanitized));
            }
          }
        }
        
        const storedLimit = localStorage.getItem('rhythm_mania_v1_history_limit');
        if (storedLimit) {
          const parsedLimit = Number(storedLimit);
           if (parsedLimit === 9999 || parsedLimit === HISTORY_LIMIT_UNLIMITED || storedLimit.toLowerCase() === 'unlimited') {
             setHistoryLimit(HISTORY_LIMIT_UNLIMITED);
           } else if (!isNaN(parsedLimit) && parsedLimit >= 5 && parsedLimit <= 500) {
            setHistoryLimit(parsedLimit);
          } else {
            setHistoryLimit(50);
          }
        }
      } catch (e) {
        console.error('Failed to load local history logs:', e);
      }
    }
  }, []);

  // Re-migrate play history when customMaps become available to populate catalog identity & beatmap hashes
  useEffect(() => {
    if (customMaps.length === 0 || playHistory.length === 0) return;
    setPlayHistory(prev => {
      let changed = false;
      const reSanitized = prev.map(record => {
        const migrated = sanitizeHistoryRecord(record, DEFAULT_SETTINGS, customMaps);
        if (!migrated) {
          changed = true;
          return null;
        }
        if (
          migrated.catalogSetId !== record.catalogSetId ||
          migrated.catalogMapId !== record.catalogMapId ||
          migrated.beatmapHash !== record.beatmapHash ||
          migrated.schemaVersion !== record.schemaVersion ||
          migrated.isServerCatalogMap !== record.isServerCatalogMap ||
          migrated.uploadEligibility !== record.uploadEligibility
        ) {
          changed = true;
          return migrated;
        }
        return record;
      }).filter((item): item is PlayHistoryRecord => item !== null);

      if (changed && typeof window !== 'undefined') {
        try {
          localStorage.setItem('rhythm_mania_v1_play_history', JSON.stringify(reSanitized));
        } catch (e) {
          console.error('Failed to persist re-migrated play history:', e);
        }
      }
      return changed ? reSanitized : prev;
    });
  }, [customMaps]);

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

  // Merges sanitized imported replay records into history; returns how many were new.
  const handleImportRecords = (records: PlayHistoryRecord[]): number => {
    const existingIds = new Set(playHistory.map(r => r.id));
    const fresh = records.filter(r => !existingIds.has(r.id));
    if (fresh.length === 0) return 0;
    setPlayHistory(prev => {
       const merged = historyLimit > 0 ? [...fresh, ...prev].slice(0, historyLimit) : [...fresh, ...prev];
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('rhythm_mania_v1_play_history', JSON.stringify(merged));
        } catch (e) {
          console.error('Failed to persist imported replays:', e);
        }
      }
      return merged;
    });
    return fresh.length;
  };

  const handleSetHistoryLimit = (limit: number) => {
    const normalizedLimit = limit === 9999 || limit === HISTORY_LIMIT_UNLIMITED
      ? HISTORY_LIMIT_UNLIMITED
      : Math.max(5, Math.min(500, limit));
    setHistoryLimit(normalizedLimit);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('rhythm_mania_v1_history_limit', normalizedLimit === HISTORY_LIMIT_UNLIMITED ? 'unlimited' : String(normalizedLimit));
        
        // Trim current logs that overflow the threshold
        setPlayHistory(prev => {
          if (normalizedLimit > 0 && prev.length > normalizedLimit) {
            const truncated = prev.slice(0, normalizedLimit);
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

  const handleWatchReplay = async (
    record: PlayHistoryRecord,
    providedMap?: Beatmap
  ): Promise<{ success: boolean; error?: string }> => {
    let targetMap = providedMap;

    if (!targetMap) {
      const baseId = record.beatmapId?.includes('_converted_')
        ? record.beatmapId.split('_converted_')[0]
        : record.beatmapId;

      targetMap = customMaps.find(m => 
        m.id === record.beatmapId || 
        (baseId && m.id === baseId) || 
        (record.catalogMapId && m.catalogMapId === record.catalogMapId) ||
        (record.beatmapHash && m.beatmapHash === record.beatmapHash)
      );
    }

    if (targetMap) {
      try {
        await unpackBeatmap(targetMap);
      } catch (e) {
        console.warn('Media unpack error:', e);
      }

      const cached = storageManager.lruMediaCache.get(targetMap.id);
      const cloned: Beatmap = {
        ...targetMap,
        audioUrl: cached?.audioUrl || targetMap.audioUrl,
        videoUrl: cached?.videoUrl || targetMap.videoUrl,
        bgUrl: cached?.bgUrl || targetMap.bgUrl,
        notes: targetMap.notes ? targetMap.notes.map(n => ({ ...n })) : []
      };

      setSelectedBeatmap(cloned);
      setActiveReplayRecord(record);
       navigateScreen('play');
      return { success: true };
    }

    // Auto-download missing osu! mirror beatmaps for replay playback (browser → Catboy/osudl).
    const catalogSetId = record.catalogSetId;
    const chartRevisionId = record.chartRevisionId;
    let catalogEntry: any = null;
    let sourceSetId: number | null = null;

    if (chartRevisionId) {
      try {
        const res = await fetch(`/api/catalog/chart?chartRevisionId=${encodeURIComponent(chartRevisionId)}`, { credentials: 'include' });
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            catalogEntry = json.data;
            const sid = Number(json.data.sourceSetId);
            if (Number.isInteger(sid) && sid > 0) sourceSetId = sid;
          }
        }
      } catch (err) {
        console.warn('Error querying catalog for replay auto-download:', err);
      }
    }

    if (!sourceSetId && typeof catalogSetId === 'string') {
      const match = /^osuapi_(\d+)$/.exec(catalogSetId);
      if (match) sourceSetId = Number(match[1]);
    }

    if (!sourceSetId) {
      return {
        success: false,
        error: 'Beatmap is missing locally and could not be located in the osu! mirror for auto-download.'
      };
    }

    try {
      const { downloadBeatmapsetArchive } = await import('./utils/osuTokenManager');
      const blob = await downloadBeatmapsetArchive(
        sourceSetId,
        () => {},
        () => {},
        MAX_COMPRESSED_SIZE_BYTES,
      );
      if (blob.size > MAX_COMPRESSED_SIZE_BYTES) throw new Error('Security Exception: Downloaded package exceeds the size limit.');
      const arrayBuffer = await blob.arrayBuffer();

       const zip = await JSZip.loadAsync(arrayBuffer);
       validateZipLimits(zip);
       const extractionBudget = createZipExtractionBudget();
       const osuFiles = Object.keys(zip.files).filter(f => f.toLowerCase().endsWith('.osu'));
      if (osuFiles.length === 0) throw new Error('No .osu files in beatmap package');

      const importedMaps: Beatmap[] = [];
       const pkgId = catalogEntry?.cloudSetId || catalogSetId;
       if (!pkgId) throw new Error('Replay has no verified cloud set identity');

      for (const fileKey of osuFiles) {
          const content = decodeBoundedUtf8(await extractZipEntry(zip.files[fileKey], fileKey, extractionBudget), `Beatmap file ${fileKey}`);
         const parsed = parseBeatmap(content, fileKey);
         if (parsed) {
           const isTarget = fileKey === catalogEntry.originalOsuFilename;
           if (!isTarget) continue;
           const fullMap: any = {
             ...parsed,
             id: chartRevisionId,
             catalogSetId: pkgId,
             catalogMapId: chartRevisionId,
             chartRevisionId,
             checksum: catalogEntry.checksum,
             checksumAlgorithm: catalogEntry.checksumAlgorithm,
             isServerMap: true,
            parentPackageId: pkgId,
          };
          importedMaps.push(fullMap as Beatmap);
        }
      }

      if (importedMaps.length === 0) throw new Error('Failed to parse beatmap files');

       await storageManager.savePackageWithBeatmaps(pkgId, catalogEntry?.title || 'Downloaded Beatmap', new Blob([arrayBuffer]), importedMaps);

      setCustomMaps(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const newOnes = importedMaps.filter(m => !existingIds.has(m.id));
        return [...newOnes, ...prev];
      });

      const matchMap = importedMaps.find(m => 
        (record.catalogMapId && m.catalogMapId === record.catalogMapId) || 
        m.id === record.beatmapId || 
        m.difficulty === (record as any).beatmapDifficulty
      ) || importedMaps[0];

      try {
        await unpackBeatmap(matchMap);
      } catch (e) {
        console.warn('Error unpacking downloaded matchMap:', e);
      }

      const cachedMatch = storageManager.lruMediaCache.get(matchMap.id);
      const clonedMatch: Beatmap = {
        ...matchMap,
        audioUrl: cachedMatch?.audioUrl || matchMap.audioUrl,
        videoUrl: cachedMatch?.videoUrl || matchMap.videoUrl,
        bgUrl: cachedMatch?.bgUrl || matchMap.bgUrl,
        notes: matchMap.notes ? matchMap.notes.map(n => ({ ...n })) : []
      };

      setSelectedBeatmap(clonedMatch);
      setActiveReplayRecord(record);
       navigateScreen('play');
      return { success: true };
    } catch (e: unknown) {
      console.error('Failed to auto-download mirror beatmap for replay:', e);
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Failed to auto-download mirror beatmap for replay playback'
      };
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

  // Debounced settings persistence to local storage
  const isInitialSettingsLoad = useRef(true);
  useEffect(() => {
    if (isInitialSettingsLoad.current) {
      isInitialSettingsLoad.current = false;
      return;
    }
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(settings));
      } catch (err) {
        console.error("Failed to serialize settings:", err instanceof Error ? err.message : String(err));
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [settings]);

  useEffect(() => {
    const loadMapsFromIndexedDB = async () => {
      try {
        const maps = await storageManager.getAllBeatmaps();
        if (maps && maps.length > 0) {
          const { maps: migratedMaps } = await migrateAndNormalizeBeatmaps(maps);
          setCustomMaps(migratedMaps);
        } else {
          const savedCustomMapsText = localStorage.getItem(LOCAL_STORAGE_CUSTOM_MAPS_KEY);
          if (savedCustomMapsText) {
             const parsed: unknown = JSON.parse(savedCustomMapsText);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const { maps: migratedMaps } = await migrateAndNormalizeBeatmaps(parsed);
              setCustomMaps(migratedMaps);
              for (const map of migratedMaps) {
                 await storageManager.saveBeatmap(map);
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

  const updateSettings = useCallback((newSettings: Partial<GameSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      const renderEngine = updated.skinId === 'rhythmmania-3d' || updated.renderEngine === 'babylon' ? 'babylon' : 'canvas';
      const widthMin = renderEngine === 'babylon' ? BABYLON_PLAYFIELD_WIDTH_MIN : PLAYFIELD_WIDTH_MIN;
      const widthMax = renderEngine === 'babylon' ? BABYLON_PLAYFIELD_WIDTH_MAX : PLAYFIELD_WIDTH_MAX;
      const requestedWidth = Number(updated.playfieldWidthPercent !== undefined ? updated.playfieldWidthPercent : 40);
       const playfieldWidthPercent = Number.isFinite(requestedWidth)
        ? Math.max(widthMin, Math.min(widthMax, requestedWidth))
         : Math.max(widthMin, Math.min(widthMax, 40));
       const sizeMax = renderEngine === 'babylon'
          ? 1.2
          : updated.playfieldStyle === 'circle'
            ? 1.5
            : (updated.squareRenderStyle === 'rhythmplus' || updated.squareRenderStyle === 'rhythmplus-dynamic') ? 1.1 : 1.05;
      const safePayload: GameSettings = {
        scrollSpeed: Number(updated.scrollSpeed !== undefined ? updated.scrollSpeed : 21),
        audioOffset: Number(updated.audioOffset !== undefined ? updated.audioOffset : 0),
        visualOffset: Number(updated.visualOffset !== undefined ? updated.visualOffset : 0),
        hitsoundVolume: Number(updated.hitsoundVolume !== undefined ? updated.hitsoundVolume : 0.60),
        musicVolume: Number(updated.musicVolume !== undefined ? updated.musicVolume : 0.75),
        previewVolume: Number(updated.previewVolume !== undefined ? updated.previewVolume : 0.70),
        masterVolume: Number(updated.masterVolume !== undefined ? updated.masterVolume : 1.0),
        keyMode: Number(updated.keyMode !== undefined ? updated.keyMode : 4),
        bindings: {},
        upsurfaceNoteMode: renderEngine === 'babylon'
          ? false
          : (updated.upsurfaceNoteMode === true || String(updated.upsurfaceNoteMode) === 'true'),
        videoOpacity: 1.0,
        backgroundDim: Number(updated.backgroundDim !== undefined ? updated.backgroundDim : 0.60),
        menuBackgroundDim: Number(updated.menuBackgroundDim !== undefined ? updated.menuBackgroundDim : 0.30),
        disableVideo: Boolean(updated.disableVideo),
        videoOffset: Number(updated.videoOffset !== undefined ? updated.videoOffset : 0),
        disableParticles: Boolean(updated.disableParticles),
        limitDprToOne: false,
        skinId: updated.skinId || 'custom',
        customSkinColors: updated.customSkinColors,
        customSkinName: updated.customSkinName,
        squareRenderStyle: updated.squareRenderStyle || 'rhythmmania',
         receptorColorsByKeyCount: updated.receptorColorsByKeyCount || {},
        noteOpacity: updated.noteOpacity !== undefined ? Number(updated.noteOpacity) : 1.0,
        receptorOpacity: updated.receptorOpacity !== undefined ? Number(updated.receptorOpacity) : 1.0,
        judgementOpacity: updated.judgementOpacity !== undefined ? Number(updated.judgementOpacity) : 1.0,
         judgementSize: updated.judgementSize !== undefined ? Number(updated.judgementSize) : 1.0,
         judgementPositionY: updated.judgementPositionY !== undefined ? Math.max(20, Math.min(85, Number(updated.judgementPositionY))) : 50,
        laneSeparatorOpacity: updated.laneSeparatorOpacity !== undefined ? Number(updated.laneSeparatorOpacity) : 0.30,
        circleSize: updated.circleSize !== undefined ? Number(updated.circleSize) : 1.0,
         noteSizeMultiplier: updated.noteSizeMultiplier !== undefined ? Math.max(0.85, Math.min(sizeMax, Number(updated.noteSizeMultiplier))) : 1.0,
         receptorSizeMultiplier: updated.receptorSizeMultiplier !== undefined ? Math.max(0.85, Math.min(sizeMax, Number(updated.receptorSizeMultiplier))) : 1.0,
        playfieldStyle: updated.playfieldStyle || 'square',
         playfieldWidthPercent,
        progressBarTop: updated.progressBarTop === true || String(updated.progressBarTop) === 'true',
        selectedMods: updated.selectedMods || [],
        bindPause: updated.bindPause !== undefined ? String(updated.bindPause) : 'escape',
        bindRetry: updated.bindRetry !== undefined ? String(updated.bindRetry) : 'r',
         renderEngine,
        babylonFloor: updated.babylonFloor !== undefined ? Boolean(updated.babylonFloor) : true,
        enableMapSV: updated.enableMapSV !== false,
        disableLaneShake: Boolean(updated.disableLaneShake),
        enableSongPreview: updated.enableSongPreview !== false,
        showFpsCounter: Boolean(updated.showFpsCounter),
      };

      if (updated.bindings) {
        for (const k of Object.keys(updated.bindings)) {
          const numKey = Number(k);
          if (!isNaN(numKey) && Array.isArray(updated.bindings[numKey])) {
            safePayload.bindings[numKey] = updated.bindings[numKey].map(bind => String(bind));
          }
        }
      }

      return safePayload;
    });
  }, []);

  const handleImportBeatmap = async (map: Beatmap) => {
    setCustomMaps(prev => {
      const filtered = prev.filter(m => m.id !== map.id);
      return [map, ...filtered];
    });
    try {
      await storageManager.saveBeatmap(map);
    } catch (e) {
      console.error('Failed to persist imported beatmap to IndexedDB:', e instanceof Error ? e.message : String(e));
    }
  };

  const handleImportPackage = async (packageId: string, name: string, blob: Blob, maps: Beatmap[]) => {
    await storageManager.savePackageWithBeatmaps(packageId, name, blob, maps);
    setCustomMaps(prev => {
      const importedIds = new Set(maps.map(map => map.id));
      return [...maps, ...prev.filter(map => !importedIds.has(map.id))];
    });
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
    const cloned = {
      ...map,
      notes: map.notes ? map.notes.map(n => ({ ...n })) : []
    };
    setSelectedBeatmap(cloned);
    setHasPlayedThisSession(true);
    navigateScreen('play');
  };

  const handleGameplayFinish = (finalScore: ScoreState, replayFrames: ReplayFrame[] = [], hitErrors?: number[]) => {
    // Session-only precision samples; never persisted (AGENTS.md storage contract).
    setLastHitErrors(hitErrors && hitErrors.length > 0 ? [...hitErrors] : null);
    void FullscreenManager.exitFocusMode();

    // Only commit to performance logs if they are NOT playing a spectator replay and it's a mania map (mode 3, or undefined/null/keyCount in mania range)
    const isMania = selectedBeatmap && (
      selectedBeatmap.mode === 3 ||
      selectedBeatmap.mode === undefined ||
      selectedBeatmap.mode === null ||
      (selectedBeatmap.keyCount >= 2 && selectedBeatmap.keyCount <= 8)
    );

    const newRecordId = `play_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    const hasNoFailMod = (settings.selectedMods || []).some(mod => mod.toUpperCase() === 'NF');
    const shouldKeepRun = !finalScore.failed || hasNoFailMod;

    if (selectedBeatmap && !activeReplayRecord && isMania && (finalScore.completed || finalScore.failed) && !finalScore.isAutoplay && shouldKeepRun) {
      const targetBm = activePlayBeatmap || selectedBeatmap;
      const isUserLoggedIn = Boolean(currentUser);
      const replaySource = isUserLoggedIn ? 'account-local' : 'guest-local';

      let newRecord = createPlayHistoryRecord({
        id: newRecordId,
        timestamp: Date.now(),
        beatmap: targetBm,
        scoreState: finalScore,
        replayFrames,
        recordedSettings: settings,
        mods: settings.selectedMods,
        replaySource: replaySource,
      });

      const shouldUpload = isUserLoggedIn && newRecord.uploadEligibility === 'eligible';

      if (shouldUpload) {
        newRecord = {
          ...newRecord,
          uploadStatus: 'pending',
        };
      }

      setPlayHistory(prev => {
         const appended = historyLimit > 0 ? [newRecord, ...prev].slice(0, historyLimit) : [newRecord, ...prev];
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('rhythm_mania_v1_play_history', JSON.stringify(appended));
          } catch (e) {
            console.error('History save error:', e);
          }
        }
        return appended;
      });

      if (shouldUpload) {
        uploadReplayRecord(newRecord).then((result) => {
          const finalStatus: UploadStatus = result.success ? result.uploadStatus : 'failed';
          setPlayHistory(prev => {
            const updated = prev.map(rec => rec.id === newRecordId ? { ...rec, uploadStatus: finalStatus } : rec);
            if (typeof window !== 'undefined') {
              try {
                localStorage.setItem('rhythm_mania_v1_play_history', JSON.stringify(updated));
              } catch (e) {
                console.error('History save error:', e);
              }
            }
            return updated;
          });
        });
      }
    }

    if (!finalScore.completed || finalScore.failed) {
      // "pre exited or failed maps will not get the score screen/ will just replay the song/ go back to the song select"
      setActiveReplayRecord(null);
      setSelectedBeatmap(null);
      setScoreState(null);
       navigateScreen('select');
      return;
    }

    // Do NOT clear spectator frames here so that the results selection knows we are in replay mode.
    // When finishing a spectator replay, anchor the results screen to that exact record so the
    // detailed options (watch/export/delete) resolve for own-history replays; for autoplay and
    // others' replays (not in playHistory) the lookup naturally yields no activeRecord, which
    // keeps the limited results view as intended.
    setScoreState({ ...finalScore, recordId: activeReplayRecord?.id || newRecordId });
    navigateScreen('results');
  };

  const handleRetrySong = () => {
    setActiveReplayRecord(null);
    setLastHitErrors(null);
    setSelectedBeatmap(null);
    navigateScreen('select');
  };

  if (path === '/tos') {
    return (
      <TermsOfServicePage 
        onBack={() => { 
          window.history.pushState({}, '', '/'); 
          setPath('/'); 
        }} 
      />
    );
  }

  if (path === '/privacypolicy') {
    return (
      <PrivacyPolicyPage 
        onBack={() => { 
          window.history.pushState({}, '', '/'); 
          setPath('/'); 
        }} 
      />
    );
  }

  return (
    <div 
      id="application-container" 
      className={`bg-[#050508] text-white flex flex-col font-sans selection:bg-cyan-300 selection:text-[#041321] relative h-screen ${
        (currentScreen === 'play' || currentScreen === 'select' || currentScreen === 'history' || currentScreen === 'results' || currentScreen === 'skins') ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'
      }`}
    >
      {/* LANDSCAPE ORIENTATION WARNING BLOCKER FOR MOBILE PHONES */}
      <div className="mobile-landscape-blocker fixed inset-0 bg-[#050508]/95 backdrop-blur-xl z-[9999] hidden flex-col items-center justify-center p-6 text-center select-none">
        <div className="relative flex flex-col items-center justify-center p-8 bg-slate-950/60 border border-white/5 rounded-3xl max-w-sm shadow-2xl">
          {/* Pulsing glow background decoration */}
          <div className="absolute inset-0 bg-cyan-500/5 rounded-3xl blur-2xl pointer-events-none" />
          
          {/* Rotating phone graphic container */}
          <div className="w-14 h-24 border-[3px] border-cyan-400 rounded-2xl relative flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(34,211,238,0.25)] animate-phone-rotate">
            {/* Speaker Notch */}
            <div className="absolute top-2.5 w-6 h-1 bg-cyan-400/50 rounded-full" />
            {/* Home bar */}
            <div className="absolute bottom-2.5 w-5 h-1 bg-cyan-400/50 rounded-full" />
            {/* Screen simulation */}
            <div className="w-9 h-14 bg-cyan-400/10 rounded-lg flex items-center justify-center">
              <div className="w-4 h-4 bg-cyan-400/40 rounded-full animate-ping" />
            </div>
          </div>

          <h2 className="text-xl font-sans font-black text-white uppercase tracking-wider mb-2 animate-pulse">
            Portrait Mode Required
          </h2>
          <p className="text-xs text-slate-400 font-mono leading-relaxed uppercase">
            Please turn your phone into portrait mode to continue playing RhythmMania as normal.
          </p>
        </div>
      </div>

       {/* Mobile landscape blocker */}
       {isMobileLandscape && (
        <AnimatePresence>
          {isMobileLandscape && (
            <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-[#050508]/95 backdrop-blur-xl z-[9999] flex flex-col items-center justify-center p-6 text-center select-none"
          >
            <div className="relative flex flex-col items-center justify-center p-8 bg-slate-950/60 border border-white/5 rounded-3xl max-w-sm shadow-2xl">
              {/* Pulsing glow background decoration */}
              <div className="absolute inset-0 bg-cyan-500/5 rounded-3xl blur-2xl pointer-events-none" />
              
              {/* Rotating phone graphic container */}
              <motion.div
                animate={{ rotate: [90, 0, 0, 90, 90] }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  repeatDelay: 0.5,
                  ease: "easeInOut"
                }}
                className="w-14 h-24 border-[3px] border-cyan-400 rounded-2xl relative flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(34,211,238,0.25)]"
              >
                {/* Speaker Notch */}
                <div className="absolute top-2.5 w-6 h-1 bg-cyan-400/50 rounded-full" />
                {/* Home bar */}
                <div className="absolute bottom-2.5 w-5 h-1 bg-cyan-400/50 rounded-full" />
                {/* Screen simulation */}
                <div className="w-9 h-14 bg-cyan-400/10 rounded-lg flex items-center justify-center">
                  <motion.div 
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    className="w-4 h-4 bg-cyan-400/30 rounded-full" 
                  />
                </div>
              </motion.div>

              <h2 className="text-xl font-sans font-black text-white uppercase tracking-wider mb-2 animate-pulse">
                Portrait Mode Required
              </h2>
              <p className="text-xs text-slate-400 font-mono leading-relaxed uppercase">
                Please turn your phone into portrait mode to continue playing RhythmMania as normal.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      )}

      {/* DYNAMIC CROSS-FADING BACKGROUND LAYERS */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden select-none">
        <AnimatePresence initial={false}>
          {currentScreen === 'select' && (
            <motion.div
              key={songSelectBgUrl}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: "easeInOut" }}
              className="absolute inset-0 bg-cover bg-center bg-no-repeat bg-fixed"
              style={{
                backgroundImage: `linear-gradient(rgba(0, 0, 0, ${settings.menuBackgroundDim ?? 0.3}), rgba(0, 0, 0, ${settings.menuBackgroundDim ?? 0.3})), url("${sanitizeCssUrl(songSelectBgUrl)}")`
              }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Soft glow backdrop (no grid overlay — background art stays clean) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-1">
        <div className="absolute top-[-300px] left-1/4 w-[600px] h-[600px] rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-100px] right-10 w-[500px] h-[500px] rounded-full bg-indigo-500/5 blur-[120px] pointer-events-none" />
      </div>

      {/* 1. MASTER HEADER */}
      {currentScreen !== 'play' && (
        <>
          <header
            id="main-header"
            className="sticky top-0 z-30 h-[60px] shrink-0 border-b border-white/[0.08] bg-[#061a34]/95 px-2 shadow-[0_8px_30px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:h-[68px] sm:px-5 md:px-7"
          >
            <div className="mx-auto flex h-full w-full max-w-[1440px] items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => leaveProfilePath('menu')}
                className="group flex shrink-0 items-center gap-2 rounded-xl py-2 pr-2 text-left transition-transform duration-150 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                title="Back to menu"
              >
                <img
                  src="/icons/favicon-64.png"
                  alt="RhythmMania logo"
                  className="h-8 w-8 rounded-lg object-cover shadow-[0_0_16px_rgba(0,176,255,0.4)] transition-shadow duration-150 group-hover:shadow-[0_0_22px_rgba(0,176,255,0.7)] sm:h-9 sm:w-9"
                  draggable={false}
                />
                <span className="hidden text-[1.35rem] font-black leading-none tracking-[-0.04em] text-white sm:inline md:text-[1.55rem]">
                  Rhythm<span className="text-cyan-300">Mania</span>
                </span>
              </button>

              <nav id="top-nav" aria-label="Primary navigation" className="scrollbar-none flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto md:ml-3 md:gap-1">
                <button
                  id="header-nav-song-select"
                  type="button"
                  onClick={() => leaveProfilePath('select')}
                  className={`group flex h-10 w-9 items-center justify-center gap-2 rounded-xl px-0 text-[11px] font-bold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 sm:h-11 sm:w-auto sm:justify-start sm:px-3 md:px-4 ${currentScreen === 'select' ? 'bg-[#193454] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'}`}
                  title="Song Select"
                >
                  <Music2 className="h-[19px] w-[19px] shrink-0 text-slate-300 transition-colors group-hover:text-cyan-200" />
                  <span className="hidden sm:inline">Song Select</span>
                </button>

                <button
                  id="header-nav-map-maker"
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="group flex h-10 w-9 items-center justify-center gap-2 rounded-xl px-0 text-[11px] font-bold tracking-wide text-slate-500 opacity-75 sm:h-11 sm:w-auto sm:justify-start sm:px-3 md:px-4"
                  title="Map Maker is coming soon"
                >
                  <Hammer className="h-[19px] w-[19px] shrink-0 text-slate-400" />
                  <span className="hidden sm:inline">Map Maker</span>
                </button>

                <button
                  id="header-nav-party"
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="group flex h-10 w-9 items-center justify-center gap-2 rounded-xl px-0 text-[11px] font-bold tracking-wide text-slate-500 opacity-75 sm:h-11 sm:w-auto sm:justify-start sm:px-3 md:px-4"
                  title="Party is coming soon"
                >
                  <Swords className="h-[19px] w-[19px] shrink-0 text-slate-400" />
                  <span className="hidden sm:inline">Party</span>
                </button>

                <button
                  id="header-nav-beatmap-listing"
                  type="button"
                  onClick={() => setShowFindBeatmapOverlay(true)}
                  className="group flex h-10 w-9 items-center justify-center gap-2 rounded-xl px-0 text-[11px] font-bold tracking-wide text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 sm:h-11 sm:w-auto sm:justify-start sm:px-3 md:px-4"
                  title="Beatmap Listing"
                >
                  <Compass className="h-[19px] w-[19px] shrink-0 text-slate-300 transition-colors group-hover:text-cyan-200" />
                  <span className="hidden sm:inline">Beatmap Listing</span>
                </button>

                <button
                  id="header-nav-skins"
                  type="button"
                  onClick={() => {
                    setShowSettings(false);
                    leaveProfilePath('skins');
                  }}
                  className={`group flex h-10 w-9 items-center justify-center gap-2 rounded-xl px-0 text-[11px] font-bold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 sm:h-11 sm:w-auto sm:justify-start sm:px-3 md:px-4 ${currentScreen === 'skins' ? 'bg-[#193454] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'}`}
                  title="Skins"
                >
                  <Paintbrush className="h-[19px] w-[19px] shrink-0 text-slate-300 transition-colors group-hover:text-cyan-200" />
                  <span className="hidden sm:inline">Skins</span>
                </button>

                <button
                  id="header-nav-settings"
                  type="button"
                  onClick={() => showSettings ? setShowSettings(false) : openSettings()}
                  className={`group flex h-10 w-9 items-center justify-center gap-2 rounded-xl px-0 text-[11px] font-bold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 sm:h-11 sm:w-auto sm:justify-start sm:px-3 md:px-4 ${showSettings ? 'bg-[#193454] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'}`}
                  title="Settings"
                >
                  <SettingsIcon className="h-[19px] w-[19px] shrink-0 text-slate-300 transition-colors group-hover:text-cyan-200" />
                  <span className="hidden sm:inline">Settings</span>
                </button>

                <button
                  id="header-nav-history"
                  type="button"
                  onClick={() => leaveProfilePath('history')}
                  className={`group flex h-10 w-9 items-center justify-center gap-2 rounded-xl px-0 text-[11px] font-bold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 sm:h-11 sm:w-auto sm:justify-start sm:px-3 md:px-4 ${currentScreen === 'history' ? 'bg-[#193454] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'}`}
                  title="History"
                >
                  <RotateCcw className="h-[19px] w-[19px] shrink-0 text-slate-300 transition-colors group-hover:text-cyan-200" />
                  <span className="hidden sm:inline">History</span>
                </button>
              </nav>

              <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
                {authLoading ? (
                  <div className="flex h-10 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-400 sm:h-11 sm:w-[118px]">
                    <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                    <span className="ml-2 hidden text-[11px] font-bold sm:inline">Loading</span>
                  </div>
                ) : currentUser ? (
                  <div ref={accountMenuRef} className="relative">
                    <button
                      id="header-nav-account"
                      type="button"
                      onClick={() => setIsAccountMenuOpen((open) => !open)}
                      className={`group flex h-10 max-w-[9rem] items-center gap-2 rounded-xl border px-2 text-cyan-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 sm:h-11 sm:max-w-none sm:px-3.5 ${isAccountMenuOpen ? 'border-cyan-200/50 bg-cyan-300/[0.16]' : 'border-cyan-300/25 bg-cyan-300/[0.08] hover:border-cyan-200/50 hover:bg-cyan-300/[0.14]'}`}
                      title="Open account menu"
                      aria-label={`Open account menu for ${currentUser.username}`}
                      aria-haspopup="menu"
                      aria-expanded={isAccountMenuOpen}
                    >
                      {currentUser.avatarUrl ? (
                        <img src={currentUser.avatarUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-cyan-200/40" />
                      ) : (
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-300/20 text-[10px] font-black text-cyan-100 ring-1 ring-cyan-200/40">
                          {currentUser.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="min-w-0 truncate text-[11px] font-bold">{currentUser.username}</span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-cyan-200/80 transition-transform duration-150 ${isAccountMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>

                    {isAccountMenuOpen && (
                      <div
                        role="menu"
                        aria-label="Account menu"
                        className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border border-white/[0.12] bg-[#392c4c]/95 p-1.5 shadow-[0_14px_35px_rgba(0,0,0,0.42)] backdrop-blur-xl"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setIsAccountMenuOpen(false);
                            openEditProfile();
                          }}
                          className="group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-white/90 transition-colors hover:bg-white/[0.1] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                        >
                          <SettingsIcon className="h-[18px] w-[18px] shrink-0 text-white/90" aria-hidden="true" />
                          <span>Account Settings</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setIsAccountMenuOpen(false);
                            openProfile({ kind: 'userId', value: currentUser.id });
                          }}
                          className="group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-white/90 transition-colors hover:bg-white/[0.1] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                        >
                          <UserRound className="h-[18px] w-[18px] shrink-0 text-white/90" aria-hidden="true" />
                          <span>My Profile</span>
                        </button>
                        <div className="my-1.5 border-t border-white/[0.12]" aria-hidden="true" />
                        <a
                          role="menuitem"
                          href="https://bug-report.rhythm-mania.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setIsAccountMenuOpen(false)}
                          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-white/90 transition-colors hover:bg-white/[0.1] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                        >
                          <MessageSquareWarning className="h-[18px] w-[18px] shrink-0 text-white/90" aria-hidden="true" />
                          <span>Bug Report</span>
                        </a>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={requestSignOut}
                          className="group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-rose-300 transition-colors hover:bg-rose-400/[0.12] hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/70"
                        >
                          <LogOut className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                          <span>Logout</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    id="header-nav-login"
                    type="button"
                    onClick={handleGoogleSignIn}
                    className="group flex h-10 w-9 items-center justify-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-300/[0.08] px-0 text-[11px] font-bold text-cyan-100 transition-colors hover:border-cyan-200/50 hover:bg-cyan-300/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 sm:h-11 sm:w-auto sm:justify-start sm:px-3.5"
                    title="Log in"
                  >
                    <LogIn className="h-[18px] w-[18px] text-cyan-200" />
                    <span className="hidden sm:inline">Log in</span>
                  </button>
                )}

                <button
                  id="header-nav-fullscreen"
                  type="button"
                  onClick={() => void toggleFullscreen()}
                  className="flex h-10 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 sm:h-11 sm:w-11"
                  title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                >
                  {isFullscreen ? <Minimize2 className="h-[19px] w-[19px]" /> : <Maximize2 className="h-[19px] w-[19px]" />}
                </button>
                <button
                  id="header-nav-mute"
                  type="button"
                  onClick={toggleMute}
                  className={`flex h-10 w-9 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 sm:h-11 sm:w-11 ${isMuted ? 'text-rose-200 hover:bg-white/[0.06]' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'}`}
                  title={isMuted ? 'Unmute audio' : 'Mute audio'}
                  aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
                >
                  {isMuted ? <VolumeX className="h-[19px] w-[19px]" /> : <Volume2 className="h-[19px] w-[19px]" />}
                </button>
              </div>
            </div>
          </header>
          {authError && (
            <div className="absolute right-4 top-[76px] z-40 max-w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-rose-300/25 bg-rose-950/90 px-4 py-2.5 text-xs text-rose-100 shadow-xl sm:right-6">
              {authError}
            </div>
          )}
        </>
      )}

      {/* 2. CORE VIEWPORTS */}
      <main 
        id="app-main-viewport" 
        className={`flex-1 flex flex-col min-h-0 relative ${
          (currentScreen === 'play' || currentScreen === 'select' || currentScreen === 'history' || currentScreen === 'results' || currentScreen === 'skins')
            ? 'w-full h-full' 
            : 'py-6 md:py-12 px-4 md:px-6 z-10'
        }`}
      >
        <AnimatePresence mode="wait">
          {currentScreen === 'menu' && (
            <motion.div
              key="menu"
              variants={PAGE_TRANSITION_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full"
            >
              <MainMenu 
                onNavigate={(screen) => {
                  if (screen === 'profile') {
                    if (currentUser) openProfile({ kind: 'userId', value: currentUser.id });
                    else handleGoogleSignIn();
                    return;
                  }
                  leaveProfilePath(screen as GameScreen);
                }} 
                onOpenSettings={openSettings}
                 currentUser={currentUser}
                 authLoading={authLoading}
                onSignIn={handleGoogleSignIn}
                onSignOut={requestSignOut}
                authError={authError}
              />
            </motion.div>
          )}

          {currentScreen === 'skins' && (
            <motion.div
              key="skins"
              variants={PAGE_TRANSITION_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              className="h-full w-full overflow-hidden"
            >
              <SkinScreen
                settings={settings}
                updateSettings={updateSettings}
                onBack={() => navigateScreen('menu')}
              />
            </motion.div>
          )}

          {currentScreen === 'editprofile' && (
            <motion.div
              key="edit-profile"
              variants={PAGE_TRANSITION_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              className="h-full w-full overflow-hidden"
            >
              <EditProfileScreen
                onDone={() => currentUser && openProfile({ kind: 'userId', value: currentUser.id })}
                onBack={() => {
                  if (currentUser) openProfile({ kind: 'userId', value: currentUser.id });
                  else leaveProfilePath('menu');
                }}
              />
            </motion.div>
          )}

          {currentScreen === 'profile' && (
            <motion.div
              key={`profile-${profileTarget ? `${profileTarget.kind}-${profileTarget.value}` : 'search'}`}
              variants={PAGE_TRANSITION_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              className="h-full w-full overflow-hidden"
            >
              <ProfileScreen
                user={currentUser}
                profileTarget={profileTarget}
                onBack={() => leaveProfilePath('menu')}
                onEditProfile={openEditProfile}
                onOpenProfile={openProfile}
              />
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
                onOpenSettings={openSettings}
                customMaps={customMaps}
                shouldAutoSelectOnMount={hasPlayedThisSession}
                 onImportBeatmap={handleImportBeatmap}
                 onImportPackage={handleImportPackage}
                onDeleteSongGroup={handleDeleteSongGroup}
                filterMode={3}
                setSongSelectBgUrl={setSongSelectBgUrl}
                 onBack={() => navigateScreen('menu')}
                onOpenOnlineCatalog={() => setShowFindBeatmapOverlay(true)}
                onWatchReplay={handleWatchReplay}
                playHistory={playHistory}
                onAddHistoryRecord={(record) => {
                  setPlayHistory(prev => {
                    if (prev.some(r => r.id === record.id)) return prev;
                     const updated = historyLimit > 0 ? [record, ...prev].slice(0, historyLimit) : [record, ...prev];
                    if (typeof window !== 'undefined') {
                      try {
                        localStorage.setItem('rhythm_mania_v1_play_history', JSON.stringify(updated));
                      } catch (e) {
                        console.error('History save error:', e);
                      }
                    }
                    return updated;
                  });
                }}
              />
            </motion.div>
          )}

          {currentScreen === 'play' && selectedBeatmap && activePlayBeatmap && (
            <motion.div
              key="play"
              variants={PAGE_TRANSITION_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full flex-1 flex flex-col"
            >
                <GameplayCanvas
                  beatmap={activePlayBeatmap}
                  settings={settings}
                  updateSettings={updateSettings}
                  onFinish={handleGameplayFinish}
                  onBack={() => {
                    void FullscreenManager.exitFocusMode();
                    const returnScreen = activeReplayRecord ? 'history' : 'select';
                    setActiveReplayRecord(null);
                    if (selectedBeatmap) {
                      const cached = storageManager.lruMediaCache.get(selectedBeatmap.id);
                      if (!cached) {
                        AssetLifecycleManager.releaseSpecific(selectedBeatmap.audioUrl);
                        AssetLifecycleManager.releaseSpecific(selectedBeatmap.videoUrl);
                        AssetLifecycleManager.releaseSpecific(selectedBeatmap.bgUrl);
                      } else {
                        if (selectedBeatmap.audioUrl && selectedBeatmap.audioUrl !== cached.audioUrl) {
                          AssetLifecycleManager.releaseSpecific(selectedBeatmap.audioUrl);
                        }
                        if (selectedBeatmap.videoUrl && selectedBeatmap.videoUrl !== cached.videoUrl) {
                          AssetLifecycleManager.releaseSpecific(selectedBeatmap.videoUrl);
                        }
                        if (selectedBeatmap.bgUrl && selectedBeatmap.bgUrl !== cached.bgUrl) {
                          AssetLifecycleManager.releaseSpecific(selectedBeatmap.bgUrl);
                        }
                      }
                    }
                    setSelectedBeatmap(null);
                     navigateScreen(returnScreen);
                  }}
                  replayRecord={activeReplayRecord}
                />
            </motion.div>
          )}

          {currentScreen === 'results' && scoreState && selectedBeatmap && activePlayBeatmap && (
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
                beatmap={activePlayBeatmap}
                playHistory={playHistory}
                currentMods={settings.selectedMods}
                hitErrors={lastHitErrors}
                onRetry={handleRetrySong}
                onWatchReplay={(record) => {
                   setViewingHistoryResult(false);
                   return handleWatchReplay(record);
                }}
                onDeleteRecord={handleDeleteHistoryRecord}
                onBack={() => {
                  void FullscreenManager.exitFocusMode();
                  const returnScreen = activeReplayRecord ? 'history' : (viewingHistoryResult ? 'history' : 'select');
                  setActiveReplayRecord(null);
                  setViewingHistoryResult(false);
                  if (selectedBeatmap) {
                    const cached = storageManager.lruMediaCache.get(selectedBeatmap.id);
                    if (!cached) {
                      AssetLifecycleManager.releaseSpecific(selectedBeatmap.audioUrl);
                      AssetLifecycleManager.releaseSpecific(selectedBeatmap.videoUrl);
                      AssetLifecycleManager.releaseSpecific(selectedBeatmap.bgUrl);
                    } else {
                      if (selectedBeatmap.audioUrl && selectedBeatmap.audioUrl !== cached.audioUrl) {
                        AssetLifecycleManager.releaseSpecific(selectedBeatmap.audioUrl);
                      }
                      if (selectedBeatmap.videoUrl && selectedBeatmap.videoUrl !== cached.videoUrl) {
                        AssetLifecycleManager.releaseSpecific(selectedBeatmap.videoUrl);
                      }
                      if (selectedBeatmap.bgUrl && selectedBeatmap.bgUrl !== cached.bgUrl) {
                        AssetLifecycleManager.releaseSpecific(selectedBeatmap.bgUrl);
                      }
                    }
                  }
                  setSelectedBeatmap(null);
                   navigateScreen(returnScreen);
                }}
                onBackToHistory={viewingHistoryResult ? () => {
                  setViewingHistoryResult(false);
                  setScoreState(null);
                   navigateScreen('history');
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
              className="w-full h-full overflow-hidden"
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
                    setLastHitErrors(null);
                    setScoreState(record.scoreState);
                    const baseId = record.beatmapId.includes('_converted_')
                      ? record.beatmapId.split('_converted_')[0]
                      : record.beatmapId;
                    const bm = customMaps.find(m =>
                      m.id === record.beatmapId ||
                      (baseId && m.id === baseId) ||
                      (record.catalogMapId && m.catalogMapId === record.catalogMapId) ||
                      (record.beatmapHash && m.beatmapHash === record.beatmapHash)
                    );
                    if (bm) {
                        const cloned = {
                          ...bm,
                          notes: bm.notes ? bm.notes.map(n => ({ ...n })) : []
                        };
                        setSelectedBeatmap(cloned);
                        setViewingHistoryResult(true);
                        navigateScreen('results');
                    }
                  }}
                  onClearHistory={handleClearHistory}
                  onDeleteRecord={handleDeleteHistoryRecord}
                  onImportRecords={handleImportRecords}
                  historyLimit={historyLimit}
                  onSetHistoryLimit={handleSetHistoryLimit}
                  settings={settings}
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

      <OnlineBeatmapCatalog
        open={showFindBeatmapOverlay}
        onClose={() => setShowFindBeatmapOverlay(false)}
        customMaps={customMaps}
        onImportPackage={handleImportPackage}
      />

      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-confirm-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-950 p-6 text-center shadow-2xl">
            <h2 id="logout-confirm-title" className="text-lg font-black text-white">
              Sign out?
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Are you sure you want to log out of your account?
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-black text-white transition hover:bg-rose-500"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
