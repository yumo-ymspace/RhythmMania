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
import { handleCors, requireSameOrigin, sendError } from '../_lib/response.js';
import { getSessionFromReq, isValidUserId } from '../_lib/auth.js';
import { query, withTransaction } from '../_lib/db.js';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const DATA_URL_RE = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

function hasImageSignature(mime: string, buffer: Buffer): boolean {
  if (mime === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  try {
    if (req.method === 'GET') {
      return await handleGetAvatar(req, res);
    }

    if (req.method === 'POST') {
      if (!requireSameOrigin(req, res)) return;
      return await handleUploadAvatar(req, res);
    }

    return sendError(res, 405, 'Method Not Allowed');
  } catch (e: unknown) {
    console.error('Profile avatar request failed:', e instanceof Error ? e.name : 'unknown');
    return sendError(res, 500, 'Profile avatar service unavailable');
  }
}

async function handleGetAvatar(req: VercelRequest, res: VercelResponse) {
  const rawUserId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
  if (!rawUserId || !isValidUserId(rawUserId)) {
    return sendError(res, 400, 'Invalid or missing userId');
  }

  const avatarRes = await query<{ mime: string; data: Buffer }>(
    `SELECT mime, data FROM user_avatars WHERE user_id = $1`,
    [rawUserId]
  );

  if (avatarRes.rows.length === 0) {
    return sendError(res, 404, 'Avatar not found');
  }

  const row = avatarRes.rows[0];
  res.setHeader('Content-Type', row.mime);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(Buffer.from(row.data));
}

async function handleUploadAvatar(req: VercelRequest, res: VercelResponse) {
  const sessionObj = await getSessionFromReq(req);
  if (!sessionObj) {
    return sendError(res, 401, 'Authentication required');
  }

  const body = req.body || {};
  const imageDataUrl = typeof body.image === 'string' ? body.image : '';

  const match = imageDataUrl.match(DATA_URL_RE);
  if (!match) {
    return sendError(res, 400, 'Image must be a base64 data URL (JPEG, PNG, or WebP)');
  }

  const mime = match[1];
  if (!ALLOWED_MIME.has(mime)) {
    return sendError(res, 400, 'Unsupported image format');
  }

  const buffer = Buffer.from(match[3], 'base64');
  if (buffer.length === 0 || !hasImageSignature(mime, buffer)) {
    return sendError(res, 400, 'Image bytes do not match the declared format');
  }

  if (buffer.length > MAX_AVATAR_BYTES) {
    return sendError(res, 400, 'Image exceeds 2 MB limit');
  }

  const ext = MIME_TO_EXT[mime] || 'png';
  const avatarUrl = `/api/profile/avatar?userId=${sessionObj.userId}&v=${Date.now()}`;
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO user_avatars (user_id, mime, data, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data, created_at = NOW()`,
      [sessionObj.userId, mime, buffer]
    );
    await client.query(
      `UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2`,
      [avatarUrl, sessionObj.userId]
    );
  });

  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(200).json({
    success: true,
    data: {
      avatarUrl,
      format: ext,
    },
  });
}
