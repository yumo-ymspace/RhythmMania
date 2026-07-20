/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 */

import { Container, Sprite, Text, TextStyle } from 'pixi.js';
import { PlayfieldFrame } from '../../types';
import { BakedSkinTextures } from '../skin/TextureAtlasBuilder';

export class ReceptorLayer extends Container {
  private receptorSprites: Sprite[] = [];
  private labelTexts: Text[] = [];

  constructor() {
    super();
  }

  update(frame: PlayfieldFrame, textures: BakedSkinTextures): void {
    const { columns, showKeyLabels, keyLabels, settingsSlice } = frame;
    const keyCount = columns.length;
    const receptorY = frame.receptorY;

    // Synchronize receptor sprites
    while (this.receptorSprites.length < keyCount) {
      const sp = new Sprite();
      sp.anchor.set(0.5);
      this.addChild(sp);
      this.receptorSprites.push(sp);
    }
    while (this.receptorSprites.length > keyCount) {
      const sp = this.receptorSprites.pop()!;
      this.removeChild(sp);
      sp.destroy();
    }

    // Synchronize label texts
    while (this.labelTexts.length < keyCount) {
      const txtStyle = new TextStyle({
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 22,
        fontWeight: '900',
        fill: 0xffffff,
        align: 'center',
      });
      const txt = new Text({ style: txtStyle });
      txt.anchor.set(0.5);
      this.addChild(txt);
      this.labelTexts.push(txt);
    }
    while (this.labelTexts.length > keyCount) {
      const txt = this.labelTexts.pop()!;
      this.removeChild(txt);
      txt.destroy();
    }

    // Update positions and states
    const receptorOpacity = settingsSlice.receptorOpacity ?? 1.0;

    for (let i = 0; i < keyCount; i++) {
      const col = columns[i];
      const sp = this.receptorSprites[i];
      const txt = this.labelTexts[i];

      if (col && sp) {
        const tex = col.pressed
          ? textures.receptorsPressed[i]
          : textures.receptorsNormal[i];

        sp.texture = tex;
        sp.x = col.x + col.width / 2;
        sp.y = receptorY;
        sp.alpha = receptorOpacity;
        sp.visible = true;
      }

      if (col && txt) {
        if (showKeyLabels && keyLabels[i]) {
          txt.text = keyLabels[i].toUpperCase();
          txt.x = col.x + col.width / 2;
          txt.y = settingsSlice.upsurfaceNoteMode ? receptorY + 50 : receptorY - 50;
          txt.alpha = col.pressed ? 0.7 : 0.25;
          txt.visible = true;
        } else {
          txt.visible = false;
        }
      }
    }
  }
}
