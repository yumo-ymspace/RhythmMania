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
import { handleCors, sendJson } from './_lib/response.js';
import metadata from '../metadata.json' with { type: 'json' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
  }

  return sendJson(res, 200, {
    success: true,
    data: {
      appName: metadata.name || 'RhythmMania',
      version: metadata.version || '0.7.6',
      supportedModes: [3],
      features: {
        leaderboards: true,
        replays: true,
        catalogSync: true,
        customBeatmaps: true,
      },
    },
  });
}
