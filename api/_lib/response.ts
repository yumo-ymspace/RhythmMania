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

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  ensureCsrfCookie,
  isSecureRequest,
  isValidCsrfToken,
  parseCookies,
  SESSION_COOKIE_NAME,
} from './auth.js';
import { isProductionEnvironment } from './env.js';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: Record<string, unknown>;
}

export const ALLOWED_HOSTS = ['rhythm-mania.com', 'beta.rhythm-mania.com'] as const;

export function isAllowedHost(hostWithPort?: string | null, isProduction?: boolean): boolean {
  if (!hostWithPort || typeof hostWithPort !== 'string') return false;
  const host = hostWithPort.split(':')[0].trim().toLowerCase();
  if (!host) return false;

  const prod = isProduction ?? isProductionEnvironment();
  if (!prod) {
    if (host === 'localhost' || host === '127.0.0.1') {
      return true;
    }
  }

  return ALLOWED_HOSTS.includes(host as (typeof ALLOWED_HOSTS)[number]);
}

export function isAllowedOrigin(originStr?: string | null, isProduction?: boolean): boolean {
  if (!originStr || typeof originStr !== 'string') return false;
  try {
    const url = new URL(originStr);
    const prod = isProduction ?? isProductionEnvironment();
    if (prod && url.protocol !== 'https:') {
      return false;
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      return false;
    }
    return isAllowedHost(url.host, prod);
  } catch {
    return false;
  }
}

export function getRequestOrigin(req: VercelRequest): string {
  const forwardedHost = req.headers['x-forwarded-host'];
  const hostHeader = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || req.headers.host;
  const rawHost = (Array.isArray(hostHeader) ? hostHeader[0] : hostHeader || '').split(',')[0].trim();

  const isProd = isProductionEnvironment();
  const host = isAllowedHost(rawHost, isProd)
    ? rawHost
    : (isProd ? 'rhythm-mania.com' : 'localhost:3000');

  const forwardedProto = req.headers['x-forwarded-proto'];
  const protoHeader = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const proto = (protoHeader || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'))
    .split(',')[0]
    .trim()
    .toLowerCase();

  return `${proto === 'http' ? 'http' : 'https'}://${host}`;
}

const APPROVED_OAUTH_REFERER_HOSTS = new Set([
  'accounts.google.com',
  'osu.ppy.sh',
]);

function isOAuthCallbackRequest(req: VercelRequest): boolean {
  const url = req.url || '';
  if (url.includes('/api/auth/google/callback') || url.includes('/api/auth/osu/callback')) return true;
  const routeParam = (req.query as Record<string, unknown>)?._route;
  const routeStr = Array.isArray(routeParam)
    ? typeof routeParam[0] === 'string'
      ? routeParam[0]
      : ''
    : typeof routeParam === 'string'
      ? routeParam
      : '';
  return routeStr.includes('google/callback') || routeStr.includes('osu/callback');
}

export function validateRequestOrigin(req: VercelRequest): boolean {
  const isOAuthCallback = isOAuthCallbackRequest(req);
  const fetchSite = req.headers['sec-fetch-site'];
  if (typeof fetchSite === 'string' && fetchSite.toLowerCase() === 'cross-site') {
    if (!isOAuthCallback) return false;
  }

  const isProd = isProductionEnvironment();

  // Validate Host / X-Forwarded-Host if provided
  const forwardedHost = req.headers['x-forwarded-host'];
  const hostHeader = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || req.headers.host;
  const host = (Array.isArray(hostHeader) ? hostHeader[0] : hostHeader || '').split(',')[0].trim();
  if (host && !isAllowedHost(host, isProd)) {
    return false;
  }

  // Validate Origin header if present
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin.trim()) {
    if (!isAllowedOrigin(origin, isProd)) {
      if (!isOAuthCallback) return false;
      try {
        const originUrl = new URL(origin);
        if (!APPROVED_OAUTH_REFERER_HOSTS.has(originUrl.hostname.toLowerCase())) return false;
        if (isProd && originUrl.protocol !== 'https:') return false;
      } catch {
        return false;
      }
    }
  }

  // Validate Referer header if present
  const referer = req.headers.referer;
  if (typeof referer === 'string' && referer.trim()) {
    try {
      const refererUrl = new URL(referer);
      if (!isAllowedHost(refererUrl.host, isProd)) {
        if (!isOAuthCallback || !APPROVED_OAUTH_REFERER_HOSTS.has(refererUrl.hostname.toLowerCase())) {
          return false;
        }
      }
    } catch {
      return false;
    }
  }

  return true;
}

export function handleCors(req: VercelRequest, res: VercelResponse): boolean {
  if (!validateRequestOrigin(req)) {
    sendError(res, 403, 'Request origin is not allowed');
    return true;
  }

  const requestOrigin = req.headers.origin;
  if (typeof requestOrigin === 'string' && isAllowedOrigin(requestOrigin)) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Type, Authorization'
    );
    res.setHeader('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  ensureCsrfCookie(req, res, isSecureRequest(req));
  return false;
}

export function isSameOriginRequest(req: VercelRequest): boolean {
  if (!validateRequestOrigin(req)) return false;

  const expectedOrigin = getRequestOrigin(req);
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin.trim()) {
    try {
      const originUrl = new URL(origin).origin;
      return originUrl === expectedOrigin || isAllowedOrigin(originUrl);
    } catch {
      return false;
    }
  }

  const referer = req.headers.referer;
  if (typeof referer === 'string' && referer.trim()) {
    try {
      const refererUrl = new URL(referer).origin;
      return refererUrl === expectedOrigin || isAllowedOrigin(refererUrl);
    } catch {
      return false;
    }
  }

  return true;
}

export function requireSameOrigin(req: VercelRequest, res: VercelResponse): boolean {
  if (!isSameOriginRequest(req)) {
    sendError(res, 403, 'Request origin is not allowed');
    return false;
  }

  // Cookie-authenticated mutations require the signed double-submit proof.
  // Bearer-token requests do not rely on the session cookie for authority.
  if (parseCookies(req)[SESSION_COOKIE_NAME] && !isValidCsrfToken(req)) {
    sendError(res, 403, 'Invalid CSRF token');
    return false;
  }
  return true;
}

export function sendJson<T>(res: VercelResponse, statusCode: number, payload: ApiResponse<T>): void {
  res
    .status(statusCode)
    .setHeader('Content-Type', 'application/json; charset=utf-8')
    .setHeader('X-Content-Type-Options', 'nosniff')
    .setHeader('Cache-Control', 'no-store')
    .json(payload);
}

export function sendError(res: VercelResponse, statusCode: number, message: string): void {
  sendJson(res, statusCode, {
    success: false,
    error: message,
  });
}
