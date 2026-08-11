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

import { withCsrfHeaders } from './csrfClient';

export interface AuthUser {
  id: string;
  username: string;
  email?: string | null;
  avatarUrl?: string | null;
  role: string;
}

export interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const res = await fetch('/api/auth/me', {
      headers: withCsrfHeaders({ 'Accept': 'application/json' }),
      credentials: 'include',
    });
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) return null;
    const json = await res.json();
    const user = json.data?.user || json.user;
    if (json.success && user) {
      return user as AuthUser;
    }
    return null;
  } catch (e) {
    console.warn('Failed to fetch current user session:', e);
    return null;
  }
}

export async function logoutUser(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: withCsrfHeaders({ 'Accept': 'application/json' }),
      credentials: 'include',
    });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return false;
    const json = await res.json();
    return json.success;
  } catch (e) {
    console.error('Logout request failed:', e);
    return false;
  }
}

export async function initiateGoogleSignIn(
  onSuccess: (user: AuthUser) => void,
  onError: (msg: string) => void
): Promise<void> {
  let popup: Window | null = null;
  try {
    // Open synchronously while the click's user activation is still active.
    // Navigating the popup after the URL request avoids browser popup blocking.
    const width = 500;
    const height = 650;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    popup = window.open(
      'about:blank',
      'rhythm_mania_google_auth',
      `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
    );

    if (!popup) {
      onError('Popup blocker enabled. Please allow popups for this site to sign in.');
      return;
    }

    const res = await fetch('/api/auth/google/url', {
      headers: { 'Accept': 'application/json' },
      credentials: 'include',
    });

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      popup.close();
      let errText = 'Server returned invalid response';
      try {
        const text = await res.text();
        if (text.includes('import ') || text.includes('<!DOCTYPE')) {
          errText = 'Google OAuth backend is not active in this preview environment.';
        }
      } catch {}
      onError(errText);
      return;
    }

    const json = await res.json();

    if (!json.success || !json.data?.url) {
      popup.close();
      onError(json.error || 'Google OAuth is not configured on the server');
      return;
    }

    const popupUrl = json.data.url;
    const state = new URL(popupUrl).searchParams.get('state');
    if (!state) {
      popup.close();
      onError('Google OAuth response did not include a valid state');
      return;
    }
    const resultKey = `rhythm_mania_google_auth_${state}`;

    let timeoutId: number | undefined;
    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', handleStorage);
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };

    const handleResult = (result: { success?: boolean; message?: string }) => {
      cleanup();
      try {
        window.localStorage.removeItem(resultKey);
      } catch {
        // Storage may be unavailable in a restricted browser context.
      }
      if (result?.success) {
        fetchCurrentUser().then((user) => {
          if (user) {
            onSuccess(user);
          } else {
            onError('Failed to load user profile after login');
          }
        });
      } else {
        onError(result?.message || 'Google authentication failed');
      }
    };

    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (origin !== window.location.origin) {
        return;
      }

      if (event.data?.type === 'GOOGLE_AUTH_RESULT') {
        handleResult(event.data.payload);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== resultKey || !event.newValue) return;
      try {
        handleResult(JSON.parse(event.newValue) as { success?: boolean; message?: string });
      } catch {
        onError('Google authentication returned an invalid result');
      }
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('storage', handleStorage);
    timeoutId = window.setTimeout(() => {
      cleanup();
      onError('Google sign-in timed out. Please try again.');
    }, 5 * 60 * 1000);
    popup.location.href = popupUrl;
  } catch (e: unknown) {
    popup?.close();
    console.error('Google Sign-In initialization error:', e);
    onError(e instanceof Error ? e.message : 'Failed to start Google Sign-In');
  }
}
