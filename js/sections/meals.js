// meals.js
//
// Save meals with a photo, ingredients, cooking instructions, and
// nutrition info; mark favorites; search and filter the list. Everything
// here is real and working — meals you add actually save to the device
// and survive a reload (try it, then check Settings > (eventually) data
// tools, or just refresh the page).
//
// Ingredient note: to keep the "Add Meal" form simple for now, each
// ingredient is just one line of free text (e.g. "2 eggs"). The data is
// still stored as a list of { name, quantity } objects under the hood
// (see schema.js), so a fancier per-field ingredient editor can be
// swapped in later without touching how ingredients are stored.

import { Storage } from '../data/storage.js';
import { createMeal } from '../data/schema.js';
import { openModal, closeModal } from '../components/modal.js';

let allMeals = [];
let searchQuery = '';
let activeFilter = 'all'; // 'all' | 'favorites'

export function render() {
  return `
    <div class="page-header">
      <div class="page-header__title">Meals</div>
    </div>
    <div class="page-content">
      <div class="search-bar">
        <span class="icon">🔍</span>
        <input type="search" id="meals-search" placeholder="Search meals or ingredients" />
      </div>
      <div class="chip-row">
        <button class="chip active" data-filter="all">All</button>
        <button class="chip" data-filter="favorites">Favorites</button>
      </div>
      <div id="meals-list"></div>
    </div>
    <button class="fab" id="add-meal-fab" aria-label="Add meal">+</button>
  `;
}

export async function init() {
  allMeals = await Storage.meals.getAll();
  renderList();

  document.getElementById('meals-search').addEventListener('input', (event) => {
    searchQuery = event.target.value.trim().toLowerCase();
    renderList();
  });

  document.querySelectorAll('.chip[data-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      activeFilter = chip.dataset.filter;
      document.querySelectorAll('.chip[data-filter]').forEach((c) => c.classList.toggle('active', c === chip));
      renderList();
    });
  });

  document.getElementById('add-meal-fab').addEventListener('click', () => openMealFormModal());
}

function getFilteredMeals() {
  return allMeals.filter((meal) => {
    if (activeFilter === 'favorites' && !meal.favorite) return false;
    if (!searchQuery) return true;

    const haystack = [meal.name, ...(meal.ingredients || []).map((i) => i.name)].join(' ').toLowerCase();
    return haystack.includes(searchQuery);
  });
}

function renderList() {
  const listEl = document.getElementById('meals-list');
  const meals = getFilteredMeals();

  if (meals.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">🍽️</div>
        <div class="empty-state__title">${allMeals.length === 0 ? 'No meals yet' : 'No matching meals'}</div>
        <div class="empty-state__subtitle">${allMeals.length === 0 ? 'Tap + to save your first meal.' : 'Try a different search or filter.'}</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = meals.map((meal) => mealRowHTML(meal)).join('');

  listEl.querySelectorAll('.list-row[data-meal-id]').forEach((row) => {
    row.addEventListener('click', (event) => {
      // Don't open the detail sheet if the tap was on the favorite star.
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
      renderList();
    });
  });
}

function mealRowHTML(meal) {
  const calories = meal.nutrition?.calories;
  const metaParts = [];
  if (calories !== null && calories !== undefined && calories !== '') metaParts.push(`${calories} cal`);
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
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== Add / edit form =====

function openMealFormModal(existingMeal = null) {
  const meal = existingMeal || createMeal();
  const ingredientsText = (meal.ingredients || []).map((i) => i.name).join('\n');

  openModal({
    title: existingMeal ? 'Edit Meal' : 'Add Meal',
    contentHTML: `
      <form id="meal-form" class="meals-form">
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
        <div class="meals-form__nutrition-grid">
          ${nutritionFieldHTML('calories', 'Calories', meal.nutrition?.calories)}
          ${nutritionFieldHTML('protein', 'Protein (g)', meal.nutrition?.protein)}
          ${nutritionFieldHTML('carbs', 'Carbs (g)', meal.nutrition?.carbs)}
          ${nutritionFieldHTML('fat', 'Fat (g)', meal.nutrition?.fat)}
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

        const ingredients = document
          .getElementById('meal-ingredients')
          .value.split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((name) => ({ name, quantity: '' }));

        const updatedMeal = {
          ...meal,
          name: document.getElementById('meal-name').value.trim(),
          photo: selectedPhoto,
          ingredients,
          instructions: document.getElementById('meal-instructions').value.trim(),
          nutrition: {
            calories: readNumberField('meal-calories'),
            protein: readNumberField('meal-protein'),
            carbs: readNumberField('meal-carbs'),
            fat: readNumberField('meal-fat'),
          },
          favorite: document.getElementById('meal-favorite').checked,
        };

        await Storage.meals.save(updatedMeal);
        allMeals = await Storage.meals.getAll();
        renderList();
        closeModal();
      });
    },
  });
}

function nutritionFieldHTML(key, label, value) {
  return `
    <div>
      <label class="modal-sheet__field-label" for="meal-${key}">${label}</label>
      <input class="input" type="number" inputmode="decimal" id="meal-${key}" value="${value ?? ''}" placeholder="0" />
    </div>
  `;
}

function readNumberField(id) {
  const raw = document.getElementById(id).value;
  return raw === '' ? null : Number(raw);
}

// ===== Detail view =====

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
        ${(meal.ingredients || []).length ? `
          <div>
            <div class="section-label">Ingredients</div>
            <ul class="meals-detail__ingredients">
              ${meal.ingredients.map((i) => `<li>${escapeHTML(i.name)}</li>`).join('')}
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
      document.getElementById('meal-edit-btn').addEventListener('click', () => {
        closeModal();
        setTimeout(() => openMealFormModal(meal), 420);
      });

      document.getElementById('meal-delete-btn').addEventListener('click', async () => {
        await Storage.meals.remove(meal.id);
        allMeals = await Storage.meals.getAll();
        renderList();
        closeModal();
      });
    },
  });
}
