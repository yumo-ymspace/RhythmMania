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

import { Container, Graphics, Texture, Sprite } from 'pixi.js';
import { PlayfieldFrame } from '../../types';
import { getLaneColors, isCircleSkinMode } from '../../skinTheme';
import { getNoteVisualY } from '../../playfieldLayout';
import { hexToRgba } from '../../../components/GameplayCanvas';
import { SpritePool } from '../pool/SpritePool';

function applyFade(colorStr: string, stopOpacity: number) {
  if (colorStr.startsWith('#')) {
    return hexToRgba(colorStr, stopOpacity);
  }
  if (colorStr.startsWith('rgba(')) {
    const parts = colorStr.substring(5, colorStr.length - 1).split(',');
    if (parts.length === 4) {
      const existingAlpha = parseFloat(parts[3]);
      parts[3] = (existingAlpha * stopOpacity).toFixed(3);
      return `rgba(${parts.join(',')})`;
    }
  }
  if (colorStr.startsWith('rgb(')) {
    const parts = colorStr.substring(4, colorStr.length - 1).split(',');
    return `rgba(${parts.join(',')},${stopOpacity})`;
  }
  return colorStr;
}

const holdGradientCache = new Map<string, Texture>();

function getHoldBodyTexture(color1: string, color2: string, width: number, radius: number, isRect: boolean): Texture {
  const key = `${color1}_${color2}_${width}_${radius}_${isRect}`;
  let tex = holdGradientCache.get(key);
  if (!tex) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(width));
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createLinearGradient(0, 128, 0, 0); // bottom to top
    grad.addColorStop(0, color1);
    grad.addColorStop(1, color2);

    ctx.fillStyle = grad;
    ctx.beginPath();
    if (isRect) {
      ctx.rect(0, 0, canvas.width, 128);
    } else {
      ctx.roundRect(0, 0, canvas.width, 128, radius);
    }
    ctx.fill();

    tex = Texture.from(canvas);
    holdGradientCache.set(key, tex);
  }
  return tex;
}

export class HoldLayer extends Container {
  private bodyContainer: Container;
  private holdG: Graphics;
  private pool: SpritePool;
  private activeSprites = new Map<string, Sprite>();

  constructor() {
    super();
    this.bodyContainer = new Container();
    this.addChild(this.bodyContainer);

    this.holdG = new Graphics();
    this.addChild(this.holdG);

    this.pool = new SpritePool();
  }

