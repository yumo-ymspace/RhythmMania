/**
 * @license
 * SPDX-License-Identifier: GPL-3.0-only
 */

export class FullscreenManager {
  public static async enterFocusMode(element: HTMLElement): Promise<void> {
    try {
      if (element.requestFullscreen) {
        await element.requestFullscreen();
      } else if ((element as any).webkitRequestFullscreen) { // Safari support
        await (element as any).webkitRequestFullscreen();
      } else if ((element as any).mozRequestFullScreen) { // Firefox support
        await (element as any).mozRequestFullScreen();
      } else if ((element as any).msRequestFullscreen) { // IE11 support
        await (element as any).msRequestFullscreen();
      }

      // Try locked portrait orientation on mobile if supported
      if (typeof window !== 'undefined' && window.screen && (window.screen as any).orientation && (window.screen as any).orientation.lock) {
        await (window.screen as any).orientation.lock('portrait').catch((err: any) => {
          console.warn('Orientation lock rejected or unsupported on this device:', err);
        });
      }
    } catch (err) {
      console.warn("Native fullscreen request rejected by browser:", err);
    }
  }

  public static async exitFocusMode(): Promise<void> {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        await (document as any).mozCancelFullScreen();
      } else if ((document as any).msExitFullscreen) {
        await (document as any).msExitFullscreen();
      }

      // Unlock orientation if supported
      if (typeof window !== 'undefined' && window.screen && (window.screen as any).orientation && (window.screen as any).orientation.unlock) {
        (window.screen as any).orientation.unlock();
      }
    } catch (err) {
      console.warn("Failed to exit native fullscreen:", err);
    }
  }

  public static isFullscreenActive(): boolean {
    if (typeof document === 'undefined') return false;
    return !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    );
  }
}
