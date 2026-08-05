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
import { handleCors, sendJson, sendError } from '../_lib/response.js';
import { getSessionFromReq } from '../_lib/auth.js';
import { query } from '../_lib/db.js';
import { RESERVED_HANDLES, isValidHandle, sanitizeSocialLinks, sanitizeActivityStatus, sanitizeActivityMessage } from '../_lib/profile.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  try {
    const session = await getSessionFromReq(req);
    if (!session) {
      return sendError(res, 401, 'Authentication required');
    }

    if (req.method === 'GET') {
      return await handleGetMe(req, res, session);
    }

    if (req.method === 'PATCH') {
      return await handlePatchMe(req, res, session);
    }

    return sendError(res, 405, 'Method Not Allowed');
  } catch (e: unknown) {
    console.error('Error in /api/profile/me:', e);
    return sendError(res, 500, e instanceof Error ? e.message : 'Internal server error');
  }
}

async function handleGetMe(
  _req: VercelRequest,
  res: VercelResponse,
  session: { userId: string; username: string; email?: string | null; avatarUrl?: string | null; role: string }
) {
  const profileRes = await query<{
    display_name: string;
    handle: string;
    bio: string;
    social_links: unknown;
    activity_status: string | null;
    activity_message: string | null;
  }>(
    `SELECT display_name, handle, bio, social_links, activity_status, activity_message
     FROM user_profiles WHERE user_id = $1`,
    [session.userId]
  );

  const row = profileRes.rows[0];
  const avatarUrl = session.avatarUrl || null;

  return sendJson(res, 200, {
    success: true,
    data: {
      user: {
        id: session.userId,
        username: session.username,
        email: session.email || null,
        avatarUrl,
        role: session.role,
      },
      profile: row
        ? {
            displayName: row.display_name,
            handle: row.handle,
            bio: row.bio,
            socialLinks: row.social_links || {},
            activityStatus: sanitizeActivityStatus(row.activity_status),
            activityMessage: sanitizeActivityMessage(row.activity_message),
            avatarSource: avatarUrl
              ? avatarUrl.startsWith('/avatars/')
                ? 'preset'
                : 'uploaded'
              : 'google',
          }
        : {
            displayName: session.username,
            handle: '',
            bio: '',
            socialLinks: {},
            activityStatus: 'offline',
            activityMessage: '',
            avatarSource: avatarUrl ? 'google' : null,
          },
    },
  });
}

async function handlePatchMe(
  req: VercelRequest,
  res: VercelResponse,
  session: { userId: string; username: string }
) {
  const body = req.body || {};
  const {
    displayName,
    handle,
    bio,
    socialLinks,
    activityStatus,
    activityMessage,
  } = body;

  // Validate displayName
  if (typeof displayName !== 'string' || displayName.trim().length === 0 || displayName.length > 32) {
    return sendError(res, 400, 'Display name must be 1-32 characters');
  }
  const cleanDisplayName = displayName.trim();

  // Validate handle
  if (typeof handle !== 'string' || !isValidHandle(handle)) {
    return sendError(res, 400, 'Handle must be 3-20 chars, lowercase a-z0-9_, starting with a letter');
  }
  if (RESERVED_HANDLES.has(handle.toLowerCase())) {
    return sendError(res, 400, 'This handle is reserved');
  }

  // Check handle uniqueness (exclude self)
  const conflictRes = await query<{ user_id: string }>(
    `SELECT user_id FROM user_profiles WHERE handle = $1 AND user_id != $2`,
    [handle, session.userId]
  );
  if (conflictRes.rows.length > 0) {
    return sendJson(res, 409, { success: false, error: 'Handle is already taken' });
  }

  // Validate bio
  const cleanBio = typeof bio === 'string' ? bio.slice(0, 500) : '';

  // Sanitize social links
  const cleanSocialLinks = sanitizeSocialLinks(socialLinks);
  const cleanActivityStatus = sanitizeActivityStatus(activityStatus);
  const cleanActivityMessage = sanitizeActivityMessage(activityMessage);

  // Upsert profile row
  await query(
    `INSERT INTO user_profiles (user_id, display_name, handle, bio, social_links, activity_status, activity_message, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       handle = EXCLUDED.handle,
       bio = EXCLUDED.bio,
       social_links = EXCLUDED.social_links,
       activity_status = EXCLUDED.activity_status,
       activity_message = EXCLUDED.activity_message,
       updated_at = NOW()`,
    [
      session.userId,
      cleanDisplayName,
      handle,
      cleanBio,
      JSON.stringify(cleanSocialLinks),
      cleanActivityStatus,
      cleanActivityMessage,
    ]
  );

  return sendJson(res, 200, {
    success: true,
    data: {
      displayName: cleanDisplayName,
      handle,
      bio: cleanBio,
      socialLinks: cleanSocialLinks,
      activityStatus: cleanActivityStatus,
      activityMessage: cleanActivityMessage,
    },
  });
}
