// dashboard.js
//
// The home screen. Exactly three things at a glance:
//   1. Calories — today's total, summed live from the Food pillar's logs
//   2. Workout — done/not-done toggle, plus your current gym streak
//      (consecutive days with the workout marked complete)
//   3. Investing — portfolio value and day change, from the holdings'
//      daily closing prices
// Everything else (weight logging, latest macro note, quick links) sits
// one tap deeper behind the "More" toggle. The gear opens Settings.

import { Storage } from '../data/storage.js';
import { createDailyLog } from '../data/schema.js';
import { portfolioSummary } from '../data/prices.js';
import { navigateTo } from '../router.js';
import { openModal, closeModal } from '../components/modal.js';

const QUICK_LINKS = [
  { id: 'gym', label: 'Gym', icon: '💪' },
  { id: 'food', label: 'Food', icon: '🍽️' },
  { id: 'investing', label: 'Investing', icon: '📊' },
  { id: 'school', label: 'School', icon: '🎓' },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formattedToday() {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function render() {
  return `
    <div class="page-header dashboard-header">
      <div>
        <span class="wordmark"><span class="wordmark__chap">CHAP</span><span class="wordmark__hq">HQ</span></span>
        <div class="page-header__subtitle">${formattedToday()}</div>
      </div>
      <button class="btn-icon" id="dashboard-settings-btn" aria-label="Settings">⚙️</button>
    </div>
    <div class="page-content">
      <div class="dashboard-hero" id="dashboard-hero"></div>

      <button class="btn btn-secondary" id="dashboard-more-btn" aria-expanded="false">More ▾</button>

      <div class="dashboard-more" id="dashboard-more" hidden>
        <div class="section-label">Weight</div>
        <div class="stat-grid" id="dashboard-body"></div>
        <button class="btn btn-secondary" id="log-weight-btn">Log Weight</button>

        <div class="section-label">Latest Macro Note</div>
        <div class="card" id="dashboard-investing-note"></div>

        <div class="section-label">Quick Links</div>
        <div class="link-grid" id="dashboard-quicklinks"></div>
      </div>
    </div>
  `;
}

export async function init() {
  const today = todayISO();
  let todayLog = (await Storage.dailyLogs.getByDate(today)) || createDailyLog();

  await renderHero(todayLog);
  renderBodyTiles(todayLog);
  renderInvestingNote(await Storage.macroNotes.getAll());
  renderQuickLinks();

  document.getElementById('dashboard-settings-btn').addEventListener('click', () => navigateTo('settings'));
  document.getElementById('dashboard-more-btn').addEventListener('click', toggleMoreSection);

  wireHeroCards();

  document.getElementById('log-weight-btn').addEventListener('click', () => {
    openWeightModal(todayLog, (updated) => {
      todayLog = updated;
      renderBodyTiles(todayLog);
    });
  });

  // renderHero replaces the card elements, so this must run again after
  // every re-render to reattach the tap handlers.
  function wireHeroCards() {
    // Tapping the Workout card toggles today's gym completion.
    document.getElementById('hero-workout').addEventListener('click', async () => {
      todayLog = { ...todayLog, date: today, gymCompleted: !todayLog.gymCompleted };
      await Storage.dailyLogs.save(todayLog);
      await renderHero(todayLog);
      wireHeroCards();
    });
    // The Investing card jumps straight to the portfolio.
    document.getElementById('hero-investing').addEventListener('click', () => navigateTo('investing'));
  }
}

// ===== More section toggle =====

function toggleMoreSection() {
  const moreEl = document.getElementById('dashboard-more');
  const btn = document.getElementById('dashboard-more-btn');
  moreEl.hidden = !moreEl.hidden;
  btn.textContent = moreEl.hidden ? 'More ▾' : 'Less ▴';
  btn.setAttribute('aria-expanded', String(!moreEl.hidden));
}

// ===== Hero: the 3 at-a-glance cards =====

// Gym streak = consecutive days (ending today or yesterday) where the
// workout was marked complete on the daily log.
function computeGymStreak(allDailyLogs) {
  const doneDates = new Set(allDailyLogs.filter((l) => l.gymCompleted).map((l) => l.date));
  let streak = 0;
  const day = new Date();
  if (!doneDates.has(day.toISOString().slice(0, 10))) day.setDate(day.getDate() - 1);
  while (doneDates.has(day.toISOString().slice(0, 10))) {
    streak += 1;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

async function renderHero(todayLog) {
  const [todaysFoodLogs, allDailyLogs, holdings] = await Promise.all([
    Storage.foodLogs.getByDate(todayISO()),
    Storage.dailyLogs.getAll(),
    Storage.holdings.getAll(),
  ]);

  const calories = todaysFoodLogs.reduce((sum, log) => sum + (Number(log.calories) || 0), 0);
  const streak = computeGymStreak(allDailyLogs);
  const summary = portfolioSummary(holdings);

  const changeText =
    summary.dayChange == null
      ? holdings.length === 0
        ? 'add holdings'
        : 'no day change yet'
      : `${summary.dayChange >= 0 ? '+' : '−'}$${Math.abs(summary.dayChange).toFixed(0)} today`;
  const changeClass = summary.dayChange == null ? '' : summary.dayChange >= 0 ? 'dashboard-hero__up' : 'dashboard-hero__down';

  document.getElementById('dashboard-hero').innerHTML = `
    <div class="stat-tile">
      <div class="stat-tile__label">Calories</div>
      <div class="stat-tile__value">${todaysFoodLogs.length === 0 ? '—' : Math.round(calories)}</div>
      <div class="stat-tile__meta">today</div>
    </div>
    <div class="stat-tile dashboard-hero__tappable" id="hero-workout" role="button">
      <div class="stat-tile__label">Workout</div>
      <div class="stat-tile__value">${todayLog.gymCompleted ? '✅' : '—'}</div>
      <div class="stat-tile__meta">${streak > 0 ? '🔥 ' + streak + ' day' + (streak === 1 ? '' : 's') : todayLog.gymCompleted ? 'done' : 'tap when done'}</div>
    </div>
    <div class="stat-tile dashboard-hero__tappable" id="hero-investing" role="button">
      <div class="stat-tile__label">Portfolio</div>
      <div class="stat-tile__value">${summary.value == null ? '—' : '$' + Math.round(summary.value).toLocaleString()}</div>
      <div class="stat-tile__meta ${changeClass}">${changeText}</div>
    </div>
  `;
}

// ===== Weight (one tap deeper, in More) =====

function renderBodyTiles(log) {
  document.getElementById('dashboard-body').innerHTML = `
    <div class="stat-tile">
      <div class="stat-tile__label">Weight</div>
      <div class="stat-tile__value">${log.weight == null ? '—' : log.weight + 'lb'}</div>
    </div>
  `;
}

function openWeightModal(currentLog, onSaved) {
  openModal({
    title: 'Log Weight',
    contentHTML: `
      <form id="weight-form" class="dashboard-log-form">
        <div>
          <label class="modal-sheet__field-label" for="field-weight">Weight (lb)</label>
          <input class="input" type="number" inputmode="decimal" id="field-weight" value="${currentLog.weight ?? ''}" placeholder="0" />
        </div>
        <button type="submit" class="btn btn-primary">Save</button>
      </form>
    `,
    onOpen: () => {
      document.getElementById('weight-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const weight = document.getElementById('field-weight').value;
        const updated = { ...currentLog, date: todayISO(), weight: weight === '' ? null : Number(weight) };
        await Storage.dailyLogs.save(updated);
        onSaved(updated);
        closeModal();
      });
    },
  });
}

// ===== Latest macro note =====

function renderInvestingNote(allNotes) {
  const el = document.getElementById('dashboard-investing-note');
  if (allNotes.length === 0) {
    el.innerHTML = `
      <div class="list-row__title">No macro notes yet</div>
      <div class="list-row__meta">Your latest note from the Investing pillar will show here.</div>
    `;
    return;
  }

  const latest = allNotes.sort((a, b) => b.createdAt - a.createdAt)[0];
  el.innerHTML = `
    <div class="list-row__title">${escapeHTML(latest.title || 'Untitled note')}</div>
    <div class="list-row__meta">${latest.date}${latest.body ? ' · ' + escapeHTML(latest.body.slice(0, 80)) : ''}</div>
  `;
  el.style.cursor = 'pointer';
  el.onclick = () => navigateTo('investing');
}

// ===== Quick links =====

function renderQuickLinks() {
  const linksEl = document.getElementById('dashboard-quicklinks');
  linksEl.innerHTML = QUICK_LINKS.map(
    (link) => `
      <button class="link-tile" data-route="${link.id}">
        <span class="icon">${link.icon}</span>
        <span class="label">${link.label}</span>
      </button>
    `
  ).join('');

  linksEl.querySelectorAll('.link-tile').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.route));
  });
}
