// dashboard.js
//
// The home screen: today's numbers at a glance (calories, protein,
// water, weight, gym), plus quick links to every other section. All the
// numbers read from and write to a single "daily log" record for today
// (see createDailyLog in schema.js) via the Storage API — nothing here
// talks to IndexedDB directly.

import { Storage } from '../data/storage.js';
import { createDailyLog } from '../data/schema.js';
import { navigateTo } from '../router.js';
import { openModal, closeModal } from '../components/modal.js';

const STAT_TILES = [
  { key: 'calories', label: 'Calories', unit: '' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'waterMl', label: 'Water', unit: 'ml' },
  { key: 'weight', label: 'Weight', unit: 'lb' },
];

// Every section except Dashboard itself gets a quick-link tile here.
const QUICK_LINKS = [
  { id: 'meals', label: 'Meals', icon: '🍽️' },
  { id: 'grocery', label: 'Grocery', icon: '🛒' },
  { id: 'workouts', label: 'Workouts', icon: '💪' },
  { id: 'progress', label: 'Progress', icon: '📈' },
  { id: 'school', label: 'School', icon: '🎓' },
  { id: 'goals', label: 'Goals', icon: '🎯' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formattedToday() {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export function render() {
  return `
    <div class="page-header">
      <div class="page-header__title">Dashboard</div>
      <div class="page-header__subtitle">${formattedToday()}</div>
    </div>
    <div class="page-content">
      <div class="stat-grid" id="dashboard-stats"></div>

      <div class="card dashboard-gym-card" id="gym-card">
        <div class="dashboard-gym-card__text">
          <div class="list-row__title">Gym today</div>
          <div class="list-row__meta">Mark today's workout complete</div>
        </div>
        <div class="checkbox-circle" id="gym-checkbox">&#10003;</div>
      </div>

      <button class="btn btn-primary" id="log-today-btn">Log Today's Numbers</button>

      <div class="section-label">Quick Links</div>
      <div class="more-sheet__grid" id="dashboard-quicklinks"></div>
    </div>
  `;
}

export async function init() {
  let todayLog = (await Storage.dailyLogs.getByDate(todayISO())) || createDailyLog();

  renderStatTiles(todayLog);
  renderGymCheckbox(todayLog);
  renderQuickLinks();

  document.getElementById('gym-card').addEventListener('click', async () => {
    todayLog = { ...todayLog, date: todayISO(), gymCompleted: !todayLog.gymCompleted };
    await Storage.dailyLogs.save(todayLog);
    renderGymCheckbox(todayLog);
  });

  document.getElementById('log-today-btn').addEventListener('click', () => {
    openLogTodayModal(todayLog, (updatedLog) => {
      todayLog = updatedLog;
      renderStatTiles(todayLog);
    });
  });
}

function renderStatTiles(log) {
  const statsEl = document.getElementById('dashboard-stats');
  statsEl.innerHTML = STAT_TILES.map(({ key, label, unit }) => {
    const value = log[key];
    const displayValue = value === null || value === undefined || value === '' ? '—' : `${value}${unit}`;
    return `
      <div class="stat-tile">
        <div class="stat-tile__label">${label}</div>
        <div class="stat-tile__value">${displayValue}</div>
      </div>
    `;
  }).join('');
}

function renderGymCheckbox(log) {
  document.getElementById('gym-checkbox').classList.toggle('checked', !!log.gymCompleted);
}

function renderQuickLinks() {
  const linksEl = document.getElementById('dashboard-quicklinks');
  linksEl.innerHTML = QUICK_LINKS.map(
    (link) => `
      <button class="more-sheet__item" data-route="${link.id}">
        <span class="icon">${link.icon}</span>
        <span class="label">${link.label}</span>
      </button>
    `
  ).join('');

  linksEl.querySelectorAll('.more-sheet__item').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.route));
  });
}

function openLogTodayModal(currentLog, onSaved) {
  const fieldsHTML = STAT_TILES.map(
    ({ key, label, unit }) => `
      <div>
        <label class="modal-sheet__field-label" for="field-${key}">${label}${unit ? ` (${unit})` : ''}</label>
        <input class="input" type="number" inputmode="decimal" id="field-${key}" value="${currentLog[key] ?? ''}" placeholder="0" />
      </div>
    `
  ).join('');

  openModal({
    title: "Log Today's Numbers",
    contentHTML: `
      <form id="log-today-form" class="dashboard-log-form">
        ${fieldsHTML}
        <button type="submit" class="btn btn-primary">Save</button>
      </form>
    `,
    onOpen: () => {
      document.getElementById('log-today-form').addEventListener('submit', async (event) => {
        event.preventDefault();

        const updatedLog = { ...currentLog, date: todayISO() };
        STAT_TILES.forEach(({ key }) => {
          const raw = document.getElementById(`field-${key}`).value;
          updatedLog[key] = raw === '' ? null : Number(raw);
        });

        await Storage.dailyLogs.save(updatedLog);
        onSaved(updatedLog);
        closeModal();
      });
    },
  });
}
