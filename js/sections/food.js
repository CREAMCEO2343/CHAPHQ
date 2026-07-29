// food.js
//
// The Food pillar, in three sub-tabs:
//   Today   — calories + water counters side by side, a live macro pie
//             chart (protein/carbs/fat), today's logged food, a manual
//             "Log Food" form, and the AI quick-add box (stubbed for now
//             — see estimateFromText below).
//   Meals   — saved meals: photos, ingredients, instructions, nutrition,
//             favorites, search/filter. A meal can be logged to today or
//             its ingredients sent to the grocery list in one tap.
//   Grocery — the shopping list: organized by category, checkable,
//             manual adds, plus whatever meals push into it.

import { Storage } from '../data/storage.js';
import { createMeal, createGroceryItem, createFoodLog, GROCERY_STAPLES } from '../data/schema.js';
import { openModal, closeModal } from '../components/modal.js';
import { initTabs } from '../components/tabs.js';

const WATER_GOAL_ML = 3000; // daily target; a Settings option can override later
const WATER_STEP_ML = 250; // one tap = one glass

const GROCERY_CATEGORIES = ['Produce', 'Meat', 'Dairy', 'Pantry', 'Frozen', 'Other'];

// The staples palette, collapsed into { group: [{ name, category }] } so
// it renders as the headings you'd actually think in (Proteins, Carbs,
// ...) even where one group spans two store sections.
const STAPLE_GROUPS = GROCERY_STAPLES.reduce((groups, entry) => {
  const bucket = (groups[entry.group] ||= []);
  entry.items.forEach((name) => bucket.push({ name, category: entry.category }));
  return groups;
}, {});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function render() {
  return `
    <div class="page-header">
      <div class="page-header__title">Food</div>
    </div>
    <div class="page-content">
      <div id="food-tabs"></div>
      <div id="food-tab-content"></div>
    </div>
  `;
}

export function init() {
  initTabs({
    containerId: 'food-tabs',
    tabs: [
      { id: 'today', label: 'Today' },
      { id: 'meals', label: 'Meals' },
      { id: 'grocery', label: 'Grocery' },
    ],
    onChange: (tabId) => {
      if (tabId === 'today') renderTodayTab();
      if (tabId === 'meals') renderMealsTab();
      if (tabId === 'grocery') renderGroceryTab();
    },
  });
}

/* =====================================================================
   TODAY TAB — counters, pie chart, log
   ===================================================================== */

