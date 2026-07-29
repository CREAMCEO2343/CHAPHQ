// prices.js
//
// The price layer for the Investing pillar — kept in its own module so it
// can be upgraded without touching any screen code.
//
// HOW IT WORKS NOW (phase 2, live):
//   Prices come from Alpha Vantage's GLOBAL_QUOTE endpoint, fetched
//   automatically when the Investing tab opens. One request per ticker
//   returns the last price, the previous close, and which trading day
//   they belong to — exactly the three things a holding stores.
//
//   Alpha Vantage sends CORS headers, so the browser can call it directly
//   with no server in the middle. (The old note in this file said free
//   stock APIs can't be called from a browser-only app; that's true of
//   many, but not this one.)
//
// THE TWO CONSTRAINTS THAT SHAPE EVERYTHING BELOW:
//
//   1. The free tier allows 25 requests PER DAY. There are 21 tickers in
//      the portfolio. So "fetch every time the tab opens" would burn the
//      whole day's quota on the second visit. Instead the sync is
//      staleness-driven: it fetches only what it doesn't already have,
//      and once a day's prices are in, opening the tab costs nothing.
//      See syncPrices() for the probe trick that makes a weekend visit
//      cost one request instead of twenty-one.
//
//   2. An API key in a browser app is public — anyone with devtools can
//      read it. That's an acceptable trade for a free personal-use market
//      data key, but it is NOT acceptable for anything that can spend
//      money or read private data. Don't reuse this pattern for those.
//
// THE CACHE IS THE DATABASE. Fetched prices are written straight onto
// holdings in IndexedDB, so the last good numbers are already on-device.
// Offline, or when the API is down, screens keep rendering those and the
// status line says how old they are. There is no separate cache to
// invalidate.
//
// STILL TO COME (phase 2 continued):
//   NEWS FEED — same provider shape: add fetchNews(tickers) here or in a
//   sibling news.js, render it in a new sub-tab.
//   AI PORTFOLIO CHATBOT — buildPortfolioSnapshot() below already
//   produces the clean context payload such an assistant would take.

import { Storage } from './storage.js';

const ENDPOINT = 'https://www.alphavantage.co/query';

// Settings-store keys. The API key lives in IndexedDB rather than in the
// source so it isn't committed to git.
const KEY_SETTING = 'marketData:apiKey';
const SYNC_SETTING = 'marketData:sync';

// Free tier is 25/day. We stop at 24 to leave one in hand — hitting the
// wall makes Alpha Vantage return an error for the rest of the day, and
// a partial refresh is much better than a blocked one.
const DAILY_BUDGET = 24;

// Alpha Vantage's free tier enforces a burst limit of ONE REQUEST PER
// SECOND, separately from the 25/day cap. Going faster doesn't fail
// loudly — it returns 200 OK with a "spread your requests out" message
// instead of a quote, which is easy to mistake for the daily cap.
// 1200ms leaves headroom over the 1000ms floor. A full 21-ticker sync
// therefore takes ~25s, which is fine: it runs in the background while
// cached prices are already on screen.
const REQUEST_SPACING_MS = 1200;

// When we do get throttled anyway, back off and retry the same ticker
// rather than abandoning it.
const THROTTLE_BACKOFF_MS = [3000, 6000];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* =====================================================================
   API KEY
   ===================================================================== */

export async function getApiKey() {
  const key = await Storage.settings.get(KEY_SETTING);
  return typeof key === 'string' && key.trim() ? key.trim() : null;
}

export async function setApiKey(key) {
  await Storage.settings.set(KEY_SETTING, (key || '').trim());
}

/* =====================================================================
   SYNC STATE — what we've spent today, and how it went
   ===================================================================== */

function blankSyncState(date) {
  return {
    date, // the calendar day this budget belongs to
    used: 0, // requests spent today
    syncedOn: null, // calendar day we last completed a sync
    tradingDay: null, // the market day those prices belong to
    lastSuccessAt: null, // timestamp, for "prices as of ..."
    unresolved: [], // symbols the API doesn't know — don't retry all day
    lastError: null,
  };
}

async function loadSyncState() {
  const stored = await Storage.settings.get(SYNC_SETTING);
  const today = todayISO();
  if (!stored || stored.date !== today) {
    // New day, new budget. Carry forward only the facts that outlive it.
    return {
      ...blankSyncState(today),
      tradingDay: stored?.tradingDay ?? null,
      lastSuccessAt: stored?.lastSuccessAt ?? null,
    };
  }
  return { ...blankSyncState(today), ...stored };
}

