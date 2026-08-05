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
import { sendJson } from './_lib/response.js';
import handleMe from './auth/_me.js';
import handleLogout from './auth/_logout.js';
import handleGoogleUrl from './auth/google/_url.js';
import handleGoogleCallback from './auth/google/_callback.js';
import handleOsuUrl from './auth/osu/_url.js';
import handleOsuCallback from './auth/osu/_callback.js';
import handleOsuRefresh from './auth/osu/_refresh.js';
import handleOsuByoToken from './auth/osu/_byo-token.js';

// Single function for all /api/auth/* routes. Vercel's @vercel/node runtime
// does not support [...path] catch-all files for non-Next.js projects, so
// vercel.json rewrites /api/auth/:path* to this function and passes the
// sub-route via the _route query parameter.
function getRoute(req: VercelRequest): string {
  const routeParam = req.query._route;
  const routeStr = Array.isArray(routeParam)
    ? typeof routeParam[0] === 'string' ? routeParam[0] : ''
    : typeof routeParam === 'string' ? routeParam : '';
  if (routeStr) return routeStr.replace(/\/+$/, '');

  const rawUrl = req.url || '';
  let pathname = rawUrl.split('?')[0];
  if (pathname.startsWith('/api/auth/')) {
    pathname = pathname.slice('/api/auth/'.length);
  } else {
    pathname = pathname.replace(/^\/+/, '');
  }
  return pathname.replace(/\/+$/, '');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const route = getRoute(req);
    console.log('[auth-router] route:', route, 'url:', req.url);
    switch (route) {
      case 'me':
        return handleMe(req, res);
      case 'logout':
        return handleLogout(req, res);
      case 'google/url':
        return handleGoogleUrl(req, res);
      case 'google/callback':
        return handleGoogleCallback(req, res);
      case 'osu/url':
        return handleOsuUrl(req, res);
      case 'osu/callback':
        return handleOsuCallback(req, res);
      case 'osu/refresh':
        return handleOsuRefresh(req, res);
      case 'osu/byo-token':
        return handleOsuByoToken(req, res);
      default:
        console.warn('[auth-router] no handler for route:', route);
        return sendJson(res, 404, { success: false, error: 'Not found' });
    }
  } catch (e: unknown) {
    console.error('Error in auth-router:', e);
    return sendJson(res, 500, { success: false, error: e instanceof Error ? e.message : 'Internal server error' });
  }
}
