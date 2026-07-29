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
//
// REP/SET TARGETS live on the workout, not on each exercise, because
// that's how the training actually works: a whole day is heavy (3 × 6–8)
// or a whole day is volume (3 × 10–12). Every exercise in the workout
// inherits its targets, so a newly added exercise is on-plan the moment
// it's created — no per-exercise bookkeeping. Running has no targets at
// all: it's a log, not a prescription.
export const DEFAULT_WORKOUTS = [
  {
    name: 'Chest + Triceps',
    type: 'lifting',
    estimatedMin: 50,
    order: 1,
    targetSets: 3,
    targetRepsLow: 6,
    targetRepsHigh: 8,
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
    targetSets: 3,
    targetRepsLow: 6,
    targetRepsHigh: 8,
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
    targetSets: 3,
    targetRepsLow: 10,
    targetRepsHigh: 12,
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
    targetSets: 3,
    targetRepsLow: 10,
    targetRepsHigh: 12,
    exercises: [
      { name: 'Leg Press' },
      { name: 'Romanian Deadlift' },
      { name: 'Standing Calf Raise' },
    ],
  },
  {
    // A simple running log: duration, optional distance/pace/notes.
    // No GPS, maps, heart rate, or health integrations — on purpose.
    // Log-only, so no rep/set targets.
    name: 'Running',
    type: 'running',
    estimatedMin: 30,
    order: 5,
    targetSets: null,
    targetRepsLow: null,
    targetRepsHigh: null,
    exercises: [],
  },
];

// ===== Food starter content =====

// The four go-to meals, seeded as favorites on first launch. Ingredients
// are stored exactly as they're cooked; `optional` ones render dimmed in
// the meal detail sheet so the core recipe reads clearly at a glance.
// Nutrition is deliberately left blank — better an honest blank than a
// made-up calorie count.
export const DEFAULT_MEALS = [
  {
    name: 'Ground Beef Power Bowl',
    favorite: true,
    ingredients: [
      { name: '90/10 or 93/7 lean ground beef' },
      { name: 'Beef bouillon cube (crumbled in while cooking)', quantity: '1' },
      { name: 'Jasmine rice' },
      { name: 'Black beans' },
      { name: 'Cucumber' },
      { name: 'Tomato' },
      { name: 'Avocado' },
      { name: 'Lime juice', optional: true },
      { name: 'Cilantro', optional: true },
      { name: 'Hot sauce or salsa', optional: true },
      { name: 'Shredded cheese', optional: true },
    ],
  },
  {
    name: 'Salmon Rice Bowl',
    favorite: true,
    ingredients: [
      { name: 'Air-fried salmon' },
      { name: 'Jasmine rice' },
      { name: 'Avocado' },
      { name: 'Cucumber' },
      { name: 'Furikake seasoning' },
      { name: 'Soy sauce' },
      { name: 'Edamame', optional: true },
      { name: 'Spicy mayo', optional: true },
    ],
  },
  {
    name: 'Pork Tenderloin & Sweet Potatoes',
    favorite: true,
    ingredients: [
      { name: 'Air-fried pork tenderloin' },
      { name: 'Sweet potatoes' },
      { name: 'Broccoli or green beans' },
      { name: 'Garlic powder' },
      { name: 'Paprika' },
      { name: 'Black pepper' },
    ],
  },
  {
    name: 'Steak & Crispy Potatoes',
    favorite: true,
    ingredients: [
      { name: 'Sirloin steak' },
      { name: 'Baby potatoes' },
      { name: 'Broccoli or asparagus' },
      { name: 'Montreal steak seasoning' },
      { name: 'Garlic powder' },
      { name: 'Black pepper' },
    ],
  },
];

// The quick-add palette at the top of the Grocery tab: the things that
// get bought over and over, one tap to drop on the list. These are NOT
// seeded onto the shopping list itself — a list you didn't write isn't a
// shopping list. `group` is the heading shown in the palette; `category`
// is which aisle section the item lands under once added.
export const GROCERY_STAPLES = [
  { group: 'Proteins', category: 'Meat', items: ['Lean ground beef', 'Salmon fillets', 'Pork tenderloin', 'Sirloin steak'] },
  { group: 'Proteins', category: 'Frozen', items: ['Frozen shrimp'] },
  { group: 'Carbs', category: 'Pantry', items: ['Jasmine rice', 'Black beans'] },
  { group: 'Carbs', category: 'Produce', items: ['Sweet potatoes', 'Baby potatoes'] },
  { group: 'Vegetables', category: 'Produce', items: ['Cucumbers', 'Tomatoes', 'Broccoli', 'Green beans', 'Avocados'] },
  {
    group: 'Seasonings',
    category: 'Pantry',
    items: [
      'Beef bouillon cubes',
      'Montreal steak seasoning',
      'Garlic powder',
      'Onion powder',
      'Paprika',
      'Black pepper',
      'Soy sauce',
      'Furikake',
      'Hot sauce or salsa',
    ],
  },
  { group: 'Everyday Basics', category: 'Dairy', items: ['Organic Valley whole milk', 'Munster cheese'] },
  { group: 'Everyday Basics', category: 'Meat', items: ['Smoked forest ham'] },
  { group: 'Everyday Basics', category: 'Produce', items: ['Romaine lettuce'] },
];

