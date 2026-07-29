// settings.js
//
// The Settings screen — reached from the gear icon on the Dashboard
// (it deliberately has no bottom-nav tab). Holds app-wide preferences;
// today that's the theme. New options belong here as the app grows.
//
// The theme choice is saved in localStorage (not IndexedDB) on purpose:
// index.html reads it synchronously before the first paint, so the app
// never flashes the wrong theme while starting up.

const THEME_KEY = 'liamhq-theme';

const THEME_OPTIONS = [
  { id: 'system', label: 'System', hint: "Follow the iPhone's light/dark setting" },
  { id: 'light', label: 'Light', hint: 'Always light' },
  { id: 'dark', label: 'Dark', hint: 'Always dark — the signature CHAPHQ look' },
];

function currentTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === 'light' || saved === 'dark' ? saved : 'system';
}

function applyTheme(themeId) {
  if (themeId === 'system') {
    localStorage.removeItem(THEME_KEY);
    document.documentElement.removeAttribute('data-theme');
  } else {
    localStorage.setItem(THEME_KEY, themeId);
    document.documentElement.setAttribute('data-theme', themeId);
  }
}

export function render() {
  return `
    <div class="page-header">
      <div class="page-header__title">Settings</div>
    </div>
    <div class="page-content">
      <div class="settings-seal">
        <img src="icons/seal.png" alt="CHAPHQ — Non Sine Periculo" />
      </div>

      <div class="section-label">Appearance</div>
      <div id="theme-options">
        ${THEME_OPTIONS.map(
          (opt) => `
            <div class="list-row settings-theme-row" data-theme-id="${opt.id}" role="button">
              <div style="flex:1;">
                <div class="list-row__title">${opt.label}</div>
                <div class="list-row__meta">${opt.hint}</div>
              </div>
              <div class="checkbox-circle${currentTheme() === opt.id ? ' checked' : ''}">&#10003;</div>
            </div>
          `
        ).join('')}
      </div>

      <div class="section-label">About</div>
      <div class="card">
        <div class="list-row__title">CHAPHQ — Non Sine Periculo</div>
        <div class="list-row__meta">Personal headquarters — gym, food, investing, school. Built to grow.</div>
      </div>
    </div>
  `;
}

export function init() {
  document.querySelectorAll('.settings-theme-row').forEach((row) => {
    row.addEventListener('click', () => {
      applyTheme(row.dataset.themeId);
      document.querySelectorAll('.settings-theme-row .checkbox-circle').forEach((circle) => {
        circle.classList.toggle('checked', circle.closest('.settings-theme-row') === row);
      });
    });
  });
}
