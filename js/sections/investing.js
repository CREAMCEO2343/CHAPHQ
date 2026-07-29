// investing.js
//
// The Investing pillar, in five sub-tabs:
//   Portfolio — Brokerage and IRA as separate buckets, each with its own
//               total and a HUD allocation dial, over a terminal-style
//               holdings readout. Prices are daily closes entered via the
//               Update Prices sheet (see js/data/prices.js for how a real
//               feed slots in later — phase 2).
//   Journal   — closed trades as a data readout: date, ticker, order
//               type, realized P/L. Imported history carries its P/L
//               from the statement; trades opened here compute it.
//   Watch     — tickers you're watching, with a note each.
//   Notes     — dated macro notes (latest one also shows on Dashboard).
//   HC        — Hollingsworth Capital: business to-dos and content ideas.
//
// VISUAL TREATMENT: this section, and only this section, wears the
// "tactical HUD" look — thin glowing gold line-art, monospace readouts,
// outline buttons. Everything is scoped under the .hud wrapper below and
// styled in css/sections/investing.css. The drawing primitives live in
// js/components/hud.js.
//
// PHASE 2 HOOKS (planned, not built — see js/data/prices.js):
//   live/delayed price feed · news feed · AI portfolio chatbot
// Each has a marked extension point in this file; search PHASE 2.

import { Storage } from '../data/storage.js';
import { createHolding, createTrade, createWatchlistItem, createMacroNote, createBizItem } from '../data/schema.js';
import {
  syncPrices,
  getSyncStatus,
  applyManualCloses,
  holdingValue,
  holdingDayChange,
  holdingGain,
  holdingGainPercent,
  portfolioSummary,
} from '../data/prices.js';
import { openModal, closeModal } from '../components/modal.js';
import { initTabs } from '../components/tabs.js';
import { renderRing, toSegments, renderRingLegend } from '../components/hud.js';

const ACCOUNTS = [
  { id: 'brokerage', label: 'Brokerage' },
  { id: 'ira', label: 'IRA' },
];

