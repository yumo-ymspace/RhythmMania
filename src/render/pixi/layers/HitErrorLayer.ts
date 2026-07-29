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

import { Container, Graphics } from 'pixi.js';
import { PlayfieldFrame } from '../../types';

export class HitErrorLayer extends Container {
  private chromeG: Graphics;
  private ticksG: Graphics;

  private lastWidth = 0;
  private lastReceptorY = 0;
  private lastUpsurfaceMode: boolean | null = null;

  constructor() {
    super();
    this.chromeG = new Graphics();
    this.ticksG = new Graphics();
    this.addChild(this.chromeG);
    this.addChild(this.ticksG);
  }

  update(frame: PlayfieldFrame): void {
    const { width, receptorY, hitErrorTicks, hitErrorAvgMs, settingsSlice } = frame;
    const upsurfaceMode = !!settingsSlice.upsurfaceNoteMode;

    const maxMs = 150;
    const barWidth = 300;
    const barHeight = 8;
    const centerX = width / 2;
    const barY = upsurfaceMode ? receptorY - 55 : receptorY + 55;

    // 1. Redraw Chrome only on size/setting changes
    if (
      width !== this.lastWidth ||
      receptorY !== this.lastReceptorY ||
      upsurfaceMode !== this.lastUpsurfaceMode
    ) {
      this.lastWidth = width;
      this.lastReceptorY = receptorY;
      this.lastUpsurfaceMode = upsurfaceMode;

      this.chromeG.clear();

      // Container background
      this.chromeG.roundRect(centerX - barWidth / 2, barY, barWidth, barHeight, 4)
            .fill({ color: 0x0f172a, alpha: 0.75 })
            .stroke({ color: 0xffffff, width: 1, alpha: 0.15 });

      // Bad window region: 135ms
      const badWin = 135;
      const badX1 = centerX - (badWin / maxMs) * (barWidth / 2);
      const badX2 = centerX + (badWin / maxMs) * (barWidth / 2);
      this.chromeG.rect(badX1, barY, badX2 - badX1, barHeight)
            .fill({ color: 0xec9a29, alpha: 0.35 });

      // Great window region: 75ms
      const greatWin = 75;
      const greatX1 = centerX - (greatWin / maxMs) * (barWidth / 2);
      const greatX2 = centerX + (greatWin / maxMs) * (barWidth / 2);
      this.chromeG.rect(greatX1, barY, greatX2 - greatX1, barHeight)
            .fill({ color: 0x22c55e, alpha: 0.5 });

      // Perfect region: 40ms
      const perfectWin = 40;
      const perfectX1 = centerX - (perfectWin / maxMs) * (barWidth / 2);
      const perfectX2 = centerX + (perfectWin / maxMs) * (barWidth / 2);
      this.chromeG.rect(perfectX1, barY, perfectX2 - perfectX1, barHeight)
            .fill({ color: 0x3b82f6, alpha: 0.7 });

      // Perfect center line
      this.chromeG.moveTo(centerX, barY - 3)
            .lineTo(centerX, barY + barHeight + 3)
            .stroke({ color: 0xffffff, width: 1.5 });
    }

    // 2. Dynamic ticks & average indicator (clear and redraw every frame on ticksG)
    this.ticksG.clear();

    const now = Date.now();
    hitErrorTicks.forEach((t) => {
      const age = now - t.timestamp;
      const tickAlpha = Math.max(0, 1 - age / 2000);
      const clampedError = Math.max(-maxMs, Math.min(maxMs, t.error));
      const tickX = centerX + (clampedError / maxMs) * (barWidth / 2);

      const colorHex = this.hexStringToNumber(t.color);

      this.ticksG.moveTo(tickX, barY - 2)
            .lineTo(tickX, barY + barHeight + 2)
            .stroke({ color: colorHex, width: 1.5, alpha: tickAlpha });
    });

    if (hitErrorAvgMs !== null) {
      const clampedAvg = Math.max(-maxMs, Math.min(maxMs, hitErrorAvgMs));
      const avgX = centerX + (clampedAvg / maxMs) * (barWidth / 2);

      this.ticksG.moveTo(avgX, barY - 1)
            .lineTo(avgX - 4, barY - 7)
            .lineTo(avgX + 4, barY - 7)
            .fill({ color: 0xffffff })
            .stroke({ color: 0x000000, width: 1, alpha: 0.6 });

      this.ticksG.moveTo(avgX, barY - 1)
            .lineTo(avgX, barY + barHeight + 1)
            .stroke({ color: 0xffffff, width: 1, alpha: 0.4 });
    }
  }

  private hexStringToNumber(hex: string): number {
    if (!hex) return 0xffffff;
    const clean = hex.replace('#', '');
    if (clean.length === 3) {
      return parseInt(clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2], 16);
    }
    if (clean.length === 6) {
      return parseInt(clean, 16);
    }
    return 0xffffff;
  }
}
