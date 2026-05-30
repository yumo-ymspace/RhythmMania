/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
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
