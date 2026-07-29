// navbar.js
//
// Renders the bottom tab bar and keeps it in sync with whatever section
// is currently showing. All five pillars get a permanent spot in the bar.
// Settings is intentionally NOT here — it's reached via the gear icon on
// the Dashboard, but the navbar still knows about it so no tab lights up
// while you're on the Settings screen.

import { navigateTo, onRouteChange, getCurrentRoute } from '../router.js';
import { icon } from './icons.js';

// `icon` is a key into js/components/icons.js. The SVG inherits
// currentColor, so the active tab's gold comes straight from
// .navbar__item.active in navbar.css — there's no second icon set.
const TABS = [
  { id: 'dashboard', label: 'Home', icon: 'home' },
  { id: 'gym', label: 'Gym', icon: 'gym' },
  { id: 'food', label: 'Food', icon: 'food' },
  { id: 'investing', label: 'Investing', icon: 'investing' },
  { id: 'school', label: 'School', icon: 'school' },
];

const navEl = document.getElementById('app-navbar');

export function initNavbar() {
  navEl.innerHTML = TABS.map(
    (tab) => `
      <button class="navbar__item" data-route="${tab.id}">
        <span class="icon">${icon(tab.icon)}</span>
        <span class="label">${tab.label}</span>
      </button>
    `
  ).join('');

  navEl.querySelectorAll('.navbar__item').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.route));
  });

  onRouteChange(updateActiveTab);
  updateActiveTab(getCurrentRoute());
}

function updateActiveTab(routeId) {
  navEl.querySelectorAll('.navbar__item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.route === routeId);
  });
}
