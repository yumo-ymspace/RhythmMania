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
import {
  addExtractedZipBytes,
  type ZipExtractionBudget,
  validateZipEntrySize,
} from './securityLimits';

type ZipObjectWithData = JSZip.JSZipObject & { _data?: { uncompressedSize?: number } };
type ZipEntryStream = {
  on(event: 'data', listener: (chunk: Uint8Array) => void): ZipEntryStream;
  on(event: 'error' | 'end', listener: (error?: unknown) => void): ZipEntryStream;
  pause(): ZipEntryStream;
  resume(): ZipEntryStream;
};
type ZipObjectWithStream = JSZip.JSZipObject & {
  internalStream?: (type: string) => ZipEntryStream;
};

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
    let maxBytes = -1;

    for (const cand of candidates) {
      const fileObj = cand.file as ZipObjectWithData;
      const size = fileObj._data?.uncompressedSize ?? 0;
      if (size > maxBytes) {
        maxBytes = size;
        largestFile = cand.file;
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

/**
 * Extract one entry while enforcing both JSZip's advertised size and the
 * actual bytes returned by decompression. The caller shares a budget across
 * all entries selected from the archive.
 */
export async function extractZipEntry(
  file: JSZip.JSZipObject,
  name: string,
  budget: ZipExtractionBudget,
): Promise<ArrayBuffer> {
  validateZipEntrySize(file, name);
  const internalStream = (file as ZipObjectWithStream).internalStream;
  if (!internalStream) {
    const data = await file.async('arraybuffer');
    addExtractedZipBytes(budget, data.byteLength, name);
    return data;
  }

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let failed = false;
    const stream = internalStream.call(file, 'uint8array');
    stream
      .on('data', (chunk) => {
        if (failed) return;
        try {
          addExtractedZipBytes(budget, chunk.byteLength, name);
          chunks.push(chunk);
        } catch (error) {
          failed = true;
          stream.pause();
          reject(error);
        }
      })
      .on('error', (error) => {
        if (!failed) {
          failed = true;
          reject(error instanceof Error ? error : new Error(`Failed to extract "${name}".`));
        }
      })
      .on('end', () => {
        if (failed) return;
        const totalBytes = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
        const result = new Uint8Array(totalBytes);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.byteLength;
        }
        resolve(result.buffer);
      })
      .resume();
  });
}
