/**
 * @license
 * SPDX-License-Identifier: GPL-3.0-only
 */

export class TempMemoryCache {
  private static cache: Map<string, ArrayBuffer> = new Map();

  /**
   * Temporarily holds a downloaded ZIP buffer in memory
   */
  public static set(packageId: string, buffer: ArrayBuffer) {
    // Clone the buffer to prevent structured-cloning detachment bugs
    this.cache.set(packageId, buffer.slice(0));
  }

  public static get(packageId: string): ArrayBuffer | null {
    const buffer = this.cache.get(packageId);
    return buffer ? buffer.slice(0) : null;
  }

  public static remove(packageId: string) {
    this.cache.delete(packageId);
  }
}
