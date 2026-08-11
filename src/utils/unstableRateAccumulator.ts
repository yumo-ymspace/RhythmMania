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
