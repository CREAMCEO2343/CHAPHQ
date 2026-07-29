// gym.js
//
// The Gym module, rebuilt around one core loop:
//   pick a workout → log sets → finish → review.
//
// Deliberately NOT here: graphs, achievements, recovery scores, AI
// recommendations, badges, social features, analytics. If a feature
// doesn't serve the core loop, it doesn't belong in this file.
//
// Screens (simple in-module view switching, no sub-tab bar):
//   Home     — last completed workout + the workout cards + History and
//              Body Stats buttons
//   Workout  — the active session: previous numbers under each exercise,
//              pre-filled editable sets, workout timer, rest timer
//   Running  — the running variant: duration / distance / pace / notes
//   History  — sessions list (date · name · duration) → session detail
//   Body     — a plain weight log (other body fields exist in the data
//              model but deliberately have no UI yet)

import { Storage } from '../data/storage.js';
import { createWorkoutSession, createBodyStat } from '../data/schema.js';
import { openModal, closeModal } from '../components/modal.js';

const REST_SECONDS = 90; // rest timer length after completing a set

// The active session lives here while training. Timers are module-level
// so navigating away can always clean them up.
let activeSession = null; // { workout, startedAt, exercises: [{name, sets:[{weight, reps, completed}]}] }
let workoutTimerInterval = null;
let restTimerInterval = null;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDuration(totalSec) {
  if (totalSec == null) return '—';
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}:${String(sec).padStart(2, '0')}`;
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// Does this workout prescribe sets and reps? Running logs don't.
function hasTarget(workout) {
  return workout.targetSets > 0 && workout.targetRepsLow > 0;
}

// "3 × 6–8" — the day's prescription, shown on the workout card and
// above every exercise once training starts.
function formatTarget(workout) {
  if (!hasTarget(workout)) return '';
  const { targetSets, targetRepsLow, targetRepsHigh } = workout;
  const reps = targetRepsHigh > targetRepsLow ? `${targetRepsLow}–${targetRepsHigh}` : `${targetRepsLow}`;
  return `${targetSets} × ${reps}`;
}

function clearTimers() {
  clearInterval(workoutTimerInterval);
  clearInterval(restTimerInterval);
  workoutTimerInterval = null;
  restTimerInterval = null;
  document.getElementById('gym-rest-banner')?.remove();
}

export function render() {
  // Leaving and re-entering the section always resets to Home.
  activeSession = null;
  clearTimers();
  return `
    <div class="page-header">
      <div class="page-header__title">Gym</div>
    </div>
    <div class="page-content" id="gym-content"></div>
  `;
}

export function init() {
  renderHome();
}

/* =====================================================================
   HOME
   ===================================================================== */

async function renderHome() {
  clearTimers();
  const contentEl = document.getElementById('gym-content');
  const [workouts, sessions] = await Promise.all([Storage.workouts.getAll(), Storage.workoutSessions.getAll()]);
  workouts.sort((a, b) => (a.order || 99) - (b.order || 99));
  const lastSession = sessions.sort((a, b) => b.createdAt - a.createdAt)[0];

  contentEl.innerHTML = `
    ${
      lastSession
        ? `<div class="card gym-last">
             <div class="stat-tile__label">Last workout</div>
             <div class="list-row__title">${escapeHTML(lastSession.workoutName)}</div>
             <div class="list-row__meta mono">${formatDate(lastSession.createdAt)} · ${formatDuration(lastSession.durationSec)}</div>
           </div>`
        : ''
    }

    <div class="gym-card-list">
      ${workouts
        .map((w) => {
          const meta =
            w.type === 'running'
              ? `Running log · ~${w.estimatedMin} min`
              : `${w.exercises.length} exercises · ${formatTarget(w)} · ~${w.estimatedMin} min`;
          return `
            <div class="card gym-workout-card" data-workout-id="${w.id}">
              <div class="gym-workout-card__info">
                <div class="gym-workout-card__name">${escapeHTML(w.name)}</div>
                <div class="list-row__meta">${meta}</div>
                <div class="list-row__meta">${w.lastCompletedAt ? 'Last: ' + formatDate(w.lastCompletedAt) : 'Not completed yet'}</div>
              </div>
              <div class="gym-workout-card__actions">
                <button class="btn btn-primary gym-start-btn" data-start="${w.id}">Start Workout</button>
                ${w.type === 'lifting' ? `<button class="btn btn-secondary gym-edit-btn" data-edit="${w.id}">Edit</button>` : ''}
              </div>
            </div>
          `;
        })
        .join('')}
    </div>

    <div class="gym-home-links">
      <button class="btn btn-secondary" id="gym-history-btn">History</button>
      <button class="btn btn-secondary" id="gym-body-btn">Body Stats</button>
    </div>
  `;

  contentEl.querySelectorAll('[data-start]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const workout = workouts.find((w) => w.id === btn.dataset.start);
      if (workout.type === 'running') startRunning(workout);
      else startWorkout(workout);
    });
  });

  contentEl.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const workout = workouts.find((w) => w.id === btn.dataset.edit);
      openWorkoutEditor(workout);
    });
  });

  document.getElementById('gym-history-btn').addEventListener('click', renderHistory);
  document.getElementById('gym-body-btn').addEventListener('click', renderBody);
}

/* =====================================================================
   WORKOUT EDITOR — add / remove / reorder exercises
   ===================================================================== */

function openWorkoutEditor(workout) {
  const listHTML = () =>
    workout.exercises
      .map(
        (ex, i) => `
          <div class="list-row gym-editor-row">
            <div class="list-row__title">${escapeHTML(ex.name)}</div>
            <button class="btn-icon" data-move-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
            <button class="btn-icon" data-move-down="${i}" ${i === workout.exercises.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
            <button class="btn-icon" data-remove-ex="${i}" aria-label="Remove">✕</button>
          </div>
        `
      )
      .join('');

  openModal({
    title: `Edit ${workout.name}`,
    contentHTML: `
      <div class="section-label">Target — applies to every exercise here</div>
      <div class="gym-editor-target">
        <div>
          <label class="modal-sheet__field-label" for="gym-target-sets">Sets</label>
          <input class="input mono" type="number" inputmode="numeric" min="1" id="gym-target-sets" value="${workout.targetSets ?? ''}" />
        </div>
        <div>
          <label class="modal-sheet__field-label" for="gym-target-low">Reps from</label>
          <input class="input mono" type="number" inputmode="numeric" min="1" id="gym-target-low" value="${workout.targetRepsLow ?? ''}" />
        </div>
        <div>
          <label class="modal-sheet__field-label" for="gym-target-high">to</label>
          <input class="input mono" type="number" inputmode="numeric" min="1" id="gym-target-high" value="${workout.targetRepsHigh ?? ''}" />
        </div>
      </div>

      <div class="section-label">Exercises</div>
      <div id="gym-editor-list">${listHTML()}</div>
      <div class="gym-editor-add">
        <input class="input" type="text" id="gym-new-exercise" placeholder="New exercise name" />
        <button class="btn btn-secondary" id="gym-add-exercise-btn">Add</button>
      </div>
    `,
    onOpen: (root) => {
      // Targets save as you type — no Save button to forget to press.
      ['gym-target-sets', 'gym-target-low', 'gym-target-high'].forEach((id) => {
        document.getElementById(id).addEventListener('change', async () => {
          const read = (fieldId) => {
            const value = document.getElementById(fieldId).value;
            return value === '' ? null : Number(value);
          };
          workout.targetSets = read('gym-target-sets');
          workout.targetRepsLow = read('gym-target-low');
          workout.targetRepsHigh = read('gym-target-high');
          await Storage.workouts.save(workout);
        });
      });

      const rewire = () => {
        const listEl = document.getElementById('gym-editor-list');
        listEl.innerHTML = listHTML();

        listEl.querySelectorAll('[data-move-up]').forEach((b) =>
          b.addEventListener('click', async () => {
            const i = Number(b.dataset.moveUp);
            [workout.exercises[i - 1], workout.exercises[i]] = [workout.exercises[i], workout.exercises[i - 1]];
            await Storage.workouts.save(workout);
            rewire();
          })
        );
        listEl.querySelectorAll('[data-move-down]').forEach((b) =>
          b.addEventListener('click', async () => {
            const i = Number(b.dataset.moveDown);
            [workout.exercises[i + 1], workout.exercises[i]] = [workout.exercises[i], workout.exercises[i + 1]];
            await Storage.workouts.save(workout);
            rewire();
          })
        );
        listEl.querySelectorAll('[data-remove-ex]').forEach((b) =>
          b.addEventListener('click', async () => {
            workout.exercises.splice(Number(b.dataset.removeEx), 1);
            await Storage.workouts.save(workout);
            rewire();
          })
        );
      };
      rewire();

      document.getElementById('gym-add-exercise-btn').addEventListener('click', async () => {
        const input = document.getElementById('gym-new-exercise');
        const name = input.value.trim();
        if (!name) return;
        workout.exercises.push({ name });
        await Storage.workouts.save(workout);
        input.value = '';
        rewire();
      });
    },
    onClose: () => renderHome(),
  });
}

/* =====================================================================
   ACTIVE WORKOUT (lifting)
   ===================================================================== */

// The most recent session containing this exercise, for the "previous"
// line and for pre-filling today's sets.
function findPreviousSets(sessions, exerciseName) {
  const withExercise = sessions
    .filter((s) => s.type === 'lifting')
    .sort((a, b) => b.createdAt - a.createdAt);
  for (const session of withExercise) {
    const match = session.exercises.find((e) => e.name === exerciseName);
    if (match && match.sets.length) return match.sets;
  }
  return null;
}

function formatPrevLine(sets) {
  return sets.map((s) => `${s.weight || 0} lb × ${s.reps || 0}`).join(', ');
}

// Builds the rows you see when an exercise opens. Two different sources,
// on purpose:
//
//   REPS come from the workout's target — that's the plan for today, and
//   it's the same every session, so it's worth pre-filling. The low end
//   of the range goes in the box (hit 6, then work up to 8); the full
//   range is shown above it.
//
//   WEIGHT comes from what you actually lifted last time, because there
//   is no sensible default weight — it's different for every exercise
//   and climbs over time. First time through, it's blank. When a past
//   session had fewer sets than today's target, the last weight carries
//   down to fill the remaining rows.
function buildSets(workout, prevSets) {
  const count = hasTarget(workout) ? workout.targetSets : prevSets?.length || 1;
  const targetReps = hasTarget(workout) ? workout.targetRepsLow : '';

  return Array.from({ length: count }, (_, i) => {
    const prev = prevSets ? prevSets[i] ?? prevSets[prevSets.length - 1] : null;
    return {
      weight: prev?.weight ?? '',
      reps: targetReps !== '' ? targetReps : prev?.reps ?? '',
      completed: false,
    };
  });
}

async function startWorkout(workout) {
  const sessions = await Storage.workoutSessions.getAll();

  activeSession = {
    workout,
    startedAt: Date.now(),
    exercises: workout.exercises.map((ex) => {
      const prev = findPreviousSets(sessions, ex.name);
      return {
        name: ex.name,
        prevSets: prev,
        sets: buildSets(workout, prev),
      };
    }),
  };

  renderActiveWorkout();
  workoutTimerInterval = setInterval(() => {
    const el = document.getElementById('gym-workout-timer');
    if (el) el.textContent = formatDuration(Math.floor((Date.now() - activeSession.startedAt) / 1000));
  }, 1000);
}

function renderActiveWorkout() {
  const contentEl = document.getElementById('gym-content');
  const s = activeSession;

  contentEl.innerHTML = `
    <div class="gym-active-header">
      <button class="btn btn-secondary" id="gym-cancel-btn">✕ Cancel</button>
      <div class="gym-active-title">${escapeHTML(s.workout.name)}</div>
      <div class="gym-timer mono" id="gym-workout-timer">0:00</div>
    </div>

    ${s.exercises
      .map(
        (ex, exIndex) => `
          <div class="card gym-exercise">
            <div class="gym-exercise__head">
              <div class="gym-exercise__name">${escapeHTML(ex.name)}</div>
              ${hasTarget(s.workout) ? `<div class="gym-exercise__target mono">${formatTarget(s.workout)}</div>` : ''}
            </div>
            ${ex.prevSets ? `<div class="gym-exercise__prev mono">${formatPrevLine(ex.prevSets)}</div>` : '<div class="gym-exercise__prev">first time — no previous data</div>'}
            <div class="gym-sets" data-ex="${exIndex}">
              ${ex.sets
                .map(
                  (set, setIndex) => `
                    <div class="gym-set-row">
                      <span class="gym-set-num">${setIndex + 1}</span>
                      <input class="input mono" type="number" inputmode="decimal" placeholder="lb"
                        value="${set.weight}" data-w="${exIndex}-${setIndex}" />
                      <input class="input mono" type="number" inputmode="numeric"
                        placeholder="${hasTarget(s.workout) ? `${s.workout.targetRepsLow}–${s.workout.targetRepsHigh}` : 'reps'}"
                        value="${set.reps}" data-r="${exIndex}-${setIndex}" />
                      <button class="checkbox-circle${set.completed ? ' checked' : ''}" data-c="${exIndex}-${setIndex}" aria-label="Set done">✓</button>
                    </div>
                  `
                )
                .join('')}
            </div>
            <button class="btn btn-secondary gym-add-set" data-add-set="${exIndex}">+ Add Set</button>
          </div>
        `
      )
      .join('')}

    <button class="btn btn-primary" id="gym-finish-btn">Finish Workout</button>
  `;

  document.getElementById('gym-cancel-btn').addEventListener('click', () => {
    if (confirm('Discard this workout?')) {
      activeSession = null;
      renderHome();
    }
  });

  // Inputs write straight into the session object so re-renders keep state.
  contentEl.querySelectorAll('[data-w]').forEach((input) => {
    input.addEventListener('input', () => {
      const [ei, si] = input.dataset.w.split('-').map(Number);
      s.exercises[ei].sets[si].weight = input.value;
    });
  });
  contentEl.querySelectorAll('[data-r]').forEach((input) => {
    input.addEventListener('input', () => {
      const [ei, si] = input.dataset.r.split('-').map(Number);
      s.exercises[ei].sets[si].reps = input.value;
    });
  });

  contentEl.querySelectorAll('[data-c]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [ei, si] = btn.dataset.c.split('-').map(Number);
      const set = s.exercises[ei].sets[si];
      set.completed = !set.completed;
      btn.classList.toggle('checked', set.completed);
      if (set.completed) startRestTimer();
    });
  });

  contentEl.querySelectorAll('[data-add-set]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ei = Number(btn.dataset.addSet);
      const sets = s.exercises[ei].sets;
      const last = sets[sets.length - 1];
      sets.push({ weight: last?.weight ?? '', reps: last?.reps ?? '', completed: false });
      renderActiveWorkout(); // re-render keeps all state (it lives in activeSession)
    });
  });

  document.getElementById('gym-finish-btn').addEventListener('click', finishWorkout);
}

// Automatic, dismissible rest countdown after completing a set.
function startRestTimer() {
  clearInterval(restTimerInterval);
  document.getElementById('gym-rest-banner')?.remove();

  let remaining = REST_SECONDS;
  const banner = document.createElement('div');
  banner.id = 'gym-rest-banner';
  banner.className = 'gym-rest-banner';
  banner.innerHTML = `<span>Rest</span><span class="mono" id="gym-rest-time">${formatDuration(remaining)}</span><button class="btn-icon" id="gym-rest-dismiss" aria-label="Dismiss">✕</button>`;
  document.body.appendChild(banner);

  banner.querySelector('#gym-rest-dismiss').addEventListener('click', () => {
    clearInterval(restTimerInterval);
    banner.remove();
  });

  restTimerInterval = setInterval(() => {
    remaining -= 1;
    const el = document.getElementById('gym-rest-time');
    if (el) el.textContent = formatDuration(Math.max(remaining, 0));
    if (remaining <= 0) {
      clearInterval(restTimerInterval);
      banner.remove();
    }
  }, 1000);
}

async function finishWorkout() {
  const s = activeSession;
  const durationSec = Math.floor((Date.now() - s.startedAt) / 1000);

  // Keep sets that were completed or at least have data typed in.
  const exercises = s.exercises
    .map((ex) => ({
      name: ex.name,
      sets: ex.sets
        .filter((set) => set.completed || set.weight !== '' || set.reps !== '')
        .map((set) => ({ weight: Number(set.weight) || 0, reps: Number(set.reps) || 0, completed: set.completed })),
    }))
    .filter((ex) => ex.sets.length > 0);

  const completedSets = exercises.reduce((n, ex) => n + ex.sets.filter((x) => x.completed).length, 0);
  const exercisesCompleted = exercises.filter((ex) => ex.sets.some((x) => x.completed)).length;

  await Storage.workoutSessions.save(
    createWorkoutSession({
      workoutId: s.workout.id,
      workoutName: s.workout.name,
      type: 'lifting',
      durationSec,
      exercises,
    })
  );
  await Storage.workouts.save({ ...s.workout, lastCompletedAt: Date.now() });

  // Finishing a workout also flips the Dashboard's "Workout ✅" for today.
  const daily = (await Storage.dailyLogs.getByDate(todayISO())) || { date: todayISO(), waterMl: null, weight: null };
  await Storage.dailyLogs.save({ ...daily, gymCompleted: true });

  activeSession = null;
  clearTimers();

  // Plain summary — duration, exercises, sets. No confetti.
  openModal({
    title: 'Workout Complete',
    contentHTML: `
      <div class="gym-summary">
        <div class="stat-grid">
          <div class="stat-tile"><div class="stat-tile__label">Duration</div><div class="stat-tile__value">${formatDuration(durationSec)}</div></div>
          <div class="stat-tile"><div class="stat-tile__label">Exercises</div><div class="stat-tile__value">${exercisesCompleted}</div></div>
        </div>
        <div class="stat-tile"><div class="stat-tile__label">Total Sets</div><div class="stat-tile__value">${completedSets}</div></div>
      </div>
    `,
    onClose: () => renderHome(),
  });
}

/* =====================================================================
   RUNNING
   ===================================================================== */

async function startRunning(workout) {
  const contentEl = document.getElementById('gym-content');
  const sessions = await Storage.workoutSessions.getAll();
  const lastRun = sessions.filter((x) => x.type === 'running').sort((a, b) => b.createdAt - a.createdAt)[0];

  contentEl.innerHTML = `
    <div class="gym-active-header">
      <button class="btn btn-secondary" id="gym-cancel-btn">✕ Cancel</button>
      <div class="gym-active-title">Running</div>
    </div>

    ${
      lastRun?.running
        ? `<div class="card gym-last">
             <div class="stat-tile__label">Last run</div>
             <div class="list-row__meta mono">
               ${lastRun.running.durationMin} min
               ${lastRun.running.distanceMi ? ' · ' + lastRun.running.distanceMi + ' mi' : ''}
               ${lastRun.running.pace ? ' · ' + escapeHTML(lastRun.running.pace) : ''}
             </div>
           </div>`
        : ''
    }

    <form id="gym-run-form" class="gym-form">
      <div>
        <label class="modal-sheet__field-label" for="run-duration">Duration (minutes)</label>
        <input class="input mono" type="number" inputmode="decimal" id="run-duration" placeholder="30" required />
      </div>
      <div class="gym-form__row">
        <div>
          <label class="modal-sheet__field-label" for="run-distance">Distance (mi, optional)</label>
          <input class="input mono" type="number" inputmode="decimal" step="any" id="run-distance" />
        </div>
        <div>
          <label class="modal-sheet__field-label" for="run-pace">Avg pace (optional)</label>
          <input class="input mono" type="text" id="run-pace" placeholder="9:30 /mi" />
        </div>
      </div>
      <div>
        <label class="modal-sheet__field-label" for="run-notes">Notes (optional)</label>
        <textarea class="textarea" id="run-notes"></textarea>
      </div>
      <button type="submit" class="btn btn-primary">Finish Run</button>
    </form>
  `;

  document.getElementById('gym-cancel-btn').addEventListener('click', renderHome);

  document.getElementById('gym-run-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const durationMin = Number(document.getElementById('run-duration').value);
    const distance = document.getElementById('run-distance').value;

    await Storage.workoutSessions.save(
      createWorkoutSession({
        workoutId: workout.id,
        workoutName: workout.name,
        type: 'running',
        durationSec: Math.round(durationMin * 60),
        running: {
          durationMin,
          distanceMi: distance === '' ? null : Number(distance),
          pace: document.getElementById('run-pace').value.trim() || null,
          notes: document.getElementById('run-notes').value.trim() || null,
        },
      })
    );
    await Storage.workouts.save({ ...workout, lastCompletedAt: Date.now() });

    const daily = (await Storage.dailyLogs.getByDate(todayISO())) || { date: todayISO(), waterMl: null, weight: null };
    await Storage.dailyLogs.save({ ...daily, gymCompleted: true });

    renderHome();
  });
}

/* =====================================================================
   HISTORY
   ===================================================================== */

async function renderHistory() {
  const contentEl = document.getElementById('gym-content');
  const sessions = (await Storage.workoutSessions.getAll()).sort((a, b) => b.createdAt - a.createdAt);

  contentEl.innerHTML = `
    <button class="btn btn-secondary" id="gym-back-btn">&larr; Gym</button>
    <div class="section-label">History</div>
    ${
      sessions.length === 0
        ? `<div class="empty-state">
             <div class="empty-state__icon">📜</div>
             <div class="empty-state__title">No workouts yet</div>
             <div class="empty-state__subtitle">Finished workouts appear here: date, workout, duration.</div>
           </div>`
        : sessions
            .map(
              (session) => `
                <div class="list-row" data-session-id="${session.id}" style="cursor:pointer;">
                  <div style="flex:1;">
                    <div class="list-row__title">${escapeHTML(session.workoutName)}</div>
                    <div class="list-row__meta">${formatDate(session.createdAt)}</div>
                  </div>
                  <span class="list-row__meta mono">${formatDuration(session.durationSec)}</span>
                </div>
              `
            )
            .join('')
    }
  `;

  document.getElementById('gym-back-btn').addEventListener('click', renderHome);

  contentEl.querySelectorAll('[data-session-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const session = sessions.find((x) => x.id === row.dataset.sessionId);
      if (session) renderHistoryDetail(session);
    });
  });
}

function renderHistoryDetail(session) {
  const contentEl = document.getElementById('gym-content');

  contentEl.innerHTML = `
    <button class="btn btn-secondary" id="gym-back-btn">&larr; History</button>
    <div class="page-header" style="padding-left:0;">
      <div class="page-header__title">${escapeHTML(session.workoutName)}</div>
      <div class="page-header__subtitle">${formatDate(session.createdAt)} · ${formatDuration(session.durationSec)}</div>
    </div>
    ${
      session.type === 'running' && session.running
        ? `<div class="card">
             <div class="list-row__title mono">${session.running.durationMin} min${session.running.distanceMi ? ' · ' + session.running.distanceMi + ' mi' : ''}${session.running.pace ? ' · ' + escapeHTML(session.running.pace) : ''}</div>
             ${session.running.notes ? `<div class="list-row__meta">${escapeHTML(session.running.notes)}</div>` : ''}
           </div>`
        : session.exercises
            .map(
              (ex) => `
                <div class="card gym-exercise">
                  <div class="gym-exercise__name">${escapeHTML(ex.name)}</div>
                  <div class="gym-exercise__prev mono">${ex.sets.map((s) => `${s.weight} lb × ${s.reps}${s.completed ? '' : ' (skipped)'}`).join(', ')}</div>
                </div>
              `
            )
            .join('')
    }
  `;

  document.getElementById('gym-back-btn').addEventListener('click', renderHistory);
}

/* =====================================================================
   BODY STATS — weight log only (for now, by design)
   ===================================================================== */

async function renderBody() {
  const contentEl = document.getElementById('gym-content');
  const entries = (await Storage.bodyStats.getAll()).sort((a, b) => b.createdAt - a.createdAt);
  const latest = entries.find((e) => e.weight != null);

  contentEl.innerHTML = `
    <button class="btn btn-secondary" id="gym-back-btn">&larr; Gym</button>
    <div class="section-label">Body Stats</div>
    <div class="stat-tile">
      <div class="stat-tile__label">Current Weight</div>
      <div class="stat-tile__value">${latest ? latest.weight + ' lb' : '—'}</div>
      <div class="stat-tile__meta">${latest ? 'as of ' + latest.date : ''}</div>
    </div>
    <button class="btn btn-primary" id="gym-add-weight-btn">+ Log Weight</button>
    ${entries
      .filter((e) => e.weight != null)
      .map(
        (e) => `
          <div class="list-row">
            <div class="list-row__title mono">${e.weight} lb</div>
            <span class="list-row__meta">${e.date}</span>
          </div>
        `
      )
      .join('')}
  `;

  document.getElementById('gym-back-btn').addEventListener('click', renderHome);

  document.getElementById('gym-add-weight-btn').addEventListener('click', () => {
    openModal({
      title: 'Log Weight',
      contentHTML: `
        <form id="weight-form" class="gym-form">
          <div>
            <label class="modal-sheet__field-label" for="bw-weight">Weight (lb)</label>
            <input class="input mono" type="number" inputmode="decimal" step="any" id="bw-weight" required />
          </div>
          <button type="submit" class="btn btn-primary">Save</button>
        </form>
      `,
      onOpen: () => {
        document.getElementById('weight-form').addEventListener('submit', async (event) => {
          event.preventDefault();
          await Storage.bodyStats.save(createBodyStat({ weight: Number(document.getElementById('bw-weight').value) }));
          renderBody();
          closeModal();
        });
      },
    });
  });
}
