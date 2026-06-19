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

// Service Worker for RhythmMania PWA Offline Support
const CACHE_NAME = 'rhythm-mania-cache-v1';
const BEATMAP_CACHE_NAME = 'rhythm-mania-beatmaps';

// Core assets to pre-cache immediately on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/public/beatmaps/manifest.json',
  '/metadata.json'
];

self.addEventListener('install', (event) => {
  // force active immediately of the new service worker
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching core app shell assets');
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[Service Worker] Pre-cache warning (some files might be generated during build):', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  // Claim clients immediately to let sw control the pages
  event.waitUntil(self.clients.claim());
  
  // Clean up any stale caches from previous versions
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== BEATMAP_CACHE_NAME) {
            console.log('[Service Worker] Evicting stale cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // 1. Bypass certain development or dynamic URLs
  if (
    url.pathname.includes('/@vite/') ||
    url.pathname.includes('/@react-refresh') ||
    url.hash.includes('vite') ||
    event.request.method !== 'GET' ||
    url.hostname === 'localhost' && url.port !== '3000' // skip foreign dev ports
  ) {
    return;
  }

  // 2. Specialized Cache-First policy for beatmaps / .osz files / .txt files
  const isBeatmapAsset = 
    url.pathname.endsWith('.osz') || 
    url.pathname.endsWith('.zip') || 
    url.pathname.includes('/beatmaps/') ||
    url.pathname.endsWith('.txt') ||
    url.pathname.endsWith('.mp3') ||
    url.pathname.endsWith('.ogg') ||
    url.pathname.endsWith('.wav');

  if (isBeatmapAsset) {
    event.respondWith(
      caches.open(BEATMAP_CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            console.log('[Service Worker] Serving cached beatmap file:', url.pathname);
            return cachedResponse;
          }
          
          // Fetch from network, cache, and return
          console.log('[Service Worker] Downloading and caching beatmap file:', url.pathname);
          return fetch(event.request).then((networkResponse) => {
            if (networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch((err) => {
            console.error('[Service Worker] Failed to fetch beatmap offline:', err);
            // Fallback to offline search
            return new Response('Beatmap asset is offline and not pre-cached.', { status: 503, statusText: 'Offline' });
          });
        });
      })
    );
    return;
  }

  // 3. Network-First, Falling Back to Cache for core web application shell (HTML, JS, CSS, and metadata)
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse.status === 200 || networkResponse.status === 304 || networkResponse.type === 'opaque') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch((err) => {
        console.warn('[Service Worker] Network request failed, falling back to cache:', err);
        return caches.open(CACHE_NAME).then((cache) => {
          return cache.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // If navigating and completely offline, fall back to index.html
            if (event.request.mode === 'navigate') {
              return cache.match('/index.html') || cache.match('/');
            }
            throw err;
          });
        });
      })
  );
});
