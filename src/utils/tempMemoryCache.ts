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

export class TempMemoryCache {
  private static cache: Map<string, ArrayBuffer> = new Map();

  /**
   * Temporarily holds a downloaded ZIP buffer in memory
   */
  public static set(packageId: string, buffer: ArrayBuffer): void {
    if (!packageId || !Number.isSafeInteger(buffer.byteLength)) return;
    // Clone the buffer to prevent structured-cloning detachment bugs
    this.cache.set(packageId, buffer.slice(0));
  }

  public static get(packageId: string): ArrayBuffer | null {
    const buffer = this.cache.get(packageId);
    return buffer ? buffer.slice(0) : null;
  }

  public static remove(packageId: string): void {
    this.cache.delete(packageId);
  }

  public static clear(): void {
    this.cache.clear();
  }
}
