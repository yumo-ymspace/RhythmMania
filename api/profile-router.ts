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
import handleMe from './profile/_me.js';
import handleHandleCheck from './profile/_handle-check.js';
import handleGet from './profile/_get.js';
import handleSearch from './profile/_search.js';
import handleAvatar from './profile/_avatar.js';
import handleAvatarPreset from './profile/avatar/_preset.js';

function getRoute(req: VercelRequest): string {
  const routeParam = req.query._route;
  const routeStr = Array.isArray(routeParam)
    ? typeof routeParam[0] === 'string' ? routeParam[0] : ''
    : typeof routeParam === 'string' ? routeParam : '';
  if (routeStr) return routeStr.replace(/\/+$/, '');

  const rawUrl = req.url || '';
  let pathname = rawUrl.split('?')[0];
  if (pathname.startsWith('/api/profile/')) {
    pathname = pathname.slice('/api/profile/'.length);
  } else {
    pathname = pathname.replace(/^\/+/, '');
  }
  return pathname.replace(/\/+$/, '');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const route = getRoute(req);
    console.log('[profile-router] route:', route, 'url:', req.url);
    switch (route) {
      case 'me':
        return handleMe(req, res);
      case 'handle-check':
        return handleHandleCheck(req, res);
      case 'get':
        return handleGet(req, res);
      case 'search':
        return handleSearch(req, res);
      case 'avatar':
        return handleAvatar(req, res);
      case 'avatar/preset':
        return handleAvatarPreset(req, res);
      default:
        console.warn('[profile-router] no handler for route:', route);
        return sendJson(res, 404, { success: false, error: 'Not found' });
    }
  } catch (e: unknown) {
    console.error('Error in profile-router:', e);
    return sendJson(res, 500, { success: false, error: e instanceof Error ? e.message : 'Internal server error' });
  }
}
