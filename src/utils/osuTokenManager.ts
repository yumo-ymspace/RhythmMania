import { withCsrfHeaders } from './csrfClient';

const STORAGE_KEY = 'rhythm_mania_v1_osu_oauth';

export type OsuAuthMode = 'auth_code' | 'byo';

export interface OsuTokenState {
  mode: OsuAuthMode;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  clientId?: string;
  clientSecret?: string;
}

type OsuRequestKind = 'api' | 'download';

const lastRequestAt: Record<OsuRequestKind, number> = {
  api: 0,
  download: 0,
};

const API_MIN_INTERVAL_MS = 1000;
const DOWNLOAD_MIN_INTERVAL_MS = 6000;

function readStored(): OsuTokenState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OsuTokenState>;
    if (
      (parsed.mode !== 'auth_code' && parsed.mode !== 'byo') ||
      typeof parsed.accessToken !== 'string' ||
      !parsed.accessToken ||
      typeof parsed.expiresAt !== 'number'
    ) {
      return null;
    }
    return {
      mode: parsed.mode,
      accessToken: parsed.accessToken,
      refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : undefined,
      expiresAt: parsed.expiresAt,
      clientId: typeof parsed.clientId === 'string' ? parsed.clientId : undefined,
      clientSecret: typeof parsed.clientSecret === 'string' ? parsed.clientSecret : undefined,
    };
  } catch {
    return null;
  }
}

