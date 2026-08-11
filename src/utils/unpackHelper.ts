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
import type { Beatmap } from '../types';
import { extractZipEntry, RobustZipResolver } from './zipResolver';
import { AssetLifecycleManager, isBrowserPlayableVideoFilename } from './assetLifecycle';
import { storageManager, type SavedBeatmap } from './storageManager';
import { TempMemoryCache } from './tempMemoryCache';
import { createZipExtractionBudget, validateZipLimits } from './securityLimits';

async function registerZipFile(
  file: JSZip.JSZipObject,
  filename: string,
  budget: ReturnType<typeof createZipExtractionBudget>,
): Promise<string> {
  const ab = await extractZipEntry(file, filename, budget);
  return AssetLifecycleManager.registerArrayBuffer(ab, filename);
}

export async function unpackBeatmap(map: Beatmap, force = false): Promise<void> {
  const mapWithPkg = map as SavedBeatmap;
  if (mapWithPkg.isServerMap && !mapWithPkg.isCached) {
    return;
  }

  // Clear stale mutated blob URLs if they are not in the active media cache
  const cached = storageManager.lruMediaCache.get(map.id);
  if (!cached) {
    for (const url of [map.audioUrl, map.videoUrl, map.bgUrl, ...Object.values(map.hitSoundUrls || {})]) {
      if (url?.startsWith('blob:')) AssetLifecycleManager.releaseSpecific(url);
    }
    map.audioUrl = '';
    map.videoUrl = '';
    map.bgUrl = '';
    map.hitSoundUrls = undefined;
  } else {
    for (const [current, retained] of [
      [map.audioUrl, cached.audioUrl],
      [map.videoUrl, cached.videoUrl],
      [map.bgUrl, cached.bgUrl],
    ] as Array<[string | undefined, string]>) {
      if (current && current !== retained) AssetLifecycleManager.releaseSpecific(current);
    }
    for (const [name, current] of Object.entries(map.hitSoundUrls || {})) {
      if (current !== cached.hitSoundUrls[name]) AssetLifecycleManager.releaseSpecific(current);
    }
    map.audioUrl = cached.audioUrl || map.audioUrl;
    map.videoUrl = cached.videoUrl || map.videoUrl;
    map.bgUrl = cached.bgUrl || map.bgUrl;
    map.hitSoundUrls = cached.hitSoundUrls;
  }

  if (!mapWithPkg.packageId) {
    return;
  }

  const wantsVideo = !!(mapWithPkg.videoFilename && isBrowserPlayableVideoFilename(mapWithPkg.videoFilename));
  const cacheComplete =
    !force &&
    !!cached?.audioUrl &&
    !!cached?.bgUrl &&
    map.hitSoundUrls !== undefined &&
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
  const extractionBudget = createZipExtractionBudget();

  const resolver = new RobustZipResolver(zip);
  const audioFilename = mapWithPkg.audioFilename || '';
  const videoFilename = mapWithPkg.videoFilename || '';
  const bgFilename = mapWithPkg.bgFilename || '';
  const hitSoundFilenames = new Set<string>(['normal-hitnormal', 'normal-hitwhistle', 'normal-hitfinish', 'normal-hitclap']);
  for (const note of map.notes || []) {
    if (note.hitSample?.filename) hitSoundFilenames.add(note.hitSample.filename.replace(/\.[^/.]+$/, ''));
  }

  let parsedAudioUrl = (!force && cached?.audioUrl) || '';
  let parsedVideoUrl = (!force && cached?.videoUrl) || '';
  let parsedBgUrl = (!force && cached?.bgUrl) || '';
  const parsedHitSoundUrls: Record<string, string> = (!force && cached?.hitSoundUrls) ? { ...cached.hitSoundUrls } : {};
  const createdUrls: string[] = [];

  const register = async (file: JSZip.JSZipObject, filename: string): Promise<string> => {
    const url = await registerZipFile(file, filename, extractionBudget);
    createdUrls.push(url);
    return url;
  };

  try {
    if (audioFilename && !parsedAudioUrl) {
      const file = resolver.findFile(audioFilename);
      if (file) parsedAudioUrl = await register(file, audioFilename);
    }
    if (videoFilename && isBrowserPlayableVideoFilename(videoFilename) && !parsedVideoUrl) {
      const file = resolver.findFile(videoFilename);
      if (file) parsedVideoUrl = await register(file, videoFilename);
    }

  if (!parsedAudioUrl) {
    const fallbackObj =
      (await resolver.findLargestFileByExtensions(['.mp3', '.ogg'])) ||
      resolver.findFallbackByExtensions(['.mp3', '.ogg'])?.file;
    if (fallbackObj) {
      parsedAudioUrl = await register(fallbackObj, fallbackObj.name);
    }
  }
  if (!parsedVideoUrl) {
    const fallbackObj =
      (await resolver.findLargestFileByExtensions(['.mp4', '.m4v', '.webm', '.ogv'])) ||
      resolver.findFallbackByExtensions(['.mp4', '.m4v', '.webm', '.ogv'])?.file;
    if (fallbackObj) {
      parsedVideoUrl = await register(fallbackObj, fallbackObj.name);
    }
  }

  if (bgFilename && !parsedBgUrl) {
    const file = resolver.findFile(bgFilename);
    if (file) {
      // Skip if the "background" is actually a video file — handled as video above
      if (!isBrowserPlayableVideoFilename(bgFilename)) {
        parsedBgUrl = await register(file, bgFilename);
      }
    }
  }
  for (const sampleName of hitSoundFilenames) {
    const file = resolver.findFile(sampleName) ||
      resolver.findFile(`${sampleName}.wav`) ||
      resolver.findFile(`${sampleName}.ogg`);
     if (file && !parsedHitSoundUrls[sampleName]) parsedHitSoundUrls[sampleName] = await register(file, file.name);
  }
  if (!parsedBgUrl) {
    const fallbackObj =
      (await resolver.findLargestFileByExtensions(['.jpg', '.jpeg', '.png', '.bmp', '.webp'])) ||
      resolver.findFallbackByExtensions(['.jpg', '.jpeg', '.png', '.bmp', '.webp'])?.file;
    if (fallbackObj) {
      parsedBgUrl = await register(fallbackObj, fallbackObj.name);
    }
  }

    storageManager.lruMediaCache.put(map.id, {
      audioUrl: parsedAudioUrl,
      videoUrl: parsedVideoUrl,
      bgUrl: parsedBgUrl,
      hitSoundUrls: parsedHitSoundUrls,
    });

  if (parsedAudioUrl) map.audioUrl = parsedAudioUrl;
  if (parsedVideoUrl) map.videoUrl = parsedVideoUrl;
  if (parsedBgUrl) map.bgUrl = parsedBgUrl;
    if (map.hitSoundUrls) {
      for (const url of Object.values(map.hitSoundUrls)) {
        if (url?.startsWith('blob:') && !Object.values(parsedHitSoundUrls).includes(url)) AssetLifecycleManager.releaseSpecific(url);
      }
    }
    map.hitSoundUrls = parsedHitSoundUrls;
  } catch (error) {
    for (const url of createdUrls) AssetLifecycleManager.releaseSpecific(url);
    throw error;
  } finally {
    TempMemoryCache.remove(mapWithPkg.packageId);
  }
}
