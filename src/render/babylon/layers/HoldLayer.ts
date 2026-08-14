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
 * Tapered hold bodies for the Babylon runway.
 */

import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Constants } from '@babylonjs/core/Engines/constants';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { PlayfieldFrame } from '../../types';
import type { RunwayContext } from '../BabylonPlayfieldRenderer';
import { clampNoteDepth, laneWidthAt, runwayPosition, RUNWAY_CONVERGENCE, safeColorAlpha, safeHex, yToDepthFactor } from '../coords';
import { isHoldBodyAnchored } from '../../noteState';
import { mergeVisibleTailSegments } from '../../tailSegments';

const MAX_FRUSTUMS = 128;
const POSITION_KIND = 'position';
const NOTE_WIDTH_FRAC = 0.82;

type HoldMesh = Mesh & { holdPositions?: Float32Array };

export class HoldLayer {
  private pool: HoldMesh[] = [];
  private free: HoldMesh[] = [];
  private active = new Map<string, HoldMesh>();

  constructor(private readonly scene: Scene) {}

  private acquire(key: string): HoldMesh | null {
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
         0, 2, 6, 0, 6, 4,
         1, 3, 7, 1, 7, 5,
       ];
      data.applyToMesh(mesh, true);
      mesh.holdPositions = positions;
      this.pool.push(mesh);
    }

    // Excess visuals are skipped. Reusing an active mesh would make two note
    // IDs mutate the same geometry and corrupt the free list on release.
    if (!mesh) return null;
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

    const updateSegment = (
      key: string,
      columnIndex: number,
      headY: number,
      tailY: number,
      color: string,
      alpha: number,
      inFrontOfReceptor = false,
    ): void => {
      const mesh = this.acquire(key);
      if (!mesh) return;
      keep.add(key);
      mesh.renderingGroupId = inFrontOfReceptor ? 2 : 0;
      const material = mesh.material as StandardMaterial;
      material.depthFunction = inFrontOfReceptor ? Constants.ALWAYS : Constants.LESS;
      material.disableDepthWrite = inFrontOfReceptor;

      const headDepth = clampNoteDepth(yToDepthFactor(headY, receptorY));
      const tailDepth = clampNoteDepth(yToDepthFactor(tailY, receptorY));
      const head = runwayPosition(columnIndex, ctx.keyCount, headDepth, RUNWAY_CONVERGENCE, ctx.nearWidth);
      const tail = runwayPosition(columnIndex, ctx.keyCount, tailDepth, RUNWAY_CONVERGENCE, ctx.nearWidth);
      const noteScale = settingsSlice.noteSizeMultiplier ?? 1;
      const headHalfWidth = laneWidthAt(headDepth, RUNWAY_CONVERGENCE, ctx.nearWidth, ctx.keyCount) * NOTE_WIDTH_FRAC * noteScale * 0.5;
      const tailHalfWidth = laneWidthAt(tailDepth, RUNWAY_CONVERGENCE, ctx.nearWidth, ctx.keyCount) * NOTE_WIDTH_FRAC * noteScale * 0.5;
      const positions = mesh.holdPositions;
      if (positions) {
        positions.set([
          head.x - headHalfWidth, 0.07, head.z,
          head.x + headHalfWidth, 0.07, head.z,
          head.x - headHalfWidth, 0.17, head.z,
          head.x + headHalfWidth, 0.17, head.z,
          tail.x - tailHalfWidth, 0.07, tail.z,
          tail.x + tailHalfWidth, 0.07, tail.z,
          tail.x - tailHalfWidth, 0.17, tail.z,
          tail.x + tailHalfWidth, 0.17, tail.z,
        ]);
        mesh.updateVerticesData(POSITION_KIND, positions, false, false);
      }

      material.emissiveColor = Color3.FromHexString(safeHex(color)).scale(0.7);
      material.alpha = alpha;
    };

    for (const note of notes) {
      if (note.type !== 'hold' || note.endY === undefined) continue;
      const column = columns[note.column];
      if (!column) continue;

      const holdColor = settingsSlice.receptorColorsByKeyCount?.[ctx.keyCount]?.[note.column] || column.color;
      let alpha = note.opacity * safeColorAlpha(holdColor) * 0.62;
      if (note.isHoldFailed) alpha *= 0.35;
      const bodySegments = note.tailSegments || [{
        startY: isHoldBodyAnchored(note) ? receptorY : (note.bodyStartY ?? note.y),
        endY: note.endY,
      }];
      const segments = note.holdRulesVersion === 2
        ? mergeVisibleTailSegments([...bodySegments, ...(note.missedTailSegments || [])])
        : bodySegments;
      segments.forEach((segment, index) => updateSegment(`${note.id}_body_${index}`, note.column, segment.startY, segment.endY, holdColor, alpha));
      if (note.endpointTailSegment) {
        updateSegment(
          `${note.id}_endpoint_tail`,
          note.column,
          note.endpointTailSegment.startY,
          note.endpointTailSegment.endY,
          holdColor,
          alpha,
          true,
        );
      }

      if (note.hitSegmentStartY !== undefined && note.hitSegmentEndY !== undefined) {
        const hitAlpha = note.opacity * safeColorAlpha(holdColor) * 0.9;
        updateSegment(`${note.id}_hit`, note.column, note.hitSegmentStartY, note.hitSegmentEndY, holdColor, hitAlpha);
      }
    }

    this.releaseUnused(keep);
  }

  dispose(): void {
    this.pool.forEach((mesh) => mesh.dispose(false, true));
    this.pool = [];
    this.free = [];
    this.active.clear();
  }
}
