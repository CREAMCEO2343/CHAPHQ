// schema.js
//
// The single source of truth for what data this app stores and how it's
// shaped. Two things live here:
//   1. STORE_NAMES — the list of IndexedDB "tables" (called "object
//      stores") the app needs, and which field each uses as its unique ID.
//   2. createXxx() factory functions — helpers that build a blank new
//      record with sensible defaults, so section code never has to
//      remember every field name by hand.
//
// If you add a new kind of data later (say, a "supplements" tracker),
// this is the file to edit first: add it to STORE_NAMES, add a create
// function, then bump DB_VERSION in db.js by 1 so the new store gets
// created on next launch.

export const STORE_NAMES = {
  // Food pillar
  MEALS: 'meals',
  GROCERY_ITEMS: 'groceryItems',
  FOOD_LOGS: 'foodLogs',
  // Gym pillar
  WORKOUT_SPLITS: 'workoutSplits',
  EXERCISE_LOGS: 'exerciseLogs',
  BODY_STATS: 'bodyStats',
  // Investing pillar
  HOLDINGS: 'holdings',
  TRADES: 'trades',
  WATCHLIST: 'watchlist',
  MACRO_NOTES: 'macroNotes',
  BIZ_ITEMS: 'bizItems',
  // Dashboard
  DAILY_LOGS: 'dailyLogs',
  // App-wide
  SETTINGS: 'settings',
};

// Every object store, and which field of its records is the unique key.
// db.js reads this list to create the stores the first time the app runs
// (or when DB_VERSION is bumped).
export const STORE_DEFINITIONS = [
  { name: STORE_NAMES.MEALS, keyPath: 'id' },
  { name: STORE_NAMES.GROCERY_ITEMS, keyPath: 'id' },
  { name: STORE_NAMES.FOOD_LOGS, keyPath: 'id' },
  { name: STORE_NAMES.WORKOUT_SPLITS, keyPath: 'id' },
  { name: STORE_NAMES.EXERCISE_LOGS, keyPath: 'id' },
  { name: STORE_NAMES.BODY_STATS, keyPath: 'id' },
  { name: STORE_NAMES.HOLDINGS, keyPath: 'id' },
  { name: STORE_NAMES.TRADES, keyPath: 'id' },
  { name: STORE_NAMES.WATCHLIST, keyPath: 'id' },
  { name: STORE_NAMES.MACRO_NOTES, keyPath: 'id' },
  { name: STORE_NAMES.BIZ_ITEMS, keyPath: 'id' },
  // Daily logs use the date itself ("2026-07-29") as the key, since
  // there's only ever one log per day.
  { name: STORE_NAMES.DAILY_LOGS, keyPath: 'date' },
  // Settings is a simple key/value store: { key: 'theme', value: 'dark' }.
  { name: STORE_NAMES.SETTINGS, keyPath: 'key' },
];

// The 5 workout splits the Gym pillar starts with. These are seeded into
// the database on first launch (see storage.js) and fully editable after
// that — this list is only the starting point, not a limit.
export const DEFAULT_SPLITS = [
  { name: 'Chest / Tri', icon: '🏋️' },
  { name: 'Back / Bi', icon: '🚣' },
  { name: 'Shoulders', icon: '🤸' },
  { name: 'Legs', icon: '🦵' },
  { name: 'Cardio', icon: '🏃' },
];

function newId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10); // "2026-07-29"
}

// ===== Record shapes =====
// Each function returns a fresh object with every field the app might
// eventually use, pre-filled with empty/default values. Spread your own
// values over the top, e.g. createMeal({ name: 'Oatmeal' }).

// ---- Food pillar ----

export function createMeal(overrides = {}) {
  return {
    id: newId(),
    name: '',
    photo: null, // a Blob, stored directly in IndexedDB
    ingredients: [], // [{ name, quantity }]
    instructions: '',
    nutrition: { calories: null, protein: null, carbs: null, fat: null },
    tags: [],
    favorite: false,
    createdAt: Date.now(),
    ...overrides,
  };
}

