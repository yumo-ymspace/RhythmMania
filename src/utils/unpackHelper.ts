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
import { AssetLifecycleManager } from './assetLifecycle';
import { storageManager } from './storageManager';
import { TempMemoryCache } from './tempMemoryCache';
import { validateZipLimits, validateZipEntrySize } from './securityLimits';

export async function unpackBeatmap(map: Beatmap): Promise<void> {
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

  if (mapWithPkg.packageId) {
    const cachedInside = storageManager.lruMediaCache.get(map.id);
    if (cachedInside) {
      map.audioUrl = cachedInside.audioUrl || map.audioUrl;
      map.videoUrl = cachedInside.videoUrl || map.videoUrl;
      map.bgUrl = cachedInside.bgUrl || map.bgUrl;
      return;
    }

    let zipBuffer: ArrayBuffer | Blob | null = TempMemoryCache.get(mapWithPkg.packageId);
    if (!zipBuffer) {
      zipBuffer = await storageManager.getPackage(mapWithPkg.packageId);
    }

    if (zipBuffer) {
      const zip = await JSZip.loadAsync(zipBuffer);
      validateZipLimits(zip);

      const resolver = new RobustZipResolver(zip);
      const audioFilename = mapWithPkg.audioFilename || '';
      const videoFilename = mapWithPkg.videoFilename || '';
      const bgFilename = mapWithPkg.bgFilename || '';

      let parsedAudioUrl = '';
      let parsedVideoUrl = '';
      let parsedBgUrl = '';

      if (audioFilename) {
        const file = resolver.findFile(audioFilename);
        if (file) {
          validateZipEntrySize(file, audioFilename);
          const b = await file.async('blob');
          parsedAudioUrl = AssetLifecycleManager.registerBlob(b);
        }
      }
      if (videoFilename) {
        const file = resolver.findFile(videoFilename);
        if (file) {
          validateZipEntrySize(file, videoFilename);
          const b = await file.async('blob');
          parsedVideoUrl = AssetLifecycleManager.registerBlob(b);
        }
      }

      if (!parsedAudioUrl) {
        const fallbackObj = await resolver.findLargestFileByExtensions(['.mp3', '.ogg']) || resolver.findFallbackByExtensions(['.mp3', '.ogg'])?.file;
        if (fallbackObj) {
          validateZipEntrySize(fallbackObj, fallbackObj.name);
          const b = await fallbackObj.async('blob');
          parsedAudioUrl = AssetLifecycleManager.registerBlob(b);
        }
      }
      if (!parsedVideoUrl) {
        const fallbackObj = await resolver.findLargestFileByExtensions(['.mp4', '.webm', '.avi', '.mkv']) || resolver.findFallbackByExtensions(['.mp4', '.webm', '.avi'])?.file;
        if (fallbackObj) {
          validateZipEntrySize(fallbackObj, fallbackObj.name);
          const b = await fallbackObj.async('blob');
          parsedVideoUrl = AssetLifecycleManager.registerBlob(b);
        }
      }

      if (bgFilename) {
        const file = resolver.findFile(bgFilename);
        if (file) {
          validateZipEntrySize(file, bgFilename);
          const b = await file.async('blob');
          parsedBgUrl = AssetLifecycleManager.registerBlob(b);
        }
      }
      if (!parsedBgUrl) {
        const fallbackObj = await resolver.findLargestFileByExtensions(['.jpg', '.jpeg', '.png', '.bmp']) || resolver.findFallbackByExtensions(['.jpg', '.jpeg', '.png', '.bmp'])?.file;
        if (fallbackObj) {
          validateZipEntrySize(fallbackObj, fallbackObj.name);
          const b = await fallbackObj.async('blob');
          parsedBgUrl = AssetLifecycleManager.registerBlob(b);
        }
      }

      storageManager.lruMediaCache.put(map.id, {
        audioUrl: parsedAudioUrl,
        videoUrl: parsedVideoUrl,
        bgUrl: parsedBgUrl
      });

      if (parsedAudioUrl) map.audioUrl = parsedAudioUrl;
      if (parsedVideoUrl) map.videoUrl = parsedVideoUrl;
      if (parsedBgUrl) map.bgUrl = parsedBgUrl;

      TempMemoryCache.remove(mapWithPkg.packageId);
    }
  }
}
