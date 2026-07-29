// app.js
//
// The entry point — the one file index.html actually loads with a
// <script> tag. Everything else gets pulled in via import statements.
// Its only job is to start up the three big pieces of the app in order:
// the navbar, the router, and (if the browser supports it) the service
// worker that enables offline use.

import { initRouter } from './router.js';
import { initNavbar } from './components/navbar.js';
import { seedDefaultsIfNeeded } from './data/storage.js';

const SPLASH_FADE_MS = 400; // must match the transition duration in index.html

// Fades out the boot splash (the seal on black, defined inline in
// index.html) once the first screen is actually on-screen and
// interactive — not before.
function hideBootSplash() {
  const splash = document.getElementById('boot-splash');
  if (!splash) return;
  splash.classList.add('boot-splash-hidden');
  // A timer (not transitionend) removes it — transitionend never fires if
  // the tab is backgrounded mid-fade, which would leave the splash stuck
  // in the DOM (invisible, but still blocking taps) forever.
  setTimeout(() => splash.remove(), SPLASH_FADE_MS);
}

function registerServiceWorker() {
  // Service workers only work over HTTPS or on localhost — never over a
  // plain file:// path — so this quietly does nothing if you just
  // double-click index.html to peek at it on your PC.
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

initNavbar();
// Seed starter data (the 5 workout splits) before the first screen
// renders, so sections never load against an empty database.
seedDefaultsIfNeeded().then(() => {
  initRouter();
  hideBootSplash();
});
registerServiceWorker();
