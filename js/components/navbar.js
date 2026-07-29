// navbar.js
//
// Renders the bottom tab bar and keeps it in sync with whatever section
// is currently showing. Only 4 sections get a permanent spot in the bar
// (Dashboard, Meals, Workouts, Progress) — the rest live behind the
// "More" button, which opens a grid using the shared modal sheet.

import { navigateTo, onRouteChange, getCurrentRoute } from '../router.js';
import { openModal, closeModal } from './modal.js';

const PRIMARY_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'meals', label: 'Meals', icon: '🍽️' },
  { id: 'workouts', label: 'Workouts', icon: '💪' },
  { id: 'progress', label: 'Progress', icon: '📈' },
];

// These live in the "More" sheet instead of the main bar.
const MORE_TABS = [
  { id: 'grocery', label: 'Grocery', icon: '🛒' },
  { id: 'school', label: 'School', icon: '🎓' },
  { id: 'goals', label: 'Goals', icon: '🎯' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

const navEl = document.getElementById('app-navbar');

export function initNavbar() {
  navEl.innerHTML = renderNavbarHTML();
  wireUpTabClicks();
  onRouteChange(updateActiveTab);
  updateActiveTab(getCurrentRoute());
}

function renderNavbarHTML() {
  const primaryButtons = PRIMARY_TABS.map(
    (tab) => `
      <button class="navbar__item" data-route="${tab.id}">
        <span class="icon">${tab.icon}</span>
        <span class="label">${tab.label}</span>
      </button>
    `
  ).join('');

  return `
    ${primaryButtons}
    <button class="navbar__item" id="navbar-more-btn">
      <span class="icon">⋯</span>
      <span class="label">More</span>
    </button>
  `;
}

function wireUpTabClicks() {
  navEl.querySelectorAll('.navbar__item[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.route));
  });

  document.getElementById('navbar-more-btn').addEventListener('click', openMoreSheet);
}

function openMoreSheet() {
  const itemsHTML = MORE_TABS.map(
    (tab) => `
      <button class="more-sheet__item" data-route="${tab.id}">
        <span class="icon">${tab.icon}</span>
        <span class="label">${tab.label}</span>
      </button>
    `
  ).join('');

  openModal({
    title: 'More',
    contentHTML: `<div class="more-sheet__grid">${itemsHTML}</div>`,
    onOpen: (root) => {
      root.querySelectorAll('.more-sheet__item').forEach((btn) => {
        btn.addEventListener('click', () => {
          navigateTo(btn.dataset.route);
          closeModal();
        });
      });
    },
  });
}

// Highlights whichever tab matches the current section. If the current
// section is one of the "More" ones, the More button itself lights up.
function updateActiveTab(routeId) {
  const isInMoreSheet = MORE_TABS.some((tab) => tab.id === routeId);

  navEl.querySelectorAll('.navbar__item').forEach((btn) => {
    const isMoreButton = btn.id === 'navbar-more-btn';
    const isActive = isMoreButton ? isInMoreSheet : btn.dataset.route === routeId;
    btn.classList.toggle('active', isActive);
  });
}
