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

import { Container, Sprite } from 'pixi.js';
import { PlayfieldFrame } from '../../types';
import { SpritePool } from '../pool/SpritePool';
import { BakedSkinTextures } from '../skin/TextureAtlasBuilder';
import { isCircleSkinMode } from '../../skinTheme';

export class NoteLayer extends Container {
  private activeSprites = new Map<string, Sprite>();
  private pool: SpritePool;

  constructor(pool: SpritePool) {
    super();
    this.pool = pool;
  }

  update(frame: PlayfieldFrame, textures: BakedSkinTextures): void {
    const { notes, columns, settingsSlice } = frame;
    const currentKeys = new Set<string>();
    const noteScale = isCircleSkinMode(settingsSlice) ? 1 : (settingsSlice.noteSizeMultiplier ?? 1);

    // Draw active visible notes (heads + holds)
    notes.forEach((n) => {
      // Draw Head (hide after head miss; body/tail remain for salvage)
      const shouldDrawHead = (n.type === 'normal') || (n.type === 'hold' && !n.isHit && !n.isMissed);
      if (shouldDrawHead) {
        if (!(n.type === 'hold' && settingsSlice.squareRenderStyle === 'rhythmplus' && settingsSlice.playfieldStyle !== 'circle')) {
          const colLayout = columns[n.column];
          if (colLayout) {
            const headTex = textures.noteHeads[n.column];
            if (headTex) {
              const key = `${n.id}_head`;
              currentKeys.add(key);

              let sp = this.activeSprites.get(key);
              if (!sp) {
                sp = this.pool.acquire(headTex);
                this.addChild(sp);
                this.activeSprites.set(key, sp);
              } else {
                sp.texture = headTex;
              }

              sp.x = colLayout.x + colLayout.width / 2;
               sp.y = n.y;
               sp.scale.set(noteScale);
              let alpha = n.opacity;
              sp.anchor.set(0.5);

              if (n.type === 'hold' && n.isHoldFailed) {
                alpha *= 0.35;
              }
              sp.alpha = alpha;
            }
          }
        }
      }

      // Draw Hold End Receptor
      if (n.type === 'hold' && n.endY !== undefined && !n.isReleased) {
        const colLayout = columns[n.column];
        if (colLayout) {
          const endTex = textures.holdEnds[n.column];
          if (endTex) {
            const key = `${n.id}_end`;
            currentKeys.add(key);

            let sp = this.activeSprites.get(key);
            if (!sp) {
              sp = this.pool.acquire(endTex);
              this.addChild(sp);
              this.activeSprites.set(key, sp);
            } else {
              sp.texture = endTex;
            }

            sp.x = colLayout.x + colLayout.width / 2;
            sp.y = n.endY;
            sp.scale.set(noteScale);
            let alpha = n.endOpacity ?? n.opacity;
            sp.anchor.set(0.5);

            if (n.isHoldFailed) {
              alpha *= 0.35;
            }
            sp.alpha = alpha;
          }
        }
      }
    });

    // Remove any sprites that are no longer visible
    for (const [key, sp] of this.activeSprites.entries()) {
      if (!currentKeys.has(key)) {
        this.removeChild(sp);
        this.pool.release(sp);
        this.activeSprites.delete(key);
      }
    }
  }

  destroyLayer(): void {
    for (const [key, sp] of this.activeSprites.entries()) {
      this.removeChild(sp);
      this.pool.release(sp);
    }
    this.activeSprites.clear();
  }
}
