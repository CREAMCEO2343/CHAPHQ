// db.js
//
// A thin wrapper around IndexedDB — the browser's built-in database for
// storing structured data on the device (unlike localStorage, it can
// hold large amounts of data and even binary files like photos).
//
// IndexedDB's native API is callback-based and a little clunky, so this
// file's only job is to wrap it in modern Promises, and to create the
// object stores listed in schema.js the first time the app runs. Nothing
// in here knows anything about "meals" or "workouts" specifically —
// storage.js (the next file) is what gives each store meaning. That
// split is what lets storage.js be rewritten to talk to a cloud database
// later without this file changing at all.

import { STORE_DEFINITIONS } from './schema.js';

const DB_NAME = 'liamhq-db';
// v2: Liam HQ pillar restructure — added foodLogs, workoutSplits,
// bodyStats, trades, watchlist, macroNotes, bizItems stores.
const DB_VERSION = 2;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Runs the first time the app opens, or whenever DB_VERSION is bumped.
    // This is the only place object stores are allowed to be created.
    request.onupgradeneeded = () => {
      const db = request.result;
      STORE_DEFINITIONS.forEach(({ name, keyPath }) => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath });
        }
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function runTransaction(storeName, mode, work) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = work(store);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );
}

export function getAll(storeName) {
  return runTransaction(storeName, 'readonly', (store) => store.getAll());
}

export function get(storeName, key) {
  return runTransaction(storeName, 'readonly', (store) => store.get(key));
}

export function put(storeName, value) {
  return runTransaction(storeName, 'readwrite', (store) => store.put(value));
}

export function remove(storeName, key) {
  return runTransaction(storeName, 'readwrite', (store) => store.delete(key));
}

export function clear(storeName) {
  return runTransaction(storeName, 'readwrite', (store) => store.clear());
}
