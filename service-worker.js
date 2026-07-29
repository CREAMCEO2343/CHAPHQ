// service-worker.js
//
// This file runs separately from the rest of the app, in the background.
// Its job is to save copies of our files so the app still opens when the
// phone has no internet connection. Think of it as the app packing a
// suitcase (the "cache") the first time it's opened, so next time it
// doesn't need to download everything again.
//
// IMPORTANT: whenever you add a new file to the app (a new section, a new
// stylesheet, etc.), add its path to APP_SHELL_FILES below and bump
// CACHE_VERSION by 1. Bumping the version is what tells an iPhone that
// already installed the app "hey, there's an update, refresh your cache."

const CACHE_VERSION = 'v3';
const CACHE_NAME = `chaphq-${CACHE_VERSION}`;

const APP_SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/variables.css',
  './css/base.css',
  './css/components.css',
  './css/navbar.css',
  './css/sections/dashboard.css',
  './css/sections/gym.css',
  './css/sections/food.css',
  './css/sections/investing.css',
  './css/sections/school.css',
  './css/sections/settings.css',
  './js/app.js',
  './js/router.js',
  './js/data/db.js',
  './js/data/storage.js',
  './js/data/schema.js',
  './js/data/prices.js',
  './js/components/navbar.js',
  './js/components/modal.js',
  './js/components/tabs.js',
  './js/sections/dashboard.js',
  './js/sections/gym.js',
  './js/sections/food.js',
  './js/sections/investing.js',
  './js/sections/school.js',
  './js/sections/settings.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/icon-1024.png',
  './icons/seal.png',
];

// "install" fires once, the very first time the browser sees this file.
// We open a cache and store every file the app needs to run.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll fails entirely if even one file 404s, so we go file-by-file
      // and just skip anything missing (e.g. icons not generated yet).
      return Promise.all(
        APP_SHELL_FILES.map((file) =>
          cache.add(file).catch((err) => {
            console.warn('[service-worker] could not cache', file, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

// "activate" fires after install, and any time the cache version changes.
// We delete old caches so we don't pile up stale versions forever.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => (name.startsWith('chaphq-') || name.startsWith('life-app-')) && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// "fetch" fires every time the app asks for a file (a page, a script, an
// image...).
//
// Two strategies, picked automatically:
//  - On localhost (developing on the PC): NETWORK-FIRST — always try to
//    get the freshest file, fall back to cache only if the server is
//    down. Without this, the cache keeps serving files you edited five
//    minutes ago, which makes development maddening.
//  - Anywhere else (real hosting / installed on iPhone): CACHE-FIRST —
//    instant loads and full offline support, refreshed when
//    CACHE_VERSION is bumped.
const IS_DEV = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (IS_DEV) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseCopy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || (event.request.mode === 'navigate' ? caches.match('./index.html') : undefined)))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          // Save a copy of anything new we fetch, so it's available offline next time.
          if (response && response.status === 200) {
            const responseCopy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
          }
          return response;
        })
        .catch(() => {
          // Offline and not cached: for page navigations, fall back to the app shell.
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});
