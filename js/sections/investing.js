// investing.js
//
// The Investing pillar, in five sub-tabs:
//   Portfolio — all holdings with values and allocation %, split into
//               Brokerage and IRA buckets, each with its own subtotal.
//               Prices are daily closes entered via the Update Prices
//               sheet (see js/data/prices.js for how a real price feed
//               slots in later — phase 2).
//   Journal   — the trade journal: entry/exit, reasoning, outcome.
//   Watch     — tickers you're watching, with a note each.
//   Notes     — dated macro notes (latest one also shows on Dashboard).
//   HC        — Hollingsworth Capital: business to-dos and content ideas.
//
// PHASE 2 HOOKS (planned, not built — see js/data/prices.js):
//   live/delayed price feed · news feed · AI portfolio chatbot

import { Storage } from '../data/storage.js';
import { createHolding, createTrade, createWatchlistItem, createMacroNote, createBizItem } from '../data/schema.js';
import { refreshCloses, applyManualCloses, holdingValue, holdingDayChange, portfolioSummary } from '../data/prices.js';
import { openModal, closeModal } from '../components/modal.js';
import { initTabs } from '../components/tabs.js';

const ACCOUNTS = [
  { id: 'brokerage', label: 'Brokerage' },
  { id: 'ira', label: 'IRA' },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function money(n) {
  if (n == null) return '—';
  return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function changeHTML(change, percent) {
  if (change == null) return '<span class="list-row__meta">no day change yet</span>';
  const cls = change >= 0 ? 'investing-up' : 'investing-down';
  const sign = change >= 0 ? '+' : '−';
  const pct = percent != null ? ` (${sign}${Math.abs(percent).toFixed(2)}%)` : '';
  return `<span class="${cls}">${sign}${money(Math.abs(change)).slice(1) ? sign === '+' ? '$' + Math.abs(change).toFixed(2) : '$' + Math.abs(change).toFixed(2) : ''}${pct}</span>`;
}

export function render() {
  return `
    <div class="page-header">
      <div class="page-header__title">Investing</div>
    </div>
    <div class="page-content">
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

/* =====================================================================
   PORTFOLIO TAB
   ===================================================================== */

async function renderPortfolioTab() {
  const contentEl = document.getElementById('investing-tab-content');
  const holdings = await Storage.holdings.getAll();
  const total = portfolioSummary(holdings);

  const accountSection = (account) => {
    const accHoldings = holdings.filter((h) => h.account === account.id);
    if (accHoldings.length === 0) return '';
    const accSummary = portfolioSummary(accHoldings);
    const accValue = accSummary.value;

    return `
      <div class="section-label">${account.label} · ${money(accValue)}</div>
      ${accHoldings
        .sort((a, b) => (holdingValue(b) || 0) - (holdingValue(a) || 0))
        .map((h) => {
          const value = holdingValue(h);
          const change = holdingDayChange(h);
          const alloc = value != null && accValue ? ((value / accValue) * 100).toFixed(1) : null;
          return `
            <div class="list-row investing-holding" data-holding-id="${h.id}" style="cursor:pointer;">
              <div style="flex:1;">
                <div class="list-row__title">${escapeHTML(h.ticker)}</div>
                <div class="list-row__meta">
                  ${h.shares != null ? h.shares + ' sh' : ''}
                  ${h.lastClose != null ? ' · close ' + money(h.lastClose) : ' · no price yet'}
                  ${h.priceDate ? ' (' + h.priceDate + ')' : ''}
                </div>
              </div>
              <div class="investing-holding__numbers">
                <div class="list-row__title">${money(value)}</div>
                <div class="list-row__meta">
                  ${alloc != null ? alloc + '%' : ''}
                  ${change != null ? ` · <span class="${change >= 0 ? 'investing-up' : 'investing-down'}">${change >= 0 ? '+' : '−'}$${Math.abs(change).toFixed(0)}</span>` : ''}
                </div>
              </div>
            </div>
          `;
        })
        .join('')}
    `;
  };

  contentEl.innerHTML = `
    <div class="card investing-summary">
      <div class="stat-tile__label">Total Portfolio</div>
      <div class="stat-tile__value">${money(total.value)}</div>
      <div class="stat-tile__meta">
        ${
          total.dayChange == null
            ? holdings.length === 0
              ? 'Add your first holding below'
              : 'Update prices twice to see day change'
            : `<span class="${total.dayChange >= 0 ? 'investing-up' : 'investing-down'}">${total.dayChange >= 0 ? '+' : '−'}$${Math.abs(total.dayChange).toFixed(2)} (${total.dayChangePercent != null ? (total.dayChange >= 0 ? '+' : '−') + Math.abs(total.dayChangePercent).toFixed(2) + '%' : ''}) today</span>`
        }
      </div>
    </div>

    <div class="investing-actions">
      <button class="btn btn-primary" id="add-holding-btn">+ Add Holding</button>
      ${holdings.length > 0 ? '<button class="btn btn-secondary" id="update-prices-btn">Update Prices</button>' : ''}
    </div>

    ${ACCOUNTS.map(accountSection).join('')}

    ${
      holdings.length === 0
        ? `<div class="empty-state">
             <div class="empty-state__icon">📊</div>
             <div class="empty-state__title">No holdings yet</div>
             <div class="empty-state__subtitle">Add positions to your Brokerage or IRA bucket to see values and allocation.</div>
           </div>`
        : ''
    }
  `;

  document.getElementById('add-holding-btn').addEventListener('click', () => openHoldingModal());

  const updateBtn = document.getElementById('update-prices-btn');
  if (updateBtn) {
    updateBtn.addEventListener('click', async () => {
      // Ask the provider first — today it always says "manual needed",
      // but a phase-2 feed will answer here and skip the sheet entirely.
      const fetched = await refreshCloses(holdings);
      if (fetched) {
        renderPortfolioTab();
      } else {
        openUpdatePricesModal(holdings);
      }
    });
  }

  contentEl.querySelectorAll('.investing-holding').forEach((row) => {
    row.addEventListener('click', () => {
      const holding = holdings.find((h) => h.id === row.dataset.holdingId);
      if (holding) openHoldingModal(holding);
    });
  });
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
            <input class="input" type="number" inputmode="decimal" step="any" id="h-shares" value="${holding.shares ?? ''}" placeholder="0" required />
          </div>
          <div>
            <label class="modal-sheet__field-label" for="h-avgcost">Avg cost / share</label>
            <input class="input" type="number" inputmode="decimal" step="any" id="h-avgcost" value="${holding.avgCost ?? ''}" placeholder="optional" />
          </div>
        </div>
        <div>
          <label class="modal-sheet__field-label" for="h-close">Latest closing price</label>
          <input class="input" type="number" inputmode="decimal" step="any" id="h-close" value="${holding.lastClose ?? ''}" placeholder="optional — can update later" />
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
// the current close. Phase 2 replaces this sheet with an automatic feed.
function openUpdatePricesModal(holdings) {
  const tickers = [...new Set(holdings.map((h) => h.ticker))].sort();
  const currentClose = (ticker) => holdings.find((h) => h.ticker === ticker && h.lastClose != null)?.lastClose ?? '';

  openModal({
    title: "Update Prices (today's closes)",
    contentHTML: `
      <div class="list-row__meta">Enter each ticker's closing price. Prices are stored per day so day-change math works. A live feed can replace this sheet in phase 2.</div>
      <form id="prices-form" class="investing-form">
        ${tickers
          .map(
            (t) => `
              <div>
                <label class="modal-sheet__field-label" for="price-${t}">${t}</label>
                <input class="input" type="number" inputmode="decimal" step="any" id="price-${t}" value="${currentClose(t)}" placeholder="closing price" />
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
          closes[t] = document.getElementById(`price-${t}`).value;
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

async function renderJournalTab() {
  const contentEl = document.getElementById('investing-tab-content');
  const trades = (await Storage.trades.getAll()).sort((a, b) => b.createdAt - a.createdAt);

  contentEl.innerHTML = `
    <button class="btn btn-primary" id="add-trade-btn">+ New Trade</button>
    ${
      trades.length === 0
        ? `<div class="empty-state">
             <div class="empty-state__icon">📓</div>
             <div class="empty-state__title">No trades journaled yet</div>
             <div class="empty-state__subtitle">Record entries with your reasoning, then close them out with the outcome.</div>
           </div>`
        : trades
            .map((t) => {
              const pnl =
                t.status === 'closed' && t.entryPrice != null && t.exitPrice != null && t.quantity != null
                  ? (t.direction === 'short' ? t.entryPrice - t.exitPrice : t.exitPrice - t.entryPrice) * t.quantity
                  : null;
              return `
                <div class="list-row" data-trade-id="${t.id}" style="cursor:pointer;">
                  <div style="flex:1;">
                    <div class="list-row__title">
                      ${escapeHTML(t.ticker)}
                      <span class="badge ${t.status === 'open' ? 'warning' : ''}">${t.status}</span>
                    </div>
                    <div class="list-row__meta">
                      ${t.direction} · in ${money(t.entryPrice)} (${t.entryDate})${t.status === 'closed' ? ` · out ${money(t.exitPrice)}` : ''}
                    </div>
                  </div>
                  ${pnl != null ? `<span class="${pnl >= 0 ? 'investing-up' : 'investing-down'}">${pnl >= 0 ? '+' : '−'}$${Math.abs(pnl).toFixed(0)}</span>` : ''}
                </div>
              `;
            })
            .join('')
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

function openTradeModal(existing = null) {
  const trade = existing || createTrade();

  openModal({
    title: existing ? `${trade.ticker} Trade` : 'New Trade',
    contentHTML: `
      <form id="trade-form" class="investing-form">
        <div class="investing-form__row">
          <div>
            <label class="modal-sheet__field-label" for="t-ticker">Ticker</label>
            <input class="input" type="text" id="t-ticker" value="${escapeHTML(trade.ticker)}" style="text-transform:uppercase;" required />
          </div>
          <div>
            <label class="modal-sheet__field-label" for="t-direction">Direction</label>
            <select class="input" id="t-direction">
              <option value="long" ${trade.direction === 'long' ? 'selected' : ''}>Long</option>
              <option value="short" ${trade.direction === 'short' ? 'selected' : ''}>Short</option>
            </select>
          </div>
        </div>
        <div class="investing-form__row">
          <div>
            <label class="modal-sheet__field-label" for="t-entry">Entry price</label>
            <input class="input" type="number" inputmode="decimal" step="any" id="t-entry" value="${trade.entryPrice ?? ''}" required />
          </div>
          <div>
            <label class="modal-sheet__field-label" for="t-qty">Quantity</label>
            <input class="input" type="number" inputmode="decimal" step="any" id="t-qty" value="${trade.quantity ?? ''}" required />
          </div>
        </div>
        <div>
          <label class="modal-sheet__field-label" for="t-reasoning">Reasoning (why this trade?)</label>
          <textarea class="textarea" id="t-reasoning">${escapeHTML(trade.reasoning || '')}</textarea>
        </div>

        <div class="section-label">Close out (leave blank while open)</div>
        <div class="investing-form__row">
          <div>
            <label class="modal-sheet__field-label" for="t-exit">Exit price</label>
            <input class="input" type="number" inputmode="decimal" step="any" id="t-exit" value="${trade.exitPrice ?? ''}" />
          </div>
          <div>
            <label class="modal-sheet__field-label" for="t-exitdate">Exit date</label>
            <input class="input" type="date" id="t-exitdate" value="${trade.exitDate ?? ''}" />
          </div>
        </div>
        <div>
          <label class="modal-sheet__field-label" for="t-outcome">Outcome / lessons</label>
          <textarea class="textarea" id="t-outcome">${escapeHTML(trade.outcome || '')}</textarea>
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
        await Storage.trades.save({
          ...trade,
          ticker: document.getElementById('t-ticker').value.trim().toUpperCase(),
          direction: document.getElementById('t-direction').value,
          entryPrice: readNum('t-entry'),
          quantity: readNum('t-qty'),
          reasoning: document.getElementById('t-reasoning').value.trim(),
          exitPrice,
          exitDate: document.getElementById('t-exitdate').value || null,
          outcome: document.getElementById('t-outcome').value.trim(),
          status: exitPrice != null ? 'closed' : 'open',
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
    <button class="btn btn-primary" id="add-watch-btn">+ Watch a Ticker</button>
    ${
      items.length === 0
        ? `<div class="empty-state">
             <div class="empty-state__icon">👀</div>
             <div class="empty-state__title">Watchlist is empty</div>
             <div class="empty-state__subtitle">Track tickers you're considering, with a note on why.</div>
           </div>`
        : items
            .map(
              (item) => `
                <div class="list-row">
                  <div style="flex:1;">
                    <div class="list-row__title">${escapeHTML(item.ticker)}</div>
                    ${item.note ? `<div class="list-row__meta">${escapeHTML(item.note)}</div>` : ''}
                  </div>
                  <button class="btn-icon" data-remove-watch="${item.id}" aria-label="Remove">✕</button>
                </div>
              `
            )
            .join('')
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
    <button class="btn btn-primary" id="add-note-btn">+ New Note</button>
    ${
      notes.length === 0
        ? `<div class="empty-state">
             <div class="empty-state__icon">🗒️</div>
             <div class="empty-state__title">No macro notes yet</div>
             <div class="empty-state__subtitle">Jot down market thinking — the latest note also shows on your Dashboard.</div>
           </div>`
        : notes
            .map(
              (note) => `
                <div class="card" data-note-id="${note.id}" style="cursor:pointer;">
                  <div class="list-row__title">${escapeHTML(note.title || 'Untitled note')}</div>
                  <div class="list-row__meta">${note.date}</div>
                  ${note.body ? `<p class="investing-note-body">${escapeHTML(note.body)}</p>` : ''}
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
    <div class="list-row hc-row${item.done ? ' hc-row--done' : ''}" data-hc-id="${item.id}">
      ${item.type === 'todo' ? `<div class="checkbox-circle${item.done ? ' checked' : ''}">&#10003;</div>` : ''}
      <div style="flex:1;">
        <div class="list-row__title">${escapeHTML(item.title)}</div>
        ${item.details ? `<div class="list-row__meta">${escapeHTML(item.details)}</div>` : ''}
      </div>
      <button class="btn-icon" data-remove-hc="${item.id}" aria-label="Remove">✕</button>
    </div>
  `;

  contentEl.innerHTML = `
    <button class="btn btn-primary" id="add-hc-btn">+ Add To-do / Content Idea</button>
    ${todos.length ? `<div class="section-label">To-dos</div>${todos.map(itemRow).join('')}` : ''}
    ${content.length ? `<div class="section-label">Content Ideas</div>${content.map(itemRow).join('')}` : ''}
    ${
      items.length === 0
        ? `<div class="empty-state">
             <div class="empty-state__icon">🏛️</div>
             <div class="empty-state__title">Hollingsworth Capital</div>
             <div class="empty-state__subtitle">Business to-dos and content ideas live here.</div>
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

  contentEl.querySelectorAll('.hc-row').forEach((row) => {
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
