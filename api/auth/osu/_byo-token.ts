import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors, sendError, sendJson } from '../../_lib/response.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'Method Not Allowed');

  const clientId = typeof req.body?.clientId === 'string' ? req.body.clientId.trim() : '';
  const clientSecret = typeof req.body?.clientSecret === 'string' ? req.body.clientSecret.trim() : '';

  if (!/^\d{1,12}$/.test(clientId) || !clientSecret || clientSecret.length > 256) {
    return sendError(res, 400, 'Invalid client id or secret');
  }

  try {
    const tokenRes = await fetch('https://osu.ppy.sh/oauth/token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
        scope: 'public',
      }),
    });

    const tokenData: unknown = await tokenRes.json();
    if (
      !isRecord(tokenData) ||
      !tokenRes.ok ||
      typeof tokenData.access_token !== 'string' ||
      !tokenData.access_token
    ) {
      return sendError(res, 401, 'osu! rejected the client credentials');
    }

    return sendJson(res, 200, {
      success: true,
      data: {
        accessToken: tokenData.access_token,
        expiresIn: typeof tokenData.expires_in === 'number' ? tokenData.expires_in : 86400,
        mode: 'byo',
      },
    });
  } catch (error) {
    console.error('osu! BYO token mint failed');
    return sendError(res, 500, 'Failed to mint osu! token');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
