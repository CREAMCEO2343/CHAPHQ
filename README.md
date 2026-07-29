# CHAPHQ

A personal life-management PWA — gym, food, investing, and school in one
iPhone-installable app. Plain HTML/CSS/JS, no build step, all data
stored on-device.

## Running it on your PC

The app can't be opened by double-clicking `index.html` (browsers block
JavaScript modules from plain files). It needs a tiny local web server —
one is included:

1. Open File Explorer at this folder (`CHAPHQ`), right-click empty space
   → **Open in Terminal**.
2. Run:

   ```powershell
   .\serve.ps1
   ```

3. It prints two addresses. Open the `localhost` one in your browser on
   this PC.
4. **Ctrl+C** in the terminal stops the server.

## Trying it on your iPhone (same WiFi)

1. Start the server as above. Note the **"On your iPhone"** address it
   prints (something like `http://192.168.1.23:8080/`).
2. On your iPhone, join the **same WiFi network** as the PC, open
   **Safari**, and go to that address.
3. Tap the Share button → **Add to Home Screen**. The CHAPHQ icon
   appears like a real app and launches full-screen.

Two honest limitations of WiFi preview mode:

- The PC must be on, with the server running, for the app to load.
- Full **offline** support (the service worker) only activates over
  HTTPS. On plain local WiFi it won't cache for offline use.

**The fix for both** is free static hosting (GitHub Pages, Netlify,
Cloudflare Pages...). Push this folder to GitHub, turn on Pages, and
you get an `https://...` address — visit it once on the iPhone, Add to
Home Screen, and the app then works offline, from anywhere, no PC
needed. Ask Claude to set this up when you're ready.

## Brand assets

`icons/` holds the real CHAPHQ artwork (the gold bull-and-hand mark,
"Non Sine Periculo") generated from the master files Liam supplied:

- `icon-1024.png`, `icon-512.png`, `icon-512-maskable.png`, `icon-192.png`,
  `icon-180.png` — the app icon at every size iOS/PWA installs need.
- `seal.png` — the full circular seal (with the ring text), used on the
  boot splash screen and the Settings page.

To swap the artwork later: replace the source PNGs and re-run the same
resize steps (ask Claude — it's a five-line script, no design tool
needed).

## How the project is organized

```
index.html            The only HTML page. Sections swap inside it.
manifest.json         Tells iOS/Android this is an installable app.
service-worker.js     Offline caching. Bump CACHE_VERSION on updates.
serve.ps1             The local dev server (PowerShell, no installs).
css/
  variables.css       Design tokens: every color/font/spacing, incl.
                      the dark #0A0C10 / gold #9C7A28 CHAPHQ theme.
  base.css            Page-wide resets and layout skeleton.
  components.css      Shared UI: cards, buttons, sheets, wordmark...
  navbar.css          The bottom tab bar.
  sections/           One stylesheet per section.
js/
  app.js              Entry point: boots navbar, router, seeds, SW.
  router.js           Swaps sections when the URL hash changes.
  components/         navbar.js, modal.js (bottom sheets), tabs.js
                      (segmented sub-tab control).
  data/
    schema.js         WHAT gets stored: every record shape + defaults.
    db.js             HOW it's stored: IndexedDB plumbing. Bump
                      DB_VERSION when schema.js gains/loses stores.
    storage.js        The API sections actually use (Storage.meals...).
                      Swap this file's internals for a cloud backend
                      later — no section code changes.
    prices.js         Portfolio price layer: automatic Alpha Vantage
                      daily closes + gain/loss math. Needs a free API
                      key, entered in Settings → Market Data.
  sections/           One file per screen: dashboard, gym, food,
                      investing, school, settings.
```

## Adding a new section later

1. Create `js/sections/yourname.js` exporting `render()` and `init()`.
2. Create `css/sections/yourname.css` and link it in `index.html`.
3. Register it in `js/router.js` (import + add to `routes`).
4. Add a tab in `js/components/navbar.js` or a Dashboard quick link.
5. Add both files to `APP_SHELL_FILES` in `service-worker.js` and bump
   `CACHE_VERSION`.

## Git cheat-sheet (version history)

Every milestone is saved as a commit. Useful commands, run from this
folder:

```powershell
git log --oneline     # list every save point
git status            # what's changed since the last save
git add -A            # stage all changes...
git commit -m "..."   # ...and save them with a message
```

If something ever breaks badly, the history means nothing is lost —
ask Claude (or search "git restore") to roll back.

## Live stock prices

The Investing tab fetches daily closing prices automatically whenever you
open it. It needs a **free Alpha Vantage API key**:

1. Get one at <https://www.alphavantage.co/support/#api-key> (~20 seconds,
   no card).
2. In the app: **Settings → Market Data**, paste it, tap **Save Key**.

That's it — there's no refresh button to remember. Two things worth
knowing:

- The free tier allows **25 requests a day** and there are **21 tickers**,
  so the app fetches only what's changed. Once a day's closes are in,
  reopening the tab costs nothing. The status line under the portfolio
  total always says where the numbers came from and how many requests
  are left.
- Gain/loss needs a **cost basis** (price paid per share), entered per
  holding. Without it a position still shows its value and day change,
  but says "add cost basis" instead of inventing a return.

Prices are stored on the holdings themselves, so the last good numbers
stay on screen offline or if the API is down.

## Phase 2 ideas already wired for

- **Cloud sync** — rewrite the inside of `js/data/storage.js`.
- **News feed, AI portfolio chatbot** — see the extension-point notes at
  the bottom of `js/sections/investing.js`.
- **AI food quick-add** — replace `estimateFromText()` in
  `js/sections/food.js`.
- **Body fat %, measurements, progress photos** — fields already exist
  in `schema.js` (`createBodyStat`); only UI is needed.
