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
import { getRequestOrigin, validateRequestOrigin } from '../../_lib/response.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).setHeader('Allow', 'GET').send('Method Not Allowed');
  }
  if (!validateRequestOrigin(req)) {
    return res.status(403).setHeader('Content-Type', 'text/plain').send('Forbidden: Request origin is not allowed');
  }
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
    return sendHtmlResult(res, requestOrigin, false, 'Google login was cancelled or denied.', state);
  }

  if (!code) {
    return sendHtmlResult(res, requestOrigin, false, 'Missing authorization code.', state);
  }

  const env = getEnvConfig();
  const clientId = env.googleClientId;
  const clientSecret = env.googleClientSecret;

  if (!clientId || !clientSecret) {
    return sendHtmlResult(res, requestOrigin, false, 'Server Google OAuth credentials are not configured.', state);
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

    const tokenData: unknown = await tokenRes.json();
    if (!isRecord(tokenData) || !tokenRes.ok || typeof tokenData.access_token !== 'string' || !tokenData.access_token) {
      console.error('Google token exchange failed: upstream rejected the authorization code');
      return sendHtmlResult(res, requestOrigin, false, 'Failed to exchange the Google authorization code.', state);
    }

    // 2. Fetch user profile from Google
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const profile: unknown = await profileRes.json();
    if (!isRecord(profile) || !profileRes.ok || typeof profile.sub !== 'string' || !profile.sub) {
      return sendHtmlResult(res, requestOrigin, false, 'Failed to retrieve your Google profile.', state);
    }

    const googleId = profile.sub;
    const email = typeof profile.email === 'string' && profile.email ? profile.email : null;
    const name = typeof profile.name === 'string' && profile.name
      ? profile.name
      : typeof profile.given_name === 'string' && profile.given_name
        ? profile.given_name
        : 'Rhythm Player';
    const avatarUrl = typeof profile.picture === 'string' && profile.picture ? profile.picture : null;

    // 3. Find or create user in Postgres. The unique google_id conflict is
    // handled atomically so concurrent callbacks share the same user row.
    let userId: string;
    const sanitizedUsername = name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().substring(0, 32) || 'RhythmPlayer';
    let userRes: { rows: Array<{ id: string }> } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidateId = generateUserId(16);
      try {
        userRes = await query<{ id: string }>(
          `INSERT INTO users (id, google_id, username, email, avatar_url)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (google_id) DO UPDATE SET
             email = EXCLUDED.email,
             avatar_url = EXCLUDED.avatar_url,
             updated_at = NOW()
           RETURNING id`,
          [candidateId, googleId, sanitizedUsername, email, avatarUrl]
        );
        break;
      } catch (insertErr: unknown) {
        if (!isRecord(insertErr) || insertErr.code !== '23505' || !String(insertErr.constraint || '').includes('users_pkey')) {
          throw insertErr;
        }
      }
    }
    if (!userRes?.rows[0]?.id) {
      throw new Error('Failed to allocate a unique public user id');
    }
    userId = userRes.rows[0].id;

    // 4. Create session
    const sessionId = generateSessionId();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await query(
      'INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)',
      [sessionId, userId, expiresAt]
    );

    // 5. Set HTTP-only session cookie
    setSessionCookie(res, sessionId, secure);

    return sendHtmlResult(res, requestOrigin, true, 'Authentication successful.', state);
  } catch (error: unknown) {
    const databaseCode = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : 'no-code';
    console.error('Google OAuth callback failed:', error instanceof Error ? error.name : 'unknown', databaseCode);
    return sendHtmlResult(res, requestOrigin, false, 'An internal error occurred while signing in.', state);
  }
}

function getSingleQueryValue(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function sendHtmlResult(
  res: VercelResponse,
  targetOrigin: string,
  success: boolean,
  message: string,
  state?: string,
) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const payload = JSON.stringify({ success, message }).replace(/</g, '\\u003c');
  const safeMessage = escapeHtml(message);
  const resultKey = state ? `rhythm_mania_google_auth_${state}` : null;

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
          const resultKey = ${JSON.stringify(resultKey)};
          if (resultKey) {
            try {
              localStorage.setItem(resultKey, JSON.stringify(authData));
              setTimeout(() => localStorage.removeItem(resultKey), 60000);
            } catch {}
          }
          if (window.opener) {
            try {
              window.opener.postMessage({ type: 'GOOGLE_AUTH_RESULT', payload: authData }, ${JSON.stringify(targetOrigin)});
            } catch {}
            setTimeout(() => window.close(), 1000);
          } else {
            setTimeout(() => { window.location.href = '/'; }, 1500);
          }
        </script>
      </body>
    </html>
  `);
}
