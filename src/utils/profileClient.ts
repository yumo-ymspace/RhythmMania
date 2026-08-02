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

import type { ProfileActivityStatus, ProfileEditData, ProfileSocialLinks } from '../types';

export interface MyProfileResponse {
  user: {
    id: string;
    username: string;
    email?: string | null;
    avatarUrl?: string | null;
    role: string;
  };
  profile: ProfileEditData;
}

export interface HandleCheckResult {
  handle: string;
  available: boolean;
  reason: 'ok' | 'taken' | 'reserved' | 'invalid';
}

export interface ProfileSearchResult {
  id: string;
  username: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  activityStatus: ProfileActivityStatus;
  activityMessage: string;
}

export async function searchProfiles(search: string): Promise<ProfileSearchResult[]> {
  const res = await fetch(`/api/profile/search?q=${encodeURIComponent(search)}`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to search profiles');
  return json.data as ProfileSearchResult[];
}

export async function fetchMyProfile(): Promise<MyProfileResponse> {
  const res = await fetch('/api/profile/me', {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load profile');
  return json.data as MyProfileResponse;
}

export async function updateMyProfile(patch: {
  displayName: string;
  handle: string;
  bio: string;
  socialLinks: ProfileSocialLinks;
  activityStatus: ProfileActivityStatus;
  activityMessage: string;
}): Promise<ProfileEditData> {
  const res = await fetch('/api/profile/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'include',
    body: JSON.stringify(patch),
  });
  const json = await res.json();
  if (res.status === 409) throw new Error('HANDLE_TAKEN');
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to update profile');
  return json.data as ProfileEditData;
}

export async function checkHandleAvailability(handle: string): Promise<HandleCheckResult> {
  const res = await fetch(`/api/profile/handle-check?handle=${encodeURIComponent(handle)}`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to check handle');
  return json.data as HandleCheckResult;
}

export async function uploadAvatar(dataUrl: string): Promise<string> {
  const res = await fetch('/api/profile/avatar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ image: dataUrl }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to upload avatar');
  return json.data.avatarUrl as string;
}

export async function selectPresetAvatar(presetId: string): Promise<string> {
  const res = await fetch('/api/profile/avatar/preset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ presetId }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Failed to select preset avatar');
  return json.data.avatarUrl as string;
}

// Downscale + square-crop an image File to a 256x256 PNG data URL.
export async function cropToSquareDataUrl(file: File, size = 256): Promise<string> {
  const img = await loadImageFromFile(file);
  const sourceSize = Math.min(img.width, img.height);
  const sx = (img.width - sourceSize) / 2;
  const sy = (img.height - sourceSize) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sourceSize, sourceSize, 0, 0, size, size);
  return canvas.toDataURL('image/png');
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}
