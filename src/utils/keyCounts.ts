export const MIN_KEY_COUNT = 2;
export const MAX_KEY_COUNT = 9;
export const SUPPORTED_KEY_COUNTS = [2, 3, 4, 5, 6, 7, 8, 9] as const;

export function isSupportedKeyCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_KEY_COUNT && value <= MAX_KEY_COUNT;
}
