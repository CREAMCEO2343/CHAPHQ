// gym.js
//
// The Gym pillar, in three sub-tabs:
//   Workout — your splits (Chest/Tri, Back/Bi, ...). Tap one to open it,
//             add/remove exercises, and log sets (reps × weight) for
//             today. Logged sets are saved as exercise-log records.
//   History — every past logged exercise, newest first, grouped by day.
//   Body    — body check-ins: weight, body fat %, measurements, and a
//             progress photo per entry.

import { Storage } from '../data/storage.js';
import { createWorkoutSplit, createExerciseLog, createBodyStat } from '../data/schema.js';
import { openModal, closeModal } from '../components/modal.js';
import { initTabs } from '../components/tabs.js';

let openSplitId = null; // which split is expanded in the Workout tab

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
      <div class="page-header__title">Gym</div>
    </div>
    <div class="page-content">
      <div id="gym-tabs"></div>
      <div id="gym-tab-content"></div>
    </div>
  `;
}

export function init() {
  initTabs({
    containerId: 'gym-tabs',
    tabs: [
      { id: 'workout', label: 'Workout' },
      { id: 'history', label: 'History' },
      { id: 'body', label: 'Body' },
    ],
    onChange: (tabId) => {
      openSplitId = null;
      if (tabId === 'workout') renderWorkoutTab();
      if (tabId === 'history') renderHistoryTab();
      if (tabId === 'body') renderBodyTab();
    },
  });
}

/* =====================================================================
   WORKOUT TAB
   ===================================================================== */

async function renderWorkoutTab() {
  const contentEl = document.getElementById('gym-tab-content');
  const splits = await Storage.workoutSplits.getAll();
  splits.sort((a, b) => a.createdAt - b.createdAt);

  if (openSplitId) {
    const split = splits.find((s) => s.id === openSplitId);
    if (split) return renderSplitDetail(split);
    openSplitId = null;
  }

  contentEl.innerHTML = `
    <div class="gym-split-list">
      ${splits
        .map(
          (split) => `
            <button class="card gym-split-card" data-split-id="${split.id}">
              <span class="gym-split-card__icon">${split.icon}</span>
              <span class="gym-split-card__name">${escapeHTML(split.name)}</span>
              <span class="list-row__meta">${split.exercises.length} exercise${split.exercises.length === 1 ? '' : 's'}</span>
            </button>
          `
        )
        .join('')}
    </div>
  `;

  contentEl.querySelectorAll('[data-split-id]').forEach((card) => {
    card.addEventListener('click', () => {
      openSplitId = card.dataset.splitId;
      renderWorkoutTab();
    });
  });
}

async function renderSplitDetail(split) {
  const contentEl = document.getElementById('gym-tab-content');
  const todaysLogs = (await Storage.exerciseLogs.getAll()).filter(
    (log) => log.splitId === split.id && log.date === todayISO()
  );

  contentEl.innerHTML = `
    <button class="btn btn-secondary" id="split-back-btn">&larr; All splits</button>
    <div class="gym-split-header">
      <span class="gym-split-card__icon">${split.icon}</span>
      <h2 class="gym-split-card__name">${escapeHTML(split.name)}</h2>
    </div>

    ${
      split.exercises.length === 0
        ? `<div class="empty-state">
             <div class="empty-state__icon">🏋️</div>
             <div class="empty-state__title">No exercises yet</div>
             <div class="empty-state__subtitle">Add the exercises you do on this day.</div>
           </div>`
        : `<div id="split-exercise-list">
             ${split.exercises
               .map((exercise, index) => {
                 const loggedToday = todaysLogs.find((l) => l.exerciseName === exercise.name);
                 return `
                   <div class="list-row" data-exercise-index="${index}">
                     <div style="flex:1;">
                       <div class="list-row__title">${escapeHTML(exercise.name)}</div>
                       <div class="list-row__meta">
                         Target: ${exercise.targetSets} × ${exercise.targetReps}
                         ${loggedToday ? ` · ✅ ${loggedToday.sets.length} sets logged today` : ''}
                       </div>
                     </div>
                     <button class="btn-icon" data-log-index="${index}" aria-label="Log sets">＋</button>
                   </div>
                 `;
               })
               .join('')}
           </div>`
    }

    <button class="btn btn-secondary" id="add-exercise-btn">+ Add Exercise</button>
  `;

  document.getElementById('split-back-btn').addEventListener('click', () => {
    openSplitId = null;
    renderWorkoutTab();
  });

  document.getElementById('add-exercise-btn').addEventListener('click', () => openExerciseFormModal(split));

  contentEl.querySelectorAll('[data-log-index]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const exercise = split.exercises[Number(btn.dataset.logIndex)];
      openLogSetsModal(split, exercise);
    });
  });

  // Long-press... is complex; keep it simple: tapping the row (not the +)
  // opens an edit sheet where the exercise can be changed or deleted.
  contentEl.querySelectorAll('[data-exercise-index]').forEach((row) => {
    row.addEventListener('click', (event) => {
      if (event.target.closest('[data-log-index]')) return;
      const index = Number(row.dataset.exerciseIndex);
      openExerciseFormModal(split, index);
    });
  });
}

// Add a new exercise (no index) or edit/delete an existing one (with index).
function openExerciseFormModal(split, index = null) {
  const isEdit = index !== null;
  const exercise = isEdit ? split.exercises[index] : { name: '', targetSets: 3, targetReps: 10 };

  openModal({
    title: isEdit ? 'Edit Exercise' : 'Add Exercise',
    contentHTML: `
      <form id="exercise-form" class="gym-form">
        <div>
          <label class="modal-sheet__field-label" for="exercise-name">Exercise name</label>
          <input class="input" type="text" id="exercise-name" value="${escapeHTML(exercise.name)}" placeholder="e.g. Bench Press" required />
        </div>
        <div class="gym-form__row">
          <div>
            <label class="modal-sheet__field-label" for="exercise-sets">Target sets</label>
            <input class="input" type="number" inputmode="numeric" id="exercise-sets" value="${exercise.targetSets}" min="1" />
          </div>
          <div>
            <label class="modal-sheet__field-label" for="exercise-reps">Target reps</label>
            <input class="input" type="number" inputmode="numeric" id="exercise-reps" value="${exercise.targetReps}" min="1" />
          </div>
        </div>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Add Exercise'}</button>
        ${isEdit ? '<button type="button" class="btn btn-secondary gym-form__delete" id="exercise-delete-btn">Delete Exercise</button>' : ''}
      </form>
    `,
    onOpen: () => {
      document.getElementById('exercise-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const updated = {
          name: document.getElementById('exercise-name').value.trim(),
          targetSets: Number(document.getElementById('exercise-sets').value) || 3,
          targetReps: Number(document.getElementById('exercise-reps').value) || 10,
        };
        if (isEdit) {
          split.exercises[index] = updated;
        } else {
          split.exercises.push(updated);
        }
        await Storage.workoutSplits.save(split);
        renderWorkoutTab();
        closeModal();
      });

      if (isEdit) {
        document.getElementById('exercise-delete-btn').addEventListener('click', async () => {
          split.exercises.splice(index, 1);
          await Storage.workoutSplits.save(split);
          renderWorkoutTab();
          closeModal();
        });
      }
    },
  });
}

// Log today's sets for one exercise: a growing list of reps × weight rows.
function openLogSetsModal(split, exercise) {
  let sets = [{ reps: exercise.targetReps, weight: '' }];

  const setsRowsHTML = () =>
    sets
      .map(
        (set, i) => `
          <div class="gym-form__row gym-set-row">
            <div>
              <label class="modal-sheet__field-label">Set ${i + 1} — reps</label>
              <input class="input" type="number" inputmode="numeric" data-set-reps="${i}" value="${set.reps}" />
            </div>
            <div>
              <label class="modal-sheet__field-label">Weight (lb)</label>
              <input class="input" type="number" inputmode="decimal" data-set-weight="${i}" value="${set.weight}" placeholder="0" />
            </div>
          </div>
        `
      )
      .join('');

  openModal({
    title: `Log: ${exercise.name}`,
    contentHTML: `
      <form id="log-sets-form" class="gym-form">
        <div id="log-sets-rows">${setsRowsHTML()}</div>
        <button type="button" class="btn btn-secondary" id="add-set-btn">+ Add Set</button>
        <button type="submit" class="btn btn-primary">Save Workout</button>
      </form>
    `,
    onOpen: () => {
      const readSetsFromInputs = () => {
        sets = sets.map((_, i) => ({
          reps: document.querySelector(`[data-set-reps="${i}"]`).value,
          weight: document.querySelector(`[data-set-weight="${i}"]`).value,
        }));
      };

      document.getElementById('add-set-btn').addEventListener('click', () => {
        readSetsFromInputs();
        const last = sets[sets.length - 1];
        sets.push({ reps: last.reps, weight: last.weight }); // pre-fill from previous set
        document.getElementById('log-sets-rows').innerHTML = setsRowsHTML();
      });

      document.getElementById('log-sets-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        readSetsFromInputs();
        const cleanSets = sets
          .filter((s) => s.reps !== '')
          .map((s) => ({ reps: Number(s.reps), weight: s.weight === '' ? 0 : Number(s.weight) }));

        if (cleanSets.length > 0) {
          await Storage.exerciseLogs.save(
            createExerciseLog({ splitId: split.id, exerciseName: exercise.name, sets: cleanSets })
          );
        }
        renderWorkoutTab();
        closeModal();
      });
    },
  });
}

/* =====================================================================
   HISTORY TAB
   ===================================================================== */

async function renderHistoryTab() {
  const contentEl = document.getElementById('gym-tab-content');
  const logs = await Storage.exerciseLogs.getAll();

  if (logs.length === 0) {
    contentEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📜</div>
        <div class="empty-state__title">No workouts logged yet</div>
        <div class="empty-state__subtitle">Log sets from the Workout tab and they'll show up here.</div>
      </div>
    `;
    return;
  }

  // Group logs by date, newest date first.
  const byDate = {};
  logs.forEach((log) => {
    (byDate[log.date] = byDate[log.date] || []).push(log);
  });
  const dates = Object.keys(byDate).sort().reverse();

  // Each exercise shows as a one-line summary ("4 sets · 185 lb avg") to
  // keep the list scannable; tapping a row expands it to show every set.
  contentEl.innerHTML = dates
    .map((date) => {
      const dayLogs = byDate[date].sort((a, b) => a.createdAt - b.createdAt);
      return `
        <div class="section-label">${new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
        ${dayLogs
          .map(
            (log) => `
              <div class="list-row gym-history-row" data-log-id="${log.id}" role="button" aria-expanded="false">
                <div style="flex:1;">
                  <div class="list-row__title">${escapeHTML(log.exerciseName)}</div>
                  <div class="list-row__meta">${setsSummary(log.sets)}</div>
                  <div class="gym-history-row__sets" hidden>
                    ${log.sets.map((s, i) => `<div class="list-row__meta">Set ${i + 1}: ${s.reps} reps × ${s.weight} lb</div>`).join('')}
                  </div>
                </div>
                <span class="gym-history-row__chevron">›</span>
              </div>
            `
          )
          .join('')}
      `;
    })
    .join('');

  contentEl.querySelectorAll('.gym-history-row').forEach((row) => {
    row.addEventListener('click', () => {
      const detail = row.querySelector('.gym-history-row__sets');
      detail.hidden = !detail.hidden;
      row.classList.toggle('expanded', !detail.hidden);
      row.setAttribute('aria-expanded', String(!detail.hidden));
    });
  });
}

