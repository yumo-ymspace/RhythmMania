/**
 * @license
 * SPDX-License-Identifier: GPL-3.0-only
 */

import { Beatmap, HitObject, NoteType } from '../types';

export interface PredefinedSong {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  duration: number; // in seconds
  description: string;
  genre: string;
  audioUrl?: string; // Creative Commons audio files
  bgUrl?: string;
}

export const PREDEFINED_SONGS: PredefinedSong[] = [];

/**
 * Custom deterministic LCG random number generator to make maps reproducible
 */
class DeterministicRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  // Returns float between 0 and 1
  next(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }
  // Range inclusive
  range(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}

/**
 * Dynamically builds a highly responsive, fun, rhythmic beatmap on-the-fly.
 * Built with professional structure (stairs, trills, streams, long-chordholds).
 */
export function generateProceduralBeatmap(
  song: PredefinedSong,
  keyCount: number,
  difficultyMultiplier: number // 1.0 to 10.0 star rating mapping
): Beatmap {
  const notes: HitObject[] = [];
  const bpm = song.bpm;
  const durationSec = song.duration;
  
  // Custom seed using title character codes
  let initialSeed = keyCount;
  for (let i = 0; i < song.title.length; i++) {
    initialSeed += song.title.charCodeAt(i);
  }
  // Add seed factor based on difficulty level
  initialSeed += Math.floor(difficultyMultiplier * 100);
  
  const rand = new DeterministicRandom(initialSeed);
  
  // Audio timings
  const beatDurationMs = 60000 / bpm;
  const mapStartMs = 1500; // 1.5 seconds margin before notes start
  const mapEndMs = (durationSec * 1000) - 2000;
  
  let noteCounter = 0;
  
  // Track active hold notes per column to prevent overlaps
  const activeHoldEndTimes = new Array(keyCount).fill(0);
  
  // Track previous note column to enforce trills/stairs patterns
  let lastColumn = Math.floor(keyCount / 2);
  let climbDirection = 1; // staircase tracker (1 or -1)

  // Sub-beat interval: 1/4 note (easy), 1/8 note (hard), 1/16 note (ultra)
  // Determine standard density based on target star difficulty
  let quantizations: number[] = [1]; // always has 1/1 beats
  
  if (difficultyMultiplier >= 2) quantizations.push(2); // adds 1/2 beats
  if (difficultyMultiplier >= 4) quantizations.push(4); // adds 1/4 beats
  
  // Loop through timeline incrementing by 1/4 beat duration (16th notes)
  const stepMs = beatDurationMs / 4;
  
  for (let currentTime = mapStartMs; currentTime < mapEndMs; currentTime += stepMs) {
    const beatIndex = Math.floor((currentTime - mapStartMs) / beatDurationMs);
    const stepInBeat = Math.floor(((currentTime - mapStartMs) % beatDurationMs) / stepMs); // 0, 1, 2, 3
    
    // Clear holding status trackers
    for (let col = 0; col < keyCount; col++) {
      if (activeHoldEndTimes[col] < currentTime) {
        activeHoldEndTimes[col] = 0;
      }
    }
    
    // Difficulty filters: Decide probability of making a hit object
    let noteProbability = 0;
    
    if (stepInBeat === 0) {
      // Downbeat (always high probability)
      noteProbability = difficultyMultiplier >= 4 ? 0.9 : 0.75;
    } else if (stepInBeat === 2) {
      // 1/2 Beat
      noteProbability = difficultyMultiplier >= 3 ? 0.65 : 0.35;
    } else {
      // 1/4 Beats (upbeats/offbeats)
      noteProbability = difficultyMultiplier >= 5.5 ? 0.45 : (difficultyMultiplier >= 4 ? 0.18 : 0);
    }
    
    if (rand.next() > noteProbability) {
      continue;
    }

    // Pattern picker
    const patternRoll = rand.next();
    
    // Columns tracker
    let spawnedInStep = 0;
    // Max simultaneous keys in chords based on star difficulty (chords = 2 for moderate, 3 or 4 for expert)
    const maxChords = difficultyMultiplier >= 6 ? Math.min(3, keyCount - 1) : (difficultyMultiplier >= 3 ? 2 : 1);
    
    // Determine target columns to spawn hit elements
    const colsToSpawn: number[] = [];
    
    if (patternRoll < 0.25 && difficultyMultiplier > 3.0) {
      // 1. Staircase pattern
      lastColumn += climbDirection;
      if (lastColumn >= keyCount) {
        lastColumn = keyCount - 2;
        climbDirection = -1;
      } else if (lastColumn < 0) {
        lastColumn = 1;
        climbDirection = 1;
      }
      colsToSpawn.push(lastColumn);
    } 
    else if (patternRoll < 0.45 && difficultyMultiplier > 2.5) {
      // 2. Trills (alternating two keys)
      const trillColA = (beatIndex % 2 === 0) ? lastColumn : (lastColumn + 1) % keyCount;
      colsToSpawn.push(trillColA);
    }
    else {
      // 3. Regular chords or single notes
      const count = rand.range(1, maxChords);
      for (let c = 0; c < count; c++) {
        let trialCol = rand.range(0, keyCount - 1);
        // Avoid duplicate columns in the current step
        if (!colsToSpawn.includes(trialCol)) {
          colsToSpawn.push(trialCol);
        }
      }
    }
    
    // Actually spawn notes on selected columns
    for (const targetCol of colsToSpawn) {
      // If column has an ongoing hold note, skip
      if (activeHoldEndTimes[targetCol] > 0) continue;
      
      // Hold note roll: Make notes holds based on ratings (10-25% chance of holds)
      // Ambient track has higher holds
      const holdChance = song.id === 'ambient_zen' ? 0.45 : 0.15;
      const isHold = (rand.next() < holdChance) && (difficultyMultiplier >= 2.0);
      
      let type: NoteType = 'normal';
      let endTime: number | undefined;
      
      if (isHold) {
        type = 'hold';
        // Hold duration can be between 1 beat to 3 beats long
        const holdBeatsCount = rand.range(2, 4); // 2 to 4 eighth-note steps
        endTime = currentTime + (holdBeatsCount * (beatDurationMs / 2));
        
        // Safety cap mapping end limits
        if (endTime > mapEndMs) endTime = mapEndMs;
        activeHoldEndTimes[targetCol] = endTime;
      }
      
      notes.push({
        id: `${song.id}_p_${noteCounter++}`,
        time: currentTime,
        column: targetCol,
        type,
        endTime,
        isHit: false,
        isReleased: false,
        isMissed: false,
        isHoldFailed: false,
      });
      
      spawnedInStep++;
      if (spawnedInStep >= maxChords) break;
    }
  }
  
  // Final safeguard check: sort note chronology ascending
  notes.sort((a, b) => a.time - b.time);

  // Setup Overall Difficulty windows & HP drain rates corresponding to stars metric
  const overallDifficulty = Math.min(10.0, Math.max(2.0, difficultyMultiplier * 0.9));
  const hpDrainRate = Math.min(10.0, Math.max(3.0, (10 - difficultyMultiplier) * 0.5 + 4.0));

  return {
    id: `${song.id}_${keyCount}k_${difficultyMultiplier.toFixed(1)}s`,
    title: song.title,
    artist: song.artist,
    creator: 'Beatmap Engine',
    difficulty: difficultyMultiplier < 3.0 ? 'Easy' : (difficultyMultiplier < 5.0 ? 'Normal' : (difficultyMultiplier < 7.0 ? 'Hard' : 'Expert')),
    stars: parseFloat(difficultyMultiplier.toFixed(1)),
    bpm,
    keyCount,
    duration: durationSec,
    notes,
    hpDrainRate,
    overallDifficulty,
  };
}