const ORDER_TYPES = ['Market Sell', 'Limit Sell', 'Market Buy', 'Limit Buy', 'Payout'];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function money(n, digits = 2) {
  if (n == null) return '—';
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// Compact dollars for tight readout columns: $1.2K, $980, $12.3K
function moneyCompact(n) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  if (abs >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
  if (abs >= 100) return '$' + n.toFixed(0);
  return '$' + n.toFixed(2);
}

// Shares can be a whole number or a six-decimal fractional slice. Show
// every digit that's actually there — rounding 0.019721 down to "0.02"
// would misreport the position — but no trailing zeros.
function formatShares(shares) {
  if (shares == null) return '—';
  if (Number.isInteger(shares)) return String(shares);
  return String(Number(shares.toFixed(6)));
}

function signedMoney(n, digits = 2) {
  if (n == null) return '—';
  return `${n >= 0 ? '+' : '−'}$${Math.abs(n).toFixed(digits)}`;
}

function signedPercent(n) {
  if (n == null) return '';
  return `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}%`;
}

function deltaClass(n) {
  if (n == null) return '';
  return n >= 0 ? 'hud-up' : 'hud-down';
}

// "Mar 12 '26" — short enough for a readout column, unambiguous about year.
function shortDate(iso) {
  if (!iso) return '—';
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + " '" + iso.slice(2, 4);
}

export function render() {
  return `
    <div class="page-header hud-page-header">
      <div class="page-header__title">Investing</div>
      <div class="hud-page-header__rule"></div>
    </div>
    <div class="page-content hud">
      <div id="investing-tabs"></div>
      <div id="investing-tab-content"></div>
    </div>
  `;
}

export function init() {
  initTabs({
    containerId: 'investing-tabs',
    tabs: [
      { id: 'portfolio', label: 'Portfolio' },
      { id: 'journal', label: 'Journal' },
      { id: 'watch', label: 'Watch' },
      { id: 'notes', label: 'Notes' },
      { id: 'hc', label: 'HC' },
    ],
    onChange: (tabId) => {
      if (tabId === 'portfolio') renderPortfolioTab();
      if (tabId === 'journal') renderJournalTab();
      if (tabId === 'watch') renderWatchTab();
      if (tabId === 'notes') renderNotesTab();
      if (tabId === 'hc') renderHCTab();
    },
  });
}

// Small helpers so every tab's chrome is consistent.
function hudButton(id, label) {
  return `<button class="hud-btn" id="${id}">${label}</button>`;
}

function hudPanelHead(title, meta = '') {
  return `
    <div class="hud-panel__head">
      <span class="hud-panel__title">${title}</span>
      ${meta ? `<span class="hud-panel__meta mono">${meta}</span>` : ''}
    </div>
  `;
}

/* =====================================================================
   PORTFOLIO TAB
   ===================================================================== */

// Guards against two background syncs overlapping (e.g. tapping away and
// back before the first finishes) and against a finished sync redrawing
// a tab you've since navigated off.
let syncInFlight = false;

function onPortfolioTab() {
  return !!document.querySelector('#investing-tabs [data-tab="portfolio"].active');
}

async function renderPortfolioTab({ autoSync = true } = {}) {
  const contentEl = document.getElementById('investing-tab-content');
  const holdings = await Storage.holdings.getAll();
  const total = portfolioSummary(holdings);
  const priced = holdings.filter((h) => h.lastClose != null).length;
  const status = await getSyncStatus();

  contentEl.innerHTML = `
    <div class="hud-panel hud-total">
      <div class="hud-total__label">Total Portfolio</div>
      <div class="hud-total__value mono">${total.value == null ? '— — —' : money(total.value)}</div>
      <div class="hud-total__meta mono ${deltaClass(total.dayChange)}">
        ${
          total.dayChange == null
            ? holdings.length === 0
              ? 'NO POSITIONS'
              : `${priced}/${holdings.length} PRICED`
            : `${signedMoney(total.dayChange)} ${signedPercent(total.dayChangePercent)} TODAY`
        }
      </div>
      ${
        total.gain != null
          ? `<div class="hud-total__meta mono ${deltaClass(total.gain)}">
               ${signedMoney(total.gain)} ${signedPercent(total.gainPercent)} ALL TIME${
                 // Say so when the figure only covers some positions —
                 // otherwise it reads as the whole portfolio's return.
                 total.costedCount < total.totalCount ? ` · ${total.costedCount}/${total.totalCount} WITH BASIS` : ''
               }
             </div>`
          : ''
      }
      <div class="hud-total__meta mono" id="sync-status">${syncStatusText(status, holdings)}</div>
      <div class="hud-scanline"></div>
    </div>

    <div class="hud-actions">
      ${hudButton('add-holding-btn', '+ Add Holding')}
      ${holdings.length > 0 ? hudButton('update-prices-btn', status.hasKey ? 'Refresh Now' : 'Enter Prices') : ''}
    </div>

    ${ACCOUNTS.map((account) => renderAccountPanel(account, holdings)).join('')}

    ${
      holdings.length === 0
        ? `<div class="hud-empty">
             <div class="hud-empty__title">No positions</div>
             <div class="hud-empty__subtitle">Add holdings to the Brokerage or IRA bucket to bring the dials online.</div>
           </div>`
        : ''
    }
  `;

  document.getElementById('add-holding-btn').addEventListener('click', () => openHoldingModal());

  const updateBtn = document.getElementById('update-prices-btn');
  if (updateBtn) {
    updateBtn.addEventListener('click', async () => {
      // With a key this forces a re-check even if today's sync is done;
      // without one it falls back to typing closes in by hand.
      if (!status.hasKey) {
        openUpdatePricesModal(holdings);
        return;
      }
      updateBtn.disabled = true;
      await runSync(holdings, { force: true });
      if (onPortfolioTab()) renderPortfolioTab({ autoSync: false });
    });
  }

  contentEl.querySelectorAll('[data-holding-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const holding = holdings.find((h) => h.id === row.dataset.holdingId);
      if (holding) openHoldingModal(holding);
    });
  });

  // Opening the tab IS the refresh trigger — no button to remember. The
  // screen above already painted from cached prices, so this runs behind
  // it and only redraws if something actually moved.
  if (autoSync && holdings.length > 0) {
    runSync(holdings).then((result) => {
      if (!result || !onPortfolioTab()) return;
      if (result.updated) renderPortfolioTab({ autoSync: false });
      else refreshSyncLine(holdings);
    });
  }
}

async function runSync(holdings, options = {}) {
  if (syncInFlight) return null;
  syncInFlight = true;
  // A full sync is paced at ~1 request/second to respect the API's burst
  // limit, so 21 tickers takes ~25 seconds. Without a running count that
  // reads as a hung screen.
  const setLine = (text) => {
    const line = document.getElementById('sync-status');
    if (line) line.textContent = text;
  };
  setLine('SYNCING PRICES…');
  try {
    return await syncPrices(holdings, {
      ...options,
      onProgress: ({ done, total }) => setLine(`SYNCING PRICES… ${done}/${total}`),
    });
  } finally {
    syncInFlight = false;
  }
}

async function refreshSyncLine(holdings) {
  const line = document.getElementById('sync-status');
  if (!line) return;
  line.textContent = syncStatusText(await getSyncStatus(), holdings);
}

