// router.js
//
// This is the "traffic controller" for the whole app. Since index.html is
// the only page that ever loads, this file is what makes it FEEL like
// there are 8 different screens: it watches the URL's hash (the part
// after #, like #meals) and swaps the contents of <main id="app-content">
// to match, without ever reloading the page.
//
// Every section module (js/sections/dashboard.js, meals.js, etc.) must
// export two functions for this to work:
//   render()  -> returns an HTML string for that section's screen
//   init()    -> (optional) runs AFTER that HTML is inserted into the
//                page, so it's the right place to add button click
//                handlers, load data, etc.

import * as dashboard from './sections/dashboard.js';
import * as meals from './sections/meals.js';
import * as grocery from './sections/grocery.js';
import * as workouts from './sections/workouts.js';
import * as progress from './sections/progress.js';
import * as school from './sections/school.js';
import * as goals from './sections/goals.js';
import * as settings from './sections/settings.js';

const routes = { dashboard, meals, grocery, workouts, progress, school, goals, settings };
const DEFAULT_ROUTE = 'dashboard';

const contentEl = document.getElementById('app-content');

// Other modules (like navbar.js) can ask to be told whenever the visible
// section changes, so they can update things like which tab is highlighted.
const routeChangeListeners = [];
export function onRouteChange(callback) {
  routeChangeListeners.push(callback);
}

function readRouteFromHash() {
  const routeId = window.location.hash.replace('#', '');
  return routes[routeId] ? routeId : DEFAULT_ROUTE;
}

export function getCurrentRoute() {
  return readRouteFromHash();
}

function renderRoute(routeId) {
  const section = routes[routeId];
  if (!section) return;

  contentEl.innerHTML = section.render();

  // Restart the fade-in animation every time we switch sections.
  contentEl.classList.remove('section-enter');
  void contentEl.offsetWidth; // forces the browser to notice the class was removed
  contentEl.classList.add('section-enter');

  if (typeof section.init === 'function') {
    section.init();
  }

  window.scrollTo(0, 0);
  routeChangeListeners.forEach((listener) => listener(routeId));
}

// Used by the navbar (and by sections linking to each other, e.g. a
// Dashboard "quick link" card) to switch screens in code.
export function navigateTo(routeId) {
  if (!routes[routeId]) routeId = DEFAULT_ROUTE;

  if (window.location.hash.replace('#', '') === routeId) {
    // Already on this screen (e.g. tapping the active tab again) — just re-render it.
    renderRoute(routeId);
  } else {
    window.location.hash = routeId;
  }
}

export function initRouter() {
  window.addEventListener('hashchange', () => renderRoute(readRouteFromHash()));
  renderRoute(readRouteFromHash());
}
