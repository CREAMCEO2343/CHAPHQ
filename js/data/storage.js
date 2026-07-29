// storage.js
//
// THE FILE EVERY SECTION SHOULD IMPORT FROM — never import db.js
// directly from a section file. This is the "front door" for all app
// data: Storage.meals.getAll(), Storage.goals.save(goal), and so on.
//
// Why the indirection matters: right now, every function below is
// backed by IndexedDB (via db.js), so everything lives only on this
// device. When you're ready to add cloud sync later, you'll rewrite the
// INSIDE of this file to call a web API instead — but Storage.meals.getAll()
// will still exist, still return the same shape of data, and still work
// the exact same way from every section's point of view. No section code
// will need to change.

import { getAll, get, put, remove } from './db.js';
import { STORE_NAMES, DEFAULT_SPLITS, createWorkoutSplit } from './schema.js';

// Builds the standard set of functions (getAll/get/save/remove) for a
// store, so we don't repeat the same four lines eight times below.
function createCollection(storeName) {
  return {
    getAll: () => getAll(storeName),
    get: (id) => get(storeName, id),
    save: (record) => put(storeName, record).then(() => record),
    remove: (id) => remove(storeName, id),
  };
}

export const Storage = {
  // Food pillar
  meals: createCollection(STORE_NAMES.MEALS),
  groceryItems: createCollection(STORE_NAMES.GROCERY_ITEMS),
  foodLogs: {
    ...createCollection(STORE_NAMES.FOOD_LOGS),
    // All entries for one day — what the pie chart and macro totals use.
    getByDate: (date) => getAll(STORE_NAMES.FOOD_LOGS).then((logs) => logs.filter((l) => l.date === date)),
  },

  // Gym pillar
  workoutSplits: createCollection(STORE_NAMES.WORKOUT_SPLITS),
  exerciseLogs: createCollection(STORE_NAMES.EXERCISE_LOGS),
  bodyStats: createCollection(STORE_NAMES.BODY_STATS),

  // Investing pillar
  holdings: createCollection(STORE_NAMES.HOLDINGS),
  trades: createCollection(STORE_NAMES.TRADES),
  watchlist: createCollection(STORE_NAMES.WATCHLIST),
  macroNotes: createCollection(STORE_NAMES.MACRO_NOTES),
  bizItems: createCollection(STORE_NAMES.BIZ_ITEMS),

  // Daily logs are keyed by date string instead of a random id, since
  // there's only ever one per day — getByDate is the natural lookup.
  dailyLogs: {
    ...createCollection(STORE_NAMES.DAILY_LOGS),
    getByDate: (date) => get(STORE_NAMES.DAILY_LOGS, date),
  },

  // Settings is a plain key/value store (theme, units, etc.) rather than
  // a list of records, so it gets a small custom shape instead of
  // createCollection's list-oriented one.
  settings: {
    get: (key) => get(STORE_NAMES.SETTINGS, key).then((record) => (record ? record.value : undefined)),
    set: (key, value) => put(STORE_NAMES.SETTINGS, { key, value }),
  },
};

// Runs once at startup (called from app.js). If the Gym pillar has no
// splits yet — first launch, or right after this feature shipped — seed
// the 5 default splits so the Workout tab never starts empty.
export async function seedDefaultsIfNeeded() {
  const splits = await Storage.workoutSplits.getAll();
  if (splits.length === 0) {
    for (const split of DEFAULT_SPLITS) {
      await Storage.workoutSplits.save(createWorkoutSplit(split));
    }
  }
}
