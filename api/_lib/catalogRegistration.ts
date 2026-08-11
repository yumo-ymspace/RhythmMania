export const PENDING_REGISTRATION_TTL_MS = 30 * 60 * 1000;

export function isPendingRegistrationExpired(metadata: Record<string, unknown> | null, now = Date.now()): boolean {
  const rawExpiry = metadata?.registrationExpiresAt;
  if (typeof rawExpiry !== 'string') return true;
  const expiry = Date.parse(rawExpiry);
  return !Number.isFinite(expiry) || expiry <= now;
}

export function canActivatePendingRegistration(
  catalogState: 'pending' | 'active' | undefined,
  isExpired: boolean,
  metadata: Record<string, unknown> | null,
  token: string,
  userId: string,
): boolean {
  return catalogState === 'pending' &&
    !isExpired &&
    metadata?.token === token &&
    metadata.userId === userId;
}