async function renderTodayTab() {
  const contentEl = document.getElementById('food-tab-content');
  const today = todayISO();
  const [logs, dailyLog] = await Promise.all([
    Storage.foodLogs.getByDate(today),
    Storage.dailyLogs.getByDate(today),
  ]);

  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  logs.forEach((log) => {
    Object.keys(totals).forEach((key) => (totals[key] += Number(log[key]) || 0));
  });
  const waterMl = dailyLog?.waterMl || 0;

  contentEl.innerHTML = `
    <div class="stat-grid">
      <div class="stat-tile">
        <div class="stat-tile__label">Calories</div>
        <div class="stat-tile__value">${logs.length === 0 ? '—' : Math.round(totals.calories)}</div>
        <div class="stat-tile__meta">today</div>
      </div>
      <div class="stat-tile food-water-tile" id="water-tile" role="button">
        <div class="stat-tile__label">Water</div>
        <div class="stat-tile__value">${waterMl}<span class="food-water-goal"> / ${WATER_GOAL_ML}ml</span></div>
        <div class="stat-tile__meta">tap for +${WATER_STEP_ML}ml</div>
      </div>
    </div>

    <div class="card food-pie-card">
      <div class="section-label">Macros</div>
      <div class="food-pie-wrap">
        ${renderMacroPie(totals)}
        <div class="food-pie-legend">
          <div><span class="food-pie-dot" style="background:var(--color-accent)"></span>Protein ${Math.round(totals.protein)}g</div>
          <div><span class="food-pie-dot" style="background:var(--color-warning)"></span>Carbs ${Math.round(totals.carbs)}g</div>
          <div><span class="food-pie-dot" style="background:var(--color-danger)"></span>Fat ${Math.round(totals.fat)}g</div>
        </div>
      </div>
    </div>

    <div class="food-quickadd card">
      <div class="section-label">Quick Add</div>
      <div class="list-row__meta">Type what you ate in plain words — an AI estimate is coming in phase 2; for now this gives placeholder numbers you can correct before saving.</div>
      <div class="food-quickadd__row">
        <input class="input" type="text" id="quickadd-input" placeholder="e.g. 2 eggs and toast with butter" />
        <button class="btn btn-secondary" id="quickadd-btn">Estimate</button>
      </div>
    </div>

    <button class="btn btn-primary" id="log-food-btn">+ Log Food</button>

    ${
      logs.length === 0
        ? `<div class="empty-state">
             <div class="empty-state__icon">🍽️</div>
             <div class="empty-state__title">Nothing logged today</div>
             <div class="empty-state__subtitle">Log food manually, from a saved meal, or with Quick Add.</div>
           </div>`
        : logs
            .sort((a, b) => b.createdAt - a.createdAt)
            .map(
              (log) => `
                <div class="list-row">
                  <div style="flex:1;">
                    <div class="list-row__title">${escapeHTML(log.name)}</div>
                    <div class="list-row__meta">${[
                      log.calories != null ? Math.round(log.calories) + ' cal' : null,
                      log.protein != null ? Math.round(log.protein) + 'g protein' : null,
                      log.source === 'quick-add' ? 'estimated' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}</div>
                  </div>
                  <button class="btn-icon" data-remove-log="${log.id}" aria-label="Remove">✕</button>
                </div>
              `
            )
            .join('')
    }
  `;

  document.getElementById('water-tile').addEventListener('click', async () => {
    const existing = (await Storage.dailyLogs.getByDate(today)) || { date: today, waterMl: 0, weight: null, gymCompleted: false };
    existing.waterMl = (existing.waterMl || 0) + WATER_STEP_ML;
    await Storage.dailyLogs.save(existing);
    renderTodayTab();
  });

  document.getElementById('log-food-btn').addEventListener('click', () => openLogFoodModal());
  document.getElementById('quickadd-btn').addEventListener('click', handleQuickAdd);

  contentEl.querySelectorAll('[data-remove-log]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await Storage.foodLogs.remove(btn.dataset.removeLog);
      renderTodayTab();
    });
  });
}

// A hand-drawn SVG pie: three slices for protein/carbs/fat (by grams).
// No chart library — just arc math, which keeps the app dependency-free.
function renderMacroPie(totals) {
  const total = totals.protein + totals.carbs + totals.fat;
  if (total === 0) {
    return `<svg class="food-pie" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="50" fill="none" stroke="var(--color-surface-secondary)" stroke-width="18" />
      <text x="60" y="65" text-anchor="middle" fill="var(--color-text-tertiary)" font-size="12">no data</text>
    </svg>`;
  }

  const slices = [
    { value: totals.protein, color: 'var(--color-accent)' },
    { value: totals.carbs, color: 'var(--color-warning)' },
    { value: totals.fat, color: 'var(--color-danger)' },
  ];

  let startAngle = -90; // start at 12 o'clock
  const paths = slices
    .filter((s) => s.value > 0)
    .map((slice) => {
      const sweep = (slice.value / total) * 360;
      const path = describeArc(60, 60, 50, startAngle, startAngle + sweep);
      startAngle += sweep;
      return `<path d="${path}" fill="none" stroke="${slice.color}" stroke-width="18" />`;
    })
    .join('');

  return `<svg class="food-pie" viewBox="0 0 120 120">${paths}</svg>`;
}