async function saveSyncState(state) {
  await Storage.settings.set(SYNC_SETTING, state);
  return state;
}

// What the UI needs to tell you where the numbers came from.
export async function getSyncStatus() {
  const [state, key] = await Promise.all([loadSyncState(), getApiKey()]);
  return {
    hasKey: !!key,
    tradingDay: state.tradingDay,
    lastSuccessAt: state.lastSuccessAt,
    requestsUsed: state.used,
    requestsRemaining: Math.max(DAILY_BUDGET - state.used, 0),
    unresolved: state.unresolved,
    lastError: state.lastError,
    online: navigator.onLine,
  };
}

/* =====================================================================
   THE PROVIDER
   ===================================================================== */

// Alpha Vantage writes class-B share tickers with a hyphen (BRK-B),
// while brokerages and this app use a dot (BRK.B).
function toApiSymbol(ticker) {
  return ticker.replace(/\./g, '-');
}

class QuoteError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // 'throttle' | 'limit' | 'rejected' | 'network'
  }
}

// Alpha Vantage reports both the per-second throttle and the daily cap
// through the same "Information" field, and BOTH mention "25 requests
// per day" — the daily figure appears in the throttle message's upsell
// text. So the daily number can't be the discriminator. What separates
// them is the throttle's advice to spread requests out:
//
//   throttle  "...spreading out your free API requests more sparingly
//              (1 request per second)... to lift the free key rate
//              limit (25 requests per day)..."
//   daily cap "...our standard API rate limit is 25 requests per day..."
//
// Getting this wrong is expensive in both directions: treating a
// throttle as the daily cap throws away the rest of the day's quota,
// and treating the daily cap as a throttle means retrying forever.
function classifyInformation(message) {
  return /sparingly|spreading out|per second/i.test(message) ? 'throttle' : 'limit';
}

// One quote. Resolves to null when the symbol is valid-looking but the
// API has no data for it (delisted, wrong exchange, typo) — that's a
// per-symbol problem, not a reason to abandon the whole sync.
async function fetchQuote(ticker, key) {
  const url = `${ENDPOINT}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(toApiSymbol(ticker))}&apikey=${encodeURIComponent(key)}`;

  let payload;
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new QuoteError('network', `HTTP ${response.status}`);
    payload = await response.json();
  } catch (error) {
    if (error instanceof QuoteError) throw error;
    throw new QuoteError('network', error.message);
  }

  // Alpha Vantage answers 200 OK with an explanatory body rather than an
  // HTTP error code, so the body is where failure actually shows up.
  //   Information — daily cap reached, or a demo/placeholder key
  //   Note        — the older throttling message
  //   Error Message — malformed request
  const information = payload['Information'] || payload['Note'];
  if (information) {
    throw new QuoteError(classifyInformation(information), information);
  }
  if (payload['Error Message']) {
    throw new QuoteError('rejected', payload['Error Message']);
  }

  const quote = payload['Global Quote'];
  if (!quote || !quote['05. price']) return null;

  const close = Number(quote['05. price']);
  const prevClose = Number(quote['08. previous close']);
  if (!Number.isFinite(close)) return null;

  return {
    close,
    // `05. price` is the last traded price: during market hours that's
    // intraday, after the bell it's the official close. `07. latest
    // trading day` says which session it belongs to either way.
    prevClose: Number.isFinite(prevClose) && prevClose > 0 ? prevClose : null,
    date: quote['07. latest trading day'] || todayISO(),
  };
}

/* =====================================================================
   SYNC
   ===================================================================== */

// Write a fetched quote onto a holding. Unlike manual entry, the API
// hands us the real previous close, so day-change doesn't depend on
// having caught yesterday's number ourselves.
export function applyQuote(holding, quote) {
  return {
    ...holding,
    lastClose: quote.close,
    prevClose: quote.prevClose ?? (holding.priceDate === quote.date ? holding.prevClose : holding.lastClose),
    priceDate: quote.date,
  };
}

/**
 * Bring holdings up to date, spending as few requests as possible.
 *
 * @param {Array}  holdings
 * @param {object} [options]
 * @param {boolean} [options.force] Re-check even if today's sync is done.
 * @returns {Promise<{ok: boolean, reason: string, fetched: number, updated: boolean}>}
 *
 * `updated` tells the caller whether any holding actually changed, so it
 * only has to re-render when something moved.
 */
