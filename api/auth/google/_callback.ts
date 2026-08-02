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
import { getEnvConfig } from '../../_lib/env.js';
import { query } from '../../_lib/db.js';
import {
  clearOAuthStateCookie,
  generateSessionId,
  generateUserId,
  isSecureRequest,
  isValidOAuthState,
  setSessionCookie,
} from '../../_lib/auth.js';
import { getRequestOrigin } from '../../_lib/response.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = getSingleQueryValue(req.query.code);
  const error = getSingleQueryValue(req.query.error);
  const state = getSingleQueryValue(req.query.state);
  const requestOrigin = getRequestOrigin(req);
  const secure = isSecureRequest(req);

  if (!isValidOAuthState(req, state)) {
    return sendHtmlResult(res, requestOrigin, false, 'Invalid or expired sign-in request.');
  }
  clearOAuthStateCookie(res, secure);

  if (error) {
    return sendHtmlResult(res, requestOrigin, false, 'Google login was cancelled or denied.');
  }

  if (!code) {
    return sendHtmlResult(res, requestOrigin, false, 'Missing authorization code.');
  }

  const env = getEnvConfig();
  const clientId = env.googleClientId;
  const clientSecret = env.googleClientSecret;

  if (!clientId || !clientSecret) {
    return sendHtmlResult(res, requestOrigin, false, 'Server Google OAuth credentials are not configured.');
  }

  const redirectUri = `${requestOrigin}/api/auth/google/callback`;

  try {
    // 1. Exchange code for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('Google token exchange error:', tokenData);
      return sendHtmlResult(res, requestOrigin, false, 'Failed to exchange the Google authorization code.');
    }

    // 2. Fetch user profile from Google
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const profile = await profileRes.json();
    if (!profileRes.ok || !profile.sub) {
      return sendHtmlResult(res, requestOrigin, false, 'Failed to retrieve your Google profile.');
    }

    const googleId = profile.sub as string;
    const email = (profile.email as string) || null;
    const name = (profile.name || profile.given_name || 'Rhythm Player') as string;
    const avatarUrl = (profile.picture as string) || null;

    // 3. Find or create user in Postgres
    let userId: string;
    const existingUserRes = await query<{ id: string }>(
      'SELECT id FROM users WHERE google_id = $1',
      [googleId]
    );

    if (existingUserRes.rows.length > 0) {
      userId = existingUserRes.rows[0].id;
      await query(
        'UPDATE users SET email = $1, avatar_url = $2, updated_at = NOW() WHERE id = $3',
        [email, avatarUrl, userId]
      );
    } else {
      // Clean username (max 32 chars)
      const sanitizedUsername = name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().substring(0, 32) || 'RhythmPlayer';
      let newUserRes: { rows: Array<{ id: string }> } | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidateId = generateUserId(16);
        try {
          newUserRes = await query<{ id: string }>(
            `INSERT INTO users (id, google_id, username, email, avatar_url) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING id`,
            [candidateId, googleId, sanitizedUsername, email, avatarUrl]
          );
          break;
        } catch (insertErr: any) {
          // Retry only on primary-key collision; other errors bubble up.
          if (insertErr?.code !== '23505' || !String(insertErr?.constraint || '').includes('users_pkey')) {
            throw insertErr;
          }
        }
      }
      if (!newUserRes?.rows[0]?.id) {
        throw new Error('Failed to allocate a unique public user id');
      }
      userId = newUserRes.rows[0].id;
    }

    // 4. Create session
    const sessionId = generateSessionId();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await query(
      'INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)',
      [sessionId, userId, expiresAt]
    );

    // 5. Set HTTP-only session cookie
    setSessionCookie(res, sessionId, secure);

    return sendHtmlResult(res, requestOrigin, true, 'Authentication successful.');
  } catch (e: any) {
    console.error('Error during Google OAuth callback:', e);
    return sendHtmlResult(res, requestOrigin, false, 'An internal error occurred while signing in.');
  }
}

function getSingleQueryValue(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char] || char);
}

function sendHtmlResult(res: VercelResponse, targetOrigin: string, success: boolean, message: string) {
  res.setHeader('Content-Type', 'text/html');
  const payload = JSON.stringify({ success, message }).replace(/</g, '\\u003c');
  const safeMessage = escapeHtml(message);

  return res.status(200).send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>RhythmMania Auth Callback</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; text-align: center; max-width: 360px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          .status { font-size: 18px; font-weight: 600; margin-bottom: 12px; color: ${success ? '#38bdf8' : '#f87171'}; }
          .msg { font-size: 14px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="status">${success ? '✓ Signed In' : '✕ Auth Error'}</div>
          <div class="msg">${safeMessage}</div>
        </div>
        <script>
          const authData = ${payload};
          if (window.opener) {
            window.opener.postMessage({ type: 'GOOGLE_AUTH_RESULT', payload: authData }, ${JSON.stringify(targetOrigin)});
            setTimeout(() => window.close(), 1000);
          } else {
            setTimeout(() => { window.location.href = '/'; }, 1500);
          }
        </script>
      </body>
    </html>
  `);
}
