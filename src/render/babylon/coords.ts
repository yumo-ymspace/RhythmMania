/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 *
 * Babylon runway coordinate math. The shared 2D vertical-scroll PlayfieldFrame
 * is reinterpreted as a converging 3D runway: notes fly from depth (far,
 * vanishing point) toward a near judgement line (receptor), then past the
 * camera. Lane centers/boundaries converge toward x = 0 at the far end.
 *
 * Depth mapping uses the SIGNED distance from the receptor so notes that pass
 * the receptor continue toward (and past) the camera instead of reversing.
 * Babylon locks upsurfaceNoteMode to false, so notes always approach from
 * y = 0 (top of screen, far) to y = receptorY (near).
 */

import { Vector3 } from '@babylonjs/core/Maths/math.vector';

export const FAR_Z = 18;
export const NEAR_Z = 0;
export const RECEPTOR_Z = -1;
export const FLOOR_NEAR_Z = -3;
export const FLOOR_FAR_Z = 28;
export const SLAB_HEIGHT = 0.12;
export const RUNWAY_CONVERGENCE = 0.4;

export function safeHex(hex: string | undefined, fallback = '#00b0ff'): string {
  if (!hex || typeof hex !== 'string') return fallback;
  if (hex.startsWith('#') && (hex.length === 7 || hex.length === 4)) return hex;
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex}`;
  return fallback;
}

// Convergence factor controls how aggressively
// lanes narrow toward the vanishing point. converge(0)=1 (full near width),
// converge(1)=max(0, 1-cf) (lanes meet at the vanishing point, never crossing).
export function converge(depthFactor: number, convergenceFactor: number): number {
  return Math.max(0, 1 - depthFactor * convergenceFactor);
}

// Lane center X at the near plane (depth 0), in world units. nearWidth is the
// world width of the full playfield at the near plane (derived from the camera
// projection so playfieldWidthPercent is honored regardless of screen size).
export function laneToNearX(column: number, keyCount: number, nearWidth: number): number {
  const laneWidth = nearWidth / keyCount;
  return -nearWidth / 2 + laneWidth * (column + 0.5);
}

export function laneBoundaryNearX(boundaryIndex: number, keyCount: number, nearWidth: number): number {
  const laneWidth = nearWidth / keyCount;
  return -nearWidth / 2 + laneWidth * boundaryIndex;
}

// World width of one lane at a given depth factor (tapers toward the vanishing
// point). Used to size hold bodies / tail caps so they follow the converging lane.
export function laneWidthAt(
  depthFactor: number,
  convergenceFactor: number,
  nearWidth: number,
  keyCount: number
): number {
  return (nearWidth / keyCount) * converge(depthFactor, convergenceFactor);
}

// Signed depth factor: 0 at the receptor, 1 at the top of the screen (far),
// negative for notes past the receptor (they continue toward the camera).
// maxTravel is the on-screen pixel distance from the top (y=0) to the receptor.
export function yToDepthFactor(y: number, receptorY: number): number {
  const maxTravel = Math.max(1, receptorY);
  return (receptorY - y) / maxTravel;
}

// World position of a lane center at a given depth factor.
export function runwayPosition(
  column: number,
  keyCount: number,
  depthFactor: number,
  convergenceFactor: number,
  nearWidth: number
): Vector3 {
  const nearX = laneToNearX(column, keyCount, nearWidth);
  const x = nearX * converge(depthFactor, convergenceFactor);
  const z = RECEPTOR_Z + (FAR_Z - RECEPTOR_Z) * depthFactor;
  return new Vector3(x, SLAB_HEIGHT, z);
}

// World position of a lane boundary at a given depth factor (for separators).
export function runwayBoundary(
  boundaryIndex: number,
  keyCount: number,
  depthFactor: number,
  convergenceFactor: number,
  nearWidth: number
): Vector3 {
  const nearBX = laneBoundaryNearX(boundaryIndex, keyCount, nearWidth);
  const x = nearBX * converge(depthFactor, convergenceFactor);
  const z = RECEPTOR_Z + (FAR_Z - RECEPTOR_Z) * depthFactor;
  return new Vector3(x, SLAB_HEIGHT, z);
}
