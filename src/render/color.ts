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
 * Renderer-neutral CSS color parsing for the whitelisted skin color forms.
 */

export interface NormalizedColor {
  r: number;
  g: number;
  b: number;
  alpha: number;
}

const NAMED_COLORS: Record<string, [number, number, number]> = {
  red: [255, 0, 0],
  blue: [0, 0, 255],
  green: [0, 128, 0],
  yellow: [255, 255, 0],
  purple: [128, 0, 128],
  orange: [255, 165, 0],
  pink: [255, 192, 203],
  white: [255, 255, 255],
  black: [0, 0, 0],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  cyan: [0, 255, 255],
  magenta: [255, 0, 255],
  transparent: [0, 0, 0],
};

const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));
const clampAlpha = (value: number): number => Math.max(0, Math.min(1, value));

export function parseCssColor(value: string | undefined, fallback = '#ffffff'): NormalizedColor {
  const source = typeof value === 'string' ? value.trim() : '';
  const hex = source.replace(/^#/, '');
  if (/^[0-9a-fA-F]{3,4}$/.test(hex) || /^[0-9a-fA-F]{6}$/.test(hex) || /^[0-9a-fA-F]{8}$/.test(hex)) {
    const expanded = hex.length <= 4
      ? hex.split('').map((part) => part + part).join('')
      : hex;
    return {
      r: parseInt(expanded.slice(0, 2), 16),
      g: parseInt(expanded.slice(2, 4), 16),
      b: parseInt(expanded.slice(4, 6), 16),
      alpha: expanded.length === 8 ? parseInt(expanded.slice(6, 8), 16) / 255 : 1,
    };
  }

  const rgb = source.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\s*\)$/i);
  if (rgb) {
    return {
      r: clampByte(Number(rgb[1])),
      g: clampByte(Number(rgb[2])),
      b: clampByte(Number(rgb[3])),
      alpha: rgb[4] === undefined ? 1 : clampAlpha(Number(rgb[4])),
    };
  }

  const named = NAMED_COLORS[source.toLowerCase()];
  if (named) {
    return { r: named[0], g: named[1], b: named[2], alpha: source.toLowerCase() === 'transparent' ? 0 : 1 };
  }

  if (source !== fallback) return parseCssColor(fallback, '#ffffff');
  return { r: 255, g: 255, b: 255, alpha: 1 };
}

export function cssColorToHex(value: string | undefined, fallback = '#ffffff'): string {
  const color = parseCssColor(value, fallback);
  return `#${[color.r, color.g, color.b].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

export function cssColorAlpha(value: string | undefined, fallback = '#ffffff'): number {
  return parseCssColor(value, fallback).alpha;
}

export function hexToRgba(value: string | undefined, alpha: number): string {
  const color = parseCssColor(value);
  return `rgba(${color.r},${color.g},${color.b},${clampAlpha(color.alpha * alpha)})`;
}

export function applyCssAlpha(value: string | undefined, alpha: number): string {
  return hexToRgba(value, alpha);
}
