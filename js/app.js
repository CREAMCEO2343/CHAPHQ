// app.js
//
// The entry point — the one file index.html actually loads with a
// <script> tag. Everything else gets pulled in via import statements.
// Its only job is to start up the three big pieces of the app in order:
// the navbar, the router, and (if the browser supports it) the service
// worker that enables offline use.

import { initRouter } from './router.js';
import { initNavbar } from './components/navbar.js';

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
initRouter();
registerServiceWorker();
