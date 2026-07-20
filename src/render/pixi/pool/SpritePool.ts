/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 */

import { Sprite, Texture } from 'pixi.js';
import { ObjectPool } from './ObjectPool';

export class SpritePool {
  private pool: ObjectPool<Sprite>;

  constructor() {
    this.pool = new ObjectPool<Sprite>(
      () => {
        const sprite = new Sprite();
        sprite.visible = false;
        return sprite;
      },
      (sprite) => {
        sprite.visible = false;
        sprite.alpha = 0;
        sprite.tint = 0xffffff;
        sprite.scale.set(1);
        sprite.position.set(0, 0);
      },
      (sprite) => {
        try {
          sprite.destroy({ children: true, texture: false });
        } catch (e) {}
      }
    );
  }

  acquire(texture?: Texture): Sprite {
    const sprite = this.pool.acquire();
    if (texture) {
      sprite.texture = texture;
    }
    sprite.visible = true;
    sprite.alpha = 1;
    return sprite;
  }

  release(sprite: Sprite): void {
    if (sprite.parent) {
      sprite.parent.removeChild(sprite);
    }
    this.pool.release(sprite);
  }

  clear(): void {
    this.pool.clear();
  }
}