// Standard SVG arc helper: a donut segment from startAngle to endAngle.
function describeArc(cx, cy, r, startAngle, endAngle) {
  // A full circle can't be one arc — split it just under 360°.
  if (endAngle - startAngle >= 359.99) endAngle = startAngle + 359.99;
  const toXY = (angle) => {
    const rad = (angle * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [x1, y1] = toXY(startAngle);
  const [x2, y2] = toXY(endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

// ===== Quick Add (AI stub) =====

// PHASE 2 HOOK: replace this function's body with a real AI call (send
// the text, get calories/macros back). Everything around it — the
// confirm sheet, the logging flow — already works and won't change.
async function estimateFromText(text) {
  return {
    name: text,
    calories: 300,
    protein: 15,
    carbs: 30,
    fat: 12,
    isPlaceholder: true,
  };
}

async function handleQuickAdd() {
  const input = document.getElementById('quickadd-input');
  const text = input.value.trim();
  if (!text) return;

  const estimate = await estimateFromText(text);

  openModal({
    title: 'Confirm Estimate',
    contentHTML: `
      ${estimate.isPlaceholder ? '<div class="list-row__meta">⚠️ Placeholder numbers — real AI estimation arrives in phase 2. Correct them before saving.</div>' : ''}
      <form id="quickadd-form" class="food-form">
        <div>
          <label class="modal-sheet__field-label" for="qa-name">Food</label>
          <input class="input" type="text" id="qa-name" value="${escapeHTML(estimate.name)}" />
        </div>
        <div class="food-form__grid">
          <div><label class="modal-sheet__field-label" for="qa-calories">Calories</label><input class="input" type="number" id="qa-calories" value="${estimate.calories}" /></div>
          <div><label class="modal-sheet__field-label" for="qa-protein">Protein (g)</label><input class="input" type="number" id="qa-protein" value="${estimate.protein}" /></div>
          <div><label class="modal-sheet__field-label" for="qa-carbs">Carbs (g)</label><input class="input" type="number" id="qa-carbs" value="${estimate.carbs}" /></div>
          <div><label class="modal-sheet__field-label" for="qa-fat">Fat (g)</label><input class="input" type="number" id="qa-fat" value="${estimate.fat}" /></div>
        </div>
        <button type="submit" class="btn btn-primary">Log It</button>
      </form>
    `,
    onOpen: () => {
      document.getElementById('quickadd-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const readNum = (id) => {
          const v = document.getElementById(id).value;
          return v === '' ? null : Number(v);
        };
        await Storage.foodLogs.save(
          createFoodLog({
            name: document.getElementById('qa-name').value.trim(),
            calories: readNum('qa-calories'),
            protein: readNum('qa-protein'),
            carbs: readNum('qa-carbs'),
            fat: readNum('qa-fat'),
            source: 'quick-add',
          })
        );
        input.value = '';
        renderTodayTab();
        closeModal();
      });
    },
  });
}

// ===== Manual log =====

function openLogFoodModal() {
  openModal({
    title: 'Log Food',
    contentHTML: `
      <form id="log-food-form" class="food-form">
        <div>
          <label class="modal-sheet__field-label" for="lf-name">What did you eat?</label>
          <input class="input" type="text" id="lf-name" placeholder="e.g. Chicken bowl" required />
        </div>
        <div class="food-form__grid">
          <div><label class="modal-sheet__field-label" for="lf-calories">Calories</label><input class="input" type="number" inputmode="decimal" id="lf-calories" placeholder="0" /></div>
          <div><label class="modal-sheet__field-label" for="lf-protein">Protein (g)</label><input class="input" type="number" inputmode="decimal" id="lf-protein" placeholder="0" /></div>
          <div><label class="modal-sheet__field-label" for="lf-carbs">Carbs (g)</label><input class="input" type="number" inputmode="decimal" id="lf-carbs" placeholder="0" /></div>
          <div><label class="modal-sheet__field-label" for="lf-fat">Fat (g)</label><input class="input" type="number" inputmode="decimal" id="lf-fat" placeholder="0" /></div>
        </div>
        <button type="submit" class="btn btn-primary">Log Food</button>
      </form>
    `,
    onOpen: () => {
      document.getElementById('log-food-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const readNum = (id) => {
          const v = document.getElementById(id).value;
          return v === '' ? null : Number(v);
        };
        await Storage.foodLogs.save(
          createFoodLog({
            name: document.getElementById('lf-name').value.trim(),
            calories: readNum('lf-calories'),
            protein: readNum('lf-protein'),
            carbs: readNum('lf-carbs'),
            fat: readNum('lf-fat'),
            source: 'manual',
          })
        );
        renderTodayTab();
        closeModal();
      });
    },
  });
}

/* =====================================================================
   MEALS TAB — saved meals library
   ===================================================================== */

let allMeals = [];
let mealSearch = '';
let mealFilter = 'all'; // 'all' | 'favorites'

