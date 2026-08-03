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

import { Application, Texture } from 'pixi.js';
import { PlayfieldVisualSettings, ColumnLayout } from '../../types';
import { TextureAtlasBuilder, BakedSkinTextures } from './TextureAtlasBuilder';

export class SkinTextureCache {
  private textures: BakedSkinTextures | null = null;
  private settingsHash: string = '';

  getTextures(
    app: Application,
    columns: ColumnLayout[],
    settings: PlayfieldVisualSettings,
    isFocusMode: boolean
  ): BakedSkinTextures {
    const hash = this.calculateHash(columns, settings, isFocusMode);
    if (!this.textures || hash !== this.settingsHash) {
      this.destroy();
      this.textures = TextureAtlasBuilder.buildTextures(app, columns, settings, isFocusMode);
      this.settingsHash = hash;
    }
    return this.textures;
  }

  private calculateHash(columns: ColumnLayout[], settings: PlayfieldVisualSettings, isFocusMode: boolean): string {
    const colStr = columns.map(c => `${Math.round(c.width / 8) * 8}_${c.color}`).join('|');
    const colorsStr = settings.customSkinColors ? settings.customSkinColors.join(',') : '';
    return [
      colStr,
      settings.skinId || '',
      settings.playfieldStyle || '',
      settings.squareRenderStyle || '',
      settings.circleSize ?? '',
      settings.noteSizeMultiplier ?? '',
      settings.receptorSizeMultiplier ?? '',
      colorsStr,
      JSON.stringify(settings.receptorColorsByKeyCount || {}),
      isFocusMode ? 'focus' : 'normal'
    ].join('_');
  }

  destroy(): void {
    if (this.textures) {
      this.textures.noteHeads.forEach(t => t.destroy(true));
      this.textures.holdEnds.forEach(t => t.destroy(true));
      this.textures.receptorsPressed.forEach(t => t.destroy(true));
      this.textures.receptorsNormal.forEach(t => t.destroy(true));
      this.textures.laneGlows.forEach(t => t.destroy(true));
      this.textures = null;
    }
    this.settingsHash = '';
  }
}
