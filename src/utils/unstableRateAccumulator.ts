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

export class UnstableRateAccumulator {
  private count = 0;
  private mean = 0;
  private sumSquaredDelta = 0;

  public reset(): void {
    this.count = 0;
    this.mean = 0;
    this.sumSquaredDelta = 0;
  }

  public add(value: number): boolean {
    if (!Number.isFinite(value)) return false;
    this.count++;
    const delta = value - this.mean;
    this.mean += delta / this.count;
    const deltaAfterMean = value - this.mean;
    this.sumSquaredDelta += delta * deltaAfterMean;
    return true;
  }

  public get sampleCount(): number {
    return this.count;
  }

  public get populationStandardDeviation(): number | null {
    if (this.count < 2) return null;
    const standardDeviation = Math.sqrt(this.sumSquaredDelta / this.count);
    return Number.isFinite(standardDeviation) ? standardDeviation : null;
  }

  public get unstableRate(): number | null {
    const standardDeviation = this.populationStandardDeviation;
    return standardDeviation === null ? null : standardDeviation * 10;
  }
}