// One line explaining where the numbers on screen came from, and what to
// do if they're not the numbers you wanted.
function syncStatusText(status, holdings) {
  // The holdings ARE the cache, so what's on them is the truth about
  // what's on screen. Sync state can be missing (cleared storage, a
  // restored backup, a first run after an update) while real prices are
  // still displayed — reading the date off the holdings means the status
  // line can't claim "no cached prices" underneath a lit-up portfolio.
  const cachedDay =
    holdings
      .map((h) => h.priceDate)
      .filter(Boolean)
      .sort()
      .pop() || status.tradingDay;

  if (!status.hasKey) {
    return cachedDay
      ? 'MANUAL PRICES · ADD AN API KEY IN SETTINGS TO AUTO-UPDATE'
      : 'ADD AN ALPHA VANTAGE KEY IN SETTINGS TO AUTO-UPDATE';
  }
  if (!status.online) {
    return cachedDay ? `OFFLINE · SHOWING ${cachedDay} CLOSES` : 'OFFLINE · NO CACHED PRICES YET';
  }
  if (status.lastError) return status.lastError.toUpperCase();
  if (cachedDay) {
    const unresolved = status.unresolved.length ? ` · ${status.unresolved.length} SYMBOL(S) NOT FOUND` : '';
    return `CLOSES FROM ${cachedDay} · ${status.requestsRemaining} REQUESTS LEFT TODAY${unresolved}`;
  }
  return 'READY TO SYNC';
}

// One account bucket: the dial, its legend, and the holdings readout.
function renderAccountPanel(account, allHoldings) {
  const holdings = allHoldings.filter((h) => h.account === account.id);
  if (holdings.length === 0) return '';

  const summary = portfolioSummary(holdings);
  const accountValue = summary.value;
  const segments = toSegments(holdings.map((h) => ({ label: h.ticker, value: holdingValue(h) })));

  const rows = [...holdings]
    .sort((a, b) => (holdingValue(b) ?? -1) - (holdingValue(a) ?? -1))
    .map((h) => {
      const value = holdingValue(h);
      const change = holdingDayChange(h);
      const gain = holdingGain(h);
      const gainPct = holdingGainPercent(h);
      // Gain/loss needs a cost basis. Without one, say so rather than
      // showing a zero that looks like a break-even position.
      const gainLine =
        gain == null
          ? h.lastClose == null
            ? ''
            : 'add cost basis'
          : `${signedMoney(gain)} · ${signedPercent(gainPct)}`;

      return `
        <div class="hud-row" data-holding-id="${h.id}" role="button" tabindex="0">
          <span class="hud-row__ticker">
            ${escapeHTML(h.ticker)}
            ${gainLine ? `<span class="hud-row__sub ${deltaClass(gain)}">${gainLine}</span>` : ''}
          </span>
          <span class="hud-row__cell mono">${formatShares(h.shares)}</span>
          <span class="hud-row__cell mono hud-row__cell--strong">${value == null ? '—' : moneyCompact(value)}</span>
          <span class="hud-row__cell mono ${deltaClass(change)}">${change == null ? '—' : signedMoney(change, 2)}</span>
        </div>
      `;
    })
    .join('');

  // The bucket's all-time gain sits next to the position count, colored
  // by direction. hudPanelHead takes markup, so the span survives.
  const headMeta =
    summary.gain == null
      ? `${holdings.length} POS`
      : `${holdings.length} POS · <span class="${deltaClass(summary.gain)}">${signedMoney(summary.gain)} ${signedPercent(summary.gainPercent)}</span>`;

  return `
    <div class="hud-panel hud-account">
      ${hudPanelHead(account.label, headMeta)}

      <div class="hud-dial">
        ${renderRing({
          id: `ring-${account.id}`,
          segments,
          centerLabel: account.label.toUpperCase(),
          centerValue: accountValue == null ? '———' : moneyCompact(accountValue),
          footnote: summary.dayChange == null ? 'STANDBY' : signedPercent(summary.dayChangePercent),
        })}
        ${
          segments.length
            ? renderRingLegend(segments)
            : `<div class="hud-dial__standby">
                 <div class="hud-dial__standby-title">Allocation offline</div>
                 <div class="hud-dial__standby-text">Enter today's closing prices to plot this bucket.</div>
               </div>`
        }
      </div>

      <div class="hud-readout">
        <div class="hud-row hud-row--head">
          <span class="hud-row__ticker">Ticker</span>
          <span class="hud-row__cell">Shares</span>
          <span class="hud-row__cell">Value</span>
          <span class="hud-row__cell">Day</span>
        </div>
        ${rows}
      </div>
    </div>
  `;
}

