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
      headers: { 'Accept': 'application/json' },
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
      headers: { 'Accept': 'application/json' },
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
  try {
    const res = await fetch('/api/auth/google/url', {
      headers: { 'Accept': 'application/json' },
      credentials: 'include',
    });

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
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
      onError(json.error || 'Google OAuth is not configured on the server');
      return;
    }

    const popupUrl = json.data.url;
    const width = 500;
    const height = 650;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      popupUrl,
      'rhythm_mania_google_auth',
      `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
    );

    if (!popup) {
      onError('Popup blocker enabled. Please allow popups for this site to sign in.');
      return;
    }

    let timeoutId: number | undefined;
    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };

    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (origin !== window.location.origin) {
        return;
      }

      if (event.data?.type === 'GOOGLE_AUTH_RESULT') {
        cleanup();
        const result = event.data.payload;
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
      }
    };

    window.addEventListener('message', handleMessage);
    timeoutId = window.setTimeout(() => {
      cleanup();
      onError('Google sign-in timed out. Please try again.');
    }, 5 * 60 * 1000);
  } catch (e: any) {
    console.error('Google Sign-In initialization error:', e);
    onError(e?.message || 'Failed to start Google Sign-In');
  }
}
