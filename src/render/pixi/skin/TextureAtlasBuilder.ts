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

import { Texture } from 'pixi.js';
import { PlayfieldVisualSettings, ColumnLayout } from '../../types';
import { isCircleSkinMode, getLaneColors } from '../../skinTheme';
import { hexToRgba } from '../../../components/GameplayCanvas';

export interface BakedSkinTextures {
  noteHeads: Texture[];
  holdEnds: Texture[];
  receptorsPressed: Texture[];
  receptorsNormal: Texture[];
  laneGlows: Texture[];
}

export class TextureAtlasBuilder {
  static buildTextures(
    columns: ColumnLayout[],
    settings: PlayfieldVisualSettings,
    isFocusMode: boolean
  ): BakedSkinTextures {
    const noteHeads: Texture[] = [];
    const holdEnds: Texture[] = [];
    const receptorsPressed: Texture[] = [];
    const receptorsNormal: Texture[] = [];
    const laneGlows: Texture[] = [];

    const isCircle = isCircleSkinMode(settings);
    const lanePalette = getLaneColors(settings, columns.length);
    const laneColor = (column: number) => lanePalette?.[column] || columns[column].color;

    columns.forEach((col, colIdx) => {
      const noteColor = laneColor(colIdx);
      const receptorColor = noteColor;
      const colW = col.width;
      const notePadding = isCircle ? 3 : (isFocusMode ? 1.5 : 6);
      const rw = colW - notePadding * 2;
      const rh = 20;

      // 1. BAKE NOTE HEAD
      const noteHeadCanvas = document.createElement('canvas');
      let noteHeadW = colW;
      let noteHeadH = 20;
      if (isCircle) {
        noteHeadW = colW;
        noteHeadH = colW;
      }
      noteHeadCanvas.width = noteHeadW;
      noteHeadCanvas.height = noteHeadH;
      const ctx = noteHeadCanvas.getContext('2d')!;

      const rx = notePadding;
      const ry = 0;

      let noteFill = '';
      let noteStroke = col.color;

      if (isCircle) {
        noteFill = noteColor;
        noteStroke = noteColor;
      } else if (settings.squareRenderStyle === 'rhythmplus') {
        noteFill = noteColor;
        noteStroke = noteColor;
      } else {
        noteFill = noteColor;
        noteStroke = noteColor;
      }

      if (isCircle) {
        const cx = colW / 2;
        const cy = colW / 2;
        const r = (colW * (settings.noteSizeMultiplier ?? 1.0)) / 3.0;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = noteColor;
        ctx.shadowColor = noteColor;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        const drawNoteShape = (radiusDefault: number) => {
          ctx.beginPath();
          if (settings.squareRenderStyle === 'rhythmplus') {
            ctx.rect(rx, ry + rh / 2 - 4, rw, 8);
          } else {
            ctx.roundRect(rx, ry, rw, rh, radiusDefault);
          }
        };

        const grad = ctx.createLinearGradient(rx, ry, rx, ry + rh);

        if (settings.skinId === 'minimalist') {
          ctx.fillStyle = noteFill;
          ctx.strokeStyle = noteStroke;
          ctx.lineWidth = 2;

          drawNoteShape(3);
          ctx.fill();
          ctx.stroke();
        } else if (settings.skinId === 'classic-bar') {
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.35, noteFill);
          grad.addColorStop(1, 'rgba(8, 8, 12, 0.9)');
          ctx.fillStyle = grad;
          ctx.strokeStyle = noteStroke;
          ctx.lineWidth = 1.5;

          drawNoteShape(0);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(rx, ry + rh / 2 - 1.5, rw, 3);
        } else if (settings.squareRenderStyle === 'rhythmplus') {
          grad.addColorStop(0, noteFill);
          grad.addColorStop(1, noteFill);
          ctx.fillStyle = grad;
          drawNoteShape(0);
          ctx.fill();
        } else if (settings.playfieldStyle !== 'circle') {
          ctx.fillStyle = noteFill;
          ctx.strokeStyle = noteStroke;
          ctx.lineWidth = 2.5;
          drawNoteShape(4);
          ctx.fill();
          ctx.stroke();

          ctx.shadowColor = noteStroke;
          ctx.shadowBlur = 8;
          ctx.stroke();
          ctx.shadowBlur = 0;
        } else {
          grad.addColorStop(0, noteStroke);
          grad.addColorStop(0.3, noteFill);
          if (settings.skinId === 'cyberpunk') {
            grad.addColorStop(0.85, 'rgba(15, 23, 42, 0.95)');
          } else {
            grad.addColorStop(1, 'rgba(15,23,42,0.85)');
          }

          ctx.fillStyle = grad;
          ctx.strokeStyle = noteStroke;
          ctx.lineWidth = 1.5;

          drawNoteShape(5);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(rx + 4, ry + 4, rw - 8, 3);
        }
      }

      const headTex = Texture.from(noteHeadCanvas);
      noteHeads.push(headTex);

      // 2. BAKE HOLD END RECEPTOR
      const holdEndCanvas = document.createElement('canvas');
      let holdEndW = colW;
      let holdEndH = 20;
      if (isCircle) {
        holdEndW = colW;
        holdEndH = colW;
      }
      holdEndCanvas.width = holdEndW;
      holdEndCanvas.height = holdEndH;
      const ctxEnd = holdEndCanvas.getContext('2d')!;

      if (isCircle) {
        const cx = colW / 2;
        const cy = colW / 2;
        const r = (colW * (settings.noteSizeMultiplier ?? 1.0)) / 3.0;

        ctxEnd.beginPath();
        ctxEnd.arc(cx, cy, r, 0, Math.PI * 2);
        ctxEnd.strokeStyle = noteColor;
        ctxEnd.lineWidth = 3;
        ctxEnd.stroke();

        ctxEnd.beginPath();
        ctxEnd.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
        ctxEnd.fillStyle = '#ffffff';
        ctxEnd.fill();
      } else if (settings.squareRenderStyle === 'rhythmplus') {
        const rpColor = noteColor;
        ctxEnd.strokeStyle = rpColor;
        ctxEnd.lineWidth = 4;
        ctxEnd.setLineDash([3, 3]);
        ctxEnd.beginPath();
        ctxEnd.moveTo(rx, rh / 2);
        ctxEnd.lineTo(rx + rw, rh / 2);
        ctxEnd.stroke();
        ctxEnd.setLineDash([]);
      } else {
        ctxEnd.beginPath();
        ctxEnd.roundRect(rx, ry, rw, rh, 4);
        ctxEnd.strokeStyle = '#ffffff';
        ctxEnd.lineWidth = 2.5;
        ctxEnd.stroke();

        ctxEnd.save();
        ctxEnd.beginPath();
        ctxEnd.roundRect(rx + 4, ry + 4, rw - 8, rh - 8, 2);
        ctxEnd.fillStyle = noteColor;
        ctxEnd.globalAlpha = 0.75;
        ctxEnd.fill();
        ctxEnd.restore();

        ctxEnd.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctxEnd.lineWidth = 2;
        ctxEnd.beginPath();
        ctxEnd.moveTo(rx + 6, ry + 3);
        ctxEnd.lineTo(rx + 12, ry + rh - 3);
        ctxEnd.moveTo(rx + 10, ry + 3);
        ctxEnd.lineTo(rx + 16, ry + rh - 3);

        ctxEnd.moveTo(rx + rw - 6, ry + 3);
        ctxEnd.lineTo(rx + rw - 12, ry + rh - 3);
        ctxEnd.moveTo(rx + rw - 10, ry + 3);
        ctxEnd.lineTo(rx + rw - 16, ry + rh - 3);
        ctxEnd.stroke();
      }

      const endTex = Texture.from(holdEndCanvas);
      holdEnds.push(endTex);

      // 3. BAKE RECEPTORS
      const rcColor = receptorColor;

      // Normal Receptor
      const recNormCanvas = document.createElement('canvas');
      let recW = colW;
      let recH = isCircle ? colW : (settings.squareRenderStyle === 'rhythmplus' ? 20 : 28);
      recNormCanvas.width = recW;
      recNormCanvas.height = recH;
      const ctxNorm = recNormCanvas.getContext('2d')!;

      if (isCircle) {
        const cx = colW / 2;
        const cy = colW / 2;
        const r = (colW * (settings.receptorSizeMultiplier ?? 1.0)) / 3.0;

        ctxNorm.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctxNorm.lineWidth = 1.5;
        ctxNorm.beginPath();
        ctxNorm.arc(cx, cy, r, 0, Math.PI * 2);
        ctxNorm.setLineDash([4, 3]);
        ctxNorm.shadowColor = rcColor;
        ctxNorm.shadowBlur = 8;
        ctxNorm.stroke();
        ctxNorm.setLineDash([]);

        ctxNorm.fillStyle = 'transparent';
        ctxNorm.beginPath();
        ctxNorm.arc(cx, cy, r, 0, Math.PI * 2);
        ctxNorm.shadowColor = rcColor;
        ctxNorm.shadowBlur = 8;
        } else if (settings.squareRenderStyle === 'rhythmplus') {
        const receptorScale = settings.receptorSizeMultiplier ?? 1;
        const rw = (colW - 2) * receptorScale;
        const rh = 4 * receptorScale;
        const rx = (colW - rw) / 2;
        const ry = recH / 2 - rh / 2;

        ctxNorm.fillStyle = rcColor;
        ctxNorm.shadowColor = rcColor;
        ctxNorm.shadowBlur = 8;
        ctxNorm.beginPath();
        ctxNorm.rect(rx, ry, rw, rh);
        ctxNorm.fill();
      } else {
        const receptorScale = settings.receptorSizeMultiplier ?? 1;
        const rw = (colW - 12) * receptorScale;
        const rh = 28 * receptorScale;
        const rx = (colW - rw) / 2;
        const ry = (recH - rh) / 2;

        ctxNorm.strokeStyle = hexToRgba(rcColor, 0.85);
        ctxNorm.lineWidth = 2;
        ctxNorm.fillStyle = 'transparent';

        ctxNorm.beginPath();
        ctxNorm.roundRect(rx, ry, rw, rh, 6);
        ctxNorm.stroke();

        ctxNorm.fillStyle = rcColor;
        ctxNorm.beginPath();
        ctxNorm.arc(colW / 2, recH / 2, 3.5, 0, Math.PI * 2);
        ctxNorm.fill();
      }

      const normRecTex = Texture.from(recNormCanvas);
      receptorsNormal.push(normRecTex);

      // Pressed Receptor
      const recPressCanvas = document.createElement('canvas');
      recPressCanvas.width = recW;
      recPressCanvas.height = recH;
      const ctxPress = recPressCanvas.getContext('2d')!;

      if (isCircle) {
        const cx = colW / 2;
        const cy = colW / 2;
        const r = (colW * (settings.receptorSizeMultiplier ?? 1.0)) / 3.0;

        ctxPress.fillStyle = rcColor;
        ctxPress.beginPath();
        ctxPress.arc(cx, cy, r, 0, Math.PI * 2);
        ctxPress.fill();

        ctxPress.strokeStyle = '#ffffff';
        ctxPress.lineWidth = 3;
        ctxPress.beginPath();
        ctxPress.arc(cx, cy, r, 0, Math.PI * 2);
        ctxPress.stroke();

        ctxPress.fillStyle = rcColor;
        ctxPress.beginPath();
        ctxPress.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
        ctxPress.fill();
      } else if (settings.squareRenderStyle === 'rhythmplus') {
        const receptorScale = settings.receptorSizeMultiplier ?? 1;
        const rw = (colW - 2) * receptorScale;
        const rh = 4 * receptorScale;
        const rx = (colW - rw) / 2;
        const ry = recH / 2 - rh / 2;

        ctxPress.fillStyle = rcColor;
        ctxPress.beginPath();
        ctxPress.rect(rx, ry, rw, rh);
        ctxPress.fill();

        ctxPress.shadowColor = '#ffffff';
        ctxPress.shadowBlur = 10;
        ctxPress.fillStyle = rcColor;
        ctxPress.fillRect(rx, ry, rw, rh);
      } else {
        const receptorScale = settings.receptorSizeMultiplier ?? 1;
        const rw = (colW - 12) * receptorScale;
        const rh = 28 * receptorScale;
        const rx = (colW - rw) / 2;
        const ry = (recH - rh) / 2;

        ctxPress.strokeStyle = '#ffffff';
        ctxPress.lineWidth = 3.5;
        ctxPress.fillStyle = hexToRgba(rcColor, 0.15);

        ctxPress.beginPath();
        ctxPress.roundRect(rx, ry, rw, rh, 6);
        ctxPress.fill();
        ctxPress.stroke();

        ctxPress.fillStyle = '#ffffff';
        ctxPress.beginPath();
        ctxPress.arc(colW / 2, recH / 2, 5.5, 0, Math.PI * 2);
        ctxPress.fill();
      }

      const pressRecTex = Texture.from(recPressCanvas);
      receptorsPressed.push(pressRecTex);

      // 4. BAKE LANE GLOW
      const glowCanvas = document.createElement('canvas');
      glowCanvas.width = colW;
      glowCanvas.height = 350;
      const ctxGlow = glowCanvas.getContext('2d')!;

      const glowGrad = ctxGlow.createLinearGradient(0, 0, 0, 350);
      glowGrad.addColorStop(0, 'rgba(59,130,246,0)');
      glowGrad.addColorStop(1, 'rgba(59,130,246,0.3)');
      ctxGlow.fillStyle = glowGrad;
      ctxGlow.fillRect(0, 0, colW, 350);

      const glowTex = Texture.from(glowCanvas);
      laneGlows.push(glowTex);
    });

    return {
      noteHeads,
      holdEnds,
      receptorsPressed,
      receptorsNormal,
      laneGlows,
    };
  }
}
