/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Serverless Public Config Endpoint
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
