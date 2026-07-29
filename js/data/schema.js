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
  MEALS: 'meals',
  GROCERY_ITEMS: 'groceryItems',
  WORKOUT_ROUTINES: 'workoutRoutines',
  EXERCISE_LOGS: 'exerciseLogs',
  PROGRESS_ENTRIES: 'progressEntries',
  SCHOOL_ITEMS: 'schoolItems',
  GOALS: 'goals',
  DAILY_LOGS: 'dailyLogs',
  SETTINGS: 'settings',
};

// Every object store, and which field of its records is the unique key.
// db.js reads this list to create the stores the first time the app runs.
export const STORE_DEFINITIONS = [
  { name: STORE_NAMES.MEALS, keyPath: 'id' },
  { name: STORE_NAMES.GROCERY_ITEMS, keyPath: 'id' },
  { name: STORE_NAMES.WORKOUT_ROUTINES, keyPath: 'id' },
  { name: STORE_NAMES.EXERCISE_LOGS, keyPath: 'id' },
  { name: STORE_NAMES.PROGRESS_ENTRIES, keyPath: 'id' },
  { name: STORE_NAMES.SCHOOL_ITEMS, keyPath: 'id' },
  { name: STORE_NAMES.GOALS, keyPath: 'id' },
  // Daily logs use the date itself ("2026-07-29") as the key, since
  // there's only ever one log per day.
  { name: STORE_NAMES.DAILY_LOGS, keyPath: 'date' },
  // Settings is a simple key/value store: { key: 'theme', value: 'dark' }.
  { name: STORE_NAMES.SETTINGS, keyPath: 'key' },
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

export function createWorkoutRoutine(overrides = {}) {
  return {
    id: newId(),
    name: '',
    exercises: [], // [{ name, targetSets, targetReps }]
    createdAt: Date.now(),
    ...overrides,
  };
}

export function createExerciseLog(overrides = {}) {
  return {
    id: newId(),
    routineId: null,
    exerciseName: '',
    date: todayISO(),
    sets: [], // [{ reps, weight }]
    createdAt: Date.now(),
    ...overrides,
  };
}

export function createProgressEntry(overrides = {}) {
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

export function createSchoolItem(overrides = {}) {
  return {
    id: newId(),
    type: 'assignment', // 'class' | 'assignment' | 'exam' | 'note'
    title: '',
    details: '',
    dueDate: null,
    completed: false,
    createdAt: Date.now(),
    ...overrides,
  };
}

export function createGoal(overrides = {}) {
  return {
    id: newId(),
    type: 'habit', // 'habit' | 'fitness' | 'personal'
    title: '',
    targetPerWeek: 7,
    streak: 0,
    completedDates: [], // ["2026-07-29", ...]
    createdAt: Date.now(),
    ...overrides,
  };
}

export function createDailyLog(overrides = {}) {
  return {
    date: todayISO(),
    calories: null,
    protein: null,
    waterMl: null,
    weight: null,
    gymCompleted: false,
    ...overrides,
  };
}
