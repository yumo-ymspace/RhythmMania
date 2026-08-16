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

import { Beatmap, HitObject, HitSample, NoteType, TimingControlPoint } from '../types';
import { MAX_BEATMAP_NOTES, MAX_BEATMAP_TIMING_POINTS, MAX_OSU_TEXT_BYTES } from './securityLimits';
import { parseHoldTailTime } from './holdTiming';
import { isSupportedKeyCount, MAX_KEY_COUNT, MIN_KEY_COUNT } from './keyCounts';

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
export function parseMediaPaths(beatmapFileContent: string): ParsedMediaPaths {
  let audioFilename = '';
  let videoFilename: string | null = null;
  let bgFilename: string | null = null;
  let videoStartTime = 0;

  const lines = beatmapFileContent.split(/\r?\n/);
  
  // Video regex: Matches Video, offset, "filename" (quotes, spacing & offsets optional)
  const videoRegex = /^\s*Video\s*,\s*(-?\d+)\s*,\s*"?([^"\r\n]+)"?/i;
  // Background regex: Matches 0, 0, "filename" (quotes, spacing optional)
  const bgRegex = /^\s*0\s*,\s*0\s*,\s*"?([^"\r\n]+)"?/i;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.toLowerCase().startsWith('audiofilename:')) {
      audioFilename = trimmed.substring(trimmed.indexOf(':') + 1).replace(/["']/g, '').trim();
    }

    const videoMatch = trimmed.match(videoRegex);
    if (videoMatch && videoMatch[2]) {
      const parsedStart = Number(videoMatch[1]);
      videoStartTime = Number.isFinite(parsedStart) ? parsedStart : 0;
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
 * Parses raw text from an osu!mania beatmap or creates general fallback structures
 */
export function parseBeatmap(content: string, customId: string): Beatmap {
  if (typeof content !== 'string' || new TextEncoder().encode(content).byteLength > MAX_OSU_TEXT_BYTES) {
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content).byteLength : 0;
    throw new Error(`Security Exception: Beatmap file size exceeds limit (${(bytes / (1024 * 1024)).toFixed(2)} MB, limit: ${(MAX_OSU_TEXT_BYTES / (1024 * 1024)).toFixed(1)} MB)`);
  }

  const lines = content.split(/\r?\n/);
  
  let title = 'Unknown Title';
  let artist = 'Unknown Artist';
  let creator = 'Unknown Mapper';
  let difficulty = 'Normal';
  let keyCount = 4; // CircleSize stores the mania lane count
  let hasExplicitKeyCount = false;
  let overallDifficulty = 8;
  let hpDrainRate = 8;
  let previewTime: number | undefined = undefined;
  let sliderMultiplier = 1.4; // Base map multiplier defined in [Difficulty]
  
  const rawNotes: Array<{
    x: number;
    y: number;
    time: number;
    typeBit: number;
    extra: string;
    hitSound: number;
    hitSample?: HitSample;
  }> = [];

  let inHitObjects = false;
  const parsedTimingPoints: TimingControlPoint[] = [];
  const tempoTimingPoints: Array<{ time: number; beatLength: number }> = [];
  let inTimingPoints = false;
  let inEvents = false;
  const breaks: Array<{ startTime: number; endTime: number }> = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;

    // Direct section markers - robust case-insensitive check ignoring inner/outer spacing
    if (line.startsWith('[') && line.endsWith(']')) {
      const headerName = line.substring(1, line.length - 1).trim().toLowerCase().replace(/\s+/g, '');
      if (headerName === 'general') { inHitObjects = false; inTimingPoints = false; inEvents = false; continue; }
      if (headerName === 'metadata') { inHitObjects = false; inTimingPoints = false; inEvents = false; continue; }
      if (headerName === 'difficulty') { inHitObjects = false; inTimingPoints = false; inEvents = false; continue; }
      if (headerName === 'events') { inHitObjects = false; inTimingPoints = false; inEvents = true; continue; }
      if (headerName === 'timingpoints') { inHitObjects = false; inTimingPoints = true; inEvents = false; continue; }
      if (headerName === 'hitobjects') { inHitObjects = true; inTimingPoints = false; inEvents = false; continue; }
      continue;
    }

    if (!inHitObjects && !inTimingPoints && !inEvents) {
      const colonIndex = line.indexOf(':');
      if (colonIndex !== -1) {
        const key = line.substring(0, colonIndex).trim().toLowerCase();
        const value = line.substring(colonIndex + 1).trim();

        switch (key) {
          case 'title':
            title = value.replace(/\s*[([][1-9]K(ey|eys)?(?:\s*Mania)?[\])]/gi, '').trim();
            break;
          case 'artist':
            artist = value;
            break;
          case 'creator':
            creator = value;
            break;
          case 'version':
            difficulty = value.replace(/\s*[([][1-9]K(ey|eys)?(?:\s*Mania)?[\])]/gi, '').trim();
            break;
            case 'circlesize': {
              const parsed = Number(value);
              if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || !isSupportedKeyCount(parsed)) throw new Error('Invalid CircleSize value.');
              keyCount = parsed;
              hasExplicitKeyCount = true;
              break;
            }
           case 'overalldifficulty': {
             const parsed = Number(value);
             if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10) throw new Error('Invalid OverallDifficulty value.');
             overallDifficulty = parsed;
             break;
           }
           case 'hpdrainrate': {
             const parsed = Number(value);
             if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10) throw new Error('Invalid HPDrainRate value.');
             hpDrainRate = parsed;
             break;
           }
            case 'mode':
              {
                const pm = Number(value);
                if (pm !== 3) throw new Error('Unsupported beatmap mode. RhythmMania accepts osu!mania maps only.');
              }
             break;
           case 'slidermultiplier': {
             const parsed = Number(value);
             if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10) throw new Error('Invalid SliderMultiplier value.');
             sliderMultiplier = parsed;
             break;
           }
           case 'previewtime':
             {
               const pt = Number(value);
               if (!Number.isFinite(pt) || pt < -1 || pt > 10000000) throw new Error('Invalid PreviewTime value.');
               previewTime = pt;
             }
             break;
        }
      }
    } else if (inEvents) {
      const eventParts = line.split(',');
      if (eventParts[0]?.trim() === '2' && eventParts.length >= 3) {
        const startTime = Number(eventParts[1]);
        const endTime = Number(eventParts[2]);
         if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime < 0 || endTime <= startTime) {
           throw new Error('Invalid break period.');
         }
         breaks.push({ startTime, endTime });
      }
    } else if (inTimingPoints) {
      // Timing point line format: time,beatLength,meter,sampleSet,sampleIndex,volume,uninherited,effects
      const parts = line.split(',');
      if (parts.length >= 2) {
        const time = Number(parts[0]);
        const beatLength = Number(parts[1]);
        
        if (!Number.isFinite(beatLength) || !Number.isFinite(time) || time < -1000000 || beatLength === 0 || Math.abs(beatLength) > 600000) {
          throw new Error('Invalid timing point values.');
        }
        {
          let uninherited = true;
            if (parts.length >= 7) {
             const uninheritedVal = Number(parts[6]);
             if (!Number.isInteger(uninheritedVal) || (uninheritedVal !== 0 && uninheritedVal !== 1)) throw new Error('Invalid timing point inheritance flag.');
             uninherited = uninheritedVal === 1;
             } else {
               uninherited = beatLength > 0;
             }
           if (uninherited && beatLength <= 0) throw new Error('Invalid uninherited timing point.');

          // Inherited points encode scroll velocity as beatLength < 0 → SV = -100/beatLength.
          // Positive beatLength on an inherited line yields negative SV (reverse/scroll-back).
          // Uninherited lines always reset scroll speed to 1x (osu!mania EffectControlPoint).
          let svMultiplier = 1.0;
          if (!uninherited) {
            if (beatLength !== 0 && Number.isFinite(beatLength)) {
              svMultiplier = -100 / beatLength;
            }
             if (!Number.isFinite(svMultiplier)) {
              svMultiplier = 1.0;
            } else if (Math.abs(svMultiplier) > 1000) {
              svMultiplier = Math.sign(svMultiplier) * 1000;
            }
          }

          parsedTimingPoints.push({
            timeMs: time,
            beatLength,
            uninherited,
            svMultiplier
          });

          if (parsedTimingPoints.length > MAX_BEATMAP_TIMING_POINTS) {
            throw new Error(`Security Exception: Beatmap timing points exceed limit (${MAX_BEATMAP_TIMING_POINTS})`);
          }

          if (uninherited) {
            tempoTimingPoints.push({ time, beatLength });
          }
        }
      } else {
        throw new Error('Invalid timing point line.');
      }
    } else if (inHitObjects) {
      // hitobject format: x,y,time,type,hitSound,addition/endTime
      const parts = line.split(',');
      if (parts.length >= 5) {
        const x = Number(parts[0]);
        const y = Number(parts[1]);
        const time = Number(parts[2]);
        const typeBit = Number(parts[3]);
        const hitSound = Number(parts[4]);
        const extra = parts[5] || '';
        const rawSampleParts = extra.split(':');
         const sampleOffset = (typeBit & 128) !== 0 ? 1 : 0;
         const sampleParts = rawSampleParts.slice(sampleOffset);
         const sampleFilename = sampleParts.length >= 5 ? sampleParts[4]?.trim() : undefined;
         if (sampleParts.length >= 4 && sampleParts.slice(0, 4).some(value => {
           const numeric = Number(value);
           return !Number.isFinite(numeric) || numeric < 0 || numeric > 1000;
         })) {
           throw new Error('Invalid hit sample values.');
         }
        const hitSample: HitSample | undefined = sampleParts.length >= 4 && (
          sampleParts.slice(0, 4).some(value => value.trim() !== '0') || Boolean(sampleFilename)
        ) ? {
           normalSet: Number(sampleParts[0]) || 0,
           additionSet: Number(sampleParts[1]) || 0,
           index: Number(sampleParts[2]) || 0,
           volume: Number(sampleParts[3]) || 0,
          filename: sampleFilename || undefined,
        } : undefined;
          if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 512 || y < 0 || y > 384 ||
              !Number.isFinite(time) || !Number.isInteger(time) || time < 0 || time > 10000000 ||
              !Number.isInteger(typeBit) || typeBit < 0 || typeBit > 255 || !Number.isInteger(hitSound) || hitSound < 0 || hitSound > 255) {
           throw new Error('Invalid hit object values.');
         }
         {
          rawNotes.push({
            x,
            y,
            time,
            typeBit,
            extra,
              hitSound,
            hitSample,
          });
          if (rawNotes.length > MAX_BEATMAP_NOTES) {
            throw new Error(`Security Exception: Beatmap notes exceed limit (${MAX_BEATMAP_NOTES})`);
          }
        }
      } else {
        throw new Error('Invalid hit object line.');
      }
    }
  }

  // Sort raw and parsed timing points
  tempoTimingPoints.sort((a, b) => a.time - b.time);
  parsedTimingPoints.sort((a, b) => a.timeMs - b.timeMs);

  // SECOND PASS: Dynamic Column & KeyCount detection based on unique coordinates
  const rawXValues = new Set<number>();
  for (const rn of rawNotes) {
    rawXValues.add(rn.x);
  }
  const sortedRawX = Array.from(rawXValues).sort((a, b) => a - b);

  // Group raw X positions that are close to each other (margin of 8 units to tolerate floating variations)
  const clusteredX: number[] = [];
  for (const rx of sortedRawX) {
    if (clusteredX.length === 0) {
      clusteredX.push(rx);
    } else {
      const last = clusteredX[clusteredX.length - 1];
      if (rx - last > 8) {
        clusteredX.push(rx);
      }
    }
  }

  const mode = 3 as const;

  const detectedKeyCount = clusteredX.length;
  let finalKeyCount = keyCount;

  // Prefer the detected count of unique columns when it is between 2 and 9
  // and the parsed/default value falls back to 4.
  if ((!hasExplicitKeyCount && detectedKeyCount > MAX_KEY_COUNT) || keyCount > MAX_KEY_COUNT || (keyCount >= MIN_KEY_COUNT && !Number.isInteger(keyCount))) {
    throw new Error('Unsupported beatmap key count. RhythmMania supports 2K through 9K.');
  }
  if (detectedKeyCount >= MIN_KEY_COUNT && detectedKeyCount <= MAX_KEY_COUNT) {
    if (finalKeyCount === 4 || detectedKeyCount > finalKeyCount || finalKeyCount > MAX_KEY_COUNT) {
      finalKeyCount = detectedKeyCount;
    }
  }

  if (!isSupportedKeyCount(finalKeyCount)) {
    throw new Error('Unsupported beatmap key count. RhythmMania supports 2K through 9K.');
  }

  const notes: HitObject[] = [];
  let noteIdCounter = 0;

  for (const rn of rawNotes) {
    let column = 0;

    if (clusteredX.length === finalKeyCount && clusteredX.length > 0) {
      // Direct clustering mapping - 100% precise against differences in format or scaling grids
      const idx = clusteredX.findIndex(cx => Math.abs(cx - rn.x) <= 8);
      column = idx !== -1 ? idx : 0;
    } else if (sortedRawX.length > 0 && Math.max(...sortedRawX) < finalKeyCount) {
      // If the coordinates in the file are already column indices (e.g. 0 to initial count)
      column = Math.max(0, Math.min(finalKeyCount - 1, rn.x));
    } else {
      // Mania files normally use x positions across the 512-wide playfield.
      column = Math.floor((rn.x * finalKeyCount) / 512);
    }

    if (column < 0) column = 0;
    if (column >= finalKeyCount) column = finalKeyCount - 1;

    let type: NoteType = 'normal';
    let endTime: number | undefined;

    if ((rn.typeBit & 128) !== 0) {
      type = 'hold';
      const rawTailTime = rn.extra.split(':', 1)[0];
      endTime = parseHoldTailTime(rawTailTime, rn.time, 10000000) ?? undefined;
      if (endTime === undefined) {
        throw new Error('Invalid hold tail time.');
      }
    }

    notes.push({
      id: `${customId}_n_${noteIdCounter++}`,
      time: rn.time,
      column,
      type,
      endTime,
      isHit: false,
      isReleased: false,
      isMissed: false,
      isHoldFailed: false,
      x: rn.x,
      y: rn.y,
      hitSound: rn.hitSound,
      hitSample: rn.hitSample,
    });
  }

  notes.sort((a, b) => a.time - b.time);

  let maxTimeMs = 0;
  for (const note of notes) {
    const t = note.endTime !== undefined ? note.endTime : note.time;
    if (t > maxTimeMs) {
      maxTimeMs = t;
    }
  }
  const duration = notes.length > 0 ? (maxTimeMs / 1000) + 3 : 60;
  const songDurationMs = duration * 1000;

  const media = parseMediaPaths(content);

  // Calculate duration-weighted dominant BPM
  const bpm = calculateDominantBpm(tempoTimingPoints, songDurationMs);
  const baseBeatLength = bpm > 0 ? (60000 / bpm) : (tempoTimingPoints[0]?.beatLength || 500);

  return {
    id: customId,
    title,
    artist,
    creator,
    difficulty,
    bpm,
    keyCount: finalKeyCount,
    duration,
    notes,
    hpDrainRate,
    overallDifficulty,
    videoStartTime: media.videoStartTime,
    previewTime,
    mode,
    timingPoints: parsedTimingPoints,
    sliderMultiplier,
    baseBeatLength,
    breaks: breaks.sort((a, b) => a.startTime - b.startTime),
  };
}

