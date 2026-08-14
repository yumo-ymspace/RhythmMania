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

export class FullscreenManager {
  public static async enterFocusMode(element: HTMLElement): Promise<boolean> {
    try {
      const elem = element as FullscreenElement;
      const requestMethod = elem.requestFullscreen || elem.webkitRequestFullscreen || elem.mozRequestFullScreen || elem.msRequestFullscreen;
      if (!requestMethod) return false;
      await requestMethod.call(elem);

      const orientation = window.screen.orientation as ScreenOrientation & {
        lock?: (type: string) => Promise<void>;
        unlock?: () => void;
      };
      if (orientation.lock) {
        await orientation.lock('portrait').catch(() => {});
      }
      return true;
    } catch {
      // Silent fail on focus failures
      return false;
    }
  }

  public static async exitFocusMode(): Promise<void> {
    try {
      const doc = document as FullscreenDocument;
      const exitMethod = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
      if (exitMethod) {
        await exitMethod.call(doc);
      }

      const orientation = window.screen.orientation as ScreenOrientation & { unlock?: () => void };
      if (orientation.unlock) {
        orientation.unlock();
      }
    } catch {
      // Silent fail
    }
  }

  public static isFullscreenActive(): boolean {
    if (typeof document === 'undefined') return false;
    const doc = document as FullscreenDocument;
    return !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
  }
}

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
  mozRequestFullScreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
}

interface FullscreenDocument extends Document {
  webkitExitFullscreen?: () => Promise<void> | void;
  mozCancelFullScreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
}