function openHoldingModal(existing = null) {
  const holding = existing || createHolding();

  openModal({
    title: existing ? `Edit ${holding.ticker || 'Holding'}` : 'Add Holding',
    contentHTML: `
      <form id="holding-form" class="investing-form">
        <div>
          <label class="modal-sheet__field-label" for="h-account">Account</label>
          <select class="input" id="h-account">
            ${ACCOUNTS.map((a) => `<option value="${a.id}" ${holding.account === a.id ? 'selected' : ''}>${a.label}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="modal-sheet__field-label" for="h-ticker">Ticker</label>
          <input class="input" type="text" id="h-ticker" value="${escapeHTML(holding.ticker)}" placeholder="e.g. VOO" style="text-transform:uppercase;" required />
        </div>
        <div class="investing-form__row">
          <div>
            <label class="modal-sheet__field-label" for="h-shares">Shares</label>
            <input class="input mono" type="number" inputmode="decimal" step="any" id="h-shares" value="${holding.shares ?? ''}" placeholder="0" required />
          </div>
          <div>
            <label class="modal-sheet__field-label" for="h-avgcost">Cost basis / share</label>
            <input class="input mono" type="number" inputmode="decimal" step="any" id="h-avgcost" value="${holding.avgCost ?? ''}" placeholder="price paid" />
          </div>
        </div>
        <div>
          <label class="modal-sheet__field-label" for="h-close">Latest closing price</label>
          <input class="input mono" type="number" inputmode="decimal" step="any" id="h-close" value="${holding.lastClose ?? ''}" placeholder="optional — can update later" />
        </div>
        <button type="submit" class="btn btn-primary">${existing ? 'Save Changes' : 'Add Holding'}</button>
        ${existing ? '<button type="button" class="btn btn-secondary investing-delete" id="holding-delete-btn">Delete Holding</button>' : ''}
      </form>
    `,
    onOpen: () => {
      document.getElementById('holding-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const readNum = (id) => {
          const v = document.getElementById(id).value;
          return v === '' ? null : Number(v);
        };
        const newClose = readNum('h-close');
        await Storage.holdings.save({
          ...holding,
          account: document.getElementById('h-account').value,
          ticker: document.getElementById('h-ticker').value.trim().toUpperCase(),
          shares: readNum('h-shares'),
          avgCost: readNum('h-avgcost'),
          lastClose: newClose,
          priceDate: newClose != null && newClose !== holding.lastClose ? todayISO() : holding.priceDate,
        });
        renderPortfolioTab();
        closeModal();
      });

      if (existing) {
        document.getElementById('holding-delete-btn').addEventListener('click', async () => {
          await Storage.holdings.remove(holding.id);
          renderPortfolioTab();
          closeModal();
        });
      }
    },
  });
}

// Manual daily-close entry: one input per unique ticker, prefilled with
// the current close. PHASE 2 (price feed) replaces this sheet entirely.
function openUpdatePricesModal(holdings) {
  const tickers = [...new Set(holdings.map((h) => h.ticker))].sort();
  const currentClose = (ticker) => holdings.find((h) => h.ticker === ticker && h.lastClose != null)?.lastClose ?? '';
  // Ticker ids go into element ids, and BRK.B has a dot in it — which is
  // a class selector to querySelector. Slugify before using as an id.
  const fieldId = (ticker) => 'price-' + ticker.replace(/[^A-Za-z0-9]/g, '_');

  openModal({
    title: "Update Prices (today's closes)",
    contentHTML: `
      <div class="list-row__meta">Enter each ticker's closing price. Each save rolls the old close into "previous", which is what makes day-change math work. A live feed can replace this sheet in phase 2.</div>
      <form id="prices-form" class="investing-form">
        ${tickers
          .map(
            (t) => `
              <div>
                <label class="modal-sheet__field-label" for="${fieldId(t)}">${escapeHTML(t)}</label>
                <input class="input mono" type="number" inputmode="decimal" step="any" id="${fieldId(t)}" value="${currentClose(t)}" placeholder="closing price" />
              </div>
            `
          )
          .join('')}
        <button type="submit" class="btn btn-primary">Save Prices</button>
      </form>
    `,
    onOpen: () => {
      document.getElementById('prices-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const closes = {};
        tickers.forEach((t) => {
          closes[t] = document.getElementById(fieldId(t)).value;
        });
        await applyManualCloses(holdings, closes, todayISO());
        renderPortfolioTab();
        closeModal();
      });
    },
  });
}

/* =====================================================================
   JOURNAL TAB
   ===================================================================== */

// A closed trade knows its P/L one of two ways — see createTrade in
// schema.js. The stated number always wins, so an imported row never
// gets "corrected" into disagreeing with the brokerage statement.
function tradePL(trade) {
  if (trade.realizedPL != null) return trade.realizedPL;
  if (trade.status !== 'closed') return null;
  if (trade.entryPrice == null || trade.exitPrice == null || trade.quantity == null) return null;
  const perShare = trade.direction === 'short' ? trade.entryPrice - trade.exitPrice : trade.exitPrice - trade.entryPrice;
  return perShare * trade.quantity;
}

function tradePLPercent(trade) {
  if (trade.realizedPLPercent != null) return trade.realizedPLPercent;
  if (trade.entryPrice == null || trade.exitPrice == null || trade.entryPrice === 0) return null;
  const perShare = trade.direction === 'short' ? trade.entryPrice - trade.exitPrice : trade.exitPrice - trade.entryPrice;
  return (perShare / trade.entryPrice) * 100;
}

function tradeDate(trade) {
  return trade.exitDate || trade.entryDate || null;
}

async function renderJournalTab() {
  const contentEl = document.getElementById('investing-tab-content');
  const trades = (await Storage.trades.getAll()).sort((a, b) => {
    // Most recent first, by the date the trade actually resolved.
    const ad = tradeDate(a);
    const bd = tradeDate(b);
    if (ad && bd && ad !== bd) return bd.localeCompare(ad);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const closed = trades.filter((t) => t.status === 'closed');
  const realized = closed.map(tradePL).filter((pl) => pl != null);
  const totalPL = realized.reduce((sum, pl) => sum + pl, 0);
  const wins = realized.filter((pl) => pl > 0).length;
  const losses = realized.filter((pl) => pl < 0).length;
  const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : null;

  contentEl.innerHTML = `
    ${
      realized.length
        ? `<div class="hud-panel hud-stats">
             <div class="hud-stat">
               <div class="hud-stat__label">Realized</div>
               <div class="hud-stat__value mono ${deltaClass(totalPL)}">${signedMoney(totalPL)}</div>
             </div>
             <div class="hud-stat">
               <div class="hud-stat__label">Win / Loss</div>
               <div class="hud-stat__value mono">${wins}<span class="hud-stat__sep">/</span>${losses}</div>
             </div>
             <div class="hud-stat">
               <div class="hud-stat__label">Hit Rate</div>
               <div class="hud-stat__value mono">${winRate == null ? '—' : winRate.toFixed(0) + '%'}</div>
             </div>
             <div class="hud-scanline"></div>
           </div>`
        : ''
    }

    <div class="hud-actions">${hudButton('add-trade-btn', '+ New Trade')}</div>

    ${
      trades.length === 0
        ? `<div class="hud-empty">
             <div class="hud-empty__title">No trades journaled</div>
             <div class="hud-empty__subtitle">Record entries with your reasoning, then close them out with the outcome.</div>
           </div>`
        : `<div class="hud-panel">
             ${hudPanelHead('Trade Log', `${trades.length} ENTRIES`)}
             <div class="hud-readout hud-readout--journal">
               <div class="hud-row hud-row--head">
                 <span class="hud-row__cell">Date</span>
                 <span class="hud-row__ticker">Ticker</span>
                 <span class="hud-row__cell">P/L</span>
                 <span class="hud-row__cell">%</span>
               </div>
               ${trades.map(journalRow).join('')}
             </div>
           </div>`
    }
  `;

  document.getElementById('add-trade-btn').addEventListener('click', () => openTradeModal());

  contentEl.querySelectorAll('[data-trade-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const trade = trades.find((t) => t.id === row.dataset.tradeId);
      if (trade) openTradeModal(trade);
    });
  });
}

function journalRow(trade) {
  const pl = tradePL(trade);
  const pct = tradePLPercent(trade);
  const open = trade.status !== 'closed';

  return `
    <div class="hud-row hud-row--trade" data-trade-id="${trade.id}" role="button" tabindex="0">
      <span class="hud-row__cell mono hud-row__date">${shortDate(tradeDate(trade))}</span>
      <span class="hud-row__ticker">
        ${escapeHTML(trade.ticker)}
        <span class="hud-row__sub">${open ? 'OPEN' : escapeHTML(trade.orderType || 'Closed')}</span>
      </span>
      <span class="hud-row__cell mono hud-row__cell--strong ${deltaClass(pl)}">${pl == null ? '—' : signedMoney(pl)}</span>
      <span class="hud-row__cell mono ${deltaClass(pct)}">${pct == null ? '—' : signedPercent(pct)}</span>
    </div>
  `;
}

function openTradeModal(existing = null) {
  const trade = existing || createTrade();
  const imported = trade.source === 'import';

  openModal({
    title: existing ? `${trade.ticker} · ${trade.orderType || 'Trade'}` : 'New Trade',
    contentHTML: `
      <form id="trade-form" class="investing-form">
        <div class="investing-form__row">
          <div>
            <label class="modal-sheet__field-label" for="t-ticker">Ticker</label>
            <input class="input" type="text" id="t-ticker" value="${escapeHTML(trade.ticker)}" required />
          </div>
          <div>
            <label class="modal-sheet__field-label" for="t-ordertype">Order type</label>
            <select class="input" id="t-ordertype">
              <option value="">—</option>
              ${ORDER_TYPES.map((o) => `<option value="${o}" ${trade.orderType === o ? 'selected' : ''}>${o}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="investing-form__row">
          <div>
            <label class="modal-sheet__field-label" for="t-direction">Direction</label>
            <select class="input" id="t-direction">
              <option value="long" ${trade.direction === 'long' ? 'selected' : ''}>Long</option>
              <option value="short" ${trade.direction === 'short' ? 'selected' : ''}>Short</option>
            </select>
          </div>
          <div>
            <label class="modal-sheet__field-label" for="t-exitdate">Date</label>
            <input class="input mono" type="date" id="t-exitdate" value="${trade.exitDate ?? ''}" />
          </div>
        </div>

        <div class="section-label">Realized P/L${imported ? ' — as imported' : ''}</div>
        <div class="investing-form__row">
          <div>
            <label class="modal-sheet__field-label" for="t-pl">Dollars</label>
            <input class="input mono" type="number" inputmode="decimal" step="any" id="t-pl" value="${trade.realizedPL ?? ''}" placeholder="e.g. 106.85" />
          </div>
          <div>
            <label class="modal-sheet__field-label" for="t-plpct">Percent</label>
            <input class="input mono" type="number" inputmode="decimal" step="any" id="t-plpct" value="${trade.realizedPLPercent ?? ''}" placeholder="e.g. 39.85" />
          </div>
        </div>

        <div class="section-label">Prices (optional — fills in the math)</div>
        <div class="investing-form__row">
          <div>
            <label class="modal-sheet__field-label" for="t-entry">Entry price</label>
            <input class="input mono" type="number" inputmode="decimal" step="any" id="t-entry" value="${trade.entryPrice ?? ''}" placeholder="optional" />
          </div>
          <div>
            <label class="modal-sheet__field-label" for="t-exit">Exit price</label>
            <input class="input mono" type="number" inputmode="decimal" step="any" id="t-exit" value="${trade.exitPrice ?? ''}" placeholder="optional" />
          </div>
        </div>
        <div>
          <label class="modal-sheet__field-label" for="t-qty">Quantity</label>
          <input class="input mono" type="number" inputmode="decimal" step="any" id="t-qty" value="${trade.quantity ?? ''}" placeholder="optional" />
        </div>

        <div>
          <label class="modal-sheet__field-label" for="t-reasoning">Reasoning (why this trade?)</label>
          <textarea class="textarea" id="t-reasoning" placeholder="${imported ? 'Not captured on import — add it from memory.' : ''}">${escapeHTML(trade.reasoning || '')}</textarea>
        </div>
        <div>
          <label class="modal-sheet__field-label" for="t-outcome">Outcome / lessons</label>
          <textarea class="textarea" id="t-outcome" placeholder="${imported ? 'What did this one teach you?' : ''}">${escapeHTML(trade.outcome || '')}</textarea>
        </div>

        <button type="submit" class="btn btn-primary">Save Trade</button>
        ${existing ? '<button type="button" class="btn btn-secondary investing-delete" id="trade-delete-btn">Delete Trade</button>' : ''}
      </form>
    `,
    onOpen: () => {
      document.getElementById('trade-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const readNum = (id) => {
          const v = document.getElementById(id).value;
          return v === '' ? null : Number(v);
        };
        const exitPrice = readNum('t-exit');
        const realizedPL = readNum('t-pl');
        const exitDate = document.getElementById('t-exitdate').value || null;

        await Storage.trades.save({
          ...trade,
          ticker: document.getElementById('t-ticker').value.trim().toUpperCase(),
          orderType: document.getElementById('t-ordertype').value,
          direction: document.getElementById('t-direction').value,
          entryPrice: readNum('t-entry'),
          exitPrice,
          quantity: readNum('t-qty'),
          realizedPL,
          realizedPLPercent: readNum('t-plpct'),
          exitDate,
          reasoning: document.getElementById('t-reasoning').value.trim(),
          outcome: document.getElementById('t-outcome').value.trim(),
          // Closed the moment there's any evidence of a close: a stated
          // P/L, an exit price, or an exit date.
          status: realizedPL != null || exitPrice != null || exitDate != null ? 'closed' : 'open',
        });
        renderJournalTab();
        closeModal();
      });

      if (existing) {
        document.getElementById('trade-delete-btn').addEventListener('click', async () => {
          await Storage.trades.remove(trade.id);
          renderJournalTab();
          closeModal();
        });
      }
    },
  });
}

