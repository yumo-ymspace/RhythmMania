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

export const HANDLE_REGEX = /^[a-z][a-z0-9_]{2,19}$/;
export const MAX_BIO_LENGTH = 500;
export const MAX_DISPLAY_NAME_LENGTH = 32;
export const MAX_ACTIVITY_MESSAGE_LENGTH = 80;
export const PROFILE_ACTIVITY_STATUSES = new Set(['playing', 'practicing', 'mapping', 'away', 'offline', 'custom']);

export const RESERVED_HANDLES = new Set([
  'me', 'edit', 'settings', 'api', 'auth', 'profile', 'profiles',
  'play', 'select', 'menu', 'results', 'history', 'replay', 'replays',
  'tos', 'privacypolicy', 'admin', 'mod', 'moderator', 'about', 'help',
  'login', 'logout', 'register', 'signup', 'signin', 'callback',
  'beatmaps', 'beatmap', 'songs', 'catalog', 'upload', 'download',
  'avatars', 'avatar', 'sw', 'service-worker', 'assets',
]);

export function isValidHandle(value: unknown): value is string {
  return typeof value === 'string' && HANDLE_REGEX.test(value);
}

const ALLOWED_SOCIAL_KEYS = new Set(['youtube', 'twitter', 'discord', 'website']);

export function sanitizeSocialLinks(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const links = raw as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const key of ALLOWED_SOCIAL_KEYS) {
    const val = links[key];
    if (typeof val !== 'string') continue;
    const trimmed = val.trim();
    if (!trimmed || trimmed.length > 256 || /[\u0000-\u001f\u007f]/.test(trimmed)) continue;
    try {
      const url = new URL(trimmed);
      if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) continue;
      result[key] = trimmed;
    } catch {
      // Invalid and protocol-relative values are not profile links.
    }
  }
  return result;
}

export function sanitizeActivityStatus(raw: unknown): 'playing' | 'practicing' | 'mapping' | 'away' | 'offline' | 'custom' {
  return typeof raw === 'string' && PROFILE_ACTIVITY_STATUSES.has(raw)
    ? raw as 'playing' | 'practicing' | 'mapping' | 'away' | 'offline' | 'custom'
    : 'offline';
}

export function sanitizeActivityMessage(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, MAX_ACTIVITY_MESSAGE_LENGTH) : '';
}