/**
 * Calculates dominant BPM based on the active duration of each timing section.
 */
export function calculateDominantBpm(timingPoints: Array<{ time: number; beatLength: number }>, songDurationMs: number): number {
  if (timingPoints.length === 0) return 120; // Default fallback
  if (!Number.isFinite(songDurationMs) || songDurationMs < 0) return 120;
  if (timingPoints.length === 1) {
    const bpm = 60000 / timingPoints[0].beatLength;
    return Number.isFinite(bpm) && bpm > 0 ? Math.round(bpm) : 120;
  }

  const bpmDurations = new Map<number, number>();

  for (let i = 0; i < timingPoints.length; i++) {
    const current = timingPoints[i];
    const nextTime = (i + 1 < timingPoints.length) ? timingPoints[i + 1].time : Math.max(songDurationMs, current.time + 1000);
    const duration = nextTime - current.time;
    const rawBpm = 60000 / current.beatLength;
    const bpm = Number.isFinite(rawBpm) ? Math.round(rawBpm) : 0;

    if (bpm > 10 && bpm < 1000 && duration > 0) {
      bpmDurations.set(bpm, (bpmDurations.get(bpm) || 0) + duration);
    }
  }

  if (bpmDurations.size === 0) {
    const fallback = 60000 / timingPoints[0].beatLength;
    return Number.isFinite(fallback) && fallback > 0 ? Math.round(fallback) : 120;
  }

  let dominantBpm = 120;
  let dominantDuration = 0;
  for (const [bpm, duration] of bpmDurations) {
    if (duration > dominantDuration) {
      dominantBpm = bpm;
      dominantDuration = duration;
    }
  }
  return dominantBpm;
}

