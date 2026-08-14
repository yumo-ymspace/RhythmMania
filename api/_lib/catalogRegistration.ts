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

export const PENDING_REGISTRATION_TTL_MS = 30 * 60 * 1000;

export function isPendingRegistrationExpired(metadata: Record<string, unknown> | null, now = Date.now()): boolean {
  const rawExpiry = metadata?.registrationExpiresAt;
  if (typeof rawExpiry !== 'string') return true;
  const expiry = Date.parse(rawExpiry);
  return !Number.isFinite(expiry) || expiry <= now;
}

export function canActivatePendingRegistration(
  catalogState: 'pending' | 'active' | undefined,
  isExpired: boolean,
  metadata: Record<string, unknown> | null,
  token: string,
  userId: string,
): boolean {
  return catalogState === 'pending' &&
    !isExpired &&
    metadata?.token === token &&
    metadata.userId === userId;
}
