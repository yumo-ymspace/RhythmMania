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

export class RobustZipResolver {
  constructor(private zip: JSZip) {}

  public findFile(targetPath: string): JSZip.JSZipObject | null {
    if (!targetPath) return null;
    const cleanTarget = targetPath.replace(/\\/g, '/').replace(/['"]/g, '').trim().toLowerCase();
    const files = this.zip.files;

    // Exact match trial
    for (const filePath of Object.keys(files)) {
      if (files[filePath].dir) continue;
      const normalized = filePath.replace(/\\/g, '/').toLowerCase();
      if (normalized === cleanTarget) return files[filePath];
    }

    // Relative match endsWith trial
    for (const filePath of Object.keys(files)) {
      if (files[filePath].dir) continue;
      const normalized = filePath.replace(/\\/g, '/').toLowerCase();
      if (normalized.endsWith('/' + cleanTarget)) return files[filePath];
    }

    // Suffix/Filename only fallback trial
    const baseName = cleanTarget.split('/').pop() || '';
    for (const filePath of Object.keys(files)) {
      if (files[filePath].dir) continue;
      const name = filePath.split('/').pop() || '';
      if (name.toLowerCase() === baseName) return files[filePath];
    }

    return null;
  }

  public async findLargestFileByExtensions(extensions: string[]): Promise<JSZip.JSZipObject | null> {
    const files = this.zip.files;
    const candidates: { file: JSZip.JSZipObject; filepath: string }[] = [];

    for (const filePath of Object.keys(files)) {
      if (files[filePath].dir) continue;
      if (extensions.some(ext => filePath.toLowerCase().endsWith(ext))) {
        candidates.push({ file: files[filePath], filepath: filePath });
      }
    }

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0].file;

    let largestFile: JSZip.JSZipObject | null = null;
    let maxBytes = 0;

    for (const cand of candidates) {
      try {
        const arr = await cand.file.async('uint8array');
        if (arr.length > maxBytes) {
          maxBytes = arr.length;
          largestFile = cand.file;
        }
      } catch (err) {
        // Safe skip failure
      }
    }

    return largestFile;
  }

  public findFallbackByExtensions(extensions: string[]): { name: string; file: JSZip.JSZipObject } | null {
    const files = this.zip.files;
    const sortedKeys = Object.keys(files).sort();

    for (const filePath of sortedKeys) {
      if (files[filePath].dir) continue;
      if (extensions.some(ext => filePath.toLowerCase().endsWith(ext))) {
        return { name: filePath, file: files[filePath] };
      }
    }
    return null;
  }
}
