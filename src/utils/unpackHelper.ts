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

import JSZip from 'jszip';
import { Beatmap } from '../types';
import { RobustZipResolver } from './zipResolver';
import { AssetLifecycleManager, isBrowserPlayableVideoFilename } from './assetLifecycle';
import { storageManager } from './storageManager';
import { TempMemoryCache } from './tempMemoryCache';
import { validateZipLimits, validateZipEntrySize } from './securityLimits';

async function registerZipFile(
  file: JSZip.JSZipObject,
  filename: string
): Promise<string> {
  validateZipEntrySize(file, filename);
  const ab = await file.async('arraybuffer');
  return AssetLifecycleManager.registerArrayBuffer(ab, filename);
}

export async function unpackBeatmap(map: Beatmap, force = false): Promise<void> {
  const mapWithPkg = map as any;
  if (mapWithPkg.isServerMap && !mapWithPkg.isCached) {
    return;
  }

  // Clear stale mutated blob URLs if they are not in the active media cache
  const cached = storageManager.lruMediaCache.get(map.id);
  if (!cached) {
    if (map.audioUrl?.startsWith('blob:')) map.audioUrl = '';
    if (map.videoUrl?.startsWith('blob:')) map.videoUrl = '';
    if (map.bgUrl?.startsWith('blob:')) map.bgUrl = '';
  } else {
    map.audioUrl = cached.audioUrl || map.audioUrl;
    map.videoUrl = cached.videoUrl || map.videoUrl;
    map.bgUrl = cached.bgUrl || map.bgUrl;
  }

  if (!mapWithPkg.packageId) {
    return;
  }

  const wantsVideo = !!(mapWithPkg.videoFilename && isBrowserPlayableVideoFilename(mapWithPkg.videoFilename));
  const cacheComplete =
    !force &&
    !!cached?.audioUrl &&
    !!cached?.bgUrl &&
    (!wantsVideo || !!cached?.videoUrl);

  if (cacheComplete) {
    return;
  }

  let zipBuffer: ArrayBuffer | Blob | null = TempMemoryCache.get(mapWithPkg.packageId);
  if (!zipBuffer) {
    zipBuffer = await storageManager.getPackage(mapWithPkg.packageId);
  }

  if (!zipBuffer) {
    return;
  }

  const zip = await JSZip.loadAsync(zipBuffer);
  validateZipLimits(zip);

  const resolver = new RobustZipResolver(zip);
  const audioFilename = mapWithPkg.audioFilename || '';
  const videoFilename = mapWithPkg.videoFilename || '';
  const bgFilename = mapWithPkg.bgFilename || '';

  let parsedAudioUrl = (!force && cached?.audioUrl) || '';
  let parsedVideoUrl = (!force && cached?.videoUrl) || '';
  let parsedBgUrl = (!force && cached?.bgUrl) || '';

  if (audioFilename && !parsedAudioUrl) {
    const file = resolver.findFile(audioFilename);
    if (file) {
      parsedAudioUrl = await registerZipFile(file, audioFilename);
    }
  }
  if (videoFilename && isBrowserPlayableVideoFilename(videoFilename) && !parsedVideoUrl) {
    const file = resolver.findFile(videoFilename);
    if (file) {
      parsedVideoUrl = await registerZipFile(file, videoFilename);
    }
  }

  if (!parsedAudioUrl) {
    const fallbackObj =
      (await resolver.findLargestFileByExtensions(['.mp3', '.ogg'])) ||
      resolver.findFallbackByExtensions(['.mp3', '.ogg'])?.file;
    if (fallbackObj) {
      parsedAudioUrl = await registerZipFile(fallbackObj, fallbackObj.name);
    }
  }
  if (!parsedVideoUrl) {
    const fallbackObj =
      (await resolver.findLargestFileByExtensions(['.mp4', '.m4v', '.webm', '.ogv'])) ||
      resolver.findFallbackByExtensions(['.mp4', '.m4v', '.webm', '.ogv'])?.file;
    if (fallbackObj) {
      parsedVideoUrl = await registerZipFile(fallbackObj, fallbackObj.name);
    }
  }

  if (bgFilename && !parsedBgUrl) {
    const file = resolver.findFile(bgFilename);
    if (file) {
      // Skip if the "background" is actually a video file — handled as video above
      if (!isBrowserPlayableVideoFilename(bgFilename)) {
        parsedBgUrl = await registerZipFile(file, bgFilename);
      }
    }
  }
  if (!parsedBgUrl) {
    const fallbackObj =
      (await resolver.findLargestFileByExtensions(['.jpg', '.jpeg', '.png', '.bmp', '.webp'])) ||
      resolver.findFallbackByExtensions(['.jpg', '.jpeg', '.png', '.bmp', '.webp'])?.file;
    if (fallbackObj) {
      parsedBgUrl = await registerZipFile(fallbackObj, fallbackObj.name);
    }
  }

  storageManager.lruMediaCache.put(map.id, {
    audioUrl: parsedAudioUrl,
    videoUrl: parsedVideoUrl,
    bgUrl: parsedBgUrl,
  });

  if (parsedAudioUrl) map.audioUrl = parsedAudioUrl;
  if (parsedVideoUrl) map.videoUrl = parsedVideoUrl;
  if (parsedBgUrl) map.bgUrl = parsedBgUrl;

  TempMemoryCache.remove(mapWithPkg.packageId);
}