function writeStored(state: OsuTokenState | null): void {
  if (!state) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function hasOsuConnection(): boolean {
  return !!readStored()?.accessToken;
}

export function clearOsuConnection(): void {
  writeStored(null);
}

export function getOsuAuthMode(): OsuAuthMode | null {
  return readStored()?.mode ?? null;
}

export async function waitForOsuSlot(kind: OsuRequestKind): Promise<void> {
  const minInterval = kind === 'download' ? DOWNLOAD_MIN_INTERVAL_MS : API_MIN_INTERVAL_MS;
  const now = Date.now();
  const waitMs = Math.max(0, lastRequestAt[kind] + minInterval - now);
  if (waitMs > 0) {
    await new Promise((resolve) => window.setTimeout(resolve, waitMs));
  }
  lastRequestAt[kind] = Date.now();
}

async function mintByoToken(clientId: string, clientSecret: string): Promise<OsuTokenState> {
  const res = await fetch('/api/auth/osu/byo-token', {
    method: 'POST',
    headers: withCsrfHeaders({ Accept: 'application/json', 'Content-Type': 'application/json' }),
    body: JSON.stringify({ clientId, clientSecret }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success || !json.data?.accessToken) {
    throw new Error(json.error || 'Failed to mint osu! token from your application');
  }
  const expiresIn = typeof json.data.expiresIn === 'number' ? json.data.expiresIn : 86400;
  const state: OsuTokenState = {
    mode: 'byo',
    accessToken: json.data.accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
    clientId,
    clientSecret,
  };
  writeStored(state);
  return state;
}

async function refreshAuthCode(refreshToken: string): Promise<OsuTokenState> {
  const res = await fetch('/api/auth/osu/refresh', {
    method: 'POST',
    headers: withCsrfHeaders({ Accept: 'application/json', 'Content-Type': 'application/json' }),
    body: JSON.stringify({ refreshToken }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success || !json.data?.accessToken) {
    clearOsuConnection();
    throw new Error(json.error || 'osu! session expired. Please reconnect.');
  }
  const expiresIn = typeof json.data.expiresIn === 'number' ? json.data.expiresIn : 86400;
  const state: OsuTokenState = {
    mode: 'auth_code',
    accessToken: json.data.accessToken,
    refreshToken: typeof json.data.refreshToken === 'string' ? json.data.refreshToken : refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  writeStored(state);
  return state;
}

export async function getValidOsuAccessToken(): Promise<string> {
  const stored = readStored();
  if (!stored) throw new Error('Connect osu! to use the online catalog');

  if (stored.expiresAt > Date.now() + 60_000) {
    return stored.accessToken;
  }

  if (stored.mode === 'auth_code') {
    if (!stored.refreshToken) {
      clearOsuConnection();
      throw new Error('osu! session expired. Please reconnect.');
    }
    const refreshed = await refreshAuthCode(stored.refreshToken);
    return refreshed.accessToken;
  }

  if (!stored.clientId || !stored.clientSecret) {
    clearOsuConnection();
    throw new Error('BYO osu! credentials are missing. Please reconnect.');
  }
  const minted = await mintByoToken(stored.clientId, stored.clientSecret);
  return minted.accessToken;
}

export function saveAuthCodeTokens(input: {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}): void {
  writeStored({
    mode: 'auth_code',
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    expiresAt: Date.now() + Math.max(60, input.expiresIn) * 1000,
  });
}

export async function connectByoCredentials(clientId: string, clientSecret: string): Promise<void> {
  await mintByoToken(clientId.trim(), clientSecret.trim());
}

export async function initiateOsuAuthCode(
  onSuccess: () => void,
  onError: (message: string) => void,
): Promise<void> {
  let popup: Window | null = null;
  try {
    // Open synchronously while the click's user activation is still active.
    // Navigating the popup after the URL request avoids browser popup blocking.
    const width = 520;
    const height = 720;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    popup = window.open(
      'about:blank',
      'rhythm_mania_osu_auth',
      `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`,
    );
    if (!popup) {
      onError('Popup blocker enabled. Please allow popups to connect osu!.');
      return;
    }

    const res = await fetch('/api/auth/osu/url', {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success || !json.data?.url) {
      popup.close();
      onError(json.error || 'osu! OAuth is not configured on the server');
      return;
    }

    const popupUrl = json.data.url;
    const state = new URL(popupUrl).searchParams.get('state');
    if (!state) {
      popup.close();
      onError('osu! OAuth response did not include a valid state');
      return;
    }
    const resultKey = `rhythm_mania_osu_auth_${state}`;

    let timeoutId: number | undefined;
    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', handleStorage);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };

    const handleResult = (result: {
      success?: boolean;
      message?: string;
      accessToken?: string;
      refreshToken?: string;
      expiresIn?: number;
    }) => {
      cleanup();
      try {
        window.localStorage.removeItem(resultKey);
      } catch {
        // Storage may be unavailable in a restricted browser context.
      }
      if (result?.success && typeof result.accessToken === 'string') {
        saveAuthCodeTokens({
          accessToken: result.accessToken,
          refreshToken: typeof result.refreshToken === 'string' ? result.refreshToken : undefined,
          expiresIn: typeof result.expiresIn === 'number' ? result.expiresIn : 86400,
        });
        onSuccess();
      } else {
        onError(result?.message || 'osu! authorization failed');
      }
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'OSU_AUTH_RESULT') return;
      handleResult(event.data.payload);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== resultKey || !event.newValue) return;
      try {
        handleResult(JSON.parse(event.newValue) as {
          success?: boolean;
          message?: string;
          accessToken?: string;
          refreshToken?: string;
          expiresIn?: number;
        });
      } catch {
        onError('osu! authorization returned an invalid result');
      }
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('storage', handleStorage);
    timeoutId = window.setTimeout(() => {
      cleanup();
      onError('osu! sign-in timed out. Please try again.');
    }, 5 * 60 * 1000);
    popup.location.href = popupUrl;
  } catch (error) {
    popup?.close();
    onError(error instanceof Error ? error.message : 'Failed to start osu! authorization');
  }
}

export async function downloadBeatmapsetArchive(
  sourceSetId: number,
  onStatus: (message: string) => void,
  onProgress: (loaded: number, total: number) => void,
  maxBytes: number,
): Promise<Blob> {
  await waitForOsuSlot('download');
  onStatus('Requesting download from provider: Catboy mirror (Mino)');

  let response = await fetch(`https://catboy.best/d/${sourceSetId}`);
  if (response.status === 404) {
    onStatus('Transferring download to osudl.org…');
    response = await fetch(`https://osudl.org/s/${sourceSetId}`);
  }

  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }

  const contentLength = response.headers.get('content-length');
  const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
  if (totalBytes > maxBytes) {
    throw new Error(
      `Security Exception: Download size exceeds limit (${(totalBytes / (1024 * 1024)).toFixed(1)} MB)`,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('ReadableStream is unsupported in this browser.');

  let loadedBytes = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    loadedBytes += value.length;
    if (loadedBytes > maxBytes) {
      reader.cancel();
      throw new Error(
        `Security Exception: Download size limit exceeded (${(loadedBytes / (1024 * 1024)).toFixed(1)} MB)`,
      );
    }
    onProgress(loadedBytes, totalBytes);
  }

  return new Blob(
    chunks.map((chunk) => {
      const copy = new Uint8Array(chunk.byteLength);
      copy.set(chunk);
      return copy.buffer;
    }),
    { type: 'application/octet-stream' },
  );
}
