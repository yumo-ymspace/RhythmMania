/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 */

import { Container, Texture, Sprite } from 'pixi.js';
import { PlayfieldFrame } from '../../types';
import { SpritePool } from '../pool/SpritePool';

let whiteCircleTexture: Texture | null = null;

function getWhiteCircleTexture(): Texture {
  if (!whiteCircleTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(16, 16, 16, 0, Math.PI * 2);
    ctx.fill();
    whiteCircleTexture = Texture.from(canvas);
  }
  return whiteCircleTexture;
}

export class ParticleLayer extends Container {
  private pool: SpritePool;
  private activeSprites: Sprite[] = [];

  constructor() {
    super();
    this.pool = new SpritePool();
  }

  update(frame: PlayfieldFrame): void {
    const { particles, settingsSlice } = frame;

    if (settingsSlice.disableParticles || particles.length === 0) {
      this.activeSprites.forEach((sp) => {
        sp.visible = false;
        this.pool.release(sp);
      });
      this.activeSprites = [];
      return;
    }

    const tex = getWhiteCircleTexture();
    const neededCount = particles.length;

    // Grow or shrink activeSprites to match neededCount
    while (this.activeSprites.length < neededCount) {
      const sp = this.pool.acquire(tex);
      this.addChild(sp);
      this.activeSprites.push(sp);
    }

    while (this.activeSprites.length > neededCount) {
      const sp = this.activeSprites.pop()!;
      sp.visible = false;
      this.pool.release(sp);
    }

    // Update all active sprites in place
    for (let i = 0; i < neededCount; i++) {
      const p = particles[i];
      const sp = this.activeSprites[i];

      sp.visible = true;
      sp.x = p.x;
      sp.y = p.y;
      sp.anchor.set(0.5);
      sp.scale.set(p.size / 16);
      sp.alpha = p.alpha;
      
      try {
        sp.tint = p.color;
      } catch (e) {
        sp.tint = 0xffffff;
      }
    }
  }

  destroy(options?: any): void {
    this.activeSprites.forEach((sp) => {
      this.pool.release(sp);
    });
    this.activeSprites = [];
    this.pool.clear();
    super.destroy(options);
  }
}