/* =====================================================================
   WATCH TAB
   ===================================================================== */

async function renderWatchTab() {
  const contentEl = document.getElementById('investing-tab-content');
  const items = (await Storage.watchlist.getAll()).sort((a, b) => b.createdAt - a.createdAt);

  contentEl.innerHTML = `
    <div class="hud-actions">${hudButton('add-watch-btn', '+ Watch a Ticker')}</div>
    ${
      items.length === 0
        ? `<div class="hud-empty">
             <div class="hud-empty__title">Watchlist empty</div>
             <div class="hud-empty__subtitle">Track tickers you're considering, with a note on why.</div>
           </div>`
        : `<div class="hud-panel">
             ${hudPanelHead('Watchlist', `${items.length} TRACKED`)}
             <div class="hud-readout">
               ${items
                 .map(
                   (item) => `
                     <div class="hud-row hud-row--watch">
                       <span class="hud-row__ticker">
                         ${escapeHTML(item.ticker)}
                         ${item.note ? `<span class="hud-row__sub hud-row__sub--note">${escapeHTML(item.note)}</span>` : ''}
                       </span>
                       <button class="hud-icon-btn" data-remove-watch="${item.id}" aria-label="Remove ${escapeHTML(item.ticker)}">✕</button>
                     </div>
                   `
                 )
                 .join('')}
             </div>
           </div>`
    }
  `;

  document.getElementById('add-watch-btn').addEventListener('click', () => {
    openModal({
      title: 'Watch a Ticker',
      contentHTML: `
        <form id="watch-form" class="investing-form">
          <div>
            <label class="modal-sheet__field-label" for="w-ticker">Ticker</label>
            <input class="input" type="text" id="w-ticker" style="text-transform:uppercase;" required />
          </div>
          <div>
            <label class="modal-sheet__field-label" for="w-note">Why watch it?</label>
            <textarea class="textarea" id="w-note"></textarea>
          </div>
          <button type="submit" class="btn btn-primary">Add to Watchlist</button>
        </form>
      `,
      onOpen: () => {
        document.getElementById('watch-form').addEventListener('submit', async (event) => {
          event.preventDefault();
          await Storage.watchlist.save(
            createWatchlistItem({
              ticker: document.getElementById('w-ticker').value.trim().toUpperCase(),
              note: document.getElementById('w-note').value.trim(),
            })
          );
          renderWatchTab();
          closeModal();
        });
      },
    });
  });

  contentEl.querySelectorAll('[data-remove-watch]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await Storage.watchlist.remove(btn.dataset.removeWatch);
      renderWatchTab();
    });
  });
}

