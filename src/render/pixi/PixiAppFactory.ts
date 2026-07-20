/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 */

import { Application } from 'pixi.js';
import { GameSettings } from '../../types';

export class PixiAppFactory {
  static async createApplication(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    settings: GameSettings
  ): Promise<Application> {
    const app = new Application();
    const dpr = settings.limitDprToOne ? 1 : Math.min(1.5, window.devicePixelRatio || 1);

    await app.init({
      canvas: canvas,
      width: width,
      height: height,
      resolution: dpr,
      autoDensity: true,
      backgroundAlpha: 0,
      preference: 'webgl', // Explicitly force WebGL for iframe safety & performance profiles
    });

    // Disable default ticker since we manage rendering manually via audio clock
    app.ticker.stop();

    return app;
  }
}