// "4 sets · 185 lb avg" (weight part left off for bodyweight/cardio sets)
function setsSummary(sets) {
  const count = `${sets.length} set${sets.length === 1 ? '' : 's'}`;
  const weights = sets.map((s) => Number(s.weight) || 0).filter((w) => w > 0);
  if (weights.length === 0) return count;
  const avg = Math.round(weights.reduce((a, b) => a + b, 0) / weights.length);
  return `${count} · ${avg} lb avg`;
}

/* =====================================================================
   BODY TAB
   ===================================================================== */

async function renderBodyTab() {
  const contentEl = document.getElementById('gym-tab-content');
  const entries = (await Storage.bodyStats.getAll()).sort((a, b) => b.createdAt - a.createdAt);
  const latest = entries[0];

  contentEl.innerHTML = `
    <div class="stat-grid">
      <div class="stat-tile">
        <div class="stat-tile__label">Weight</div>
        <div class="stat-tile__value">${latest?.weight != null ? latest.weight + 'lb' : '—'}</div>
      </div>
      <div class="stat-tile">
        <div class="stat-tile__label">Body Fat</div>
        <div class="stat-tile__value">${latest?.bodyFatPercent != null ? latest.bodyFatPercent + '%' : '—'}</div>
      </div>
    </div>
    <button class="btn btn-primary" id="add-bodystat-btn">+ New Check-in</button>
    ${
      entries.length === 0
        ? `<div class="empty-state">
             <div class="empty-state__icon">📸</div>
             <div class="empty-state__title">No check-ins yet</div>
             <div class="empty-state__subtitle">Record weight, body fat, measurements, and a progress photo.</div>
           </div>`
        : entries
            .map(
              (entry) => `
                <div class="list-row">
                  ${entry.photo ? `<img class="gym-body-thumb" src="${URL.createObjectURL(entry.photo)}" alt="" />` : ''}
                  <div style="flex:1;">
                    <div class="list-row__title">${entry.date}</div>
                    <div class="list-row__meta">
                      ${[
                        entry.weight != null ? entry.weight + 'lb' : null,
                        entry.bodyFatPercent != null ? entry.bodyFatPercent + '% bf' : null,
                        ...Object.entries(entry.measurements || {}).map(([k, v]) => `${k}: ${v}"`),
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'No numbers recorded'}
                    </div>
                  </div>
                </div>
              `
            )
            .join('')
    }
  `;

  document.getElementById('add-bodystat-btn').addEventListener('click', openBodyStatModal);
}

function openBodyStatModal() {
  openModal({
    title: 'New Check-in',
    contentHTML: `
      <form id="bodystat-form" class="gym-form">
        <div class="gym-form__row">
          <div>
            <label class="modal-sheet__field-label" for="bs-weight">Weight (lb)</label>
            <input class="input" type="number" inputmode="decimal" id="bs-weight" placeholder="0" />
          </div>
          <div>
            <label class="modal-sheet__field-label" for="bs-bf">Body fat (%)</label>
            <input class="input" type="number" inputmode="decimal" id="bs-bf" placeholder="0" />
          </div>
        </div>
        <div class="gym-form__row">
          <div>
            <label class="modal-sheet__field-label" for="bs-waist">Waist (in)</label>
            <input class="input" type="number" inputmode="decimal" id="bs-waist" placeholder="0" />
          </div>
          <div>
            <label class="modal-sheet__field-label" for="bs-chest">Chest (in)</label>
            <input class="input" type="number" inputmode="decimal" id="bs-chest" placeholder="0" />
          </div>
        </div>
        <div>
          <label class="modal-sheet__field-label" for="bs-photo">Progress photo</label>
          <input class="input" type="file" id="bs-photo" accept="image/*" capture="environment" />
        </div>
        <button type="submit" class="btn btn-primary">Save Check-in</button>
      </form>
    `,
    onOpen: () => {
      document.getElementById('bodystat-form').addEventListener('submit', async (event) => {
        event.preventDefault();

        const readNum = (id) => {
          const v = document.getElementById(id).value;
          return v === '' ? null : Number(v);
        };
        const measurements = {};
        if (readNum('bs-waist') != null) measurements.waist = readNum('bs-waist');
        if (readNum('bs-chest') != null) measurements.chest = readNum('bs-chest');

        await Storage.bodyStats.save(
          createBodyStat({
            weight: readNum('bs-weight'),
            bodyFatPercent: readNum('bs-bf'),
            measurements,
            photo: document.getElementById('bs-photo').files[0] || null,
          })
        );
        renderBodyTab();
        closeModal();
      });
    },
  });
}
