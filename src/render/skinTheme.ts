/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 */

import { PlayfieldVisualSettings, ResolvedSkin } from './types';

export function isCircleSkinMode(settings: PlayfieldVisualSettings): boolean {
  return settings.playfieldStyle === 'circle' ||
         settings.skinId === 'circles' ||
         settings.skinId === 'glassy-spheres' ||
         settings.skinId === 'hollow-rings';
}

export function resolveSkinTheme(settings: PlayfieldVisualSettings): ResolvedSkin {
  const isCircle = isCircleSkinMode(settings);
  
  let colors = {
    blue: '#2e6b9e',
    white: '#eceff1',
    accent: '#d32f2f',
    cyan: '#00b0ff'
  };

  if (settings.skinId === 'custom' && settings.customSkinColors && settings.customSkinColors.length >= 4) {
    colors = {
      blue: settings.customSkinColors[0] || '#2e6b9e',
      white: settings.customSkinColors[1] || '#eceff1',
      accent: settings.customSkinColors[2] || '#d32f2f',
      cyan: settings.customSkinColors[3] || '#00b0ff'
    };
  } else if (settings.skinId === 'classic-bar') {
    colors = {
      blue: '#00e5ff',
      white: '#ffc107',
      accent: '#f50057',
      cyan: '#00e676'
    };
  } else if (settings.skinId === 'circles') {
    colors = {
      blue: '#2979ff',
      white: '#ff4081',
      accent: '#ffeb3b',
      cyan: '#00e5ff'
    };
  } else if (settings.skinId === 'cyberpunk') {
    colors = {
      blue: '#ec4899',
      white: '#8b5cf6',
      accent: '#eab308',
      cyan: '#06b6d4'
    };
  } else if (settings.skinId === 'emerald') {
    colors = {
      blue: '#10b981',
      white: '#34d399',
      accent: '#34d399',
      cyan: '#059669'
    };
  } else if (settings.skinId === 'minimalist') {
    colors = {
      blue: '#475569',
      white: '#f8fafc',
      accent: '#cbd5e1',
      cyan: '#64748b'
    };
  } else if (settings.skinId === 'glassy-spheres') {
    colors = {
      blue: '#0284c7',
      white: '#ec4899',
      accent: '#eab308',
      cyan: '#06b6d4'
    };
  } else if (settings.skinId === 'hollow-rings') {
    colors = {
      blue: '#3b82f6',
      white: '#c084fc',
      accent: '#f43f5e',
      cyan: '#14b8a6'
    };
  }

  const customHoldColor = (settings.skinId === 'custom' && settings.customSkinColors && settings.customSkinColors[4])
    ? settings.customSkinColors[4]
    : '#38bdf8';

  return {
    isCircleMode: isCircle,
    colors,
    customHoldColor
  };
}
