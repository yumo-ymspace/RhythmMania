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
