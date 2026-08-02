/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 *
 * Glowing note slabs for normal notes and hold heads/tails. Slabs have a
 * scale with the lane width at their depth so they track the converging
 * separators. Hold heads use the same slab as normal notes; hold tails cap
 * the tapered body (HoldLayer) and scale with the lane width at the tail's
 * depth. Signed depth lets late notes fly past the camera naturally.
 */

import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { PlayfieldFrame } from '../../types';
import type { RunwayContext } from '../BabylonPlayfieldRenderer';
import { runwayPosition, laneWidthAt, yToDepthFactor, RUNWAY_CONVERGENCE, safeHex } from '../coords';

const NOTE_WIDTH_FRAC = 0.82;   // fraction of near-plane lane width
const TAIL_MIN_WIDTH = 0.12;    // keep far tail caps visible

export class NoteLayer {
  private pool: Mesh[] = [];
  private free: Mesh[] = [];
  private active = new Map<string, Mesh>();
  private scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  private acquire(key: string): Mesh {
    let mesh = this.active.get(key);
    if (mesh) return mesh;
    mesh = this.free.pop();
    if (!mesh) {
      mesh = MeshBuilder.CreateBox(`note_${this.pool.length}`, { width: 1, height: 1, depth: 1 }, this.scene);
      mesh.isPickable = false;
      const mat = new StandardMaterial(`noteMat_${this.pool.length}`, this.scene);
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      mesh.material = mat;
      this.pool.push(mesh);
    }
    mesh.setEnabled(true);
    this.active.set(key, mesh);
    return mesh;
  }

  private releaseUnused(keep: Set<string>): void {
    for (const [key, mesh] of this.active) {
      if (!keep.has(key)) {
        mesh.setEnabled(false);
        this.free.push(mesh);
        this.active.delete(key);
      }
    }
  }

  update(frame: PlayfieldFrame, ctx: RunwayContext): void {
    const { notes, columns, receptorY, settingsSlice } = frame;
    const keep = new Set<string>();
    const noteOp = settingsSlice.noteOpacity ?? 1;
    for (const n of notes) {
      const col = columns[n.column];
      if (!col) continue;

      // Head: normal notes, and hold heads that are still approaching.
      const shouldDrawHead = n.type === 'normal' || (n.type === 'hold' && !n.isHit && !n.isMissed);
      if (shouldDrawHead) {
        const key = `${n.id}_h`;
        keep.add(key);
        const mesh = this.acquire(key);
        const mat = mesh.material as StandardMaterial;

        const depthFactor = yToDepthFactor(n.y, receptorY);
        const pos = runwayPosition(n.column, ctx.keyCount, depthFactor, RUNWAY_CONVERGENCE, ctx.nearWidth);
        const headWidth = laneWidthAt(depthFactor, RUNWAY_CONVERGENCE, ctx.nearWidth, ctx.keyCount) * NOTE_WIDTH_FRAC;

        mesh.position.copyFrom(pos);
        mesh.scaling.set(headWidth, 0.22, 0.18);
        mesh.rotation.set(0, 0, 0);

        let alpha = n.opacity * noteOp;
        if (n.type === 'hold' && n.isHoldFailed) alpha *= 0.35;
        mat.emissiveColor = Color3.FromHexString(safeHex(col.color));
        mat.alpha = alpha;
      }

      // Tail cap for holds (scales with the converged lane width at the tail depth).
      if (n.type === 'hold' && n.endY !== undefined && !n.isReleased && !n.isHoldFailed) {
        const key = `${n.id}_e`;
        keep.add(key);
        const mesh = this.acquire(key);
        const mat = mesh.material as StandardMaterial;

        const depthFactor = yToDepthFactor(n.endY, receptorY);
        const pos = runwayPosition(n.column, ctx.keyCount, depthFactor, RUNWAY_CONVERGENCE, ctx.nearWidth);
        const tailW = Math.max(
          TAIL_MIN_WIDTH,
          laneWidthAt(Math.max(0, depthFactor), RUNWAY_CONVERGENCE, ctx.nearWidth, ctx.keyCount) * NOTE_WIDTH_FRAC
        );

        mesh.position.copyFrom(pos);
        mesh.scaling.set(tailW, 0.16, 0.14);
        mesh.rotation.set(0, 0, 0);

        let alpha = (n.endOpacity ?? n.opacity) * noteOp;
        if (n.isHoldFailed) alpha *= 0.35;
        mat.emissiveColor = Color3.FromHexString(safeHex(col.color)).scale(0.9);
        mat.alpha = alpha;
      }
    }

    this.releaseUnused(keep);
  }

  dispose(): void {
    this.pool.forEach((m) => m.dispose());
    this.pool = [];
    this.free = [];
    this.active.clear();
  }
}
