/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 */

import { Container, Graphics, Texture, Matrix } from 'pixi.js';
import { PlayfieldFrame } from '../../types';

let backingGradientTexture: Texture | null = null;

function getBackingGradientTexture(): Texture {
  if (!backingGradientTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createLinearGradient(0, 0, 0, 128); // top to bottom
    grad.addColorStop(0, 'rgba(8, 8, 12, 0.12)');
    grad.addColorStop(1, 'rgba(5, 5, 8, 0.35)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1, 128);

    backingGradientTexture = Texture.from(canvas);
  }
  return backingGradientTexture;
}

export class MobileZoneLayer extends Container {
  private zoneG: Graphics;
  private lastWidth = 0;
  private lastHeight = 0;
  private lastKeyCount = 0;
  private lastIsMobile: boolean | null = null;
  private lastIsFocusMode: boolean | null = null;

  constructor() {
    super();
    this.zoneG = new Graphics();
    this.addChild(this.zoneG);
  }

  update(frame: PlayfieldFrame): void {
    const { width, height, columns, isMobile, isFocusMode } = frame;
    const keyCount = columns.length;

    if (
      width === this.lastWidth &&
      height === this.lastHeight &&
      keyCount === this.lastKeyCount &&
      isMobile === this.lastIsMobile &&
      isFocusMode === this.lastIsFocusMode
    ) {
      return;
    }

    this.lastWidth = width;
    this.lastHeight = height;
    this.lastKeyCount = keyCount;
    this.lastIsMobile = isMobile;
    this.lastIsFocusMode = isFocusMode;

    this.zoneG.clear();

    if (!isMobile || isFocusMode) {
      return;
    }

    const hitZoneTop = height * 0.60;
    const zoneHeight = height - hitZoneTop;

    // Backing box with vertical gradient
    const gradTexture = getBackingGradientTexture();
    const matrix = new Matrix();
    matrix.scale(1, zoneHeight / 128);
    matrix.translate(0, hitZoneTop);

    this.zoneG.rect(0, hitZoneTop, width, zoneHeight).fill({ texture: gradTexture, matrix });

    // Threshold neon line
    this.zoneG.moveTo(0, hitZoneTop)
               .lineTo(width, hitZoneTop)
               .stroke({ color: 0x06b6d4, width: 1.5, alpha: 0.35 });

    // Zone lane lines
    for (let i = 1; i < columns.length; i++) {
      const col = columns[i];
      if (col) {
        this.zoneG.moveTo(col.x, hitZoneTop)
                   .lineTo(col.x, height)
                   .stroke({ color: 0x475569, width: 1, alpha: 0.1 });
      }
    }
  }
}
