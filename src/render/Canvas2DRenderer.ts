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

import { IPlayfieldRenderer, PlayfieldFrame, InitOpts, VisibleNote } from './types';
import { hexToRgba } from '../components/GameplayCanvas';
import { getLaneColors } from './skinTheme';
import { getNoteVisualY } from './playfieldLayout';

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

export class Canvas2DRenderer implements IPlayfieldRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private keyCount: number = 4;

  async init(canvas: HTMLCanvasElement, opts: InitOpts): Promise<void> {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.keyCount = opts.keyCount;
  }

  resize(width: number, height: number, dpr: number): void {
    if (!this.canvas) return;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    if (this.ctx) {
      this.ctx.resetTransform();
      this.ctx.scale(dpr, dpr);
    }
  }

  render(frame: PlayfieldFrame): void {
    const { ctx } = this;
    if (!ctx) return;

    const { width, height, columns, notes, particles, hitErrorTicks, hitErrorAvgMs, shake, settingsSlice, showKeyLabels, keyLabels, isFocusMode, isMobile } = frame;
    const receptorY = frame.receptorY;

    ctx.clearRect(0, 0, width, height);

    // solid black playfield shield
    const shieldDim = settingsSlice.backgroundDim !== undefined ? settingsSlice.backgroundDim : 0.60;
    ctx.fillStyle = `rgba(0, 0, 0, ${shieldDim})`;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    if (shake > 0) {
      const shakeX = (Math.random() - 0.5) * shake;
      const shakeY = (Math.random() - 0.5) * shake;
      ctx.translate(shakeX, shakeY);
    }

    // Lane background rails & column glows
    const separatorOpacity = settingsSlice.laneSeparatorOpacity ?? 0.30;
    for (let i = 0; i < this.keyCount; i++) {
      const col = columns[i];
      if (!col) continue;

      const xPos = col.x;
      const colW = col.width;

      // Subtle lane background separators
      ctx.strokeStyle = `rgba(71,85,105,${separatorOpacity})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xPos, 0);
      ctx.lineTo(xPos, height);
      ctx.stroke();

      // Lane-pressed glowing flashes
      if (col.glow > 0) {
        const glowGrad = ctx.createLinearGradient(
          xPos,
          settingsSlice.upsurfaceNoteMode ? 0 : height,
          xPos,
          receptorY
        );

        glowGrad.addColorStop(0, `rgba(59,130,246,${col.glow * 0.3})`);
        glowGrad.addColorStop(1, 'rgba(59,130,246,0)');

        ctx.fillStyle = glowGrad;
        ctx.fillRect(xPos, settingsSlice.upsurfaceNoteMode ? 0 : receptorY, colW, settingsSlice.upsurfaceNoteMode ? receptorY : height - receptorY);
      }
    }

    // Last border outline
    ctx.strokeStyle = `rgba(71,85,105,${separatorOpacity * 1.5})`;
    ctx.strokeRect(0, 0, width, height);

    const isCircleMode = settingsSlice.playfieldStyle === 'circle' ||
                         settingsSlice.skinId === 'circles' ||
                         settingsSlice.skinId === 'glassy-spheres' ||
                          settingsSlice.skinId === 'hollow-rings';
    const laneColors = getLaneColors(settingsSlice, columns.length);
    const noteColorFor = (column: number) => laneColors?.[column] || columns[column].color;
    const receptorColorFor = noteColorFor;

    const drawEndReceptor = (ey: number, xPosVal: number, colWVal: number, notePaddingVal: number, noteObj: VisibleNote) => {
      const noteScale = settingsSlice.noteSizeMultiplier ?? 1;
      const rw = (colWVal - notePaddingVal * 2) * noteScale;
      const rh = 20 * noteScale;
      const rx = xPosVal + (colWVal - rw) / 2;
      const ry = ey - rh / 2;

      ctx.save();

      // Apply Hidden Mod fade factor for the end receptor!
      let currentOpacity = noteObj.endOpacity ?? 1.0;

      // Dim only fully failed holds; head-miss salvageable LNs keep a readable tail
      if (noteObj.isHoldFailed) {
        currentOpacity *= 0.35;
      }

      ctx.globalAlpha = currentOpacity;

      if (isCircleMode) {
        const cx = rx + rw / 2;
        const cy = ry + rh / 2;
        const r = (colWVal * noteScale) / 3.0;
        const noteColor = noteColorFor(noteObj.column);

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = noteColor;
        ctx.lineWidth = 3;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = noteColor;
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.beginPath();
        if (settingsSlice.squareRenderStyle === 'rhythmplus' && settingsSlice.playfieldStyle !== 'circle') {
          ctx.strokeStyle = noteColorFor(noteObj.column);
          ctx.lineWidth = 4;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(rx, ry + rh / 2);
          ctx.lineTo(rx + rw, ry + rh / 2);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          const noteColor = noteColorFor(noteObj.column);

          ctx.roundRect(rx, ry, rw, rh, 4);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          ctx.save();
          ctx.beginPath();
          ctx.roundRect(rx + 4, ry + 4, rw - 8, rh - 8, 2);
          ctx.fillStyle = noteColor;
          ctx.globalAlpha = currentOpacity * 0.75;
          ctx.fill();
          ctx.restore();

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(rx + 6, ry + 3);
          ctx.lineTo(rx + 12, ry + rh - 3);
          ctx.moveTo(rx + 10, ry + 3);
          ctx.lineTo(rx + 16, ry + rh - 3);

          ctx.moveTo(rx + rw - 6, ry + 3);
          ctx.lineTo(rx + rw - 12, ry + rh - 3);
          ctx.moveTo(rx + rw - 10, ry + 3);
          ctx.lineTo(rx + rw - 16, ry + rh - 3);
          ctx.stroke();
        }
      }

      ctx.restore();
    };

    // 2. Draw hold note bodies
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

          ctx.save();
          ctx.globalAlpha = 1.0;
          const holdGrad = ctx.createLinearGradient(xPos, visualStartY, xPos, visualEndY);

          const fadeStart = n.opacity;
          const fadeEnd = n.endOpacity ?? n.opacity;

          if (settingsSlice.squareRenderStyle === 'rhythmplus' && !isCircleMode) {
            const rpColor = noteColorFor(n.column);
            if (n.isHit && !n.isReleased) {
              if (n.releaseGraceUntil) {
                const flicker = (Math.floor(Date.now() / 40) % 2 === 0);
                holdGrad.addColorStop(0, applyFade(flicker ? rpColor : hexToRgba(rpColor, 0.5), fadeStart));
                holdGrad.addColorStop(1, applyFade(flicker ? rpColor : hexToRgba(rpColor, 0.5), fadeEnd));
              } else {
                holdGrad.addColorStop(0, applyFade(rpColor, fadeStart));
                holdGrad.addColorStop(1, applyFade(rpColor, fadeEnd));
              }
            } else if (n.isHoldFailed) {
              holdGrad.addColorStop(0, applyFade('rgba(100,116,139,0.5)', fadeStart));
              holdGrad.addColorStop(1, applyFade('rgba(100,116,139,0.5)', fadeEnd));
            } else {
              holdGrad.addColorStop(0, applyFade(rpColor, fadeStart));
              holdGrad.addColorStop(1, applyFade(rpColor, fadeEnd));
            }
          } else if (settingsSlice.playfieldStyle !== 'circle') {
            const rmColor = noteColorFor(n.column);
            if (n.isHit && !n.isReleased) {
              if (n.releaseGraceUntil) {
                const flicker = (Math.floor(Date.now() / 40) % 2 === 0);
                holdGrad.addColorStop(0, applyFade(flicker ? hexToRgba(rmColor, 0.8) : hexToRgba(rmColor, 0.2), fadeStart));
                holdGrad.addColorStop(1, applyFade(hexToRgba(rmColor, 0.3), fadeEnd));
              } else {
                holdGrad.addColorStop(0, applyFade(hexToRgba(rmColor, 0.8), fadeStart));
                holdGrad.addColorStop(1, applyFade(hexToRgba(rmColor, 0.3), fadeEnd));
              }
            } else if (n.isHoldFailed) {
              holdGrad.addColorStop(0, applyFade('rgba(100,116,139,0.3)', fadeStart));
              holdGrad.addColorStop(1, applyFade('rgba(71,85,105,0.1)', fadeEnd));
            } else {
              holdGrad.addColorStop(0, applyFade(hexToRgba(rmColor, 0.6), fadeStart));
              holdGrad.addColorStop(1, applyFade(hexToRgba(rmColor, 0.2), fadeEnd));
            }
          } else {
            const noteColor = noteColorFor(n.column);
            if (n.isHit && !n.isReleased) {
              if (n.releaseGraceUntil) {
                const flicker = (Math.floor(Date.now() / 40) % 2 === 0);
                holdGrad.addColorStop(0, applyFade(flicker ? hexToRgba(noteColor, 0.75) : hexToRgba(noteColor, 0.2), fadeStart));
                holdGrad.addColorStop(1, applyFade(hexToRgba(noteColor, 0.3), fadeEnd));
              } else {
                holdGrad.addColorStop(0, applyFade(hexToRgba(noteColor, 0.8), fadeStart));
                holdGrad.addColorStop(1, applyFade(hexToRgba(noteColor, 0.3), fadeEnd));
              }
            } else if (n.isHoldFailed) {
              holdGrad.addColorStop(0, applyFade('rgba(100,116,139,0.3)', fadeStart));
              holdGrad.addColorStop(1, applyFade('rgba(71,85,105,0.1)', fadeEnd));
            } else {
                holdGrad.addColorStop(0, applyFade(hexToRgba(noteColor, 0.6), fadeStart));
                holdGrad.addColorStop(1, applyFade(hexToRgba(noteColor, 0.2), fadeEnd));
            }
          }

          ctx.fillStyle = holdGrad;

           const padding = isFocusMode ? 3 : 12;
           const notePadding = isFocusMode ? 1.5 : 6;
           const noteScale = settingsSlice.noteSizeMultiplier ?? 1;
           const useNotePadding = settingsSlice.squareRenderStyle === 'rhythmplus' && !isCircleMode;

           const basePadding = useNotePadding ? notePadding : padding;
           const rw = (colW - basePadding * 2) * noteScale;
           const rx = xPos + (colW - rw) / 2;

          let drawY = Math.min(visualStartY, visualEndY);
          let drawH = Math.abs(clipHeight);

          if (useNotePadding) {
            drawY -= 4;
            drawH += 8;
          }

          ctx.beginPath();
          if (settingsSlice.squareRenderStyle === 'rhythmplus' && !isCircleMode) {
            ctx.rect(rx, drawY, rw, drawH);
          } else {
            if (isCircleMode) {
              ctx.roundRect(rx, drawY, rw, drawH, rw / 2);
            } else if (settingsSlice.skinId === 'classic-bar' || settingsSlice.skinId === 'minimalist') {
              ctx.rect(rx, drawY, rw, drawH);
            } else {
              ctx.roundRect(rx, drawY, rw, drawH, 6);
            }
          }
          ctx.fill();

          if (!(settingsSlice.squareRenderStyle === 'rhythmplus' && !isCircleMode)) {
            const strokeGrad = ctx.createLinearGradient(xPos, visualStartY, xPos, visualEndY);
            const baseStrokeColor = n.isHit && !n.isReleased
              ? (n.releaseGraceUntil ? '#eab308' : '#22d3ee')
              : 'rgba(56,189,248,0.4)';
            strokeGrad.addColorStop(0, applyFade(baseStrokeColor, fadeStart));
            strokeGrad.addColorStop(1, applyFade(baseStrokeColor, fadeEnd));

            ctx.strokeStyle = strokeGrad;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(xPos + colW / 2, visualStartY);
            ctx.lineTo(xPos + colW / 2, visualEndY);
            ctx.stroke();
          }

          ctx.restore();
        }
      }
    });

    // 3. Draw notes individual bodies (heads & endpoints)
    notes.forEach((n) => {
      // Skip normal notes that are hit or missed
      if (n.type === 'normal' && (n.isHit || n.isMissed)) {
        return;
      }

      // Skip completely consumed holds
      if (n.type === 'hold' && n.isReleased) {
        return;
      }

      const xPos = columns[n.column].x;
      const colW = columns[n.column].width;
      const notePadding = isFocusMode ? 1.5 : 6;
      const noteScale = settingsSlice.noteSizeMultiplier ?? 1;

      const shouldDrawHead = (n.type === 'normal') || (n.type === 'hold' && !n.isHit && !n.isMissed);

      if (shouldDrawHead) {
        if (!(n.type === 'hold' && settingsSlice.squareRenderStyle === 'rhythmplus' && settingsSlice.playfieldStyle !== 'circle')) {
           const rw = (colW - notePadding * 2) * noteScale;
           const rh = 20 * noteScale;
           const rx = xPos + (colW - rw) / 2;
            const ry = getNoteVisualY(n.y, colW, settingsSlice) - rh / 2;

          ctx.save();
          let currentOpacity = n.opacity;

          if (n.type === 'hold' && n.isHoldFailed) {
            currentOpacity *= 0.35;
          }

          ctx.globalAlpha = currentOpacity;

          const drawNoteShape = (radiusDefault: number) => {
            ctx.beginPath();
            if (settingsSlice.squareRenderStyle === 'rhythmplus' && settingsSlice.playfieldStyle !== 'circle') {
               const barHeight = 8 * noteScale;
               ctx.rect(rx, ry + rh / 2 - barHeight / 2, rw, barHeight);
            } else {
              ctx.roundRect(rx, ry, rw, rh, radiusDefault);
            }
          };

          let noteFill: string = '';
          let noteStroke: string = noteColorFor(n.column);

          if (isCircleMode) {
            noteFill = noteColorFor(n.column);
            noteStroke = noteColorFor(n.column);
          } else if (settingsSlice.squareRenderStyle === 'rhythmplus') {
            noteFill = noteColorFor(n.column);
            noteStroke = noteColorFor(n.column);
          } else {
            noteFill = noteColorFor(n.column);
            noteStroke = noteColorFor(n.column);
          }

          const grad = ctx.createLinearGradient(rx, ry, rx, ry + rh);
          if (settingsSlice.skinId === 'minimalist') {
            ctx.fillStyle = noteFill;
            ctx.strokeStyle = noteStroke;
            ctx.lineWidth = 2;

            drawNoteShape(3);
            ctx.fill();
            ctx.stroke();
          } else if (settingsSlice.skinId === 'classic-bar') {
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
          } else if (isCircleMode) {
            const cx = rx + rw / 2;
            const cy = ry + rh / 2;
            const r = (colW * (settingsSlice.noteSizeMultiplier ?? 1.0)) / 3.0;
            const noteColor = noteColorFor(n.column);

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
          } else if (settingsSlice.squareRenderStyle === 'rhythmplus' && settingsSlice.playfieldStyle !== 'circle') {
            grad.addColorStop(0, noteFill);
            grad.addColorStop(1, noteFill);
            ctx.fillStyle = grad;
            drawNoteShape(0);
            ctx.fill();
          } else if (settingsSlice.playfieldStyle !== 'circle') {
            grad.addColorStop(0, noteFill);
            grad.addColorStop(1, noteFill);
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
            if (settingsSlice.skinId === 'cyberpunk') {
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

          ctx.restore();
        }
      }

      if (n.type === 'hold' && n.endY !== undefined && !n.isReleased) {
         drawEndReceptor(getNoteVisualY(n.endY, colW, settingsSlice), xPos, colW, notePadding, n);
      }
    });

    // 4. Draw mobile zone overlay if active
    if (isMobile && !isFocusMode) {
      const hitZoneTop = height * 0.60;
      ctx.save();

      const fillGrad = ctx.createLinearGradient(0, hitZoneTop, 0, height);
      fillGrad.addColorStop(0, 'rgba(8, 8, 12, 0.12)');
      fillGrad.addColorStop(1, 'rgba(5, 5, 8, 0.35)');
      ctx.fillStyle = fillGrad;
      ctx.fillRect(0, hitZoneTop, width, height - hitZoneTop);

      ctx.strokeStyle = 'rgba(6, 182, 212, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, hitZoneTop);
      ctx.lineTo(width, hitZoneTop);
      ctx.stroke();

      for (let i = 1; i < this.keyCount; i++) {
        const xPos = columns[i].x;
        ctx.strokeStyle = 'rgba(71, 85, 105, 0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(xPos, hitZoneTop);
        ctx.lineTo(xPos, height);
        ctx.stroke();
      }

      ctx.restore();
    }

    // 5. Draw Receptors
    for (let i = 0; i < this.keyCount; i++) {
      const col = columns[i];
      if (!col) continue;

      const xPos = col.x;
      const colW = col.width;
      const isPressed = col.pressed;

      const rcColor = receptorColorFor(i);

      ctx.save();
      ctx.globalAlpha = settingsSlice.receptorOpacity ?? 1.0;

      if (isCircleMode) {
        const cx = xPos + colW / 2;
        const cy = receptorY;
        const r = (colW * (settingsSlice.receptorSizeMultiplier ?? 1.0)) / 3.0;

        if (isPressed) {
          ctx.fillStyle = rcColor;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.strokeStyle = hexToRgba(rcColor, 0.85);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.setLineDash([4, 3]);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = 'rgba(15, 23, 42, 0.15)';
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.shadowColor = rcColor;
          ctx.shadowBlur = 8;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      } else if (settingsSlice.squareRenderStyle === 'rhythmplus') {
        const receptorScale = settingsSlice.receptorSizeMultiplier ?? 1;
        const rw = (colW - 2) * receptorScale;
        const rh = 4 * receptorScale;
        const rx = xPos + (colW - rw) / 2;
        const ry = receptorY - rh / 2;

         ctx.fillStyle = isPressed ? '#ffffff' : rcColor;
        ctx.beginPath();
        ctx.rect(rx, ry, rw, rh);
        ctx.fill();

         if (isPressed) {
           ctx.shadowColor = rcColor;
          ctx.shadowBlur = 10;
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      } else {
        const receptorScale = settingsSlice.receptorSizeMultiplier ?? 1;
        const rw = (colW - 12) * receptorScale;
        const rh = 28 * receptorScale;
        const rx = xPos + (colW - rw) / 2;
        const ry = receptorY - rh / 2;

        ctx.strokeStyle = isPressed ? '#ffffff' : hexToRgba(rcColor, 0.85);
        ctx.lineWidth = isPressed ? 3.5 : 2;
        ctx.fillStyle = isPressed ? hexToRgba(rcColor, 0.45) : 'rgba(15, 23, 42, 0.85)';

        ctx.beginPath();
        ctx.roundRect(rx, ry, rw, rh, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isPressed ? '#ffffff' : rcColor;
        ctx.beginPath();
        ctx.arc(xPos + colW / 2, receptorY, isPressed ? 5.5 : 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw Key bindings labels
      if (showKeyLabels && keyLabels[i]) {
        ctx.font = '900 22px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = isPressed ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.25)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          keyLabels[i].toUpperCase(),
          xPos + colW / 2,
          settingsSlice.upsurfaceNoteMode ? receptorY + 50 : receptorY - 50
        );
      }

      ctx.restore();
    }

    // 6. RENDER PARTICLES BURST GENERATION
    if (!settingsSlice.disableParticles) {
      particles.forEach((p) => {
        ctx.save();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }

    ctx.restore(); // POP screen shake translations

    // 7. DRAW TIMING (HIT ERROR) METER
    const maxMs = 150;
    const barWidth = 300;
    const barHeight = 8;
    const centerX = width / 2;
    const barY = settingsSlice.upsurfaceNoteMode ? receptorY - 55 : receptorY + 55;

    ctx.save();

    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.roundRect(centerX - barWidth / 2, barY, barWidth, barHeight, 4);
    ctx.fill();
    ctx.stroke();

    const orangeColor = 'rgba(236, 154, 41, 0.35)';
    const greenColor = 'rgba(34, 197, 94, 0.5)';
    const blueColor = 'rgba(59, 130, 246, 0.7)';

    // Bad region (using generic OD range representation from frames)
    // We can compute the width of the blocks based on standard OD settings represented by typical threshold ms:
    // Bad window region: 135ms standard
    const badWin = 135;
    const badX1 = centerX - (badWin / maxMs) * (barWidth / 2);
    const badX2 = centerX + (badWin / maxMs) * (barWidth / 2);
    ctx.fillStyle = orangeColor;
    ctx.fillRect(badX1, barY, badX2 - badX1, barHeight);

    // Great window region: 75ms standard
    const greatWin = 75;
    const greatX1 = centerX - (greatWin / maxMs) * (barWidth / 2);
    const greatX2 = centerX + (greatWin / maxMs) * (barWidth / 2);
    ctx.fillStyle = greenColor;
    ctx.fillRect(greatX1, barY, greatX2 - greatX1, barHeight);

    // Perfect region: 40ms standard
    const perfectWin = 40;
    const perfectX1 = centerX - (perfectWin / maxMs) * (barWidth / 2);
    const perfectX2 = centerX + (perfectWin / maxMs) * (barWidth / 2);
    ctx.fillStyle = blueColor;
    ctx.fillRect(perfectX1, barY, perfectX2 - perfectX1, barHeight);

    // Centered perfect line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(centerX, barY - 3);
    ctx.lineTo(centerX, barY + barHeight + 3);
    ctx.stroke();

    // Render timing ticks
    hitErrorTicks.forEach(t => {
      const clampedError = Math.max(-maxMs, Math.min(maxMs, t.error));
      const tickX = centerX + (clampedError / maxMs) * (barWidth / 2);

      ctx.save();
      const age = Date.now() - t.timestamp;
      ctx.globalAlpha = Math.max(0, 1 - age / 2000);
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tickX, barY - 2);
      ctx.lineTo(tickX, barY + barHeight + 2);
      ctx.stroke();
      ctx.restore();
    });

    // Render rolling average white indicator pointer
    if (hitErrorAvgMs !== null) {
      const clampedAvg = Math.max(-maxMs, Math.min(maxMs, hitErrorAvgMs));
      const avgX = centerX + (clampedAvg / maxMs) * (barWidth / 2);

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(avgX, barY - 1);
      ctx.lineTo(avgX - 4, barY - 7);
      ctx.lineTo(avgX + 4, barY - 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(avgX, barY - 1);
      ctx.lineTo(avgX, barY + barHeight + 1);
      ctx.stroke();
    }

    ctx.restore();
  }

  destroy(): void {
    this.canvas = null;
    this.ctx = null;
  }
}
