import type { Beatmap } from '../types';
import { calculateChartStarRating } from './chartStarRating';

export function resolveStarRating(map: Pick<Beatmap, 'id' | 'difficulty' | 'notes' | 'keyCount' | 'duration'> & {
  starRating?: unknown;
}): number {
  const explicit = Number(map.starRating);
  if (Number.isFinite(explicit) && explicit >= 0 && explicit <= 20) {
    return Math.round(explicit * 100) / 100;
  }

  if (Array.isArray(map.notes)) {
    return calculateChartStarRating(map);
  }

  return 0;
}