async function renderMealsTab() {
  const contentEl = document.getElementById('food-tab-content');
  allMeals = await Storage.meals.getAll();

  contentEl.innerHTML = `
    <div class="search-bar">
      <span class="icon">🔍</span>
      <input type="search" id="meals-search" placeholder="Search meals or ingredients" value="${escapeHTML(mealSearch)}" />
    </div>
    <div class="chip-row">
      <button class="chip${mealFilter === 'all' ? ' active' : ''}" data-filter="all">All</button>
      <button class="chip${mealFilter === 'favorites' ? ' active' : ''}" data-filter="favorites">Favorites</button>
    </div>
    <div id="meals-list"></div>
    <button class="btn btn-primary" id="add-meal-btn">+ Add Meal</button>
  `;

  renderMealsList();

  document.getElementById('meals-search').addEventListener('input', (event) => {
    mealSearch = event.target.value.trim().toLowerCase();
    renderMealsList();
  });

  contentEl.querySelectorAll('.chip[data-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      mealFilter = chip.dataset.filter;
      contentEl.querySelectorAll('.chip[data-filter]').forEach((c) => c.classList.toggle('active', c === chip));
      renderMealsList();
    });
  });

  document.getElementById('add-meal-btn').addEventListener('click', () => openMealFormModal());
}

function renderMealsList() {
  const listEl = document.getElementById('meals-list');
  const meals = allMeals.filter((meal) => {
    if (mealFilter === 'favorites' && !meal.favorite) return false;
    if (!mealSearch) return true;
    const haystack = [meal.name, ...(meal.ingredients || []).map((i) => i.name)].join(' ').toLowerCase();
    return haystack.includes(mealSearch);
  });

  if (meals.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📖</div>
        <div class="empty-state__title">${allMeals.length === 0 ? 'No meals saved yet' : 'No matching meals'}</div>
        <div class="empty-state__subtitle">${allMeals.length === 0 ? 'Save your go-to meals with ingredients and nutrition.' : 'Try a different search or filter.'}</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = meals
    .map((meal) => {
      const calories = meal.nutrition?.calories;
      const metaParts = [];
      if (calories != null && calories !== '') metaParts.push(`${calories} cal`);
      if ((meal.ingredients || []).length) metaParts.push(`${meal.ingredients.length} ingredients`);
      return `
        <div class="list-row" data-meal-id="${meal.id}" style="cursor:pointer;">
          ${meal.photo ? `<img class="meal-row__thumb" src="${URL.createObjectURL(meal.photo)}" alt="" />` : `<div class="meal-row__thumb meal-row__thumb--placeholder">🍽️</div>`}
          <div style="flex:1;">
            <div class="list-row__title">${escapeHTML(meal.name || 'Untitled meal')}</div>
            ${metaParts.length ? `<div class="list-row__meta">${metaParts.join(' · ')}</div>` : ''}
          </div>
          <span class="meal-row__favorite">${meal.favorite ? '⭐' : '☆'}</span>
        </div>
      `;
    })
    .join('');

  listEl.querySelectorAll('.list-row[data-meal-id]').forEach((row) => {
    row.addEventListener('click', (event) => {
      if (event.target.closest('.meal-row__favorite')) return;
      const meal = allMeals.find((m) => m.id === row.dataset.mealId);
      if (meal) openMealDetailModal(meal);
    });
  });

  listEl.querySelectorAll('.meal-row__favorite').forEach((star) => {
    star.addEventListener('click', async (event) => {
      event.stopPropagation();
      const meal = allMeals.find((m) => m.id === star.closest('[data-meal-id]').dataset.mealId);
      if (!meal) return;
      meal.favorite = !meal.favorite;
      await Storage.meals.save(meal);
      renderMealsList();
    });
  });
}

// Ingredients round-trip through a plain textarea, one per line. An
// optional ingredient is written back out with a trailing "(optional)"
// so editing a meal doesn't silently promote its garnishes to required.
function ingredientsToText(ingredients) {
  return (ingredients || []).map((i) => (i.optional ? `${i.name} (optional)` : i.name)).join('\n');
}

function ingredientsFromText(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const optional = /\(optional\)$/i.test(line);
      const name = optional ? line.replace(/\s*\(optional\)$/i, '').trim() : line;
      return optional ? { name, quantity: '', optional: true } : { name, quantity: '' };
    });
}

