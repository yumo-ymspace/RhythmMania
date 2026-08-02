import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';
import type { PlayfieldFrame } from '../../types';
import type { RunwayContext } from '../BabylonPlayfieldRenderer';
import { NEAR_Z, SLAB_HEIGHT, safeHex } from '../coords';

export class ParticleLayer {
  private pool: Mesh[] = [];
  private active: Mesh[] = [];

  constructor(private readonly scene: Scene) {}

  private acquire(): Mesh {
    const mesh = this.pool[this.active.length] ?? MeshBuilder.CreatePlane(`particle_${this.pool.length}`, { width: 1, height: 1 }, this.scene);
    if (this.pool.indexOf(mesh) < 0) {
      mesh.billboardMode = 7;
      mesh.isPickable = false;
      const material = new StandardMaterial(`particleMat_${this.pool.length}`, this.scene);
      material.disableLighting = true;
      material.backFaceCulling = false;
      mesh.material = material;
      this.pool.push(mesh);
    }
    mesh.setEnabled(true);
    this.active.push(mesh);
    return mesh;
  }

  update(frame: PlayfieldFrame, ctx: RunwayContext): void {
    this.active.forEach((mesh) => mesh.setEnabled(false));
    this.active = [];
    if (frame.settingsSlice.disableParticles || frame.particles.length === 0) return;

    const multiplier = ctx.quality === 'low' ? 0.5 : ctx.quality === 'medium' ? 0.75 : 1;
    const max = Math.min(frame.particles.length, ctx.quality === 'low' ? 40 : 80);
    for (let i = 0; i < max; i++) {
      if (Math.random() > multiplier) continue;
      const particle = frame.particles[i];
      const mesh = this.acquire();
      const material = mesh.material as StandardMaterial;
      const x = ((particle.x / Math.max(1, frame.width)) - 0.5) * ctx.nearWidth;
      const y = SLAB_HEIGHT + 0.16 + particle.size * 0.006;
      mesh.position.set(x, y, NEAR_Z + 0.18);
      const size = Math.max(0.035, particle.size * 0.018);
      mesh.scaling.setAll(size);
      material.emissiveColor = Color3.FromHexString(safeHex(particle.color, '#22d3ee'));
      material.alpha = Math.max(0, Math.min(1, particle.alpha));
    }
  }

  dispose(): void {
    this.pool.forEach((mesh) => mesh.dispose());
    this.pool = [];
    this.active = [];
  }
}
