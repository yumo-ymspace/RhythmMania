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

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: Record<string, any>;
}

export function getRequestOrigin(req: VercelRequest): string {
  const forwardedHost = req.headers['x-forwarded-host'];
  const hostHeader = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || req.headers.host;
  const host = (Array.isArray(hostHeader) ? hostHeader[0] : hostHeader || 'localhost:3000').split(',')[0].trim();
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protoHeader = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const proto = (protoHeader || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'))
    .split(',')[0]
    .trim()
    .toLowerCase();

  return `${proto === 'http' ? 'http' : 'https'}://${host}`;
}

export function handleCors(req: VercelRequest, res: VercelResponse): boolean {
  const requestOrigin = req.headers.origin;
  if (typeof requestOrigin === 'string' && requestOrigin === getRequestOrigin(req)) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Type, Authorization'
    );
    res.setHeader('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export function sendJson<T>(res: VercelResponse, statusCode: number, payload: ApiResponse<T>): void {
  res.status(statusCode).setHeader('Content-Type', 'application/json').json(payload);
}

export function sendError(res: VercelResponse, statusCode: number, message: string): void {
  sendJson(res, statusCode, {
    success: false,
    error: message,
  });
}