function openMealFormModal(existingMeal = null) {
  const meal = existingMeal || createMeal();
  const ingredientsText = ingredientsToText(meal.ingredients);

  openModal({
    title: existingMeal ? 'Edit Meal' : 'Add Meal',
    contentHTML: `
      <form id="meal-form" class="food-form">
        <div>
          <label class="modal-sheet__field-label" for="meal-photo">Photo</label>
          <input class="input" type="file" id="meal-photo" accept="image/*" capture="environment" />
          <div id="meal-photo-preview" class="meals-form__photo-preview"></div>
        </div>
        <div>
          <label class="modal-sheet__field-label" for="meal-name">Name</label>
          <input class="input" type="text" id="meal-name" value="${escapeHTML(meal.name)}" placeholder="e.g. Chicken Stir Fry" required />
        </div>
        <div>
          <label class="modal-sheet__field-label" for="meal-ingredients">Ingredients (one per line)</label>
          <textarea class="textarea" id="meal-ingredients" placeholder="2 chicken breasts&#10;1 cup rice&#10;Broccoli">${escapeHTML(ingredientsText)}</textarea>
        </div>
        <div>
          <label class="modal-sheet__field-label" for="meal-instructions">Cooking instructions</label>
          <textarea class="textarea" id="meal-instructions" placeholder="Steps to make it...">${escapeHTML(meal.instructions || '')}</textarea>
        </div>
        <div class="food-form__grid">
          <div><label class="modal-sheet__field-label" for="meal-calories">Calories</label><input class="input" type="number" id="meal-calories" value="${meal.nutrition?.calories ?? ''}" placeholder="0" /></div>
          <div><label class="modal-sheet__field-label" for="meal-protein">Protein (g)</label><input class="input" type="number" id="meal-protein" value="${meal.nutrition?.protein ?? ''}" placeholder="0" /></div>
          <div><label class="modal-sheet__field-label" for="meal-carbs">Carbs (g)</label><input class="input" type="number" id="meal-carbs" value="${meal.nutrition?.carbs ?? ''}" placeholder="0" /></div>
          <div><label class="modal-sheet__field-label" for="meal-fat">Fat (g)</label><input class="input" type="number" id="meal-fat" value="${meal.nutrition?.fat ?? ''}" placeholder="0" /></div>
        </div>
        <label class="meals-form__favorite-toggle">
          <input type="checkbox" id="meal-favorite" ${meal.favorite ? 'checked' : ''} />
          <span>Mark as favorite</span>
        </label>
        <button type="submit" class="btn btn-primary">Save Meal</button>
      </form>
    `,
    onOpen: () => {
      let selectedPhoto = meal.photo || null;
      if (selectedPhoto) {
        document.getElementById('meal-photo-preview').innerHTML = `<img src="${URL.createObjectURL(selectedPhoto)}" alt="" />`;
      }

      document.getElementById('meal-photo').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        selectedPhoto = file;
        document.getElementById('meal-photo-preview').innerHTML = `<img src="${URL.createObjectURL(file)}" alt="" />`;
      });

      document.getElementById('meal-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const readNum = (id) => {
          const v = document.getElementById(id).value;
          return v === '' ? null : Number(v);
        };
        const ingredients = ingredientsFromText(document.getElementById('meal-ingredients').value);

        await Storage.meals.save({
          ...meal,
          name: document.getElementById('meal-name').value.trim(),
          photo: selectedPhoto,
          ingredients,
          instructions: document.getElementById('meal-instructions').value.trim(),
          nutrition: {
            calories: readNum('meal-calories'),
            protein: readNum('meal-protein'),
            carbs: readNum('meal-carbs'),
            fat: readNum('meal-fat'),
          },
          favorite: document.getElementById('meal-favorite').checked,
        });
        renderMealsTab();
        closeModal();
      });
    },
  });
}

