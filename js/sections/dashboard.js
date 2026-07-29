// dashboard.js
//
// The home screen — a snapshot of every pillar at a glance:
//   - Today's macros (calories/protein/carbs/fat), summed live from the
//     Food pillar's log entries
//   - Water + weight quick-logging (stored on today's daily log)
//   - Gym completion toggle
//   - The latest investing macro note
//   - Goals & daily habits with streak tracking (this IS the Goals area —
//     it lives here instead of being its own bottom-nav tab)
//   - Quick links to every pillar, plus the gear icon → Settings

import { Storage } from '../data/storage.js';
import { createDailyLog, createGoal } from '../data/schema.js';
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
      <!-- The only three things competing for attention at a glance:
           Calories · Workout status · Streaks. Everything else lives
           below, behind the "More" toggle. -->
      <div class="dashboard-hero" id="dashboard-hero"></div>

      <button class="btn btn-secondary" id="dashboard-more-btn" aria-expanded="false">More ▾</button>

      <div class="dashboard-more" id="dashboard-more" hidden>
        <div class="section-label">Body</div>
        <div class="stat-grid" id="dashboard-body"></div>
        <button class="btn btn-secondary" id="log-water-weight-btn">Log Water / Weight</button>

        <div class="section-label">Investing</div>
        <div class="card" id="dashboard-investing-note"></div>

        <div class="section-label">Goals &amp; Habits</div>
        <div id="dashboard-goals"></div>
        <button class="btn btn-secondary" id="add-goal-btn">+ Add Goal</button>

        <div class="section-label">Quick Links</div>
        <div class="link-grid" id="dashboard-quicklinks"></div>
      </div>
    </div>
  `;
}

export async function init() {
  const today = todayISO();
  let todayLog = (await Storage.dailyLogs.getByDate(today)) || createDailyLog();
  const goals = await Storage.goals.getAll();

  renderHero(await Storage.foodLogs.getByDate(today), todayLog, goals);
  renderBodyTiles(todayLog);
  renderInvestingNote(await Storage.macroNotes.getAll());
  await refreshGoals();
  renderQuickLinks();

  document.getElementById('dashboard-settings-btn').addEventListener('click', () => navigateTo('settings'));

  document.getElementById('dashboard-more-btn').addEventListener('click', toggleMoreSection);

  wireHeroCards();

  document.getElementById('log-water-weight-btn').addEventListener('click', () => {
    openWaterWeightModal(todayLog, (updated) => {
      todayLog = updated;
      renderBodyTiles(todayLog);
    });
  });

  document.getElementById('add-goal-btn').addEventListener('click', () => openGoalModal());

  // renderHero replaces the card elements, so this must run again after
  // every re-render to reattach the tap handlers.
  function wireHeroCards() {
    // Tapping the Workout card toggles today's gym completion.
    document.getElementById('hero-workout').addEventListener('click', async () => {
      todayLog = { ...todayLog, date: today, gymCompleted: !todayLog.gymCompleted };
      await Storage.dailyLogs.save(todayLog);
      renderHero(await Storage.foodLogs.getByDate(today), todayLog, await Storage.goals.getAll());
      wireHeroCards();
    });
    // Tapping the Streaks card opens More and jumps to the goals list.
    document.getElementById('hero-streaks').addEventListener('click', () => {
      openMoreSection();
      document.getElementById('dashboard-goals').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

// ===== More section toggle =====

function openMoreSection() {
  const moreEl = document.getElementById('dashboard-more');
  const btn = document.getElementById('dashboard-more-btn');
  moreEl.hidden = false;
  btn.textContent = 'Less ▴';
  btn.setAttribute('aria-expanded', 'true');
}

function toggleMoreSection() {
  const moreEl = document.getElementById('dashboard-more');
  const btn = document.getElementById('dashboard-more-btn');
  if (moreEl.hidden) {
    openMoreSection();
  } else {
    moreEl.hidden = true;
    btn.textContent = 'More ▾';
    btn.setAttribute('aria-expanded', 'false');
  }
}

// ===== Hero: the 3 at-a-glance cards =====

function renderHero(todaysFoodLogs, todayLog, goals) {
  const calories = todaysFoodLogs.reduce((sum, log) => sum + (Number(log.calories) || 0), 0);
  const bestStreak = goals.length ? Math.max(0, ...goals.map(computeStreak)) : 0;
  const activeCount = goals.filter((g) => computeStreak(g) > 0).length;

  document.getElementById('dashboard-hero').innerHTML = `
    <div class="stat-tile">
      <div class="stat-tile__label">Calories</div>
      <div class="stat-tile__value">${todaysFoodLogs.length === 0 ? '—' : Math.round(calories)}</div>
      <div class="stat-tile__meta">today</div>
    </div>
    <div class="stat-tile dashboard-hero__tappable" id="hero-workout" role="button">
      <div class="stat-tile__label">Workout</div>
      <div class="stat-tile__value">${todayLog.gymCompleted ? '✅' : '—'}</div>
      <div class="stat-tile__meta">${todayLog.gymCompleted ? 'done' : 'tap when done'}</div>
    </div>
    <div class="stat-tile dashboard-hero__tappable" id="hero-streaks" role="button">
      <div class="stat-tile__label">Streaks</div>
      <div class="stat-tile__value">${bestStreak > 0 ? '🔥 ' + bestStreak : '—'}</div>
      <div class="stat-tile__meta">${activeCount > 0 ? activeCount + ' active' : 'no streaks yet'}</div>
    </div>
  `;
}

// ===== Water + weight =====

function renderBodyTiles(log) {
  const tiles = [
    { label: 'Water', value: log.waterMl, unit: 'ml' },
    { label: 'Weight', value: log.weight, unit: 'lb' },
  ];
  document.getElementById('dashboard-body').innerHTML = tiles
    .map(
      (t) => `
        <div class="stat-tile">
          <div class="stat-tile__label">${t.label}</div>
          <div class="stat-tile__value">${t.value == null ? '—' : t.value + t.unit}</div>
        </div>
      `
    )
    .join('');
}

function openWaterWeightModal(currentLog, onSaved) {
  openModal({
    title: 'Log Water / Weight',
    contentHTML: `
      <form id="water-weight-form" class="dashboard-log-form">
        <div>
          <label class="modal-sheet__field-label" for="field-water">Water (ml)</label>
          <input class="input" type="number" inputmode="decimal" id="field-water" value="${currentLog.waterMl ?? ''}" placeholder="0" />
        </div>
        <div>
          <label class="modal-sheet__field-label" for="field-weight">Weight (lb)</label>
          <input class="input" type="number" inputmode="decimal" id="field-weight" value="${currentLog.weight ?? ''}" placeholder="0" />
        </div>
        <button type="submit" class="btn btn-primary">Save</button>
      </form>
    `,
    onOpen: () => {
      document.getElementById('water-weight-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const water = document.getElementById('field-water').value;
        const weight = document.getElementById('field-weight').value;
        const updated = {
          ...currentLog,
          date: todayISO(),
          waterMl: water === '' ? null : Number(water),
          weight: weight === '' ? null : Number(weight),
        };
        await Storage.dailyLogs.save(updated);
        onSaved(updated);
        closeModal();
      });
    },
  });
}

// ===== Investing snapshot =====

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

// ===== Goals & habits =====

// A goal's streak = how many days in a row it's been completed, counting
// back from today (or from yesterday, so a streak isn't "broken" before
// the day is over).
function computeStreak(goal) {
  const done = new Set(goal.completedDates || []);
  let streak = 0;
  const day = new Date();
  if (!done.has(day.toISOString().slice(0, 10))) day.setDate(day.getDate() - 1);
  while (done.has(day.toISOString().slice(0, 10))) {
    streak += 1;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

async function refreshGoals() {
  const goals = await Storage.goals.getAll();
  const el = document.getElementById('dashboard-goals');
  const today = todayISO();

  if (goals.length === 0) {
    el.innerHTML = `
      <div class="card">
        <div class="list-row__title">No goals yet</div>
        <div class="list-row__meta">Add a daily habit or goal to start building streaks.</div>
      </div>
    `;
    return;
  }

  el.innerHTML = goals
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((goal) => {
      const doneToday = (goal.completedDates || []).includes(today);
      const streak = computeStreak(goal);
      return `
        <div class="list-row" data-goal-id="${goal.id}">
          <div class="checkbox-circle${doneToday ? ' checked' : ''}">&#10003;</div>
          <div style="flex:1;">
            <div class="list-row__title">${escapeHTML(goal.title)}</div>
            <div class="list-row__meta">${goal.type}</div>
          </div>
          ${streak > 0 ? `<span class="badge warning">🔥 ${streak}</span>` : ''}
        </div>
      `;
    })
    .join('');

  el.querySelectorAll('.list-row[data-goal-id]').forEach((row) => {
    row.addEventListener('click', async () => {
      const goal = goals.find((g) => g.id === row.dataset.goalId);
      const dates = new Set(goal.completedDates || []);
      if (dates.has(today)) {
        dates.delete(today);
      } else {
        dates.add(today);
      }
      goal.completedDates = [...dates].sort();
      goal.streak = computeStreak(goal);
      await Storage.goals.save(goal);
      refreshGoals();
    });
  });
}

function openGoalModal() {
  openModal({
    title: 'Add Goal',
    contentHTML: `
      <form id="goal-form" class="dashboard-log-form">
        <div>
          <label class="modal-sheet__field-label" for="goal-title">What's the goal?</label>
          <input class="input" type="text" id="goal-title" placeholder="e.g. Read 20 minutes" required />
        </div>
        <div>
          <label class="modal-sheet__field-label" for="goal-type">Type</label>
          <select class="input" id="goal-type">
            <option value="habit">Daily habit</option>
            <option value="fitness">Fitness goal</option>
            <option value="personal">Personal goal</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary">Add Goal</button>
      </form>
    `,
    onOpen: () => {
      document.getElementById('goal-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        await Storage.goals.save(
          createGoal({
            title: document.getElementById('goal-title').value.trim(),
            type: document.getElementById('goal-type').value,
          })
        );
        await refreshGoals();
        closeModal();
      });
    },
  });
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