export async function syncPrices(holdings, options = {}) {
  const done = (reason, extra = {}) => ({ ok: false, reason, fetched: 0, updated: false, ...extra });

  const key = await getApiKey();
  if (!key) return done('no-key');
  if (!navigator.onLine) return done('offline');

  const tickers = [...new Set(holdings.map((h) => h.ticker).filter(Boolean))];
  if (tickers.length === 0) return done('no-holdings');

  const state = await loadSyncState();
  if (!options.force && state.syncedOn === todayISO()) {
    return { ok: true, reason: 'already-current', fetched: 0, updated: false };
  }
  if (state.used >= DAILY_BUDGET) return done('budget-spent');

  const priceDateOf = (ticker) => holdings.find((h) => h.ticker === ticker)?.priceDate ?? null;
  const report = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  let fetched = 0;
  let updated = false;

  const commit = async (ticker, quote) => {
    for (const holding of holdings.filter((h) => h.ticker === ticker)) {
      if (holding.lastClose === quote.close && holding.priceDate === quote.date) continue;
      await Storage.holdings.save(applyQuote(holding, quote));
      updated = true;
    }
  };

  // One ticker, retrying through the per-second throttle. Only requests
  // the API actually served count against the daily budget — a throttled
  // request is a refusal, not a spend.
  const fetchWithBackoff = async (ticker) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        state.used += 1;
        const quote = await fetchQuote(ticker, key);
        fetched += 1;
        return quote;
      } catch (error) {
        state.used -= 1; // not served, so don't charge it
        if (error.code !== 'throttle' || attempt >= THROTTLE_BACKOFF_MS.length) throw error;
        await sleep(THROTTLE_BACKOFF_MS[attempt]);
      }
    }
  };

  try {
    // --- Probe -------------------------------------------------------
    // Spend one request to learn which session the market is currently
    // on. If every holding already carries that date, there's nothing
    // new and we stop here. This is what makes opening the tab on a
    // Saturday cost 1 request instead of 21.
    const probeTicker = tickers.find((t) => !state.unresolved.includes(t)) || tickers[0];
    report({ done: 0, total: tickers.length });
    const probe = await fetchWithBackoff(probeTicker);

    if (probe) {
      await commit(probeTicker, probe);
      state.tradingDay = probe.date;
    } else if (!state.unresolved.includes(probeTicker)) {
      state.unresolved.push(probeTicker);
    }

    const currentDay = state.tradingDay;
    const stale = tickers.filter(
      (t) => t !== probeTicker && !state.unresolved.includes(t) && (!currentDay || priceDateOf(t) !== currentDay)
    );

    // --- Fetch the rest ----------------------------------------------
    let done = 0;
    for (const ticker of stale) {
      if (state.used >= DAILY_BUDGET) {
        state.lastError = 'Daily request budget reached — the rest will refresh tomorrow.';
        break;
      }
      await sleep(REQUEST_SPACING_MS);
      const quote = await fetchWithBackoff(ticker);
      done += 1;
      report({ done, total: stale.length });
      if (quote) await commit(ticker, quote);
      else if (!state.unresolved.includes(ticker)) state.unresolved.push(ticker);
    }

    // Only call it a completed sync if we got through everything we
    // meant to — otherwise tomorrow's open should pick up the rest.
    const finishedEverything = state.used < DAILY_BUDGET;
    if (finishedEverything) {
      state.syncedOn = todayISO();
      state.lastError = null;
    }
    state.lastSuccessAt = Date.now();
    await saveSyncState(state);

    return { ok: true, reason: 'synced', fetched, updated };
  } catch (error) {
    // Whatever we already wrote stays written — a partial refresh is
    // still a refresh. Cached prices remain on screen either way; the
    // status line explains why the rest didn't move.
    //
    // Only the DAILY cap justifies writing off the rest of the day.
    // A throttle that survived every backoff, or a network blip, should
    // leave the budget alone so reopening the tab tries again.
    if (error.code === 'limit') {
      state.lastError = 'Alpha Vantage daily limit reached — cached prices shown. Resets at midnight UTC.';
      state.used = DAILY_BUDGET;
    } else if (error.code === 'throttle') {
      state.lastError = 'Alpha Vantage is throttling — reopen the tab shortly to finish updating.';
    } else if (error.code === 'rejected') {
      state.lastError = 'Alpha Vantage rejected the request — check the API key in Settings.';
    } else {
      state.lastError = `Could not reach Alpha Vantage (${error.message}).`;
    }
    await saveSyncState(state);
    return { ok: false, reason: error.code, fetched, updated, message: state.lastError };
  }
}