/* =====================================================================
   NOTES TAB (macro notes)
   ===================================================================== */

async function renderNotesTab() {
  const contentEl = document.getElementById('investing-tab-content');
  const notes = (await Storage.macroNotes.getAll()).sort((a, b) => b.createdAt - a.createdAt);

  contentEl.innerHTML = `
    <div class="hud-actions">${hudButton('add-note-btn', '+ New Note')}</div>
    ${
      notes.length === 0
        ? `<div class="hud-empty">
             <div class="hud-empty__title">No macro notes</div>
             <div class="hud-empty__subtitle">Jot down market thinking — the latest note also shows on your Dashboard.</div>
           </div>`
        : notes
            .map(
              (note) => `
                <div class="hud-panel hud-note" data-note-id="${note.id}" role="button" tabindex="0">
                  ${hudPanelHead(escapeHTML(note.title || 'Untitled note'), note.date)}
                  ${note.body ? `<p class="hud-note__body">${escapeHTML(note.body)}</p>` : ''}
                </div>
              `
            )
            .join('')
    }
  `;

  document.getElementById('add-note-btn').addEventListener('click', () => openNoteModal());

  contentEl.querySelectorAll('[data-note-id]').forEach((card) => {
    card.addEventListener('click', () => {
      const note = notes.find((n) => n.id === card.dataset.noteId);
      if (note) openNoteModal(note);
    });
  });
}

