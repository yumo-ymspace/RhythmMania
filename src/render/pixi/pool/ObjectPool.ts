/*
 * RhythmMania - High-Performance Rhythm Game Platform
 * Copyright (C) 2026 Yumo (yumo-ymspace). All rights reserved.
 */

export class ObjectPool<T> {
  private pool: T[] = [];
  private poolSet = new Set<T>();
  private createFn: () => T;
  private resetFn?: (item: T) => void;
  private destroyFn?: (item: T) => void;
  private maxSize: number;

  constructor(
    createFn: () => T,
    resetFn?: (item: T) => void,
    destroyFn?: (item: T) => void,
    maxSize: number = 500
  ) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.destroyFn = destroyFn;
    this.maxSize = maxSize;
  }

  acquire(): T {
    if (this.pool.length > 0) {
      const item = this.pool.pop()!;
      this.poolSet.delete(item);
      return item;
    }
    return this.createFn();
  }

  release(item: T): void {
    // Guard against double-release to prevent corruption of the free list
    if (this.poolSet.has(item)) {
      return;
    }

    if (this.resetFn) {
      try {
        this.resetFn(item);
      } catch (e) {}
    }

    // Limit pool size (guard against unbounded growth)
    if (this.pool.length >= this.maxSize) {
      if (this.destroyFn) {
        try {
          this.destroyFn(item);
        } catch (e) {}
      }
      return;
    }

    this.pool.push(item);
    this.poolSet.add(item);
  }

  clear(): void {
    if (this.destroyFn) {
      this.pool.forEach((item) => {
        try {
          this.destroyFn?.(item);
        } catch (e) {}
      });
    }
    this.pool = [];
    this.poolSet.clear();
  }
}
