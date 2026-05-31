/**
 * @license
 * SPDX-License-Identifier: GPL-3.0-only
 */

export class GameplayMediaRegistry {
  private static videoElement: HTMLVideoElement | null = null;

  public static setVideo(el: HTMLVideoElement | null) {
    this.videoElement = el;
  }

  public static getVideo(): HTMLVideoElement | null {
    return this.videoElement;
  }
}
