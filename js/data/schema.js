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
  WORKOUTS: 'workouts',
  WORKOUT_SESSIONS: 'workoutSessions',
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
  { name: STORE_NAMES.WORKOUTS, keyPath: 'id' },
  { name: STORE_NAMES.WORKOUT_SESSIONS, keyPath: 'id' },
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

// The default workout templates the Gym pillar starts with. Seeded on
// first launch (see storage.js) and fully editable after that — add,
// remove, and reorder exercises freely; this list is only the starting
// point, not a limit. `order` controls card position on the Gym home.
export const DEFAULT_WORKOUTS = [
  {
    name: 'Chest + Triceps',
    type: 'lifting',
    estimatedMin: 50,
    order: 1,
    exercises: [
      { name: 'Bench Press' },
      { name: 'Incline Dumbbell Press' },
      { name: 'Standing Cable Fly' },
      { name: 'Dips' },
      { name: 'Overhead Rope Extension' },
      { name: 'Cable Pushdown' },
    ],
  },
  {
    name: 'Back + Biceps',
    type: 'lifting',
    estimatedMin: 55,
    order: 2,
    exercises: [
      { name: 'Lat Pulldown' },
      { name: 'Seated Cable Row' },
      { name: 'Chest Supported Row' },
      { name: 'Straight Arm Cable Pulldown' },
      { name: 'Incline Dumbbell Curl' },
      { name: 'Preacher Curl' },
      { name: 'Hammer Curl' },
    ],
  },
  {
    name: 'Shoulders + Abs',
    type: 'lifting',
    estimatedMin: 45,
    order: 3,
    exercises: [
      { name: 'Dumbbell Shoulder Press' },
      { name: 'Dumbbell Lateral Raise' },
      { name: 'Rear Delt Fly' },
      { name: 'Hanging Leg Raises' },
      { name: 'Cable Crunch' },
    ],
  },
  {
    // Intentionally short — maintenance, not hypertrophy.
    name: 'Legs',
    type: 'lifting',
    estimatedMin: 35,
    order: 4,
    exercises: [
      { name: 'Leg Press' },
      { name: 'Romanian Deadlift' },
      { name: 'Standing Calf Raise' },
    ],
  },
  {
    // A simple running log: duration, optional distance/pace/notes.
    // No GPS, maps, heart rate, or health integrations — on purpose.
    name: 'Running',
    type: 'running',
    estimatedMin: 30,
    order: 5,
    exercises: [],
  },
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

// A workout template: an ordered, editable list of exercises.
export function createWorkout(overrides = {}) {
  return {
    id: newId(),
    name: '',
    type: 'lifting', // 'lifting' | 'running'
    estimatedMin: 45,
    order: 99,
    exercises: [], // [{ name }] — order in this array IS the display order
    lastCompletedAt: null, // timestamp of the last finished session
    createdAt: Date.now(),
    ...overrides,
  };
}

// One finished training session. Lifting sessions fill `exercises`;
// running sessions fill `running` instead. History lists these.
export function createWorkoutSession(overrides = {}) {
  return {
    id: newId(),
    workoutId: null,
    workoutName: '',
    type: 'lifting',
    date: todayISO(),
    durationSec: null,
    exercises: [], // [{ name, sets: [{ weight, reps, completed }] }]
    running: null, // { durationMin, distanceMi, pace, notes }
    createdAt: Date.now(),
    ...overrides,
  };
}

// One body check-in. The UI currently records weight only; bodyFatPercent,
// measurements, and photo are deliberate placeholders so those features
// can be switched on later without a data migration.
export function createBodyStat(overrides = {}) {
  return {
    id: newId(),
    date: todayISO(),
    weight: null,
    bodyFatPercent: null, // not in the UI yet
    measurements: {}, // not in the UI yet — e.g. { waist: 32, chest: 40 }
    photo: null, // not in the UI yet
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
