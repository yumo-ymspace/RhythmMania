/*
 * Tapered hold bodies for the Babylon runway.
 */

import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { PlayfieldFrame } from '../../types';
import type { RunwayContext } from '../BabylonPlayfieldRenderer';
import { laneWidthAt, runwayPosition, RUNWAY_CONVERGENCE, safeHex, yToDepthFactor } from '../coords';

const MAX_FRUSTUMS = 64;
const POSITION_KIND = 'position';

type HoldMesh = Mesh & { holdPositions?: Float32Array };

export class HoldLayer {
  private pool: HoldMesh[] = [];
  private free: HoldMesh[] = [];
  private active = new Map<string, HoldMesh>();

  constructor(private readonly scene: Scene) {}

  private acquire(key: string): HoldMesh {
    const existing = this.active.get(key);
    if (existing) return existing;

    let mesh = this.free.pop();
    if (!mesh && this.pool.length < MAX_FRUSTUMS) {
      mesh = new Mesh(`hold_${this.pool.length}`, this.scene) as HoldMesh;
      mesh.isPickable = false;
      const material = new StandardMaterial(`holdMat_${this.pool.length}`, this.scene);
      material.disableLighting = true;
      material.backFaceCulling = false;
      mesh.material = material;

      const data = new VertexData();
      const positions = new Float32Array(24);
      data.positions = positions;
      data.indices = [
        0, 1, 5, 0, 5, 4,
        2, 3, 7, 2, 7, 6,
        0, 1, 3, 0, 3, 2,
        4, 5, 7, 4, 7, 6,
        0, 2, 6, 0, 6, 4,
        1, 3, 7, 1, 7, 5,
      ];
      data.applyToMesh(mesh, true);
      mesh.holdPositions = positions;
      this.pool.push(mesh);
    }

    // More than 64 simultaneous holds is exceptional. Reuse the first mesh
    // rather than allocating unbounded geometry; normal maps never approach it.
    if (!mesh) mesh = this.pool[0];
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
    const noteOpacity = settingsSlice.noteOpacity ?? 1;

    for (const note of notes) {
      if (note.type !== 'hold' || note.endY === undefined) continue;
      const column = columns[note.column];
      if (!column) continue;

      const key = note.id;
      keep.add(key);
      const mesh = this.acquire(key);
      const material = mesh.material as StandardMaterial;

      // An engaged hold is anchored at the receptor. A missed head is clamped
      // to the near plane because the portion behind the camera is invisible.
      const headY = note.isHit ? receptorY : note.y;
      const headDepth = Math.max(0, Math.min(1.5, yToDepthFactor(headY, receptorY)));
      const tailDepth = Math.max(0, Math.min(1.5, yToDepthFactor(note.endY, receptorY)));
      const head = runwayPosition(note.column, ctx.keyCount, headDepth, RUNWAY_CONVERGENCE, ctx.nearWidth);
      const tail = runwayPosition(note.column, ctx.keyCount, tailDepth, RUNWAY_CONVERGENCE, ctx.nearWidth);

      const headHalfWidth = ctx.laneWidthNear * 0.82 * 0.40;
      const tailHalfWidth = Math.max(
        0.04,
        laneWidthAt(tailDepth, RUNWAY_CONVERGENCE, ctx.nearWidth, ctx.keyCount) * 0.40
      );
      const yBottom = 0.07;
      const yTop = 0.17;
      const positions = mesh.holdPositions;
      if (positions) {
        positions.set([
          head.x - headHalfWidth, yBottom, head.z,
          head.x + headHalfWidth, yBottom, head.z,
          head.x - headHalfWidth, yTop, head.z,
          head.x + headHalfWidth, yTop, head.z,
          tail.x - tailHalfWidth, yBottom, tail.z,
          tail.x + tailHalfWidth, yBottom, tail.z,
          tail.x - tailHalfWidth, yTop, tail.z,
          tail.x + tailHalfWidth, yTop, tail.z,
        ]);
        mesh.updateVerticesData(POSITION_KIND, positions, false, false);
      }

      let alpha = note.opacity * noteOpacity * 0.62;
      if (note.isHoldFailed) alpha *= 0.35;
      material.emissiveColor = Color3.FromHexString(safeHex(column.color)).scale(0.7);
      material.alpha = alpha;
    }

    this.releaseUnused(keep);
  }

  dispose(): void {
    this.pool.forEach((mesh) => mesh.dispose());
    this.pool = [];
    this.free = [];
    this.active.clear();
  }
}
