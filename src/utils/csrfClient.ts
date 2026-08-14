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

const CSRF_COOKIE_NAME = 'rm_csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';

function readCsrfCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const entry = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CSRF_COOKIE_NAME}=`));
  if (!entry) return undefined;
  try {
    const value = decodeURIComponent(entry.slice(CSRF_COOKIE_NAME.length + 1));
    return value || undefined;
  } catch {
    return undefined;
  }
}

export function withCsrfHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const token = readCsrfCookie();
  return token ? { ...headers, [CSRF_HEADER_NAME]: token } : headers;
}
