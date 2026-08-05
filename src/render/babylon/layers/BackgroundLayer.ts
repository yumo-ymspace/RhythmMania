/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 *
 * Ambient-only background: a dark matte runway floor that spans the playfield
 * width and the runway depth. The DOM bg image/video shows through the
 * transparent Babylon canvas, so no 3D bg plane is projected here. Floor
 * visibility is toggled by babylonFloor.
 */

import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { PlayfieldFrame } from '../../types';
import type { RunwayContext } from '../BabylonPlayfieldRenderer';
import { FAR_Z, FLOOR_FAR_Z, FLOOR_NEAR_Z, RECEPTOR_Z, RUNWAY_CONVERGENCE } from '../coords';

export class BackgroundLayer {
  private floor: Mesh | null = null;
  private floorMat: StandardMaterial | null = null;
  private scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  private ensureFloor(): void {
    if (this.floor) return;
    // Base unit ground; scaled each frame to the current nearWidth (aspect-driven).
     this.floor = MeshBuilder.CreateGround('runwayFloor', { width: 1, height: 1, subdivisions: 1 }, this.scene);
     this.floor.isPickable = false;
     this.floor.renderingGroupId = 0;
    this.floor.position.set(0, 0, FAR_Z / 2);
    this.floorMat = new StandardMaterial('floorMat', this.scene);
    this.floorMat.disableLighting = true;
    this.floorMat.emissiveColor = new Color3(0.05, 0.06, 0.09);
    this.floorMat.alpha = 0.9;
    this.floorMat.backFaceCulling = false;
    this.floor.material = this.floorMat;
  }

  update(_frame: PlayfieldFrame, ctx: RunwayContext): void {
    if (ctx.floor) {
      this.ensureFloor();
      if (this.floor) {
        this.floor.setEnabled(true);
         const nearHalf = ctx.nearWidth / 2;
         const backDepth = (FLOOR_FAR_Z - RECEPTOR_Z) / (FAR_Z - RECEPTOR_Z);
         const farHalf = nearHalf * (1 - RUNWAY_CONVERGENCE);
         const backHalf = nearHalf * Math.max(0, 1 - backDepth * RUNWAY_CONVERGENCE);
        const vertices = new VertexData();
        vertices.positions = [
          -nearHalf, 0, FLOOR_NEAR_Z,
          nearHalf, 0, FLOOR_NEAR_Z,
          nearHalf, 0, RECEPTOR_Z,
           farHalf, 0, FAR_Z,
           backHalf, 0, FLOOR_FAR_Z,
           -backHalf, 0, FLOOR_FAR_Z,
           -farHalf, 0, FAR_Z,
          -nearHalf, 0, RECEPTOR_Z,
        ];
        vertices.indices = [
          0, 1, 2,  0, 2, 7,
          2, 3, 6,  2, 6, 7,
          3, 4, 5,  3, 5, 6,
        ];
        vertices.applyToMesh(this.floor, true);
        this.floor.scaling.set(1, 1, 1);
        this.floor.position.z = 0;
      }
    } else if (this.floor) {
      this.floor.setEnabled(false);
    }
  }

  dispose(): void {
    if (this.floor) {
      this.floor.dispose();
      this.floor = null;
    }
    if (this.floorMat) {
      this.floorMat.dispose();
      this.floorMat = null;
    }
  }
}
