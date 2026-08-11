/**
 * Normalize the millisecond timestamp stored at the start of an osu! hold
 * object's extra field. Some exporters write harmless fractional values.
 */
export function parseHoldTailTime(rawValue: unknown, headTime: number, maxTime: number): number | null {
  if (typeof rawValue !== 'string' || rawValue.trim() === '') return null;

  const parsed = Number(rawValue.trim());
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maxTime) return null;

  const normalized = Math.round(parsed);
  if (!Number.isSafeInteger(normalized) || normalized <= headTime || normalized > maxTime) return null;
  return normalized;
}
