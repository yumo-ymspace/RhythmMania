/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 *
 * Babylon scene setup: a perspective camera looking down a converging runway
 * (near judgement line at the bottom, vanishing point toward the top), ambient
 * lights, and a bloom post-process driven by babylonQuality. The camera looks
 * along the +Z axis with no roll (right = +X), which keeps the near-plane
 * visible-width math in coords/RunwayContext exact.
 */

import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import type { GameSettings } from '../../types';
import { FAR_Z, RECEPTOR_Z, SLAB_HEIGHT } from './coords';

export interface BabylonSceneBundle {
  engine: Engine;
  scene: Scene;
  camera: FreeCamera;
  pipeline: DefaultRenderingPipeline | null;
}

// Fixed camera framing keeps the Babylon runway consistent across settings.
const BASE_CAM_Y = 5.0;
const BASE_CAM_Z = -7.5;
const TARGET_Y = -0.7;
const BASE_TARGET_Z = 5.5;
const BASE_FOV = 0.9;

export class BabylonSceneFactory {
  static create(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    settings: GameSettings
  ): BabylonSceneBundle {
    const dpr = settings.limitDprToOne ? 1 : Math.min(1.5, window.devicePixelRatio || 1);

    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: false,
      stencil: false,
      adaptToDeviceRatio: false,
      antialias: true,
    });
    engine.setHardwareScalingLevel(1 / dpr);

    const scene = new Scene(engine);
    scene.clearColor = new Color4(0, 0, 0, 0);
    scene.autoClear = true;

    const camera = new FreeCamera('pfCam', new Vector3(0, BASE_CAM_Y, BASE_CAM_Z), scene);
    this.applyCamera(camera);
    camera.minZ = 0.1;
    camera.maxZ = 200;
    camera.inputs.clear();

    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.85;

    const dir = new DirectionalLight('dir', new Vector3(0.3, -1, 0.6), scene);
    dir.position = new Vector3(0, 12, -4);
    dir.intensity = 0.55;

    let pipeline: DefaultRenderingPipeline | null = null;
    const quality = settings.babylonQuality ?? 'high';
    try {
      pipeline = new DefaultRenderingPipeline('bloomPipeline', true, scene, [camera]);
      pipeline.bloomEnabled = quality !== 'low';
      if (quality === 'high') {
        pipeline.bloomWeight = 0.6;
        pipeline.bloomThreshold = 0.6;
      } else if (quality === 'medium') {
        pipeline.bloomWeight = 0.3;
        pipeline.bloomThreshold = 0.75;
      }
      pipeline.samples = quality === 'high' ? 4 : 2;
      pipeline.imageProcessingEnabled = false;
    } catch {
      pipeline = null;
    }

    // Let Babylon size the drawing buffer from the canvas CSS size + hardware scaling.
    void width;
    void height;
    try {
      engine.resize();
    } catch {}

    return { engine, scene, camera, pipeline };
  }

  static applyCamera(camera: FreeCamera): void {
    camera.position.set(0, BASE_CAM_Y, BASE_CAM_Z);
    camera.setTarget(new Vector3(0, TARGET_Y, BASE_TARGET_Z));
    camera.fov = BASE_FOV;
  }

  // Exact visible world width at the z = RECEPTOR_Z plane for this camera and aspect.
  // Valid because the camera has no roll and looks in the YZ plane (right = +X),
  // so the horizontal extent at a constant-z plane is 2 * dist * tan(fovV/2) * aspect.
  static computeNearVisibleWidth(camera: FreeCamera, aspect: number): number {
    const target = camera.getTarget();
    const pos = camera.position;
    const dirZ = target.z - pos.z;
    if (Math.abs(dirZ) < 1e-4) return 10;
    const tParam = (RECEPTOR_Z - pos.z) / dirZ;
    if (tParam <= 0) return 10;
    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    const dist = tParam * Math.sqrt(dx * dx + dy * dy + dirZ * dirZ);
    return Math.max(1, 2 * dist * Math.tan(camera.fov / 2) * aspect);
  }

  static targetY(): number {
    return TARGET_Y;
  }

  static slabHeight(): number {
    return SLAB_HEIGHT;
  }

  static farZ(): number {
    return FAR_Z;
  }
}