function openMealDetailModal(meal) {
  const n = meal.nutrition || {};
  const nutritionParts = [
    n.calories != null ? `${n.calories} cal` : null,
    n.protein != null ? `${n.protein}g protein` : null,
    n.carbs != null ? `${n.carbs}g carbs` : null,
    n.fat != null ? `${n.fat}g fat` : null,
  ].filter(Boolean);

  openModal({
    title: meal.name || 'Untitled meal',
    contentHTML: `
      <div class="meals-detail">
        ${meal.photo ? `<img class="meals-detail__photo" src="${URL.createObjectURL(meal.photo)}" alt="" />` : ''}
        ${nutritionParts.length ? `<div class="list-row__meta">${nutritionParts.join(' · ')}</div>` : ''}
        <button class="btn btn-primary" id="meal-log-today-btn">Log This Meal Today</button>
        ${(meal.ingredients || []).length ? `
          <button class="btn btn-secondary" id="meal-to-grocery-btn">Add Ingredients to Grocery List</button>
          <div>
            <div class="section-label">Ingredients</div>
            <ul class="meals-detail__ingredients">
              ${meal.ingredients
                .map(
                  (i) =>
                    `<li${i.optional ? ' class="meals-detail__ingredient--optional"' : ''}>${escapeHTML(i.name)}${
                      i.optional ? '<span class="meals-detail__optional-tag">optional</span>' : ''
                    }</li>`
                )
                .join('')}
            </ul>
          </div>
        ` : ''}
        ${meal.instructions ? `
          <div>
            <div class="section-label">Instructions</div>
            <p>${escapeHTML(meal.instructions)}</p>
          </div>
        ` : ''}
        <div class="meals-detail__actions">
          <button class="btn btn-secondary" id="meal-edit-btn">Edit</button>
          <button class="btn btn-secondary meals-detail__delete" id="meal-delete-btn">Delete</button>
        </div>
      </div>
    `,
    onOpen: () => {
      // One tap: today's food log gets an entry with this meal's nutrition.
      document.getElementById('meal-log-today-btn').addEventListener('click', async () => {
        await Storage.foodLogs.save(
          createFoodLog({
            name: meal.name,
            calories: n.calories,
            protein: n.protein,
            carbs: n.carbs,
            fat: n.fat,
            mealId: meal.id,
            source: 'meal',
          })
        );
        closeModal();
      });

      // One tap: every ingredient becomes an unchecked grocery item.
      const groceryBtn = document.getElementById('meal-to-grocery-btn');
      if (groceryBtn) {
        groceryBtn.addEventListener('click', async () => {
          for (const ingredient of meal.ingredients) {
            await Storage.groceryItems.save(
              createGroceryItem({ name: ingredient.name, fromMealId: meal.id })
            );
          }
          groceryBtn.textContent = '✓ Added to Grocery List';
          groceryBtn.disabled = true;
        });
      }

      document.getElementById('meal-edit-btn').addEventListener('click', () => {
        closeModal();
        setTimeout(() => openMealFormModal(meal), 420);
      });

      document.getElementById('meal-delete-btn').addEventListener('click', async () => {
        await Storage.meals.remove(meal.id);
        renderMealsTab();
        closeModal();
      });
    },
  });
}

/* =====================================================================
   GROCERY TAB — categorized shopping list
   ===================================================================== */

// Whether the staples palette is expanded. Starts open on an empty list
// (staples are the obvious first move) and closed once there's a list to
// look at. null = not decided yet.
let staplesOpen = null;

// The tap-to-add palette of things bought over and over. Items already
// on the list render as dimmed and inert, so the palette doubles as a
// "what have I got so far" check.
function renderStaplesPalette(items) {
  const onList = new Set(items.map((item) => item.name.toLowerCase()));

  return `
    <div class="card grocery-staples">
      <button class="grocery-staples__toggle" id="staples-toggle" aria-expanded="${staplesOpen}">
        <span class="section-label">Staples — tap to add</span>
        <span class="grocery-staples__chevron">${staplesOpen ? '▴' : '▾'}</span>
      </button>
      ${
        staplesOpen
          ? Object.entries(STAPLE_GROUPS)
              .map(
                ([group, staples]) => `
                  <div class="grocery-staples__group">
                    <div class="grocery-staples__group-name">${group}</div>
                    <div class="chip-row grocery-staples__chips">
                      ${staples
                        .map((staple) => {
                          const added = onList.has(staple.name.toLowerCase());
                          return `
                            <button class="chip grocery-staple${added ? ' grocery-staple--added' : ''}"
                              data-staple="${escapeHTML(staple.name)}"
                              data-staple-category="${staple.category}"
                              ${added ? 'disabled' : ''}>
                              ${added ? '✓ ' : '+ '}${escapeHTML(staple.name)}
                            </button>
                          `;
                        })
                        .join('')}
                    </div>
                  </div>
                `
              )
              .join('')
          : ''
      }
    </div>
  `;
}

