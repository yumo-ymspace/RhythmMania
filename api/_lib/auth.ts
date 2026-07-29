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

import crypto from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getEnvConfig } from './env.js';

export interface UserSession {
  sessionId: string;
  userId: string;
  username: string;
  email?: string;
  avatarUrl?: string;
  googleId?: string;
  role: string;
  expiresAt: Date;
}

const USER_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function generateUserId(length: number = 16): string {
  const bytes = crypto.randomBytes(length);
  let id = '';
  for (let i = 0; i < length; i++) {
    id += USER_ID_ALPHABET[bytes[i]! % USER_ID_ALPHABET.length];
  }
  return id;
}

export function isValidUserId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{16}$/.test(value);
}

export const SESSION_COOKIE_NAME = 'rm_session_token';
export const OAUTH_STATE_COOKIE_NAME = 'rm_oauth_state';

export function parseCookies(req: VercelRequest): Record<string, string> {
  const list: Record<string, string> = {};
  const cookieHeader = req.headers.cookie;

  if (!cookieHeader) return list;

  cookieHeader.split(';').forEach((cookie) => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    if (!value) return;
    list[name] = decodeURIComponent(value);
  });

  return list;
}

function getCookieAttributes(maxAgeSeconds: number, secure: boolean): string {
  return `Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function appendSetCookie(res: VercelResponse, value: string): void {
  const existing = res.getHeader('Set-Cookie');
  const cookies = existing ? (Array.isArray(existing) ? existing : [String(existing)]) : [];
  res.setHeader('Set-Cookie', [...cookies, value]);
}

export function isSecureRequest(req: VercelRequest): boolean {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || '').split(',')[0].trim().toLowerCase();
  return proto === 'https';
}

export function setSessionCookie(
  res: VercelResponse,
  sessionId: string,
  secure: boolean,
  maxAgeSeconds: number = 60 * 60 * 24 * 30
): void {
  const cookieStr = `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}; ${getCookieAttributes(maxAgeSeconds, secure)}`;
  appendSetCookie(res, cookieStr);
}

export function clearSessionCookie(res: VercelResponse, secure: boolean): void {
  const cookieStr = `${SESSION_COOKIE_NAME}=; ${getCookieAttributes(0, secure)}`;
  appendSetCookie(res, cookieStr);
}

export function generateSessionId(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function setOAuthStateCookie(res: VercelResponse, state: string, secure: boolean): void {
  appendSetCookie(
    res,
    `${OAUTH_STATE_COOKIE_NAME}=${encodeURIComponent(state)}; ${getCookieAttributes(10 * 60, secure)}`
  );
}

export function clearOAuthStateCookie(res: VercelResponse, secure: boolean): void {
  appendSetCookie(res, `${OAUTH_STATE_COOKIE_NAME}=; ${getCookieAttributes(0, secure)}`);
}

export function isValidOAuthState(req: VercelRequest, state: string | undefined): boolean {
  const expected = parseCookies(req)[OAUTH_STATE_COOKIE_NAME];
  if (!expected || !state || expected.length !== state.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(state));
}

export async function getSessionFromReq(req: VercelRequest): Promise<UserSession | null> {
  const cookies = parseCookies(req);
  const sessionId = cookies[SESSION_COOKIE_NAME];

  if (!sessionId) return null;

  try {
    const { query } = await import('./db.js');
    const res = await query<{
      session_id: string;
      user_id: string;
      username: string;
      email: string;
      avatar_url: string;
      google_id: string;
      role: string;
      expires_at: Date;
    }>(
      `SELECT s.id as session_id, s.user_id, u.username, u.email, u.avatar_url, u.google_id, u.role, s.expires_at 
       FROM sessions s 
       JOIN users u ON s.user_id = u.id 
       WHERE s.id = $1 AND s.expires_at > NOW()`,
      [sessionId]
    );

    if (res.rows.length === 0) return null;

    const row = res.rows[0];
    return {
      sessionId: row.session_id,
      userId: row.user_id,
      username: row.username,
      email: row.email,
      avatarUrl: row.avatar_url,
      googleId: row.google_id,
      role: row.role,
      expiresAt: new Date(row.expires_at),
    };
  } catch (e) {
    console.error('Failed to validate session from DB:', e);
    return null;
  }
}
