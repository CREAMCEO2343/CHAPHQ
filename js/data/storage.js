// storage.js
//
// THE FILE EVERY SECTION SHOULD IMPORT FROM — never import db.js
// directly from a section file. This is the "front door" for all app
// data: Storage.meals.getAll(), Storage.holdings.save(holding), and so on.
//
// Why the indirection matters: right now, every function below is
// backed by IndexedDB (via db.js), so everything lives only on this
// device. When you're ready to add cloud sync later, you'll rewrite the
// INSIDE of this file to call a web API instead — but Storage.meals.getAll()
// will still exist, still return the same shape of data, and still work
// the exact same way from every section's point of view. No section code
// will need to change.

import { getAll, get, put, remove } from './db.js';
import {
  STORE_NAMES,
  DEFAULT_WORKOUTS,
  DEFAULT_MEALS,
  DEFAULT_HOLDINGS,
  IMPORTED_TRADES,
  createWorkout,
  createBodyStat,
  createMeal,
  createHolding,
  createTrade,
} from './schema.js';

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
  workouts: createCollection(STORE_NAMES.WORKOUTS),
  workoutSessions: createCollection(STORE_NAMES.WORKOUT_SESSIONS),
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

// Runs a one-time job and remembers that it ran, in the settings store.
//
// Why the flag and not just "is this store empty?": emptiness is a bad
// signal once the app has been used. If you delete every seeded meal
// because you didn't want them, an emptiness check would helpfully put
// them all back on next launch, forever. The flag means seeded content
// arrives exactly once and then stays deleted if you delete it.
//
// Both guards are used together below — flag AND empty — so an existing
// install that already has holdings never gets a duplicate set layered
// on top.
async function runOnce(key, job) {
  const done = await Storage.settings.get(key);
  if (done) return false;
  await job();
  await Storage.settings.set(key, true);
  return true;
}

// Runs at startup (called from app.js). Seeds starter data so no screen
// ever opens onto an empty database, and applies small data migrations
// for installs that predate a field.
export async function seedDefaultsIfNeeded() {
  const workouts = await Storage.workouts.getAll();
  if (workouts.length === 0) {
    for (const workout of DEFAULT_WORKOUTS) {
      await Storage.workouts.save(createWorkout(workout));
    }
  }

  const bodyStats = await Storage.bodyStats.getAll();
  if (bodyStats.length === 0) {
    await Storage.bodyStats.save(createBodyStat({ weight: 155 }));
  }

  await migrateWorkoutTargets();
  await seedMeals();
  await seedPortfolio();
  await seedTradeHistory();
}

// Installs created before rep/set targets existed already have the five
// workouts, so the seed block above skips them — this backfills the
// targets onto those existing records, matched by name. Anything the
// user renamed or created themselves keeps createWorkout's defaults and
// is left alone.
async function migrateWorkoutTargets() {
  await runOnce('migrated:workout-targets', async () => {
    const workouts = await Storage.workouts.getAll();
    for (const workout of workouts) {
      if (workout.targetSets !== undefined) continue;
      const preset = DEFAULT_WORKOUTS.find((w) => w.name === workout.name);
      await Storage.workouts.save({
        ...workout,
        targetSets: preset ? preset.targetSets : workout.type === 'running' ? null : 3,
        targetRepsLow: preset ? preset.targetRepsLow : workout.type === 'running' ? null : 8,
        targetRepsHigh: preset ? preset.targetRepsHigh : workout.type === 'running' ? null : 12,
      });
    }
  });
}

async function seedMeals() {
  const meals = await Storage.meals.getAll();
  if (meals.length > 0) return;
  await runOnce('seeded:meals', async () => {
    for (const meal of DEFAULT_MEALS) {
      await Storage.meals.save(createMeal(meal));
    }
  });
}

// Share counts only — prices stay null until they're entered through the
// Update Prices sheet (or a phase-2 feed writes them). See prices.js.
async function seedPortfolio() {
  const holdings = await Storage.holdings.getAll();
  if (holdings.length > 0) return;
  await runOnce('seeded:holdings', async () => {
    for (const bucket of DEFAULT_HOLDINGS) {
      for (const [ticker, shares] of bucket.positions) {
        await Storage.holdings.save(createHolding({ account: bucket.account, ticker, shares }));
      }
    }
  });
}

async function seedTradeHistory() {
  const trades = await Storage.trades.getAll();
  if (trades.length > 0) return;
  await runOnce('seeded:trades', async () => {
    for (const [ticker, orderType, exitDate, realizedPL, realizedPLPercent] of IMPORTED_TRADES) {
      await Storage.trades.save(
        createTrade({
          ticker,
          orderType,
          exitDate,
          realizedPL,
          realizedPLPercent,
          status: 'closed',
          source: 'import',
          // The statement gives the sell date, not the buy date — so
          // entryDate is blank rather than guessed.
          entryDate: null,
          // Mirror the exit date into createdAt so any list that sorts
          // by "when did this happen" lands in the right order.
          createdAt: Date.parse(`${exitDate}T12:00:00`),
        })
      );
    }
  });
}
