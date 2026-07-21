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

const MIME_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/** Browser-native playable video containers (not AVI/MKV/FLV from many osu packs). */
const BROWSER_VIDEO_EXTS = new Set(['.mp4', '.m4v', '.webm', '.ogv']);

export function getMimeTypeFromFilename(filename: string): string | null {
  if (!filename) return null;
  const base = filename.split(/[/\\]/).pop() || filename;
  const dot = base.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = base.slice(dot).toLowerCase();
  return MIME_BY_EXT[ext] ?? null;
}

export function isBrowserPlayableVideoFilename(filename: string): boolean {
  if (!filename) return false;
  const base = filename.split(/[/\\]/).pop() || filename;
  const dot = base.lastIndexOf('.');
  if (dot < 0) return false;
  return BROWSER_VIDEO_EXTS.has(base.slice(dot).toLowerCase());
}

/** Human-readable container label for UI (AVI, MKV, …). */
export function getVideoFormatLabel(filename: string): string {
  if (!filename) return 'UNKNOWN';
  const base = filename.split(/[/\\]/).pop() || filename;
  const dot = base.lastIndexOf('.');
  if (dot < 0) return 'UNKNOWN';
  const ext = base.slice(dot + 1).toUpperCase();
  return ext || 'UNKNOWN';
}

/**
 * K-mods rewrite map ids to `${id}_converted_Nk`. Media cache is stored under the base id.
 */
export function getMediaCacheKey(mapId: string): string {
  if (!mapId) return mapId;
  const idx = mapId.indexOf('_converted_');
  return idx >= 0 ? mapId.slice(0, idx) : mapId;
}

/**
 * Ensure blob has a usable MIME type. JSZip's async('blob') returns type "".
 * Without this, <video src="blob:..."> often fails with MEDIA_ERR_SRC_NOT_SUPPORTED
 * even when the bytes are valid H.264/MP4.
 */
export function ensureBlobMimeType(blob: Blob, filenameOrMime?: string): Blob {
  if (!filenameOrMime) return blob;
  const mime = filenameOrMime.includes('/')
    ? filenameOrMime
    : getMimeTypeFromFilename(filenameOrMime);
  if (!mime) return blob;
  if (blob.type === mime) return blob;
  return new Blob([blob], { type: mime });
}

/**
 * Tracks and revokes Blob URLs to avoid main-thread memory leaks
 * in high-performance rhythm browser apps.
 */
export class AssetLifecycleManager {
  private static activeBlobUrls: Set<string> = new Set();

  /**
   * Encapsulates URL creation and lifecycle scope tracking.
   * Pass the source filename so media elements get a correct Content-Type.
   */
  public static registerBlob(blob: Blob, filenameOrMime?: string): string {
    const typed = ensureBlobMimeType(blob, filenameOrMime);
    const url = URL.createObjectURL(typed);
    this.activeBlobUrls.add(url);
    return url;
  }

  /**
   * Preferred path for zip entries: build a fresh typed Blob from raw bytes.
   * Avoids empty-type JSZip blobs that break &lt;video&gt; decoding.
   */
  public static registerArrayBuffer(data: ArrayBuffer, filenameOrMime: string): string {
    const mime = filenameOrMime.includes('/')
      ? filenameOrMime
      : (getMimeTypeFromFilename(filenameOrMime) || 'application/octet-stream');
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    this.activeBlobUrls.add(url);
    return url;
  }

  /**
   * Release a specific dynamic blob resource URL
   */
  public static releaseSpecific(url: string | undefined) {
    if (!url) return;
    if (this.activeBlobUrls.has(url)) {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        console.warn('Failed to revoke targeted asset Blob URL:', e instanceof Error ? e.message : String(e));
      }
      this.activeBlobUrls.delete(url);
    }
  }

  /**
   * Flushes all active files in memory
   */
  public static clearAll() {
    this.activeBlobUrls.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        // Safe fail-silent wrap
      }
    });
    this.activeBlobUrls.clear();
    console.log('RhythmMania: Dynamic assets de-allocated in memory.');
  }
}