// ===== Investing starter content =====

// Current positions, seeded once. Share counts are real; prices are NOT
// seeded — they're daily closes entered through the Update Prices sheet
// (or a phase-2 feed), so nothing here pretends to be a market quote.
// Cost basis stays blank per holding, editable later.
export const DEFAULT_HOLDINGS = [
  // [ticker, shares]
  { account: 'brokerage', positions: [
    ['HNGE', 7], ['OSCR', 16], ['FCX', 8.02], ['UUUU', 40.71], ['MSFT', 1.10],
    ['CCJ', 5.01], ['MP', 10], ['ONDS', 34.42], ['NUVB', 40], ['NB', 40.27],
    ['USAR', 6.00], ['VOO', 0.009795], ['PLTR', 0.007675], ['RVI', 0.029050],
  ] },
  { account: 'ira', positions: [
    ['BND', 0.019721], ['DXJ', 0.008224], ['GLD', 0.003869], ['AAPL', 0.004205],
    ['BRK.B', 0.002836], ['GOOG', 0.004366], ['QQQ', 0.002099],
  ] },
];

// Closed trades imported from brokerage history. Realized P/L is stored
// directly (dollars + percent) rather than derived from entry/exit
// prices, because that's what the statements give you — the per-share
// prices and quantity stay blank and editable. Reasoning and lessons are
// blank by design: they're written later, by hand, from memory.
//
// [ticker, orderType, exitDate, realizedPL, realizedPLPercent]
export const IMPORTED_TRADES = [
  // --- Wins ---
  ['SPCX', 'Limit Sell', '2026-06-15', 295.09, 43.72],
  ['RVI', 'Market Sell', '2026-05-04', 112.02, 37.34],
  ['USAR', 'Limit Sell', '2026-04-22', 106.85, 39.85],
  ['UUUU', 'Market Sell', '2026-02-03', 92.04, 49.14],
  ['USAR', 'Market Sell', '2026-01-26', 67.46, 25.54],
  ['NB', 'Market Sell', '2025-10-06', 64.65, 100.70],
  ['UUUU', 'Market Sell', '2025-10-08', 61.97, 41.85],
  ['UUUU', 'Market Sell', '2026-02-03', 38.75, 49.24],
  ['CRSR', 'Limit Sell', '2026-06-01', 31.87, 13.22],
  ['UUUU', 'Limit Sell', '2026-05-06', 28.61, 7.06],
  ['USAR', 'Market Sell', '2025-10-10', 28.22, 22.08],
  ['VOO', 'Market Sell', '2026-07-27', 27.79, 2.62],
  ['UUUU', 'Market Sell', '2026-02-03', 23.16, 49.05],
  ['IBM', 'Market Sell', '2025-10-09', 19.46, 15.65],
  ['NVDA', 'Limit Sell', '2026-04-22', 12.97, 6.92],
  ['VOO', 'Market Sell', '2026-02-04', 10.78, 5.64],
  ['UUUU', 'Market Sell', '2026-02-10', 10.41, 9.93],
  ['USAR', 'Limit Sell', '2026-04-21', 9.68, 16.08],
  ['USAR', 'Market Sell', '2025-10-09', 9.26, 15.47],
  ['UUUU', 'Market Sell', '2025-10-20', 7.64, 3.64],
  ['VOO', 'Market Sell', '2026-01-16', 7.48, 6.97],
  ['BTC', 'Market Sell', '2026-04-09', 6.52, 1.88],
  ['LYSDY', 'Market Sell', '2025-09-22', 6.40, 8.49],
  ['USAR', 'Market Sell', '2026-04-22', 5.65, 72.07],
  ['VOO', 'Market Sell', '2026-02-05', 4.77, 1.95],
  ['VOO', 'Limit Sell', '2026-02-06', 1.91, 0.77],
  ['GRT', 'Market Sell', '2026-03-12', 1.63, 4.08],
  ['VOO', 'Market Sell', '2026-02-04', 1.38, 4.13],
  ['CC', 'Market Sell', '2025-10-03', 1.36, 2.16],
  ['UUUU', 'Market Sell', '2026-02-11', 0.78, 1.14],
  ['BTC', 'Market Sell', '2026-02-13', 0.27, 0.36],
  ['MP', 'Market Sell', '2025-09-08', 0.24, 0.19],
  ['F', 'Market Sell', '2026-01-29', 0.22, 0.73],
  ['UUUU', 'Limit Sell', '2026-02-11', 0.10, 0.44],
  ['AMD', 'Market Sell', '2026-03-12', 0.10, 0.10],
  ['UUUU', 'Limit Sell', '2026-02-11', 0.07, 0.31],
  ['BRK.B', 'Market Sell', '2026-04-21', 0.06, 0.04],
  ['NVDA', 'Market Sell', '2026-04-23', 0.05, 0.66],
  ['BTC', 'Market Sell', '2026-03-09', 0.04, 0.06],
  ['UUUU', 'Market Sell', '2026-02-11', 0.00, 0.00],
  // --- Losses ---
  ['XRP', 'Market Sell', '2026-02-11', -124.77, -25.00],
  ['USAR', 'Market Sell', '2026-01-20', -114.95, -34.73],
  ['NB', 'Market Sell', '2026-05-07', -66.98, -34.41],
  ['BTC', 'Market Sell', '2026-02-03', -55.10, -17.71],
  ['S. Scheffler Yes', 'Payout', '2026-04-12', -45.40, -100.00],
  ['OMEX', 'Limit Sell', '2025-12-01', -44.00, -30.77],
  ['BTC', 'Market Sell', '2026-02-12', -37.48, -11.11],
  ['BTC', 'Market Sell', '2026-02-13', -19.61, -8.93],
  ['NB', 'Market Sell', '2026-03-02', -19.01, -48.96],
  ['NB', 'Market Sell', '2026-02-23', -13.24, -48.60],
  ['NB', 'Market Sell', '2026-06-02', -8.81, -6.94],
  ['ONDS', 'Market Sell', '2026-04-21', -5.93, -12.91],
  ['USAR', 'Limit Sell', '2026-02-25', -5.50, -5.19],
  ['BTC', 'Market Sell', '2026-02-20', -5.04, -4.80],
  ['BTC', 'Market Sell', '2026-02-19', -4.97, -3.21],
  ['BTC', 'Market Sell', '2026-02-03', -3.96, -1.97],
  ['XRP', 'Market Sell', '2026-04-13', -3.53, -8.71],
  ['ONDS', 'Market Sell', '2026-03-02', -2.60, -5.14],
  ['XRP', 'Market Sell', '2026-03-09', -2.40, -4.58],
  ['SNX', 'Market Sell', '2026-02-19', -2.14, -3.60],
  ['BTC', 'Market Sell', '2026-03-10', -1.94, -0.64],
  ['XRP', 'Market Sell', '2026-03-12', -1.66, -3.21],
  ['BTC', 'Market Sell', '2026-02-22', -1.49, -1.47],
  ['USAR', 'Limit Sell', '2026-03-12', -0.96, -2.28],
  ['BTC', 'Market Sell', '2026-04-21', -0.92, -0.66],
  ['ONDS', 'Limit Sell', '2026-03-02', -0.66, -5.21],
  ['BTC', 'Market Sell', '2026-03-01', -0.58, -2.82],
  ['AAL', 'Limit Sell', '2025-11-24', -0.57, -1.45],
  ['VOO', 'Market Sell', '2026-03-04', -0.43, -0.85],
  ['VOO', 'Market Sell', '2026-03-12', -0.39, -2.03],
  ['UUUU', 'Market Sell', '2026-02-11', -0.25, -0.23],
  ['CMG', 'Market Sell', '2026-01-16', -0.03, -0.07],
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

// A workout template: an ordered, editable list of exercises, plus the
// rep/set target every exercise in it inherits (null on running logs).
export function createWorkout(overrides = {}) {
  return {
    id: newId(),
    name: '',
    type: 'lifting', // 'lifting' | 'running'
    estimatedMin: 45,
    order: 99,
    // The prescription for this day. targetRepsLow is what gets
    // pre-filled into each set; the high end is shown as the range to
    // work up to. Weight is deliberately NOT a target — it varies per
    // exercise and climbs over time, so it comes from last session's
    // numbers instead (see gym.js).
    targetSets: 3,
    targetRepsLow: 8,
    targetRepsHigh: 12,
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

// One journalled trade. There are two ways a closed trade knows its P/L:
//   1. Derived — you entered entryPrice, exitPrice and quantity, and the
//      journal does the math. This is the path for trades you open here.
//   2. Stated — realizedPL / realizedPLPercent came straight off a
//      brokerage statement, with the per-share prices left blank. This is
//      the path for imported history.
// The journal prefers the stated number when there is one, so imported
// rows never get "recalculated" into something the statement disagrees
// with. `orderType` is the human label ("Market Sell", "Limit Sell",
// "Payout") shown in the readout.
export function createTrade(overrides = {}) {
  return {
    id: newId(),
    ticker: '',
    direction: 'long', // 'long' | 'short'
    orderType: '', // 'Market Sell' | 'Limit Sell' | 'Payout' | ''
    entryPrice: null,
    exitPrice: null,
    quantity: null,
    entryDate: todayISO(),
    exitDate: null,
    realizedPL: null, // dollars, as reported
    realizedPLPercent: null, // percent, as reported
    reasoning: '',
    outcome: '', // your own post-trade notes: what happened, lessons
    status: 'open', // 'open' | 'closed'
    source: 'manual', // 'manual' | 'import'
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
