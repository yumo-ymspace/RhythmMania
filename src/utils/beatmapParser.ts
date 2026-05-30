/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Beatmap, HitObject, NoteType } from '../types';

export interface ParsedMediaPaths {
  audioFilename: string;
  videoFilename: string | null;
  bgFilename: string | null;
  videoStartTime: number;
}

/**
 * Hardened parser utilizing robust regexes to cleanly extract filenames
 * under any casing, negative offsets, spacing variations and quotes.
 */
export function parseMediaPaths(osuFileContent: string): ParsedMediaPaths {
  let audioFilename = '';
  let videoFilename: string | null = null;
  let bgFilename: string | null = null;
  let videoStartTime = 0;

  const lines = osuFileContent.split(/\r?\n/);
  
  // Video regex: Matches Video, offset, "filename" (quotes, spacing & offsets optional)
  const videoRegex = /^\s*Video\s*,\s*(-?\d+)\s*,\s*"?([^"\r\n]+)"?/i;
  // Background regex: Matches 0, 0, "filename" (quotes, spacing optional)
  const bgRegex = /^\s*0\s*,\s*0\s*,\s*"?([^"\r\n]+)"?/i;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('AudioFilename:')) {
      audioFilename = trimmed.substring('AudioFilename:'.length).trim();
    }

    const videoMatch = trimmed.match(videoRegex);
    if (videoMatch && videoMatch[2]) {
      videoStartTime = parseInt(videoMatch[1], 10) || 0;
      videoFilename = videoMatch[2].replace(/['"]/g, '').trim();
    }

    const bgMatch = trimmed.match(bgRegex);
    if (bgMatch && bgMatch[1]) {
      let rawBg = bgMatch[1];
      if (rawBg.includes(',')) {
        rawBg = rawBg.split(',')[0];
      }
      bgFilename = rawBg.replace(/['"]/g, '').trim();
    }
  }

  return { audioFilename, videoFilename, bgFilename, videoStartTime };
}

/**
 * Parses raw text from a standard .osu mania beatmap or creates general fallback structures
 */
export function parseOsuBeatmap(content: string, customId: string): Beatmap {
  const lines = content.split(/\r?\n/);
  
  let title = 'Unknown Title';
  let artist = 'Unknown Artist';
  let creator = 'Unknown Mapper';
  let difficulty = 'Normal';
  let keyCount = 4; // CircleSize
  let overallDifficulty = 8;
  let hpDrainRate = 8;
  
  const notes: HitObject[] = [];
  let inHitObjects = false;
  const timingPoints: Array<{ time: number; beatLength: number }> = [];
  let inTimingPoints = false;

  let noteIdCounter = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;

    // Direct section markers
    if (line === '[General]') { inHitObjects = false; inTimingPoints = false; continue; }
    if (line === '[Metadata]') { inHitObjects = false; inTimingPoints = false; continue; }
    if (line === '[Difficulty]') { inHitObjects = false; inTimingPoints = false; continue; }
    if (line === '[TimingPoints]') { inHitObjects = false; inTimingPoints = true; continue; }
    if (line === '[HitObjects]') { inHitObjects = true; inTimingPoints = false; continue; }

    if (!inHitObjects && !inTimingPoints) {
      if (line.startsWith('Title:')) title = line.substring(6).trim();
      else if (line.startsWith('Artist:')) artist = line.substring(7).trim();
      else if (line.startsWith('Creator:')) creator = line.substring(8).trim();
      else if (line.startsWith('Version:')) difficulty = line.substring(8).trim();
      else if (line.startsWith('CircleSize:')) keyCount = parseInt(line.substring(11).trim()) || 4;
      else if (line.startsWith('OverallDifficulty:')) overallDifficulty = parseFloat(line.substring(18).trim()) || 8;
      else if (line.startsWith('HPDrainRate:')) hpDrainRate = parseFloat(line.substring(12).trim()) || 8;
    } else if (inTimingPoints) {
      // Timing point line format: time,beatLength,meter,sampleSet,sampleIndex,volume,uninherited,effects
      const parts = line.split(',');
      if (parts.length >= 2) {
        const time = parseFloat(parts[0]);
        const beatLength = parseFloat(parts[1]);
        let isUninherited = beatLength > 0;
        if (parts.length >= 7) {
          isUninherited = parseInt(parts[6]) === 1;
        }
        if (isUninherited && beatLength > 0) {
          timingPoints.push({ time, beatLength });
        }
      }
    } else if (inHitObjects) {
      // osu! hitobject format: x,y,time,type,hitSound,addition/endTime
      const parts = line.split(',');
      if (parts.length >= 5) {
        const x = parseInt(parts[0]);
        const time = parseInt(parts[2]);
        const typeBit = parseInt(parts[3]);
        
        let column = Math.floor((x * keyCount) / 512);
        if (column < 0) column = 0;
        if (column >= keyCount) column = keyCount - 1;

        let type: NoteType = 'normal';
        let endTime: number | undefined;

        if ((typeBit & 128) !== 0) {
          type = 'hold';
          const extra = parts[5] || '';
          const colIndex = extra.indexOf(':');
          if (colIndex !== -1) {
            endTime = parseInt(extra.substring(0, colIndex));
          } else {
            endTime = parseInt(extra) || (time + 200);
          }
        }

        notes.push({
          id: `${customId}_n_${noteIdCounter++}`,
          time,
          column,
          type,
          endTime,
          isHit: false,
          isReleased: false,
          isMissed: false,
          isHoldFailed: false,
        });
      }
    }
  }

  notes.sort((a, b) => a.time - b.time);

  const duration = notes.length > 0 ? (notes[notes.length - 1].time / 1000) + 3 : 60;
  const songDurationMs = duration * 1000;

  const media = parseMediaPaths(content);

  // Calculate duration-weighted dominant BPM
  const bpm = calculateDominantBpm(timingPoints, songDurationMs);

  // Star difficulty rating assessment based on strain-based exponential decay formula
  const stars = estimateStarDifficulty(notes, keyCount);

  return {
    id: customId,
    title,
    artist,
    creator,
    difficulty,
    bpm,
    keyCount,
    duration,
    notes,
    hpDrainRate,
    overallDifficulty,
    stars,
    videoStartTime: media.videoStartTime,
  };
}

/**
 * Calculates dominant BPM based on the active duration of each timing section.
 */
export function calculateDominantBpm(timingPoints: Array<{ time: number; beatLength: number }>, songDurationMs: number): number {
  if (timingPoints.length === 0) return 120; // Default fallback
  if (timingPoints.length === 1) return Math.round(60000 / timingPoints[0].beatLength);

  const bpmDurations: { bpm: number; duration: number }[] = [];

  for (let i = 0; i < timingPoints.length; i++) {
    const current = timingPoints[i];
    const nextTime = (i + 1 < timingPoints.length) ? timingPoints[i + 1].time : songDurationMs;
    const duration = nextTime - current.time;
    const bpm = Math.round(60000 / current.beatLength);

    if (bpm > 10 && bpm < 1000 && duration > 0) {
      const existing = bpmDurations.find(item => item.bpm === bpm);
      if (existing) {
        existing.duration += duration;
      } else {
        bpmDurations.push({ bpm, duration });
      }
    }
  }

  bpmDurations.sort((a, b) => b.duration - a.duration);
  return bpmDurations[0]?.bpm || 120;
}

/**
 * Exponential Strain-Based Difficulty Calculator
 * Evaluates decay and pattern stress over time.
 */
export function calculateDecayStrainDifficulty(notes: Array<{ time: number }>): number {
  if (notes.length === 0) return 0.0;

  let strain = 0.0;
  let maxStrain = 0.0;
  let totalStrainSum = 0.0;
  const decayRate = 0.15; // Strain decays quickly over periods of silence

  for (let i = 1; i < notes.length; i++) {
    const delta = (notes[i].time - notes[i - 1].time) / 1000; // time gap in seconds
    
    // Decay current strain over the time gap
    strain *= Math.exp(-decayRate * delta);
    
    // Add additional strain based on note density (closer notes = higher strain)
    const noteDifficultyWeight = 1.0 / (delta + 0.05); // Avoid division by zero
    strain += noteDifficultyWeight;

    maxStrain = Math.max(maxStrain, strain);
    totalStrainSum += strain;
  }

  // Star Rating is a balanced combination of peak strain and sustained strain density
  const averageStrain = totalStrainSum / notes.length;
  const rawDifficulty = (maxStrain * 0.4) + (averageStrain * 0.6);
  
  // Normalize difficulty to standard Star scale (e.g. 1.0 to 10.0)
  return Math.min(Math.max(rawDifficulty / 15.0, 1.0), 10.0);
}

/**
 * Procedural Star Difficulty heuristic estimator combining exponential strain decay, keycount scaling and holdRatio weights.
 */
function estimateStarDifficulty(notes: HitObject[], keyCount: number): number {
  if (notes.length === 0) return 1.0;
  
  const baseStrainRating = calculateDecayStrainDifficulty(notes);
  
  // Scale keyCount (higher lane counts increase physical mental stack)
  let baseRating = baseStrainRating * (0.8 + (keyCount * 0.05));
  
  // Hold note boost (managing hold release requires high visual awareness)
  const holdCount = notes.filter(n => n.type === 'hold').length;
  const holdRatio = holdCount / notes.length;
  baseRating += (holdRatio * 1.5);

  const finalRating = Math.max(1.0, Math.min(10.0, baseRating));
  return parseFloat(finalRating.toFixed(2));
}
