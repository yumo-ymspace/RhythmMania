/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 */

import { Application, Container } from 'pixi.js';
import { IPlayfieldRenderer, PlayfieldFrame, InitOpts } from '../types';
import { PixiAppFactory } from './PixiAppFactory';
import { SpritePool } from './pool/SpritePool';
import { SkinTextureCache } from './skin/SkinTextureCache';
import { BackgroundLayer } from './layers/BackgroundLayer';
import { LaneLayer } from './layers/LaneLayer';
import { HoldLayer } from './layers/HoldLayer';
import { NoteLayer } from './layers/NoteLayer';
import { ReceptorLayer } from './layers/ReceptorLayer';
import { ParticleLayer } from './layers/ParticleLayer';
import { MobileZoneLayer } from './layers/MobileZoneLayer';
import { HitErrorLayer } from './layers/HitErrorLayer';

export class PixiPlayfieldRenderer implements IPlayfieldRenderer {
  private app: Application | null = null;
  private rootContainer: Container | null = null;
  private pool = new SpritePool();
  private cache = new SkinTextureCache();

  // Layers
  private bgLayer: BackgroundLayer | null = null;
  private laneLayer: LaneLayer | null = null;
  private holdLayer: HoldLayer | null = null;
  private noteLayer: NoteLayer | null = null;
  private receptorLayer: ReceptorLayer | null = null;
  private particleLayer: ParticleLayer | null = null;
  private mobileZoneLayer: MobileZoneLayer | null = null;
  private hitErrorLayer: HitErrorLayer | null = null;

  async init(canvas: HTMLCanvasElement, opts: InitOpts): Promise<void> {
    const width = canvas.clientWidth || 400;
    const height = canvas.clientHeight || 700;

    // Create App Shell
    this.app = await PixiAppFactory.createApplication(canvas, width, height, opts.settings);

    // Disable interaction events on the stage
    this.app.stage.eventMode = 'none';

    // Root Container for screen shaking translations
    this.rootContainer = new Container();
    this.rootContainer.eventMode = 'none';
    this.app.stage.addChild(this.rootContainer);

    // Instantiate modular layers
    this.bgLayer = new BackgroundLayer();
    this.laneLayer = new LaneLayer();
    this.holdLayer = new HoldLayer();
    this.noteLayer = new NoteLayer(this.pool);
    this.receptorLayer = new ReceptorLayer();
    this.particleLayer = new ParticleLayer();
    this.mobileZoneLayer = new MobileZoneLayer();
    this.hitErrorLayer = new HitErrorLayer();

    // Add in draw order
    this.rootContainer.addChild(this.bgLayer);
    this.rootContainer.addChild(this.laneLayer);
    this.rootContainer.addChild(this.holdLayer);
    this.rootContainer.addChild(this.noteLayer);
    this.rootContainer.addChild(this.mobileZoneLayer);
    this.rootContainer.addChild(this.receptorLayer);
    this.rootContainer.addChild(this.particleLayer);

    // hitError is sibling under stage/hudRoot NOT inside shake
    this.app.stage.addChild(this.hitErrorLayer);
  }

  resize(width: number, height: number, dpr: number): void {
    if (!this.app) return;
    this.app.renderer.resize(width, height);
  }

  render(frame: PlayfieldFrame): void {
    if (!this.app || !this.rootContainer) return;

    const { shake, columns, settingsSlice, isFocusMode } = frame;

    // 1. Resolve / Build textures for this frame
    const textures = this.cache.getTextures(this.app, columns, settingsSlice, isFocusMode);

    // 2. Handle screen shake on root container
    if (shake > 0) {
      const shakeX = (Math.random() - 0.5) * shake;
      const shakeY = (Math.random() - 0.5) * shake;
      this.rootContainer.position.set(shakeX, shakeY);
    } else {
      this.rootContainer.position.set(0, 0);
    }

    // 3. Update all layers sequentially
    if (this.bgLayer) this.bgLayer.update(frame);
    if (this.laneLayer) this.laneLayer.update(frame, textures);
    if (this.holdLayer) this.holdLayer.update(frame);
    if (this.noteLayer) this.noteLayer.update(frame, textures);
    if (this.receptorLayer) this.receptorLayer.update(frame, textures);
    if (this.particleLayer) this.particleLayer.update(frame);
    if (this.mobileZoneLayer) this.mobileZoneLayer.update(frame);
    if (this.hitErrorLayer) this.hitErrorLayer.update(frame);

    // 4. Force manual render update
    this.app.render();
  }

  destroy(): void {
    // 1. Stop render: nullify app and rootContainer references immediately to prevent any further frames from rendering
    const appInstance = this.app;
    const rootContainerInstance = this.rootContainer;
    this.app = null;
    this.rootContainer = null;

    // 2. Detach: disconnect all child layers and sub-containers
    try {
      if (rootContainerInstance) {
        rootContainerInstance.removeChildren();
      }
      if (appInstance) {
        appInstance.stage.removeChildren();
      }
    } catch (e) {
      console.warn('Failed to detach children during Pixi destroy:', e);
    }

    // 3. Destroy all layers explicitly (ensuring noteLayer releases its active sprites back to the pool first)
    if (this.noteLayer) {
      try {
        this.noteLayer.destroyLayer();
      } catch (e) {
        console.warn('Failed to call destroyLayer on noteLayer:', e);
      }
    }

    const layersToDestroy = [
      this.bgLayer,
      this.laneLayer,
      this.holdLayer,
      this.noteLayer,
      this.receptorLayer,
      this.particleLayer,
      this.mobileZoneLayer,
      this.hitErrorLayer
    ];

    layersToDestroy.forEach((layer) => {
      if (layer) {
        try {
          layer.destroy({ children: true });
        } catch (e) {
          console.warn('Failed to destroy layer:', e);
        }
      }
    });

    // Nullify references to all layers
    this.bgLayer = null;
    this.laneLayer = null;
    this.holdLayer = null;
    this.noteLayer = null;
    this.receptorLayer = null;
    this.particleLayer = null;
    this.mobileZoneLayer = null;
    this.hitErrorLayer = null;

    // 4. Clear pool
    try {
      this.pool.clear();
    } catch (e) {
      console.warn('Failed to clear pool:', e);
    }

    // 5. Destroy app without destroying textures (texture: false)
    if (appInstance) {
      try {
        appInstance.destroy(false, { children: true, texture: false });
      } catch (e) {
        console.warn('Failed to destroy Pixi application:', e);
      }
    }

    // 6. Cleanly destroy the cache (including textures within it) to prevent double-destroy
    try {
      this.cache.destroy();
    } catch (e) {
      console.warn('Failed to destroy SkinTextureCache:', e);
    }
  }
}
