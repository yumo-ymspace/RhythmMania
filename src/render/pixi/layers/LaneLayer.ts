/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 */

import { Container, Graphics, Sprite } from 'pixi.js';
import { PlayfieldFrame } from '../../types';
import { BakedSkinTextures } from '../skin/TextureAtlasBuilder';

export class LaneLayer extends Container {
  private gridG: Graphics;
  private glowSprites: Sprite[] = [];
  private lastWidth = 0;
  private lastHeight = 0;
  private lastKeyCount = 0;
  private lastSeparatorOpacity = -1;

  constructor() {
    super();
    this.gridG = new Graphics();
    this.addChild(this.gridG);
  }

  update(frame: PlayfieldFrame, textures: BakedSkinTextures): void {
    const { width, height, columns, settingsSlice } = frame;
    const keyCount = columns.length;
    const separatorOpacity = settingsSlice.laneSeparatorOpacity ?? 0.30;

    // Redraw static lines only when dimensions or keyCount or opacity changes
    if (
      width !== this.lastWidth ||
      height !== this.lastHeight ||
      keyCount !== this.lastKeyCount ||
      separatorOpacity !== this.lastSeparatorOpacity
    ) {
      this.lastWidth = width;
      this.lastHeight = height;
      this.lastKeyCount = keyCount;
      this.lastSeparatorOpacity = separatorOpacity;

      this.gridG.clear();
      for (let i = 0; i < keyCount; i++) {
        const col = columns[i];
        if (col) {
          this.gridG.moveTo(col.x, 0)
                     .lineTo(col.x, height)
                     .stroke({ color: 0x475569, width: 1, alpha: separatorOpacity });
        }
      }

      // Outer border outline
      this.gridG.rect(0, 0, width, height)
                 .stroke({ color: 0x475569, width: 1.5, alpha: separatorOpacity * 1.5 });
    }

    // 2. Manage glow sprites
    while (this.glowSprites.length < keyCount) {
      const sp = new Sprite();
      this.addChild(sp);
      this.glowSprites.push(sp);
    }
    while (this.glowSprites.length > keyCount) {
      const sp = this.glowSprites.pop()!;
      this.removeChild(sp);
      sp.destroy();
    }

    // Update textures and positions
    for (let i = 0; i < keyCount; i++) {
      const col = columns[i];
      const sp = this.glowSprites[i];
      const glowTex = textures.laneGlows[i];

      if (col && sp && glowTex) {
        sp.texture = glowTex;
        sp.x = col.x;
        
        if (settingsSlice.upsurfaceNoteMode) {
          sp.y = frame.receptorY;
          sp.height = frame.receptorY;
          sp.scale.y = -Math.abs(sp.scale.y);
        } else {
          sp.y = frame.receptorY;
          sp.height = height - frame.receptorY;
          sp.scale.y = Math.abs(sp.scale.y);
        }
        sp.width = col.width;
        sp.alpha = col.glow;
        sp.visible = col.glow > 0;
      }
    }
  }
}
