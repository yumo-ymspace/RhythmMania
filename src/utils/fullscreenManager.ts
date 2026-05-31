/**
 * @license
 * SPDX-License-Identifier: GPL-3.0-only
 */

export class FullscreenManager {
  public static async enterFocusMode(element: HTMLElement): Promise<void> {
    try {
      const elem = element as any;
      const requestMethod = elem.requestFullscreen || elem.webkitRequestFullscreen || elem.mozRequestFullScreen || elem.msRequestFullscreen;
      if (requestMethod) {
        await requestMethod.call(elem);
      }

      if (window.screen && (window.screen as any).orientation?.lock) {
        await (window.screen as any).orientation.lock('portrait').catch(() => {});
      }
    } catch {
      // Slient fail on focus failures
    }
  }

  public static async exitFocusMode(): Promise<void> {
    try {
      const doc = document as any;
      const exitMethod = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
      if (exitMethod) {
        await exitMethod.call(doc);
      }

      if (window.screen && (window.screen as any).orientation?.unlock) {
        (window.screen as any).orientation.unlock();
      }
    } catch {
      // Silent fail
    }
  }

  public static isFullscreenActive(): boolean {
    if (typeof document === 'undefined') return false;
    const doc = document as any;
    return !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
  }
}