/* =====================================================================
   MANUAL ENTRY — still here, and still the fallback with no API key
   ===================================================================== */

// Write one manually-typed close onto a holding, rolling the old close
// into prevClose (that's what makes day-change math possible by hand).
export function applyClose(holding, close, date) {
  return {
    ...holding,
    prevClose: holding.priceDate === date ? holding.prevClose : holding.lastClose,
    lastClose: close,
    priceDate: date,
  };
}

export async function applyManualCloses(holdings, closesByTicker, date) {
  for (const holding of holdings) {
    const close = closesByTicker[holding.ticker];
    if (close == null || close === '') continue;
    await Storage.holdings.save(applyClose(holding, Number(close), date));
  }
}

/* =====================================================================
   PORTFOLIO MATH (shared by Investing screens + Dashboard)
   ===================================================================== */

export function holdingValue(holding) {
  if (holding.lastClose == null || holding.shares == null) return null;
  return holding.shares * holding.lastClose;
}

export function holdingDayChange(holding) {
  if (holding.lastClose == null || holding.prevClose == null || holding.shares == null) return null;
  return holding.shares * (holding.lastClose - holding.prevClose);
}

// What the position cost, from the cost basis you entered. Null when no
// basis has been entered — gain/loss is unknowable rather than zero.
export function holdingCost(holding) {
  if (holding.avgCost == null || holding.shares == null) return null;
  return holding.shares * holding.avgCost;
}

export function holdingGain(holding) {
  const value = holdingValue(holding);
  const cost = holdingCost(holding);
  if (value == null || cost == null) return null;
  return value - cost;
}

export function holdingGainPercent(holding) {
  const cost = holdingCost(holding);
  const gain = holdingGain(holding);
  if (gain == null || !cost) return null;
  return (gain / cost) * 100;
}

// Totals for a set of holdings (pass all holdings, or just one account's).
// Every total is null rather than 0 when nothing contributed to it, so a
// screen can tell "no data yet" apart from "genuinely flat".
export function portfolioSummary(holdings) {
  let value = 0;
  let change = 0;
  let cost = 0;
  let gain = 0;
  let hasValue = false;
  let hasChange = false;
  let hasCost = false;
  let costedCount = 0;

  holdings.forEach((holding) => {
    const v = holdingValue(holding);
    if (v != null) {
      value += v;
      hasValue = true;
    }
    const c = holdingDayChange(holding);
    if (c != null) {
      change += c;
      hasChange = true;
    }
    // Only positions with BOTH a price and a basis can contribute to
    // gain/loss — otherwise the total would quietly understate itself.
    const basis = holdingCost(holding);
    const g = holdingGain(holding);
    if (basis != null && g != null) {
      cost += basis;
      gain += g;
      hasCost = true;
      costedCount += 1;
    }
  });

  return {
    value: hasValue ? value : null,
    dayChange: hasChange ? change : null,
    dayChangePercent: hasChange && value - change !== 0 ? (change / (value - change)) * 100 : null,
    cost: hasCost ? cost : null,
    gain: hasCost ? gain : null,
    gainPercent: hasCost && cost !== 0 ? (gain / cost) * 100 : null,
    // How many positions the gain figure actually covers, out of how
    // many there are. A gain total built from 2 of 21 positions is not
    // the portfolio's gain, and the UI has to be able to say so.
    costedCount,
    totalCount: holdings.length,
  };
}

// The clean data summary a phase-2 AI chatbot would receive as context.
export function buildPortfolioSnapshot(holdings) {
  const summary = portfolioSummary(holdings);
  return {
    asOf: todayISO(),
    totalValue: summary.value,
    dayChange: summary.dayChange,
    totalGain: summary.gain,
    positions: holdings.map((holding) => ({
      ticker: holding.ticker,
      account: holding.account,
      shares: holding.shares,
      avgCost: holding.avgCost,
      lastClose: holding.lastClose,
      priceDate: holding.priceDate,
      value: holdingValue(holding),
      gain: holdingGain(holding),
    })),
  };
}