  update(frame: PlayfieldFrame): void {
    const { notes, columns, settingsSlice, isFocusMode } = frame;
    const receptorY = frame.receptorY;
    const isCircleMode = isCircleSkinMode(settingsSlice);

    this.holdG.clear();
    const currentKeys = new Set<string>();

    notes.forEach((n) => {
      if (n.type === 'hold' && n.endY !== undefined) {
        const xPos = columns[n.column].x;
        const colW = columns[n.column].width;

// Anchor the body start to the receptor only while the LN is actively engaged
        // (head hit & held). A missed head must not ground the body — the LN keeps its
        // fixed length and scrolls off naturally; the release stays salvageable.
        let visualStartY = getNoteVisualY(n.y, colW, settingsSlice);
        if (n.isHit && !n.isMissed && !n.isReleased && !n.isHoldFailed) {
          visualStartY = receptorY;
        }

        const visualEndY = getNoteVisualY(n.endY, colW, settingsSlice);

        const isOff = settingsSlice.upsurfaceNoteMode
          ? (visualEndY < receptorY && visualStartY < receptorY && n.isReleased)
          : (visualEndY > receptorY && visualStartY > receptorY && n.isReleased);

        if (!isOff) {
          const clipHeight = visualStartY - visualEndY;
          const fadeStart = n.opacity;
          const fadeEnd = n.endOpacity ?? n.opacity;

          // Stable color gradient by rounding the fade parameters to 1 decimal place to prevent excessive canvas allocations
          const fadeStartRounded = Math.round(fadeStart * 10) / 10;
          const fadeEndRounded = Math.round(fadeEnd * 10) / 10;

          let color1 = '';
          let color2 = '';

          if (settingsSlice.squareRenderStyle === 'rhythmplus' && !isCircleMode) {
            const rpColor = getLaneColors(settingsSlice, columns.length)?.[n.column] || columns[n.column].color;
            if (n.isHit && !n.isReleased) {
              if (n.releaseGraceUntil) {
                const flicker = (Math.floor(frame.timeMs / 40) % 2 === 0);
                const col = flicker ? rpColor : hexToRgba(rpColor, 0.5);
                color1 = applyFade(col, fadeStartRounded);
                color2 = applyFade(col, fadeEndRounded);
              } else {
                color1 = applyFade(rpColor, fadeStartRounded);
                color2 = applyFade(rpColor, fadeEndRounded);
              }
            } else if (n.isHoldFailed) {
              color1 = applyFade('rgba(100,116,139,0.5)', fadeStartRounded);
              color2 = applyFade('rgba(100,116,139,0.5)', fadeEndRounded);
            } else {
              color1 = applyFade(rpColor, fadeStartRounded);
              color2 = applyFade(rpColor, fadeEndRounded);
            }
          } else if (settingsSlice.playfieldStyle !== 'circle') {
            const rmColor = getLaneColors(settingsSlice, columns.length)?.[n.column] || columns[n.column].color;
            if (n.isHit && !n.isReleased) {
              if (n.releaseGraceUntil) {
                const flicker = (Math.floor(frame.timeMs / 40) % 2 === 0);
                color1 = applyFade(flicker ? hexToRgba(rmColor, 0.8) : hexToRgba(rmColor, 0.2), fadeStartRounded);
                color2 = applyFade(hexToRgba(rmColor, 0.3), fadeEndRounded);
              } else {
                color1 = applyFade(hexToRgba(rmColor, 0.8), fadeStartRounded);
                color2 = applyFade(hexToRgba(rmColor, 0.3), fadeEndRounded);
              }
            } else if (n.isHoldFailed) {
              color1 = applyFade('rgba(100,116,139,0.3)', fadeStartRounded);
              color2 = applyFade('rgba(71,85,105,0.1)', fadeEndRounded);
            } else {
              color1 = applyFade(hexToRgba(rmColor, 0.6), fadeStartRounded);
              color2 = applyFade(hexToRgba(rmColor, 0.2), fadeEndRounded);
            }
          } else {
            const noteColor = getLaneColors(settingsSlice, columns.length)?.[n.column] || columns[n.column].color;
            if (n.isHit && !n.isReleased) {
              if (n.releaseGraceUntil) {
                const flicker = (Math.floor(frame.timeMs / 40) % 2 === 0);
                color1 = applyFade(flicker ? hexToRgba(noteColor, 0.75) : hexToRgba(noteColor, 0.2), fadeStartRounded);
                color2 = applyFade(hexToRgba(noteColor, 0.3), fadeEndRounded);
              } else {
                color1 = applyFade(hexToRgba(noteColor, 0.8), fadeStartRounded);
                color2 = applyFade(hexToRgba(noteColor, 0.3), fadeEndRounded);
              }
            } else if (n.isHoldFailed) {
              color1 = applyFade('rgba(100,116,139,0.3)', fadeStartRounded);
              color2 = applyFade('rgba(71,85,105,0.1)', fadeEndRounded);
            } else {
                color1 = applyFade(hexToRgba(noteColor, 0.6), fadeStartRounded);
                color2 = applyFade(hexToRgba(noteColor, 0.2), fadeEndRounded);
            }
          }

          const padding = isFocusMode ? 3 : 12;
          const notePadding = isFocusMode ? 1.5 : 6;
          const useNotePadding = settingsSlice.squareRenderStyle === 'rhythmplus' && !isCircleMode;

           const noteScale = settingsSlice.noteSizeMultiplier ?? 1;
           const basePadding = useNotePadding ? notePadding : padding;
           const rw = (colW - basePadding * 2) * noteScale;
           const rx = xPos + (colW - rw) / 2;

          let drawY = Math.min(visualStartY, visualEndY);
          let drawH = Math.abs(clipHeight);

          if (useNotePadding) {
            drawY -= 4;
            drawH += 8;
          }

          const isRect = (settingsSlice.squareRenderStyle === 'rhythmplus' && !isCircleMode) ||
                         (settingsSlice.skinId === 'classic-bar' || settingsSlice.skinId === 'minimalist');
          // Match Canvas 2D's circular hold body: a capsule, not a fully-round blob.
          const radius = isCircleMode ? Math.min(rw / 2, 12) : 6;

          const gradTexture = getHoldBodyTexture(color1, color2, rw, radius, isRect);

          const key = n.id;
          currentKeys.add(key);

          let sp = this.activeSprites.get(key);
          if (!sp) {
            sp = this.pool.acquire(gradTexture);
            this.bodyContainer.addChild(sp);
            this.activeSprites.set(key, sp);
          } else {
            sp.texture = gradTexture;
          }

          sp.x = rx;
          sp.y = drawY;
          sp.width = rw;
          sp.height = drawH;

          if (!(settingsSlice.squareRenderStyle === 'rhythmplus' && !isCircleMode)) {
            const lineAlpha = n.isHit && !n.isReleased
              ? (n.releaseGraceUntil ? 0.6 : 0.8)
              : 0.4;
            const lineColor = getLaneColors(settingsSlice, columns.length)?.[n.column] || columns[n.column].color;
            this.holdG.moveTo(xPos + colW / 2, visualStartY)
                 .lineTo(xPos + colW / 2, visualEndY)
                 .stroke({ color: lineColor, width: 2, alpha: lineAlpha * (fadeStart + fadeEnd) / 2 });
          }
        }
      }
    });

    // Clean up inactive sprites
    for (const [key, sp] of this.activeSprites.entries()) {
      if (!currentKeys.has(key)) {
        this.bodyContainer.removeChild(sp);
        this.pool.release(sp);
        this.activeSprites.delete(key);
      }
    }
  }

  destroy(options?: any): void {
    for (const sp of this.activeSprites.values()) {
      if (sp.parent) {
        sp.parent.removeChild(sp);
      }
      this.pool.release(sp);
    }
    this.activeSprites.clear();
    this.pool.clear();
    super.destroy(options);
  }
}