function openNoteModal(existing = null) {
  const note = existing || createMacroNote();

  openModal({
    title: existing ? 'Edit Note' : 'New Macro Note',
    contentHTML: `
      <form id="note-form" class="investing-form">
        <div>
          <label class="modal-sheet__field-label" for="n-title">Title</label>
          <input class="input" type="text" id="n-title" value="${escapeHTML(note.title)}" placeholder="e.g. Rate cut implications" required />
        </div>
        <div>
          <label class="modal-sheet__field-label" for="n-body">Note</label>
          <textarea class="textarea" id="n-body" style="min-height:140px;">${escapeHTML(note.body || '')}</textarea>
        </div>
        <button type="submit" class="btn btn-primary">Save Note</button>
        ${existing ? '<button type="button" class="btn btn-secondary investing-delete" id="note-delete-btn">Delete Note</button>' : ''}
      </form>
    `,
    onOpen: () => {
      document.getElementById('note-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        await Storage.macroNotes.save({
          ...note,
          title: document.getElementById('n-title').value.trim(),
          body: document.getElementById('n-body').value.trim(),
        });
        renderNotesTab();
        closeModal();
      });

      if (existing) {
        document.getElementById('note-delete-btn').addEventListener('click', async () => {
          await Storage.macroNotes.remove(note.id);
          renderNotesTab();
          closeModal();
        });
      }
    },
  });
}

