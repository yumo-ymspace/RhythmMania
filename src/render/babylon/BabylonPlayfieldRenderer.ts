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

/*
 * PJ Sekai-style converging-runway renderer. The renderer is purely
 * presentational and consumes the same PlayfieldFrame the other engines do,
 * but it ignores frame.columns[].x/width (which carry the shared
 * playfieldWidthPercent-based 2D layout) and computes its own full-screen
 * equal-lane runway layout from keyCount. It still uses
 * frame.columns[].color/pressed/glow.
 *
 * The near-plane playfield width is derived each frame from the camera
 * projection (see BabylonSceneFactory.computeNearVisibleWidth) so that
 * playfieldWidthPercent is honored as a fraction of the screen width on every
 * aspect ratio. Babylon always scrolls depth -> near; upsurfaceNoteMode is
 * locked to false upstream while Babylon is the active engine.
 */

import type { Engine } from '@babylonjs/core/Engines/engine';
import type { Scene } from '@babylonjs/core/scene';
import type { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import type { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import type { IPlayfieldRenderer, PlayfieldFrame, InitOpts } from '../types';
import { BabylonSceneFactory } from './BabylonSceneFactory';
import { BackgroundLayer } from './layers/BackgroundLayer';
import { LaneLayer } from './layers/LaneLayer';
import { HoldLayer } from './layers/HoldLayer';
import { NoteLayer } from './layers/NoteLayer';
import { ReceptorLayer } from './layers/ReceptorLayer';
import { ParticleLayer } from './layers/ParticleLayer';

export interface RunwayContext {
  floor: boolean;                 // babylonFloor
  nearWidth: number;              // world width of the full playfield at the near plane
  laneWidthNear: number;           // nearWidth / keyCount
  keyCount: number;
}

export class BabylonPlayfieldRenderer implements IPlayfieldRenderer {
  private engine: Engine | null = null;
  private scene: Scene | null = null;
  private camera: FreeCamera | null = null;
  private pipeline: DefaultRenderingPipeline | null = null;

  private bgLayer: BackgroundLayer | null = null;
  private laneLayer: LaneLayer | null = null;
  private holdLayer: HoldLayer | null = null;
  private noteLayer: NoteLayer | null = null;
  private receptorLayer: ReceptorLayer | null = null;
  private particleLayer: ParticleLayer | null = null;

  private baseCamX = 0;
  private baseCamY = 0;
  private baseCamZ = 0;

  async init(canvas: HTMLCanvasElement, opts: InitOpts): Promise<void> {
    const width = canvas.clientWidth || 400;
    const height = canvas.clientHeight || 700;
    const bundle = BabylonSceneFactory.create(canvas, width, height, opts.settings);
    this.engine = bundle.engine;
    this.scene = bundle.scene;
    this.camera = bundle.camera;
    this.pipeline = bundle.pipeline;

    this.baseCamX = this.camera.position.x;
    this.baseCamY = this.camera.position.y;
    this.baseCamZ = this.camera.position.z;

    this.bgLayer = new BackgroundLayer(this.scene);
    this.laneLayer = new LaneLayer(this.scene);
    this.holdLayer = new HoldLayer(this.scene);
    this.noteLayer = new NoteLayer(this.scene);
    this.receptorLayer = new ReceptorLayer(this.scene);
    this.particleLayer = new ParticleLayer(this.scene);
  }

  resize(_width: number, _height: number, dpr: number): void {
    if (!this.engine) return;
    this.engine.setHardwareScalingLevel(1 / Math.max(0.5, dpr));
    this.engine.resize();
  }

  render(frame: PlayfieldFrame): void {
    if (!this.engine || !this.scene || !this.camera) return;

    // On-hit shake is the only camera motion; already zero when disableLaneShake is on.
    if (frame.shake > 0) {
      this.camera.position.x = this.baseCamX + (Math.random() - 0.5) * frame.shake * 0.02;
      this.camera.position.y = this.baseCamY + (Math.random() - 0.5) * frame.shake * 0.015;
    } else {
      this.camera.position.x = this.baseCamX;
      this.camera.position.y = this.baseCamY;
    }
    this.camera.position.z = this.baseCamZ;

    const rw = this.engine.getRenderWidth();
    const rh = this.engine.getRenderHeight();
    const aspect = rh > 0 ? rw / rh : 1;
    const visibleWidth = BabylonSceneFactory.computeNearVisibleWidth(this.camera, aspect);
    const playfieldWidthPercent = frame.settingsSlice.playfieldWidthPercent ?? 40;
    const nearWidth = Math.max(1, visibleWidth * (playfieldWidthPercent / 100));
    const keyCount = frame.columns.length || 1;

    const ctx: RunwayContext = {
      floor: frame.settingsSlice.babylonFloor ?? true,
      nearWidth,
      laneWidthNear: nearWidth / keyCount,
      keyCount,
    };

    this.bgLayer?.update(frame, ctx);
    this.laneLayer?.update(frame, ctx);
    this.holdLayer?.update(frame, ctx);
    this.noteLayer?.update(frame, ctx);
    this.receptorLayer?.update(frame, ctx);
    this.particleLayer?.update(frame, ctx);

    this.scene.render();
  }

  destroy(): void {
    this.bgLayer?.dispose();
    this.laneLayer?.dispose();
    this.holdLayer?.dispose();
    this.noteLayer?.dispose();
    this.receptorLayer?.dispose();
    this.particleLayer?.dispose();

    this.bgLayer = null;
    this.laneLayer = null;
    this.holdLayer = null;
    this.noteLayer = null;
    this.receptorLayer = null;
    this.particleLayer = null;

    if (this.pipeline) {
      this.pipeline.dispose();
      this.pipeline = null;
    }
    if (this.scene) {
      this.scene.dispose();
      this.scene = null;
    }
    if (this.engine) {
      this.engine.dispose();
      this.engine = null;
    }
    this.camera = null;
  }
}
