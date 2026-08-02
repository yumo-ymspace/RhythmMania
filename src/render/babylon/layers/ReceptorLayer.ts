import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { PlayfieldFrame } from '../../types';
import type { RunwayContext } from '../BabylonPlayfieldRenderer';
import { RECEPTOR_Z, SLAB_HEIGHT, safeHex } from '../coords';

export class ReceptorLayer {
  private line: Mesh | null = null;
  private lineMat: StandardMaterial | null = null;
  private segments: Mesh[] = [];
  private segmentMats: StandardMaterial[] = [];

  constructor(private readonly scene: Scene) {}

  private ensureSegments(count: number): void {
    while (this.segments.length < count) {
      const index = this.segments.length;
      const mesh = MeshBuilder.CreateBox(`receptorGlow_${index}`, { width: 1, height: 0.07, depth: 0.12 }, this.scene);
      const material = new StandardMaterial(`receptorGlowMat_${index}`, this.scene);
      material.disableLighting = true;
      material.backFaceCulling = false;
      mesh.material = material;
      mesh.isPickable = false;
      this.segments.push(mesh);
      this.segmentMats.push(material);
    }
  }

  update(frame: PlayfieldFrame, ctx: RunwayContext): void {
    if (!this.line) {
      this.line = MeshBuilder.CreateBox('receptorLine', { width: 1, height: 0.06, depth: 0.12 }, this.scene);
      this.line.isPickable = false;
      this.lineMat = new StandardMaterial('receptorLineMat', this.scene);
      this.lineMat.disableLighting = true;
      this.lineMat.backFaceCulling = false;
      this.line.material = this.lineMat;
    }

    const opacity = frame.settingsSlice.receptorOpacity ?? 1;
    this.line.scaling.set(ctx.nearWidth, 1, 1);
    this.line.position.set(0, SLAB_HEIGHT, RECEPTOR_Z + 0.04);
    this.lineMat!.emissiveColor = Color3.FromHexString(safeHex('#ffffff')).scale(0.85);
    this.lineMat!.alpha = opacity * 0.9;

    this.ensureSegments(ctx.keyCount);
    const laneWidth = ctx.laneWidthNear;
    for (let i = 0; i < this.segments.length; i++) {
      const enabled = i < ctx.keyCount;
      const segment = this.segments[i];
      segment.setEnabled(enabled);
      if (!enabled) continue;
      const column = frame.columns[i];
      const glow = column?.glow ?? 0;
      segment.position.set(-ctx.nearWidth / 2 + laneWidth * (i + 0.5), SLAB_HEIGHT + 0.01, RECEPTOR_Z + 0.05);
      segment.scaling.set(laneWidth * 0.86, 1, 1);
      const color = Color3.FromHexString(safeHex(column?.color, '#22d3ee'));
      this.segmentMats[i].emissiveColor = color.scale(0.8 + glow * 1.2);
      this.segmentMats[i].alpha = opacity * Math.min(1, 0.18 + glow * 0.82 + (column?.pressed ? 0.2 : 0));
    }
  }

  dispose(): void {
    this.line?.dispose();
    this.lineMat?.dispose();
    this.segments.forEach((mesh) => mesh.dispose());
    this.segmentMats.forEach((material) => material.dispose());
    this.line = null;
    this.lineMat = null;
    this.segments = [];
    this.segmentMats = [];
  }
}