async function renderGroceryTab() {
  const contentEl = document.getElementById('food-tab-content');
  const items = await Storage.groceryItems.getAll();

  const checkedCount = items.filter((i) => i.checked).length;
  if (staplesOpen === null) staplesOpen = items.length === 0;

  contentEl.innerHTML = `
    ${renderStaplesPalette(items)}
    <button class="btn btn-primary" id="add-grocery-btn">+ Add Item</button>
    ${checkedCount > 0 ? `<button class="btn btn-secondary" id="clear-checked-btn">Clear ${checkedCount} Checked</button>` : ''}
    ${
      items.length === 0
        ? `<div class="empty-state">
             <div class="empty-state__icon">🛒</div>
             <div class="empty-state__title">Grocery list is empty</div>
             <div class="empty-state__subtitle">Add items here, or push a meal's ingredients over in one tap.</div>
           </div>`
        : GROCERY_CATEGORIES.filter((cat) => items.some((i) => i.category === cat))
            .map(
              (cat) => `
                <div class="section-label">${cat}</div>
                ${items
                  .filter((i) => i.category === cat)
                  .sort((a, b) => Number(a.checked) - Number(b.checked) || a.createdAt - b.createdAt)
                  .map(
                    (item) => `
                      <div class="list-row grocery-row${item.checked ? ' grocery-row--checked' : ''}" data-item-id="${item.id}">
                        <div class="checkbox-circle${item.checked ? ' checked' : ''}">&#10003;</div>
                        <div class="list-row__title">${escapeHTML(item.name)}</div>
                        <button class="btn-icon" data-remove-item="${item.id}" aria-label="Remove">✕</button>
                      </div>
                    `
                  )
                  .join('')}
              `
            )
            .join('')
    }
  `;

  document.getElementById('add-grocery-btn').addEventListener('click', openGroceryModal);

  document.getElementById('staples-toggle').addEventListener('click', () => {
    staplesOpen = !staplesOpen;
    renderGroceryTab();
  });

  contentEl.querySelectorAll('[data-staple]').forEach((chip) => {
    chip.addEventListener('click', async () => {
      await Storage.groceryItems.save(
        createGroceryItem({ name: chip.dataset.staple, category: chip.dataset.stapleCategory })
      );
      renderGroceryTab();
    });
  });

  const clearBtn = document.getElementById('clear-checked-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      for (const item of items.filter((i) => i.checked)) {
        await Storage.groceryItems.remove(item.id);
      }
      renderGroceryTab();
    });
  }

  contentEl.querySelectorAll('.grocery-row').forEach((row) => {
    row.addEventListener('click', async (event) => {
      if (event.target.closest('[data-remove-item]')) return;
      const item = items.find((i) => i.id === row.dataset.itemId);
      item.checked = !item.checked;
      await Storage.groceryItems.save(item);
      renderGroceryTab();
    });
  });

  contentEl.querySelectorAll('[data-remove-item]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await Storage.groceryItems.remove(btn.dataset.removeItem);
      renderGroceryTab();
    });
  });
}

function openGroceryModal() {
  openModal({
    title: 'Add Grocery Item',
    contentHTML: `
      <form id="grocery-form" class="food-form">
        <div>
          <label class="modal-sheet__field-label" for="grocery-name">Item</label>
          <input class="input" type="text" id="grocery-name" placeholder="e.g. Chicken breast" required />
        </div>
        <div>
          <label class="modal-sheet__field-label" for="grocery-category">Category</label>
          <select class="input" id="grocery-category">
            ${GROCERY_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <button type="submit" class="btn btn-primary">Add to List</button>
      </form>
    `,
    onOpen: () => {
      document.getElementById('grocery-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        await Storage.groceryItems.save(
          createGroceryItem({
            name: document.getElementById('grocery-name').value.trim(),
            category: document.getElementById('grocery-category').value,
          })
        );
        renderGroceryTab();
        closeModal();
      });
    },
  });
}
