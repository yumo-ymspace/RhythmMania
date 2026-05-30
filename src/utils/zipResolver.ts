/**
 * @license
 * SPDX-License-Identifier: GPL-3.0-only
 */

import JSZip from 'jszip';

export class RobustZipResolver {
  private zip: JSZip;

  constructor(zip: JSZip) {
    this.zip = zip;
  }

  /**
   * Cleans file paths and executes a case-insensitive hierarchical search.
   * Phase 1: Try exact normalized path match
   * Phase 2: Match relative subfolder structural depth (e.g. endsWith('/' + target))
   * Phase 3: Suffix/Filename only fallback (last resort, alert of potential collisions)
   */
  public findFile(targetPath: string): JSZip.JSZipObject | null {
    if (!targetPath) return null;

    // Clean backslashes, quotes, and whitespace
    const normalizedTarget = targetPath.replace(/\\/g, '/').replace(/['"]/g, '').trim().toLowerCase();
    const files = this.zip.files;

    // Phase 1: Try exact normalized path match
    if (files[normalizedTarget] && !files[normalizedTarget].dir) {
      return files[normalizedTarget];
    }

    for (const filePath of Object.keys(files)) {
      const normalizedFile = filePath.replace(/\\/g, '/').toLowerCase();
      if (normalizedFile === normalizedTarget && !files[filePath].dir) {
        return files[filePath];
      }
    }

    // Phase 2: Match relative subfolder structural depth
    for (const filePath of Object.keys(files)) {
      const normalizedFile = filePath.replace(/\\/g, '/').toLowerCase();
      if (normalizedFile.endsWith('/' + normalizedTarget) && !files[filePath].dir) {
        return files[filePath];
      }
    }

    // Phase 3: Suffix/Filename only fallback (last resort, warn of potential collisions)
    const targetBaseName = normalizedTarget.split('/').pop() || '';
    for (const filePath of Object.keys(files)) {
      if (files[filePath].dir) continue;
      const fileName = filePath.split('/').pop() || '';
      if (fileName.toLowerCase() === targetBaseName) {
        console.warn(`Asset collision risk fallback selected: ${filePath} matched ${targetPath}`);
        return files[filePath];
      }
    }

    return null;
  }

  /**
   * Finds the largest file ending with standard extensions.
   * Exceedingly robust fallback for locating long-form media track objects (audio or video).
   * Refactored to asynchronously query size via JSZip public APIs, avoiding private property access deprecation issues.
   */
  public async findLargestFileByExtensions(extensions: string[]): Promise<JSZip.JSZipObject | null> {
    const files = this.zip.files;
    const candidates: { file: JSZip.JSZipObject; filepath: string }[] = [];

    for (const filePath of Object.keys(files)) {
      const file = files[filePath];
      if (file.dir) continue;

      const lowerPath = filePath.toLowerCase();
      const hasValidExtension = extensions.some(ext => lowerPath.endsWith(ext));
      if (hasValidExtension) {
        candidates.push({ file, filepath: filePath });
      }
    }

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0].file;

    // Use JSZip public async API to determine decompressed size for accuracy
    let largestFile: JSZip.JSZipObject | null = null;
    let maxBytes = 0;

    for (const cand of candidates) {
      try {
        const arr = await cand.file.async('uint8array');
        const fileSize = arr.length;
        if (fileSize > maxBytes) {
          maxBytes = fileSize;
          largestFile = cand.file;
        }
      } catch (err) {
        console.warn(`Failed securely resolving bytes of ${cand.filepath}:`, err);
      }
    }

    if (largestFile) {
      console.log(`[Heuristic Match] Identified largest asset of extensions [${extensions.join(', ')}]: ${largestFile.name} (${(maxBytes / 1024 / 1024).toFixed(2)} MB)`);
    }
    return largestFile;
  }

  /**
   * Scan zip content keys searching for any file with matching candidate extensions.
   * Provides auto-fallbacks when the metadata specified file names are incorrect/missing.
   */
  public findFallbackByExtensions(extensions: string[]): { name: string; file: JSZip.JSZipObject } | null {
    const files = this.zip.files;
    
    // Sort keys alphabetically so first matching element is selected deterministically
    const keys = Object.keys(files).sort();

    for (const filePath of keys) {
      if (files[filePath].dir) continue;
      const lowerPath = filePath.toLowerCase();
      
      if (extensions.some(ext => lowerPath.endsWith(ext))) {
        return { name: filePath, file: files[filePath] };
      }
    }
    return null;
  }
}
