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

const VERTICAL_TOUCH_ZONE_THRESHOLD = 0.60;

export class TouchInputAdapter {
  // Active touches: maps raw touch identifiers to lane columns (indices)
  private activeTouches: Map<number, number> = new Map();
  private onKeyDown: (lane: number) => void;
  private onKeyUp: (lane: number) => void;

  constructor(onKeyDown: (lane: number) => void, onKeyUp: (lane: number) => void) {
    this.onKeyDown = onKeyDown;
    this.onKeyUp = onKeyUp;
  }

  /**
   * Translates the relative physical touch coordinates to the correct weighted lane column
   */
  public getLaneIndex(relativeX: number, containerWidth: number, keyCount: number): number {
    let totalWeight = 0;
    for (let i = 0; i < keyCount; i++) {
      let weight = 1.0;
      if (keyCount === 5 && i === 2) weight = 1.35;
      else if (keyCount === 7 && i === 3) weight = 1.35;
      else if (keyCount === 8 && i === 0) weight = 1.4;
      totalWeight += weight;
    }
    const baseWidth = containerWidth / totalWeight;

    let accumulatedX = 0;
    for (let i = 0; i < keyCount; i++) {
      let colWidth = baseWidth;
      if (keyCount === 5 && i === 2) colWidth = baseWidth * 1.35;
      else if (keyCount === 7 && i === 3) colWidth = baseWidth * 1.35;
      else if (keyCount === 8 && i === 0) colWidth = baseWidth * 1.4;

      if (relativeX >= accumulatedX && relativeX <= accumulatedX + colWidth) {
        return i;
      }
      accumulatedX += colWidth;
    }
    return -1;
  }

  /**
   * Tracks start of touchscreen gestures, routing hits directly to virtual key states
   */
  public handleTouchStart(e: TouchEvent, containerRect: DOMRect, keyCount: number) {
    // Avoid double triggering browser zoom or simulated mouse clicks
    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const relativeY = touch.clientY - containerRect.top;
      const verticalRatio = relativeY / containerRect.height;

      // PIANO TILES CONSTRAINT: Only register taps in the bottom 40% of the playfield
      if (verticalRatio < VERTICAL_TOUCH_ZONE_THRESHOLD) {
        console.log(`Tap ignored: Outside of active bottom receptor zone (verticalRatio ${verticalRatio.toFixed(2)} < ${VERTICAL_TOUCH_ZONE_THRESHOLD}).`);
        continue;
      }

      const relativeX = touch.clientX - containerRect.left;
      const lane = this.getLaneIndex(relativeX, containerRect.width, keyCount);

      if (lane >= 0 && lane < keyCount) {
        const laneHasTouch = Array.from(this.activeTouches.values()).includes(lane);
        this.activeTouches.set(touch.identifier, lane);
        if (!laneHasTouch) {
          this.onKeyDown(lane);
        }
      }
    }
  }

  /**
   * Tracks slide motions (sweeps) across vertical lanes for games like Piano Tiles / Tap Tap Reborn
   */
  public handleTouchMove(e: TouchEvent, containerRect: DOMRect, keyCount: number) {
    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const previousLane = this.activeTouches.get(touch.identifier);

      if (previousLane !== undefined) {
        const relativeY = touch.clientY - containerRect.top;
        const verticalRatio = relativeY / containerRect.height;

        // PIANO TILES CONSTRAINT: If they slide out of the active bottom 40% zone, release keypress
        if (verticalRatio < VERTICAL_TOUCH_ZONE_THRESHOLD) {
          this.activeTouches.delete(touch.identifier);
          const laneStillHasTouch = Array.from(this.activeTouches.values()).includes(previousLane);
          if (!laneStillHasTouch) {
            this.onKeyUp(previousLane);
          }
          continue;
        }

        const relativeX = touch.clientX - containerRect.left;
        const currentLane = this.getLaneIndex(relativeX, containerRect.width, keyCount);

        if (currentLane >= 0 && currentLane < keyCount && currentLane !== previousLane) {
          // Release previous lane, slide into current lane dynamically
          this.activeTouches.delete(touch.identifier);
          const previousStillHasTouch = Array.from(this.activeTouches.values()).includes(previousLane);
          if (!previousStillHasTouch) {
            this.onKeyUp(previousLane);
          }

          const currentHasTouch = Array.from(this.activeTouches.values()).includes(currentLane);
          this.activeTouches.set(touch.identifier, currentLane);
          if (!currentHasTouch) {
            this.onKeyDown(currentLane);
          }
        }
      }
    }
  }

  /**
   * Releases pressed state of virtual keys when a tap lifts up
   */
  public handleTouchEnd(e: TouchEvent) {
    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const lane = this.activeTouches.get(touch.identifier);

      if (lane !== undefined) {
        this.activeTouches.delete(touch.identifier);
        const laneStillHasTouch = Array.from(this.activeTouches.values()).includes(lane);
        if (!laneStillHasTouch) {
          this.onKeyUp(lane);
        }
      }
    }
  }

  /**
   * Ensures physical boundary slips cleanly release key bindings without holds sticking
   */
  public handleTouchCancel(e: TouchEvent) {
    // Treat cancellation as direct key lifts
    this.handleTouchEnd(e);
  }

  /**
   * Safe complete cleanup to release all active touch indicators
   */
  public reset() {
    const uniqueLanes = Array.from(new Set(this.activeTouches.values()));
    this.activeTouches.clear();
    uniqueLanes.forEach((lane) => {
      this.onKeyUp(lane);
    });
  }
}
