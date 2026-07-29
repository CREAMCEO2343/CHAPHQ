// settings.js
//
// The Settings screen — reached from the gear icon on the Dashboard
// (it deliberately has no bottom-nav tab). Holds app-wide preferences;
// today that's the theme. New options belong here as the app grows.
//
// The theme choice is saved in localStorage (not IndexedDB) on purpose:
// index.html reads it synchronously before the first paint, so the app
// never flashes the wrong theme while starting up.

import { getApiKey, setApiKey } from '../data/prices.js';

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

      <div class="section-label">Market Data</div>
      <div class="card settings-apikey">
        <div class="list-row__meta">
          Investing fetches daily closing prices automatically when you open the tab.
          It needs a free Alpha Vantage API key — grab one at
          <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noopener noreferrer">alphavantage.co</a>
          (takes about 20 seconds).
        </div>
        <div>
          <label class="modal-sheet__field-label" for="av-key">API key</label>
          <input class="input mono" type="text" id="av-key" placeholder="paste key here"
            autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />
        </div>
        <div class="settings-apikey__actions">
          <button class="btn btn-primary" id="av-key-save">Save Key</button>
          <button class="btn btn-secondary" id="av-key-clear">Clear</button>
        </div>
        <div class="list-row__meta" id="av-key-status"></div>
        <div class="list-row__meta">
          The free tier allows 25 requests a day and there are 21 tickers to price,
          so the app fetches only what's changed and skips the call entirely once
          the day's closes are in.
        </div>
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

  initApiKeyField();
}

// The key is stored in IndexedDB, not in the source, so it never lands in
// git. It's still readable by anyone with this device and devtools —
// fine for a free read-only market data key, not fine for anything that
// can spend money.
async function initApiKeyField() {
  const input = document.getElementById('av-key');
  const statusEl = document.getElementById('av-key-status');
  if (!input) return;

  // Show a masked hint rather than the key itself, so a shoulder-surfer
  // or a screenshot doesn't leak it, while still confirming one is set.
  const showStatus = (key) => {
    statusEl.textContent = key
      ? `Key saved (••••${key.slice(-4)}). Prices update automatically.`
      : 'No key saved — Investing falls back to entering closes by hand.';
  };

  showStatus(await getApiKey());

  document.getElementById('av-key-save').addEventListener('click', async () => {
    const value = input.value.trim();
    if (!value) return;
    await setApiKey(value);
    input.value = '';
    showStatus(value);
  });

  document.getElementById('av-key-clear').addEventListener('click', async () => {
    await setApiKey('');
    input.value = '';
    showStatus(null);
  });
}