export function createGroceryItem(overrides = {}) {
  return {
    id: newId(),
    name: '',
    category: 'Other',
    checked: false,
    fromMealId: null, // set when added via a meal's "add to grocery list" button
    createdAt: Date.now(),
    ...overrides,
  };
}

// One "thing I ate" entry. The Food pillar sums today's entries for the
// macro totals + pie chart, and the Dashboard reads the same numbers.
export function createFoodLog(overrides = {}) {
  return {
    id: newId(),
    date: todayISO(),
    name: '',
    calories: null,
    protein: null,
    carbs: null,
    fat: null,
    mealId: null, // set when logged from a saved meal
    source: 'manual', // 'manual' | 'meal' | 'quick-add'
    createdAt: Date.now(),
    ...overrides,
  };
}

// ---- Gym pillar ----

export function createWorkoutSplit(overrides = {}) {
  return {
    id: newId(),
    name: '',
    icon: '🏋️',
    exercises: [], // [{ name, targetSets, targetReps }]
    createdAt: Date.now(),
    ...overrides,
  };
}

export function createExerciseLog(overrides = {}) {
  return {
    id: newId(),
    splitId: null,
    exerciseName: '',
    date: todayISO(),
    sets: [], // [{ reps, weight }]
    createdAt: Date.now(),
    ...overrides,
  };
}

// Weight, body fat, measurements, progress photo — one entry per check-in.
export function createBodyStat(overrides = {}) {
  return {
    id: newId(),
    date: todayISO(),
    weight: null,
    bodyFatPercent: null,
    measurements: {}, // e.g. { waist: 32, chest: 40 }
    photo: null,
    createdAt: Date.now(),
    ...overrides,
  };
}

// ---- Investing pillar ----

// One position you own. `account` separates the regular brokerage bucket
// from the IRA. Prices are daily closes — `lastClose` is the most recent
// close you've entered (or a future price feed has written), `prevClose`
// the one before it, so day-change can be computed. A phase-2 live price
// feed only needs to update these same three fields.
export function createHolding(overrides = {}) {
  return {
    id: newId(),
    account: 'brokerage', // 'brokerage' | 'ira'
    ticker: '',
    shares: null,
    avgCost: null, // average cost per share (optional, for future gain/loss)
    lastClose: null,
    prevClose: null,
    priceDate: null, // "2026-07-29" — the date lastClose is from
    createdAt: Date.now(),
    ...overrides,
  };
}

export function createTrade(overrides = {}) {
  return {
    id: newId(),
    ticker: '',
    direction: 'long', // 'long' | 'short'
    entryPrice: null,
    exitPrice: null,
    quantity: null,
    entryDate: todayISO(),
    exitDate: null,
    reasoning: '',
    outcome: '', // your own post-trade notes: what happened, lessons
    status: 'open', // 'open' | 'closed'
    createdAt: Date.now(),
    ...overrides,
  };
}

export function createWatchlistItem(overrides = {}) {
  return {
    id: newId(),
    ticker: '',
    note: '',
    isPosition: false, // true = currently held, false = just watching
    createdAt: Date.now(),
    ...overrides,
  };
}

export function createMacroNote(overrides = {}) {
  return {
    id: newId(),
    date: todayISO(),
    title: '',
    body: '',
    createdAt: Date.now(),
    ...overrides,
  };
}

// Hollingsworth Capital: business content ideas and to-dos in one store,
// separated by `type`.
export function createBizItem(overrides = {}) {
  return {
    id: newId(),
    type: 'todo', // 'todo' | 'content'
    title: '',
    details: '',
    done: false,
    createdAt: Date.now(),
    ...overrides,
  };
}

// ---- Dashboard ----

export function createDailyLog(overrides = {}) {
  return {
    date: todayISO(),
    waterMl: null,
    weight: null,
    gymCompleted: false,
    ...overrides,
  };
}