/**
 * Converts a beatmap to a target key count using symmetrical column mapping
 * and dynamic note deduplication.
 */
export function convertBeatmapKeyCount(beatmap: Beatmap, targetKeyCount: number): Beatmap {
  if (!isSupportedKeyCount(targetKeyCount)) throw new Error('Unsupported conversion target. RhythmMania supports 2K through 9K.');
  if (beatmap.keyCount === targetKeyCount) return beatmap;

  const originalKeyCount = beatmap.keyCount;
  
  // Symmetrical column mapping: scale column to targetKeyCount
  const convertedNotes = (beatmap.notes || []).map(note => {
    const scaledColumn = Math.floor((note.column / originalKeyCount) * targetKeyCount);
    const finalColumn = Math.min(targetKeyCount - 1, Math.max(0, scaledColumn));
    return {
      ...note,
      column: finalColumn
    };
  });

  // Filter out exact duplicate notes at the same timestamp in the same column
  const seenNotes = new Set<string>();
  const uniqueNotes = convertedNotes.filter(note => {
    const key = `${note.time}_${note.column}`;
    if (seenNotes.has(key)) {
      return false;
    }
    seenNotes.add(key);
    return true;
  });

  return {
    ...beatmap,
    keyCount: targetKeyCount,
    notes: uniqueNotes,
    id: `${beatmap.id}_converted_${targetKeyCount}k`,
    timingPoints: beatmap.timingPoints ? beatmap.timingPoints.map(tp => ({ ...tp })) : [],
    sliderMultiplier: beatmap.sliderMultiplier !== undefined ? beatmap.sliderMultiplier : 1.4,
    baseBeatLength: beatmap.baseBeatLength
  };
}
