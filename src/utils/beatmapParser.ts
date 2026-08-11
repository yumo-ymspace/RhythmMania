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
 * Parses raw text from a standard mania beatmap or creates general fallback structures
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
  let keyCount = 4; // CircleSize (standard header detection)
  let overallDifficulty = 8;
  let hpDrainRate = 8;
  let parsedMode: number | undefined = undefined;
  let previewTime: number | undefined = undefined;
  let sliderMultiplier = 1.4; // Base map multiplier defined in [Difficulty]
  
  const rawNotes: Array<{
    x: number;
    y: number;
    time: number;
    typeBit: number;
    extra: string;
    slides: number;
    pixelLength: number;
    hitSound: number;
    hitSample?: HitSample;
  }> = [];

  let inHitObjects = false;
  const parsedTimingPoints: TimingControlPoint[] = [];
  const tempoTimingPoints: Array<{ time: number; beatLength: number }> = [];
  const effectiveTimingPoints: Array<{ time: number; beatLength: number; sv: number }> = [];
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
            title = value.replace(/\s*[([][1-8]K(ey|eys)?(?:\s*Mania)?[\])]/gi, '').trim();
            break;
          case 'artist':
            artist = value;
            break;
          case 'creator':
            creator = value;
            break;
          case 'version':
            difficulty = value.replace(/\s*[([][1-8]K(ey|eys)?(?:\s*Mania)?[\])]/gi, '').trim();
            break;
           case 'circlesize': {
             const parsed = Number(value);
             if (!Number.isFinite(parsed) || parsed < 0 || parsed > 10) throw new Error('Invalid CircleSize value.');
             keyCount = parsed;
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
               if (!Number.isInteger(pm) || (pm !== 0 && pm !== 3)) throw new Error('Unsupported beatmap mode.');
               parsedMode = pm;
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

           effectiveTimingPoints.push({ time, beatLength, sv: svMultiplier });
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
        // Slider slides are at parts[6], pixelLength at parts[7]
         const slides = parts[6] ? Number(parts[6]) : 1;
         const pixelLength = parts[7] ? Number(parts[7]) : 0;
         if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 512 || y < 0 || y > 384 ||
             !Number.isFinite(time) || !Number.isInteger(time) || time < 0 || time > 10000000 ||
             !Number.isInteger(typeBit) || typeBit < 0 || typeBit > 255 || !Number.isInteger(hitSound) || hitSound < 0 || hitSound > 255 ||
             !Number.isInteger(slides) || slides < 1 || slides > 100 || !Number.isFinite(pixelLength) || pixelLength < 0 || pixelLength > 1000000) {
           throw new Error('Invalid hit object values.');
         }
         {
          rawNotes.push({
            x,
            y,
            time,
            typeBit,
            extra,
             slides,
             pixelLength,
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
  effectiveTimingPoints.sort((a, b) => a.time - b.time);

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

  const mode = parsedMode !== undefined ? parsedMode : 3;

  const detectedKeyCount = clusteredX.length;
  let finalKeyCount = keyCount;

  if (mode === 0) {
    // Mode 0 (standard mode): convert Circle Size to a playable key count from 4 to 7
    finalKeyCount = Math.max(4, Math.min(7, Math.round(keyCount)));
    // Clear clusteredX for standard mode to force standard formula conversion
    clusteredX.length = 0;
  } else {
    // Prefer the detected count of unique columns if is between 2 and 10 and:
    // - matches more columns than the parsed/default value
    // - or the parsed/default value falls back to 4
    if (detectedKeyCount > 8 || keyCount > 8 || (keyCount >= 2 && !Number.isInteger(keyCount))) {
      throw new Error('Unsupported beatmap key count. RhythmMania supports 2K through 8K.');
    }
    if (detectedKeyCount >= 2 && detectedKeyCount <= 8) {
      if (finalKeyCount === 4 || detectedKeyCount > finalKeyCount || finalKeyCount > 10) {
        finalKeyCount = detectedKeyCount;
      }
    }

    if (!Number.isInteger(finalKeyCount) || finalKeyCount < 2 || finalKeyCount > 8) {
      throw new Error('Unsupported beatmap key count. RhythmMania supports 2K through 8K.');
    }
  }

  const findLastAtOrBefore = <T extends { time: number }>(points: T[], time: number): T | undefined => {
    let low = 0;
    let high = points.length - 1;
    let result: T | undefined;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const point = points[mid];
      if (point.time <= time) {
        result = point;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return result;
  };

  // Helper resolver to retrieve effective beatLength and SV multiplier at any specific hit time
  const getTimingAtTime = (startTime: number) => {

    // 1. Find the active beatLength (Uninherited Tempo)
    let activeBeatLength = 500; // default 120 bpm (500ms per beat)
    const tempoPoint = findLastAtOrBefore(tempoTimingPoints, startTime) || tempoTimingPoints[0];
    if (tempoPoint) activeBeatLength = tempoPoint.beatLength;

    // 2. Find the active SV, including red-line resets and reverse scroll.
    let activeSV = 1.0;
    const svPoint = findLastAtOrBefore(effectiveTimingPoints, startTime) || effectiveTimingPoints[0];
    if (svPoint) activeSV = svPoint.sv;

    // Slider duration needs a positive velocity; reverse/zero SV is visual-only.
    if (activeSV <= 0 || !Number.isFinite(activeSV)) {
      activeSV = 1.0;
    }

    return { beatLength: activeBeatLength, sv: activeSV };
  };

  const notes: HitObject[] = [];
  let noteIdCounter = 0;

  for (const rn of rawNotes) {
    let column = 0;

    if (clusteredX.length === finalKeyCount && clusteredX.length > 0) {
      // Direct clustering mapping - 100% precise against differences in format or scaling grids
      const idx = clusteredX.findIndex(cx => Math.abs(cx - rn.x) <= 8);
      column = idx !== -1 ? idx : 0;
    } else if (sortedRawX.length > 0 && Math.max(...sortedRawX) < finalKeyCount && mode !== 0) {
      // If the coordinates in the file are already column indices (e.g. 0 to initial count)
      column = Math.max(0, Math.min(finalKeyCount - 1, rn.x));
    } else {
      // Robust standard mathematical fallback: Column = floor(x * CircleSize / 512)
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
    } else if (mode === 0 && (rn.typeBit & 2) !== 0) {
      // Standard slider being converted to hold note in standard mode (mode: 0)
      type = 'hold';
      const totalPixelLength = rn.pixelLength * (rn.slides || 1);
      const timing = getTimingAtTime(rn.time);
      const duration = totalPixelLength / (sliderMultiplier * 100 * timing.sv) * timing.beatLength;
      endTime = Math.round(rn.time + duration);
      if (!Number.isFinite(endTime) || endTime <= rn.time || endTime > 10000000) {
        throw new Error('Invalid converted slider duration.');
      }
    }

    let sliderPoints: Array<{ x: number; y: number }> | undefined = undefined;
    if ((rn.typeBit & 2) !== 0 && rn.extra && rn.extra.includes('|')) {
      sliderPoints = [];
      const partsExtra = rn.extra.split('|');
      for (let i = 1; i < partsExtra.length; i++) {
        const coords = partsExtra[i].split(':');
        if (coords.length === 2) {
          const px = Number(coords[0]);
          const py = Number(coords[1]);
          if (Number.isInteger(px) && Number.isInteger(py) && px >= 0 && px <= 512 && py >= 0 && py <= 384) {
            sliderPoints.push({ x: px, y: py });
          }
        }
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
      objType: rn.typeBit,
      sliderPoints,
      sliderLength: rn.pixelLength,
      slidesCount: rn.slides,
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
