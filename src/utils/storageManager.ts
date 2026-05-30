/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Beatmap } from '../types';
import { AssetLifecycleManager } from './assetLifecycle';
import { TempMemoryCache } from './tempMemoryCache';

export interface SavedBeatmap extends Beatmap {
  packageId?: string; // Links to the original .osz package
  parentPackageId?: string; // Relational link to the original server-hosted .osz source package
  audioFilename?: string;
  videoFilename?: string | null;
  bgFilename?: string | null;
  originalOsuContent?: string;
  isServerMap?: boolean;
  oszUrl?: string;
}

export interface PackageRecord {
  id: string; // Matches beatmap.packageId
  name: string; // Name of imported file
  zipBlob?: Blob; // Deprecated backward compatibility field
  zipData?: ArrayBuffer; // Stable binary storage instead of raw Blob
}

const DB_NAME = 'RhythmManiaDB';
const DB_VERSION = 1;

class LRUBlobCache {
  private capacity: number = 3;
  // Map of beatmap ID to resolved media URLs
  private cache: Map<string, { audioUrl: string; videoUrl: string; bgUrl: string }> = new Map();
  // Queue tracking access order (LRU)
  private order: string[] = [];

  constructor(capacity = 3) {
    this.capacity = capacity;
  }

  public get(id: string) {
    if (!this.cache.has(id)) return null;
    // Move to end (most recently used)
    this.order = this.order.filter(key => key !== id);
    this.order.push(id);
    return this.cache.get(id);
  }

  public put(id: string, urls: { audioUrl: string; videoUrl: string; bgUrl: string }) {
    if (this.cache.has(id)) {
      this.order = this.order.filter(key => key !== id);
    } else {
      if (this.order.length >= this.capacity) {
        const oldestId = this.order.shift();
        if (oldestId) {
          this.evict(oldestId);
        }
      }
    }
    this.cache.set(id, urls);
    this.order.push(id);
    console.log(`LRUBlobCache: Preserved resource URLs for ${id}. Active caching count: ${this.cache.size}/${this.capacity}`);
  }

  public evict(id: string) {
    const urls = this.cache.get(id);
    if (urls) {
      if (urls.audioUrl && urls.audioUrl.startsWith('blob:')) {
        AssetLifecycleManager.releaseSpecific(urls.audioUrl);
      }
      if (urls.videoUrl && urls.videoUrl.startsWith('blob:')) {
        AssetLifecycleManager.releaseSpecific(urls.videoUrl);
      }
      if (urls.bgUrl && urls.bgUrl.startsWith('blob:')) {
        AssetLifecycleManager.releaseSpecific(urls.bgUrl);
      }
    }
    this.cache.delete(id);
    this.order = this.order.filter(key => key !== id);
    console.log(`LRUBlobCache: Revoked and freed memory blobs for map: ${id}`);
  }

  public clearAll() {
    this.order.forEach(id => {
      this.evict(id);
    });
    this.cache.clear();
    this.order = [];
    console.log('LRUBlobCache: Flushed all preloaded song blobs.');
  }
}

class StorageManager {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;
  public lruMediaCache = new LRUBlobCache(3);

  constructor() {
    this.initPromise = this.init();
  }

  private init(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB is not supported on this platform.'));
        return;
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open RhythmMania IndexedDB');
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('Successfully opened RhythmMania IndexedDB');
        resolve(request.result);
      };

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const database = request.result;
        
        // 1. Beatmaps storage store
        if (!database.objectStoreNames.contains('beatmaps')) {
          database.createObjectStore('beatmaps', { keyPath: 'id' });
        }

        // 2. Original OSZ zip file bytes store
        if (!database.objectStoreNames.contains('packages')) {
          database.createObjectStore('packages', { keyPath: 'id' });
        }
      };
    });
  }

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.init();
    return this.initPromise;
  }

  /**
   * Saves raw imported ZIP bytes securely after converting to a stable ArrayBuffer
   */
  public async savePackage(id: string, name: string, zipBlob: Blob): Promise<void> {
    const database = await this.getDB();
    const arrayBuffer = await zipBlob.arrayBuffer();

    // 1. Temporarily register buffer in the memory bridge for immediate play bypass
    TempMemoryCache.set(id, arrayBuffer);

    // 2. Clone the buffer for the DB transaction to avoid V8 memory detachment
    const dbBufferCopy = arrayBuffer.slice(0);

    return new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('packages', 'readwrite');
      const store = transaction.objectStore('packages');
      
      const record: PackageRecord = { id, name, zipData: dbBufferCopy };
      const request = store.put(record);

      // Await complete transactional execution and disk commit
      transaction.oncomplete = () => {
        console.log(`Database transaction fully committed to disk for package: ${id}`);
        resolve();
      };
      transaction.onerror = () => {
        reject(transaction.error || request.error);
      };
    });
  }

  /**
   * Saves parsed beatmap metadata and notes directly
   */
  public async saveBeatmap(beatmap: SavedBeatmap): Promise<void> {
    const database = await this.getDB();
    return new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('beatmaps', 'readwrite');
      const store = transaction.objectStore('beatmaps');
      const request = store.put(beatmap);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || request.error);
    });
  }

  /**
   * Retrieves all imported beatmaps
   */
  public async getAllBeatmaps(): Promise<SavedBeatmap[]> {
    const database = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('beatmaps', 'readonly');
      const store = transaction.objectStore('beatmaps');
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retrieves ZIP bytes for extracting assets, reconstituting it from ArrayBuffer representation
   */
  public async getPackage(id: string): Promise<Blob | null> {
    const database = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('packages', 'readonly');
      const store = transaction.objectStore('packages');
      const request = store.get(id);

      request.onsuccess = () => {
        const record = request.result as PackageRecord | undefined;
        if (record) {
          const buffer = record.zipData || record.zipBlob;
          if (buffer) {
            resolve(new Blob([buffer], { type: 'application/octet-stream' }));
          } else {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Purges a beatmap from DB and revokes LRU Blob URLs.
   * If no other difficulties belong to its package, clean up the original zip too!
   */
  public async deleteBeatmapAndCleanup(id: string): Promise<void> {
    const database = await this.getDB();
    
    // 1. Evict any active Object URL resource pointers from the LRU cache immediately
    this.lruMediaCache.evict(id);

    // 2. Query target beatmap to grab its packageId
    const beatmap: SavedBeatmap | null = await new Promise((resolve, reject) => {
      const tx = database.transaction('beatmaps', 'readonly');
      const req = tx.objectStore('beatmaps').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });

    if (!beatmap) return;

    // 3. Delete the beatmap record
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('beatmaps', 'readwrite');
      const req = tx.objectStore('beatmaps').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || req.error);
    });

    // 4. Clean up the original package ZIP if no remaining beatmaps require it
    if (beatmap.packageId) {
      const packageId = beatmap.packageId;
      const allMaps: SavedBeatmap[] = await this.getAllBeatmaps();
      const referencesExist = allMaps.some(m => m.packageId === packageId);

      if (!referencesExist) {
        // Complete sweep of original archive
        await new Promise<void>((resolve, reject) => {
          const tx = database.transaction('packages', 'readwrite');
          const req = tx.objectStore('packages').delete(packageId);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || req.error);
        });
        console.log(`StorageManager: Safely deleted unreferenced ZIP package ${packageId}`);
      }
    }
    console.log(`StorageManager: Beatmap ${id} completely removed from index.`);
  }
}

export const storageManager = new StorageManager();
