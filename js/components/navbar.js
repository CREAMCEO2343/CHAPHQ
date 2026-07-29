// navbar.js
//
// Renders the bottom tab bar and keeps it in sync with whatever section
// is currently showing. All five pillars get a permanent spot in the bar.
// Settings is intentionally NOT here — it's reached via the gear icon on
// the Dashboard, but the navbar still knows about it so no tab lights up
// while you're on the Settings screen.

import { navigateTo, onRouteChange, getCurrentRoute } from '../router.js';

const TABS = [
  { id: 'dashboard', label: 'Home', icon: '🏠' },
  { id: 'gym', label: 'Gym', icon: '💪' },
  { id: 'food', label: 'Food', icon: '🍽️' },
  { id: 'investing', label: 'Investing', icon: '📊' },
  { id: 'school', label: 'School', icon: '🎓' },
];

const navEl = document.getElementById('app-navbar');

export function initNavbar() {
  navEl.innerHTML = TABS.map(
    (tab) => `
      <button class="navbar__item" data-route="${tab.id}">
        <span class="icon">${tab.icon}</span>
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