/* =====================================================================
   HC TAB (Hollingsworth Capital)
   ===================================================================== */

async function renderHCTab() {
  const contentEl = document.getElementById('investing-tab-content');
  const items = (await Storage.bizItems.getAll()).sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt - a.createdAt);
  const todos = items.filter((i) => i.type === 'todo');
  const content = items.filter((i) => i.type === 'content');

  const itemRow = (item) => `
    <div class="hud-row hud-row--hc${item.done ? ' hud-row--done' : ''}" data-hc-id="${item.id}">
      ${item.type === 'todo' ? `<span class="hud-check${item.done ? ' hud-check--on' : ''}">${item.done ? '✓' : ''}</span>` : ''}
      <span class="hud-row__ticker hud-row__ticker--wide">
        ${escapeHTML(item.title)}
        ${item.details ? `<span class="hud-row__sub hud-row__sub--note">${escapeHTML(item.details)}</span>` : ''}
      </span>
      <button class="hud-icon-btn" data-remove-hc="${item.id}" aria-label="Remove">✕</button>
    </div>
  `;

  const panel = (title, rows) =>
    rows.length
      ? `<div class="hud-panel">
           ${hudPanelHead(title, `${rows.length}`)}
           <div class="hud-readout">${rows.map(itemRow).join('')}</div>
         </div>`
      : '';

  contentEl.innerHTML = `
    <div class="hud-actions">${hudButton('add-hc-btn', '+ Add To-do / Content Idea')}</div>
    ${panel('To-dos', todos)}
    ${panel('Content Ideas', content)}
    ${
      items.length === 0
        ? `<div class="hud-empty">
             <div class="hud-empty__title">Hollingsworth Capital</div>
             <div class="hud-empty__subtitle">Business to-dos and content ideas live here.</div>
           </div>`
        : ''
    }
  `;

  document.getElementById('add-hc-btn').addEventListener('click', () => {
    openModal({
      title: 'Add HC Item',
      contentHTML: `
        <form id="hc-form" class="investing-form">
          <div>
            <label class="modal-sheet__field-label" for="hc-type">Type</label>
            <select class="input" id="hc-type">
              <option value="todo">To-do</option>
              <option value="content">Content idea</option>
            </select>
          </div>
          <div>
            <label class="modal-sheet__field-label" for="hc-title">Title</label>
            <input class="input" type="text" id="hc-title" required />
          </div>
          <div>
            <label class="modal-sheet__field-label" for="hc-details">Details</label>
            <textarea class="textarea" id="hc-details"></textarea>
          </div>
          <button type="submit" class="btn btn-primary">Add</button>
        </form>
      `,
      onOpen: () => {
        document.getElementById('hc-form').addEventListener('submit', async (event) => {
          event.preventDefault();
          await Storage.bizItems.save(
            createBizItem({
              type: document.getElementById('hc-type').value,
              title: document.getElementById('hc-title').value.trim(),
              details: document.getElementById('hc-details').value.trim(),
            })
          );
          renderHCTab();
          closeModal();
        });
      },
    });
  });

  contentEl.querySelectorAll('.hud-row--hc').forEach((row) => {
    row.addEventListener('click', async (event) => {
      if (event.target.closest('[data-remove-hc]')) return;
      const item = items.find((i) => i.id === row.dataset.hcId);
      if (!item || item.type !== 'todo') return;
      item.done = !item.done;
      await Storage.bizItems.save(item);
      renderHCTab();
    });
  });

  contentEl.querySelectorAll('[data-remove-hc]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await Storage.bizItems.remove(btn.dataset.removeHc);
      renderHCTab();
    });
  });
}

/* =====================================================================
   PHASE 2 EXTENSION POINTS
   =====================================================================

   1. LIVE / DELAYED PRICE FEED — BUILT.
      Alpha Vantage daily closes, fetched automatically when this tab
      opens (see syncPrices in js/data/prices.js). Manual entry survives
      as the no-API-key fallback. To swap data providers, replace
      fetchQuote() in prices.js — nothing in this file needs to change.

   2. NEWS FEED
      Add fetchNews(tickers) to a news provider, then add a sixth tab to
      initTabs() above with a renderNewsTab() that reuses .hud-panel and
      .hud-readout. The HUD styles are generic row/panel primitives, so a
      headline list needs no new CSS.

   3. AI PORTFOLIO CHATBOT
      buildPortfolioSnapshot(holdings) in prices.js already produces the
      clean context payload an assistant would take. Add an advisor
      provider with ask(question, snapshot), then a chat panel — the
      snapshot shape is the contract, and it's already stable.
   ===================================================================== */
