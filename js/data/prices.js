// prices.js
//
// The price layer for the Investing pillar — deliberately kept in its
// own module so it can be upgraded without touching any screen code.
//
// HOW IT WORKS TODAY (phase 1):
//   Prices are DAILY CLOSES entered by hand via the "Update Prices"
//   sheet in the Portfolio tab. Free stock APIs can't be called directly
//   from a browser-only app (they block cross-site requests), so manual
//   entry is the honest zero-cost, zero-backend option. Each update
//   shifts the old close into prevClose so day-change can be computed.
//
// PHASE 2 HOOKS (add later, no rewrite needed):
//   1. LIVE/DELAYED PRICE FEED — write a new provider object with the
//      same shape as ManualPriceProvider below (one function:
//      fetchCloses). Point `provider` at it. Everything else — holdings
//      math, portfolio screens, the Dashboard snapshot — keeps working
//      unchanged, because they only ever read lastClose/prevClose off
//      holding records. A feed needs either an API key service that
//      allows browser requests, or a tiny server/cloud function proxy
//      (natural to add alongside cloud sync).
//   2. NEWS FEED — same pattern: add a NewsProvider with
//      fetchNews(tickers) here (or a sibling news.js), render it in a
//      new Investing sub-tab. Nothing existing needs to change.
//   3. AI PORTFOLIO CHATBOT — an AdvisorProvider whose ask(question,
//      portfolioSnapshot) calls an AI API. buildPortfolioSnapshot()
//      below already produces the clean data summary such a chatbot
//      would take as context, so the hook is ready.

import { Storage } from './storage.js';

// ===== The provider seam =====
// A provider is any object with:
//   fetchCloses(tickers: string[]) -> Promise<{ [ticker]: { close: number, date: string } } | null>
// Returning null means "this provider can't fetch automatically" — the
// UI then falls back to the manual entry sheet.

const ManualPriceProvider = {
  name: 'manual',
  // Manual mode has nothing to fetch — the Update Prices sheet writes
  // closes straight onto holdings via applyManualCloses() below.
  fetchCloses: async () => null,
};

// Phase 2: replace with e.g. MyApiPriceProvider.
const provider = ManualPriceProvider;

export function getProviderName() {
  return provider.name;
}

// Try to auto-fetch closes for the given tickers. Returns true if the
// provider supplied prices (and holdings were updated), false if manual
// entry is needed. Screens call this first, then open the manual sheet
// only when it returns false — so a future feed slots in invisibly.
export async function refreshCloses(holdings) {
  const tickers = [...new Set(holdings.map((h) => h.ticker))];
  const quotes = await provider.fetchCloses(tickers);
  if (!quotes) return false;

  for (const holding of holdings) {
    const quote = quotes[holding.ticker];
    if (!quote) continue;
    await Storage.holdings.save(applyClose(holding, quote.close, quote.date));
  }
  return true;
}

// Write one new daily close onto a holding, rolling the old close into
// prevClose (that's what makes day-change math possible).
export function applyClose(holding, close, date) {
  return {
    ...holding,
    prevClose: holding.priceDate === date ? holding.prevClose : holding.lastClose,
    lastClose: close,
    priceDate: date,
  };
}

// Used by the manual Update Prices sheet: { ticker: close } typed by Liam.
export async function applyManualCloses(holdings, closesByTicker, date) {
  for (const holding of holdings) {
    const close = closesByTicker[holding.ticker];
    if (close == null || close === '') continue;
    await Storage.holdings.save(applyClose(holding, Number(close), date));
  }
}

// ===== Portfolio math (shared by Investing screens + Dashboard) =====

export function holdingValue(holding) {
  if (holding.lastClose == null || holding.shares == null) return null;
  return holding.shares * holding.lastClose;
}

export function holdingDayChange(holding) {
  if (holding.lastClose == null || holding.prevClose == null || holding.shares == null) return null;
  return holding.shares * (holding.lastClose - holding.prevClose);
}

// Totals for a set of holdings (pass all holdings, or just one account's).
export function portfolioSummary(holdings) {
  let value = 0;
  let change = 0;
  let hasValue = false;
  let hasChange = false;

  holdings.forEach((h) => {
    const v = holdingValue(h);
    if (v != null) {
      value += v;
      hasValue = true;
    }
    const c = holdingDayChange(h);
    if (c != null) {
      change += c;
      hasChange = true;
    }
  });

  return {
    value: hasValue ? value : null,
    dayChange: hasChange ? change : null,
    dayChangePercent: hasChange && value - change !== 0 ? (change / (value - change)) * 100 : null,
  };
}

// The clean data summary a phase-2 AI chatbot would receive as context.
export function buildPortfolioSnapshot(holdings) {
  const summary = portfolioSummary(holdings);
  return {
    asOf: new Date().toISOString().slice(0, 10),
    totalValue: summary.value,
    dayChange: summary.dayChange,
    positions: holdings.map((h) => ({
      ticker: h.ticker,
      account: h.account,
      shares: h.shares,
      lastClose: h.lastClose,
      value: holdingValue(h),
    })),
  };
}
