// tabs.js
//
// A reusable "segmented control" — the iOS-style pill switcher used for
// sub-tabs inside a pillar (e.g. Gym's Workout | History | Body). Each
// pillar passes in its tab list and a callback; this component handles
// rendering, highlighting, and remembering which tab is active.
//
// Usage from a section:
//   initTabs({
//     containerId: 'gym-tabs',
//     tabs: [{ id: 'workout', label: 'Workout' }, ...],
//     onChange: (tabId) => { ...show that tab's content... },
//   });

export function initTabs({ containerId, tabs, activeId, onChange }) {
  const container = document.getElementById(containerId);
  let currentId = activeId || tabs[0].id;

  container.classList.add('segmented');
  container.innerHTML = tabs
    .map(
      (tab) => `
        <button class="segmented__item${tab.id === currentId ? ' active' : ''}" data-tab="${tab.id}">
          ${tab.label}
        </button>
      `
    )
    .join('');

  container.querySelectorAll('.segmented__item').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === currentId) return;
      currentId = btn.dataset.tab;
      container.querySelectorAll('.segmented__item').forEach((b) => b.classList.toggle('active', b === btn));
      onChange(currentId);
    });
  });

  // Fire once for the initial tab so the section shows content immediately.
  onChange(currentId);
}
