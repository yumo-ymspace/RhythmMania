/**
 * @license
 * SPDX-License-Identifier: GPL-3.0-only
 */

/**
 * Tracks and revokes Blob URLs to avoid main-thread memory leaks
 * in high-performance rhythm browser apps.
 */
export class AssetLifecycleManager {
  private static activeBlobUrls: Set<string> = new Set();

  /**
   * Encapsulates URL creation and lifecycle scope tracking
   */
  public static registerBlob(blob: Blob): string {
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
        console.warn('Failed to revoke targeted asset Blob URL:', e);
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
