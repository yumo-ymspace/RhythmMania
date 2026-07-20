/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 */

import { Container, Graphics } from 'pixi.js';
import { PlayfieldFrame } from '../../types';

export class BackgroundLayer extends Container {
  private bg: Graphics;
  private lastWidth = 0;
  private lastHeight = 0;
  private lastShieldDim = -1;

  constructor() {
    super();
    this.bg = new Graphics();
    this.addChild(this.bg);
  }

  update(frame: PlayfieldFrame): void {
    const { width, height, settingsSlice } = frame;
    const shieldDim = settingsSlice.backgroundDim !== undefined ? settingsSlice.backgroundDim : 0.60;

    if (width === this.lastWidth && height === this.lastHeight && shieldDim === this.lastShieldDim) {
      return;
    }

    this.lastWidth = width;
    this.lastHeight = height;
    this.lastShieldDim = shieldDim;

    this.bg.clear();
    this.bg.rect(0, 0, width, height).fill({ color: 0x000000, alpha: shieldDim });
  }
}
