/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 *
 * This source code is licensed under the PolyForm Perimeter License 1.0.0.
 * You may modify and use this file for non-competing purposes, provided 
 * that open and explicit attribution is maintained.
 *
 * For the full license terms, see the LICENSE file in the root directory
 * from: https://github.com/yumo-ymspace/RhythmMania
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
 * Parses raw text from a standard mania beatmap or creates general fallback structures
 */
export function parseBeatmap(content: string, customId: string): Beatmap {
  const lines = content.split(/\r?\n/);
  
  let title = 'Unknown Title';
  let artist = 'Unknown Artist';
  let creator = 'Unknown Mapper';
  let difficulty = 'Normal';
  let keyCount = 4; // CircleSize (standard header detection)
  let overallDifficulty = 8;
  let hpDrainRate = 8;
  let mode = 0; // Default to 0 (standard)
  let sliderMultiplier = 1.4; // Base map multiplier defined in [Difficulty]
  
  const rawNotes: Array<{
    x: number;
    y: number;
    time: number;
    typeBit: number;
    extra: string;
    slides: number;
    pixelLength: number;
  }> = [];

  let inHitObjects = false;
  const timingPoints: Array<{ time: number; beatLength: number }> = [];
  const allTimingPoints: Array<{ time: number; beatLength: number }> = [];
  let inTimingPoints = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;

    // Direct section markers - robust case-insensitive check ignoring inner/outer spacing
    if (line.startsWith('[') && line.endsWith(']')) {
      const headerName = line.substring(1, line.length - 1).trim().toLowerCase().replace(/\s+/g, '');
      if (headerName === 'general') { inHitObjects = false; inTimingPoints = false; continue; }
      if (headerName === 'metadata') { inHitObjects = false; inTimingPoints = false; continue; }
      if (headerName === 'difficulty') { inHitObjects = false; inTimingPoints = false; continue; }
      if (headerName === 'timingpoints') { inHitObjects = false; inTimingPoints = true; continue; }
      if (headerName === 'hitobjects') { inHitObjects = true; inTimingPoints = false; continue; }
      continue;
    }

    if (!inHitObjects && !inTimingPoints) {
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
          case 'circlesize':
            keyCount = parseInt(value, 10) || 4;
            break;
          case 'overalldifficulty':
            overallDifficulty = parseFloat(value) || 8;
            break;
          case 'hpdrainrate':
            hpDrainRate = parseFloat(value) || 8;
            break;
          case 'mode':
            mode = parseInt(value, 10);
            if (isNaN(mode)) mode = 0;
            break;
          case 'slidermultiplier':
            sliderMultiplier = parseFloat(value) || 1.4;
            break;
        }
      }
    } else if (inTimingPoints) {
      // Timing point line format: time,beatLength,meter,sampleSet,sampleIndex,volume,uninherited,effects
      const parts = line.split(',');
      if (parts.length >= 2) {
        const time = parseFloat(parts[0]);
        const beatLength = parseFloat(parts[1]);
        
        if (!isNaN(beatLength) && !isNaN(time)) {
          allTimingPoints.push({ time, beatLength });
          // Uninherited timing points ALWAYS map positive beatLength representing mills per beat.
          // Negative elements represent slider/velocity multipliers and are not BPM-defining.
          if (beatLength > 0) {
            timingPoints.push({ time, beatLength });
          }
        }
      }
    } else if (inHitObjects) {
      // hitobject format: x,y,time,type,hitSound,addition/endTime
      const parts = line.split(',');
      if (parts.length >= 5) {
        const x = parseInt(parts[0], 10);
        const y = parseInt(parts[1], 10);
        const time = parseInt(parts[2], 10);
        const typeBit = parseInt(parts[3], 10);
        const extra = parts[5] || '';
        // Slider slides are at parts[6], pixelLength at parts[7]
        const slides = parts[6] ? parseInt(parts[6], 10) : 1;
        const pixelLength = parts[7] ? parseFloat(parts[7]) : 0;
        if (!isNaN(x) && !isNaN(y) && !isNaN(time)) {
          rawNotes.push({
            x,
            y,
            time,
            typeBit,
            extra,
            slides: isNaN(slides) ? 1 : slides,
            pixelLength: isNaN(pixelLength) ? 0 : pixelLength
          });
        }
      }
    }
  }

  // Sort raw timing points
  allTimingPoints.sort((a, b) => a.time - b.time);

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
    if (detectedKeyCount >= 2 && detectedKeyCount <= 10) {
      if (finalKeyCount === 4 || detectedKeyCount > finalKeyCount || finalKeyCount > 10) {
        finalKeyCount = detectedKeyCount;
      }
    }

    if (finalKeyCount < 1 || finalKeyCount > 10) {
      finalKeyCount = 4; // Absolute safe fallback
    }
  }

  // Helper resolver to retrieve effective beatLength and SV multiplier at any specific hit time
  const getTimingAtTime = (startTime: number) => {
    // 1. Find the active beatLength (Uninherited Tempo)
    let activeBeatLength = 500; // default 120 bpm (500ms per beat)
    for (let i = timingPoints.length - 1; i >= 0; i--) {
      if (timingPoints[i].time <= startTime) {
        activeBeatLength = timingPoints[i].beatLength;
        break;
      }
    }
    if (timingPoints.length > 0 && startTime < timingPoints[0].time) {
      activeBeatLength = timingPoints[0].beatLength;
    }

    // 2. Find the active SV (Slider Velocity Multiplier)
    let activeSV = 1.0;
    let lastPoint: { time: number; beatLength: number } | null = null;
    for (let i = allTimingPoints.length - 1; i >= 0; i--) {
      if (allTimingPoints[i].time <= startTime) {
        lastPoint = allTimingPoints[i];
        break;
      }
    }
    if (!lastPoint && allTimingPoints.length > 0) {
      lastPoint = allTimingPoints[0];
    }

    if (lastPoint) {
      if (lastPoint.beatLength < 0) {
        // SV multiplier is -100 / beatLength
        activeSV = -100 / lastPoint.beatLength;
      } else {
        activeSV = 1.0;
      }
    }

    if (activeSV <= 0 || isNaN(activeSV)) {
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
      const colIndex = rn.extra.indexOf(':');
      if (colIndex !== -1) {
        endTime = parseInt(rn.extra.substring(0, colIndex), 10);
      } else {
        endTime = parseInt(rn.extra, 10) || (rn.time + 200);
      }
    } else if (mode === 0 && (rn.typeBit & 2) !== 0) {
      // Standard slider being converted to hold note in standard mode (mode: 0)
      type = 'hold';
      const totalPixelLength = rn.pixelLength * (rn.slides || 1);
      const timing = getTimingAtTime(rn.time);
      const duration = totalPixelLength / (sliderMultiplier * 100 * timing.sv) * timing.beatLength;
      endTime = Math.round(rn.time + duration);
      if (isNaN(endTime) || endTime <= rn.time) {
        endTime = rn.time + 150; // Fallback to 150ms hold note if duration calculation invalid
      }
    }

    let sliderPoints: Array<{ x: number; y: number }> | undefined = undefined;
    if ((rn.typeBit & 2) !== 0 && rn.extra && rn.extra.includes('|')) {
      sliderPoints = [];
      const partsExtra = rn.extra.split('|');
      for (let i = 1; i < partsExtra.length; i++) {
        const coords = partsExtra[i].split(':');
        if (coords.length === 2) {
          const px = parseInt(coords[0], 10);
          const py = parseInt(coords[1], 10);
          if (!isNaN(px) && !isNaN(py)) {
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
    });
  }

  notes.sort((a, b) => a.time - b.time);

  const duration = notes.length > 0 ? (notes[notes.length - 1].time / 1000) + 3 : 60;
  const songDurationMs = duration * 1000;

  const media = parseMediaPaths(content);

  // Calculate duration-weighted dominant BPM
  const bpm = calculateDominantBpm(timingPoints, songDurationMs);

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
    mode,
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
    const nextTime = (i + 1 < timingPoints.length) ? timingPoints[i + 1].time : Math.max(songDurationMs, current.time + 1000);
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

  if (bpmDurations.length === 0) {
    return Math.round(60000 / timingPoints[0].beatLength);
  }

  bpmDurations.sort((a, b) => b.duration - a.duration);
  return bpmDurations[0]?.bpm || 120;
}

/**
 * Exponential Strain-Based Difficulty Calculator
 * Evaluates decay and pattern stress over time.
 * Note: Keeps compatibility with external signatures, referencing the modular estimateStarDifficulty logic.
 */
export function calculateDecayStrainDifficulty(notes: Array<{ time: number }>): number {
  if (notes.length === 0) return 0.0;
  
  // Transform notes structure to match HitObject signature for modular processing
  const mockObjects = notes.map((n, i) => ({
    id: `${i}`,
    time: n.time,
    column: i % 4,
    type: 'normal' as const,
    isHit: false,
    isReleased: false,
    isMissed: false,
    isHoldFailed: false
  }));
  return estimateStarDifficulty(mockObjects, 4);
}

/**
 * Procedural Star Difficulty heuristic estimator.
 * Mimics rhythm algorithm using multi-column strain analysis, jackhammer penalties,
 * chord-complexity weighting, and peak strain aggregation over short intervals.
 */
function estimateStarDifficulty(notes: HitObject[], keyCount: number): number {
  if (notes.length === 0) return 1.0;

  // Let's first group notes by their timestamp to correctly handle chords vs speed streams
  interface NoteEvent {
    time: number;
    notes: HitObject[];
  }

  const events: NoteEvent[] = [];
  for (const note of notes) {
    if (events.length === 0 || events[events.length - 1].time !== note.time) {
      events.push({ time: note.time, notes: [note] });
    } else {
      events[events.length - 1].notes.push(note);
    }
  }

  const colCount = Math.max(1, keyCount);
  const columnStrain = new Array(colCount).fill(0.1);
  const lastNoteTimeInColumn = new Array(colCount).fill(-1);
  let lastProcessedTime = events[0].time;

  const eventStrains: number[] = [];
  const decayRate = 2.5; // Strain decay steepness (decays faster over quiet sections)

  for (const event of events) {
    const deltaSec = (event.time - lastProcessedTime) / 1000;

    // 1. Apply global time decay to all columns
    if (deltaSec > 0) {
      const decayFactor = Math.exp(-decayRate * deltaSec);
      for (let c = 0; c < colCount; c++) {
        columnStrain[c] *= decayFactor;
      }
    }

    // 2. Chord multiplier represents key coordination stress (chords are exponentially harder to read/coordinate)
    const chordSize = event.notes.length;
    const chordMultiplier = 1.0 + (chordSize - 1) * 0.35;

    // 3. Process individual notes in this chord event
    for (const note of event.notes) {
      const col = note.column;
      if (col < 0 || col >= colCount) continue;

      const elapsedInColSec = lastNoteTimeInColumn[col] !== -1
        ? (event.time - lastNoteTimeInColumn[col]) / 1000
        : Infinity;

      let columnBaseStrain = 1.0;

      if (elapsedInColSec !== Infinity) {
        // Jackhammer penalty: rapid consecutive key taps on the same lane are highly tiring.
        // We use a high-frequency speed scaling term.
        const speedBonus = Math.min(22.0, 1.3 / (elapsedInColSec + 0.04));
        columnBaseStrain += speedBonus;
      }

      // Hold notes require dual-state cognitive visual tracking (hold start and release timing)
      if (note.type === 'hold') {
        columnBaseStrain *= 1.25;
      }

      columnStrain[col] += columnBaseStrain * chordMultiplier;
      lastNoteTimeInColumn[col] = event.time;
    }

    // 4. Combine key strains. lane/column strain priority sorting
    const sortedStrains = [...columnStrain].sort((a, b) => b - a);
    let combinedStrain = 0;
    let rankWeight = 1.0;

    for (let c = 0; c < colCount; c++) {
      combinedStrain += (sortedStrains[c] || 0) * rankWeight;
      rankWeight *= 0.45; // lower-priority strains have smaller, decaying impact on current event difficulty
    }

    eventStrains.push(combinedStrain);
    lastProcessedTime = event.time;
  }

  // 5. Peak Strain Aggregation (Chunking) to balance map length vs local intensity peaks
  const firstNoteTime = notes[0].time;
  const lastNoteTime = notes[notes.length - 1].time;
  const songDurationMs = lastNoteTime - firstNoteTime;

  if (songDurationMs <= 0 || eventStrains.length === 0) return 1.0;

  const chunkSizeMs = 400; // 400ms interval bins representing immediate visual scroll field
  const numChunks = Math.ceil(songDurationMs / chunkSizeMs);
  const chunkPeaks = new Array(numChunks).fill(0.0);

  for (let i = 0; i < eventStrains.length; i++) {
    const relativeTime = events[i].time - firstNoteTime;
    const chunkIdx = Math.floor(relativeTime / chunkSizeMs);
    if (chunkIdx >= 0 && chunkIdx < numChunks) {
      chunkPeaks[chunkIdx] = Math.max(chunkPeaks[chunkIdx], eventStrains[i]);
    }
  }

  // Sort descending to value peaks of intensity higher than filler segments
  chunkPeaks.sort((a, b) => b - a);

  // Apply geometric series sum decay weighting
  let weightedSum = 0;
  let currentWeight = 1.0;
  const decayWeightFactor = 0.94; // Generally around 0.90 - 0.95

  for (const peak of chunkPeaks) {
    weightedSum += peak * currentWeight;
    currentWeight *= decayWeightFactor;
  }

  // 6. Calibrate weightedSum to standard VSRG star scale (approx 1.5 to 10.0+ stars)
  // Let's apply a smooth logarithmic or power compression so the spikes don't inflate to infinity
  let finalDifficulty = 0.35 * Math.pow(weightedSum, 0.65);

  // KeyCount difficulty scaling (higher lane counts increase visual multi-tasking stack)
  const keyWeight = 0.75 + (colCount * 0.05); // 4k -> 0.95, 5k -> 1.0, 7k -> 1.10, etc.
  finalDifficulty *= keyWeight;

  // Ensure reasonable bounds
  const constrainedDifficulty = Math.max(1.0, Math.min(15.0, finalDifficulty));
  return parseFloat(constrainedDifficulty.toFixed(2));
}