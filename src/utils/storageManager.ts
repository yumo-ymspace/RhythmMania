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

import { Beatmap } from '../types';
import { AssetLifecycleManager, getMediaCacheKey } from './assetLifecycle';
import { TempMemoryCache } from './tempMemoryCache';

export interface SavedBeatmap extends Beatmap {
  packageId?: string;
  parentPackageId?: string;
  audioFilename?: string;
  videoFilename?: string | null;
  bgFilename?: string | null;
  originalContent?: string;
  isServerMap?: boolean;
  oszUrl?: string;
  importedAt?: number; // epoch ms when first saved locally; used by "Date Added" sort
}

export interface PackageRecord {
  id: string;
  name: string;
  zipData?: ArrayBuffer;
}

const DB_NAME = 'RhythmManiaDB';
const DB_VERSION = 3;

class SimpleBlobCache {
  private cache = new Map<string, { audioUrl: string; videoUrl: string; bgUrl: string }>();
  private order: string[] = [];

  constructor(private capacity = 8) {}

  public get(id: string) {
    const key = getMediaCacheKey(id);
    if (!this.cache.has(key)) return null;
    this.order = this.order.filter(k => k !== key).concat(key);
    return this.cache.get(key)!;
  }

  public put(id: string, urls: { audioUrl: string; videoUrl: string; bgUrl: string }) {
    const key = getMediaCacheKey(id);
    if (this.cache.has(key)) {
      const prev = this.cache.get(key)!;
      // Revoke replaced URLs that are no longer referenced
      if (prev.audioUrl && prev.audioUrl !== urls.audioUrl) AssetLifecycleManager.releaseSpecific(prev.audioUrl);
      if (prev.videoUrl && prev.videoUrl !== urls.videoUrl) AssetLifecycleManager.releaseSpecific(prev.videoUrl);
      if (prev.bgUrl && prev.bgUrl !== urls.bgUrl) AssetLifecycleManager.releaseSpecific(prev.bgUrl);
      this.order = this.order.filter(k => k !== key);
    } else if (this.order.length >= this.capacity) {
      const oldest = this.order.shift();
      if (oldest) this.evict(oldest);
    }
    this.cache.set(key, urls);
    this.order.push(key);
  }

  public evict(id: string) {
    const key = getMediaCacheKey(id);
    const urls = this.cache.get(key);
    if (urls) {
      if (urls.audioUrl?.startsWith('blob:')) AssetLifecycleManager.releaseSpecific(urls.audioUrl);
      if (urls.videoUrl?.startsWith('blob:')) AssetLifecycleManager.releaseSpecific(urls.videoUrl);
      if (urls.bgUrl?.startsWith('blob:')) AssetLifecycleManager.releaseSpecific(urls.bgUrl);
    }
    this.cache.delete(key);
    this.order = this.order.filter(k => k !== key);
  }

  public clearAll() {
    this.order.forEach(id => this.evict(id));
    this.cache.clear();
    this.order = [];
  }
}

class StorageManager {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;
  public lruMediaCache = new SimpleBlobCache(3);

  constructor() {
    this.initPromise = this.init();
  }

  private init(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB not supported'));
        return;
      }
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };
      request.onupgradeneeded = () => {
        const d = request.result;
        if (!d.objectStoreNames.contains('beatmaps')) d.createObjectStore('beatmaps', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('packages')) d.createObjectStore('packages', { keyPath: 'id' });
      };
    });
  }

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.initPromise) {
      try {
        return await this.initPromise;
      } catch (err) {
        this.initPromise = null;
        throw err;
      }
    }
    this.initPromise = this.init();
    try {
      return await this.initPromise;
    } catch (err) {
      this.initPromise = null;
      throw err;
    }
  }

  public async savePackage(id: string, name: string, zipBlob: Blob): Promise<void> {
    const database = await this.getDB();
    const arrayBuffer = await zipBlob.arrayBuffer();
    TempMemoryCache.set(id, arrayBuffer);

    return new Promise<void>((resolve, reject) => {
      const tx = database.transaction('packages', 'readwrite');
      const store = tx.objectStore('packages');
      store.put({ id, name, zipData: arrayBuffer.slice(0) });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async saveBeatmap(beatmap: SavedBeatmap): Promise<void> {
    const database = await this.getDB();
    const record: SavedBeatmap = { ...beatmap, importedAt: beatmap.importedAt ?? Date.now() };
    return new Promise<void>((resolve, reject) => {
      const tx = database.transaction('beatmaps', 'readwrite');
      tx.objectStore('beatmaps').put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async getAllBeatmaps(): Promise<SavedBeatmap[]> {
    const database = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('beatmaps', 'readonly');
      const req = tx.objectStore('beatmaps').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  public async getPackage(id: string): Promise<Blob | null> {
    const database = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('packages', 'readonly');
      const req = tx.objectStore('packages').get(id);
      req.onsuccess = () => {
        const record = req.result as PackageRecord | undefined;
        if (record?.zipData) {
          resolve(new Blob([record.zipData], { type: 'application/octet-stream' }));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async deleteBeatmapAndCleanup(id: string): Promise<void> {
    const database = await this.getDB();
    this.lruMediaCache.evict(id);

    const beatmap: SavedBeatmap | null = await new Promise((resolve, reject) => {
      const tx = database.transaction('beatmaps', 'readonly');
      const req = tx.objectStore('beatmaps').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });

    if (!beatmap) return;

    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('beatmaps', 'readwrite');
      tx.objectStore('beatmaps').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    if (beatmap.packageId) {
      const pkgId = beatmap.packageId;
      const allMaps = await this.getAllBeatmaps();
      const referencesExist = allMaps.some(m => m.packageId === pkgId);

      if (!referencesExist) {
        await new Promise<void>((resolve, reject) => {
          const tx = database.transaction('packages', 'readwrite');
          tx.objectStore('packages').delete(pkgId);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }
    }
  }

  public async deletePackageAndAllBeatmaps(serverMapId: string): Promise<void> {
    const database = await this.getDB();
    const packageId = `pkg_${serverMapId}`;

    // 1. Clear TempMemoryCache
    TempMemoryCache.remove(packageId);

    // 2. Evict LRU cache
    this.lruMediaCache.evict(serverMapId);

    // 3. Find and delete all beatmaps matching id prefix, parentPackageId, or packageId
    const allMaps = await this.getAllBeatmaps();
    const mapsToDelete = allMaps.filter(
      m => m.id === serverMapId || m.id.startsWith(`${serverMapId}_idx`) || m.parentPackageId === serverMapId || m.packageId === packageId
    );

    for (const m of mapsToDelete) {
      this.lruMediaCache.evict(m.id);
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction('beatmaps', 'readwrite');
        tx.objectStore('beatmaps').delete(m.id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    // 4. Delete the package itself
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('packages', 'readwrite');
      tx.objectStore('packages').delete(packageId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const storageManager = new StorageManager();
