/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 *
 * Railroad-track lane separators: one thin box per lane boundary, rotated and
 * scaled so it spans from its near-plane X (depth 0) to its converged X at the
 * vanishing point (depth 1). Geometry is only recomputed when the layout key
 * (keyCount + nearWidth + perspective) changes.
 */

import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { PlayfieldFrame } from '../../types';
import type { RunwayContext } from '../BabylonPlayfieldRenderer';
import { runwayBoundary, FAR_Z, NEAR_Z, SLAB_HEIGHT, RUNWAY_CONVERGENCE, safeHex } from '../coords';

export class LaneLayer {
  private separatorMeshes: Mesh[] = [];
  private separatorMats: StandardMaterial[] = [];
  private scene: Scene;
  private layoutKey = '';

  constructor(scene: Scene) {
    this.scene = scene;
  }

  private ensure(count: number): void {
    while (this.separatorMeshes.length < count) {
      const i = this.separatorMeshes.length;
      const mesh = MeshBuilder.CreateBox(`sep_${i}`, { width: 0.04, height: 0.02, depth: 1 }, this.scene);
      mesh.isPickable = false;
      const mat = new StandardMaterial(`sepMat_${i}`, this.scene);
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      mesh.material = mat;
      this.separatorMeshes.push(mesh);
      this.separatorMats.push(mat);
    }
    for (let i = 0; i < this.separatorMeshes.length; i++) {
      this.separatorMeshes[i].setEnabled(i < count);
    }
  }

  update(frame: PlayfieldFrame, ctx: RunwayContext): void {
    const keyCount = ctx.keyCount;
    const boundaryCount = keyCount + 1;
    this.ensure(boundaryCount);

    const opacity = frame.settingsSlice.laneSeparatorOpacity ?? 0.30;
    const key = `${keyCount}|${ctx.nearWidth.toFixed(3)}`;
    const layoutChanged = key !== this.layoutKey;
    if (layoutChanged) this.layoutKey = key;

    const color = Color3.FromHexString(safeHex('#ffffff')).scale(0.4);

    for (let i = 0; i < boundaryCount; i++) {
      const mesh = this.separatorMeshes[i];
      const mat = this.separatorMats[i];

      if (layoutChanged) {
        const near = runwayBoundary(i, keyCount, 0, RUNWAY_CONVERGENCE, ctx.nearWidth);
        const far = runwayBoundary(i, keyCount, 1, RUNWAY_CONVERGENCE, ctx.nearWidth);
        const dx = far.x - near.x;
        const dz = far.z - near.z;
        const len = Math.max(0.1, Math.sqrt(dx * dx + dz * dz));
        mesh.position.set((near.x + far.x) / 2, SLAB_HEIGHT + 0.002, (near.z + far.z) / 2);
        mesh.scaling.set(1, 1, len);
        mesh.rotation.y = Math.atan2(dx, dz);
      }

      mat.emissiveColor = color;
      mat.alpha = opacity;
    }

    // Hide any excess pooled separators (e.g. after keyCount dropped).
    for (let i = boundaryCount; i < this.separatorMeshes.length; i++) {
      this.separatorMeshes[i].setEnabled(false);
    }
    void NEAR_Z;
    void FAR_Z;
  }

  dispose(): void {
    this.separatorMeshes.forEach((m) => m.dispose());
    this.separatorMats.forEach((m) => m.dispose());
    this.separatorMeshes = [];
    this.separatorMats = [];
    this.layoutKey = '';
  }
}
