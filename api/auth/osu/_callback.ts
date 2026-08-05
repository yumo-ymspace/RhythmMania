import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  clearOsuOAuthStateCookie,
  isSecureRequest,
  isValidOsuOAuthState,
} from '../../_lib/auth.js';
import { getEnvConfig } from '../../_lib/env.js';
import { getRequestOrigin } from '../../_lib/response.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = getSingleQueryValue(req.query.code);
  const error = getSingleQueryValue(req.query.error);
  const state = getSingleQueryValue(req.query.state);
  const requestOrigin = getRequestOrigin(req);
  const secure = isSecureRequest(req);

  if (!isValidOsuOAuthState(req, state)) {
    return sendHtmlResult(res, requestOrigin, false, 'Invalid or expired osu! authorization request.');
  }
  clearOsuOAuthStateCookie(res, secure);

  if (error) {
    return sendHtmlResult(res, requestOrigin, false, 'osu! authorization was cancelled or denied.');
  }
  if (!code) {
    return sendHtmlResult(res, requestOrigin, false, 'Missing authorization code.');
  }

  const env = getEnvConfig();
  if (!env.osuClientId || !env.osuClientSecret) {
    return sendHtmlResult(res, requestOrigin, false, 'Server osu! OAuth credentials are not configured.');
  }

  const redirectUri = `${requestOrigin}/api/auth/osu/callback`;

  try {
    const tokenRes = await fetch('https://osu.ppy.sh/oauth/token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: env.osuClientId,
        client_secret: env.osuClientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    const tokenData: unknown = await tokenRes.json();
    if (
      !isRecord(tokenData) ||
      !tokenRes.ok ||
      typeof tokenData.access_token !== 'string' ||
      !tokenData.access_token
    ) {
      console.error('osu! token exchange error');
      return sendHtmlResult(res, requestOrigin, false, 'Failed to exchange the osu! authorization code.');
    }

    const accessToken = tokenData.access_token;
    const refreshToken = typeof tokenData.refresh_token === 'string' ? tokenData.refresh_token : '';
    const expiresIn = typeof tokenData.expires_in === 'number' ? tokenData.expires_in : 86400;

    return sendHtmlResult(res, requestOrigin, true, 'osu! connected.', {
      accessToken,
      refreshToken,
      expiresIn,
      mode: 'auth_code',
    });
  } catch (err) {
    console.error('Error during osu! OAuth callback:', err);
    return sendHtmlResult(res, requestOrigin, false, 'An internal error occurred while connecting osu!.');
  }
}

function getSingleQueryValue(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char,
  );
}

function sendHtmlResult(
  res: VercelResponse,
  targetOrigin: string,
  success: boolean,
  message: string,
  tokens?: { accessToken: string; refreshToken: string; expiresIn: number; mode: string },
) {
  res.setHeader('Content-Type', 'text/html');
  const payload = JSON.stringify({
    success,
    message,
    ...(tokens
      ? {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
          mode: tokens.mode,
        }
      : {}),
  }).replace(/</g, '\\u003c');
  const safeMessage = escapeHtml(message);

  return res.status(200).send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>RhythmMania osu! Auth</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; text-align: center; max-width: 360px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          .status { font-size: 18px; font-weight: 600; margin-bottom: 12px; color: ${success ? '#38bdf8' : '#f87171'}; }
          .msg { font-size: 14px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="status">${success ? '✓ osu! Connected' : '✕ Auth Error'}</div>
          <div class="msg">${safeMessage}</div>
        </div>
        <script>
          const authData = ${payload};
          if (window.opener) {
            window.opener.postMessage({ type: 'OSU_AUTH_RESULT', payload: authData }, ${JSON.stringify(targetOrigin)});
            setTimeout(() => window.close(), 1000);
          } else {
            setTimeout(() => { window.location.href = '/'; }, 1500);
          }
        </script>
      </body>
    </html>
  `);
}
