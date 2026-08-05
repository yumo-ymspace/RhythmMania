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
import handleUpload from './replays/_upload.js';
import handleList from './replays/_list.js';
import handleGet from './replays/_get.js';

function getRoute(req: VercelRequest): string {
  const routeParam = req.query._route;
  const routeStr = Array.isArray(routeParam)
    ? typeof routeParam[0] === 'string' ? routeParam[0] : ''
    : typeof routeParam === 'string' ? routeParam : '';
  if (routeStr) return routeStr.replace(/\/+$/, '');

  const rawUrl = req.url || '';
  let pathname = rawUrl.split('?')[0];
  if (pathname.startsWith('/api/replays/')) {
    pathname = pathname.slice('/api/replays/'.length);
  } else {
    pathname = pathname.replace(/^\/+/, '');
  }
  return pathname.replace(/\/+$/, '');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const route = getRoute(req);
    console.log('[replays-router] route:', route, 'url:', req.url);
    switch (route) {
      case 'upload':
        return handleUpload(req, res);
      case 'list':
        return handleList(req, res);
      case 'get':
        return handleGet(req, res);
      default:
        console.warn('[replays-router] no handler for route:', route);
        return sendJson(res, 404, { success: false, error: 'Not found' });
    }
  } catch (e: unknown) {
    console.error('Error in replays-router:', e);
    return sendJson(res, 500, { success: false, error: e instanceof Error ? e.message : 'Internal server error' });
  }
}
