// school.js
//
// Intentionally an "Under Construction" screen for now — per the spec,
// nothing functional lives here yet. When it's time to build it, this
// file follows the same render()/init() pattern as every other section.

export function render() {
  return `
    <div class="page-header">
      <div class="page-header__title">School</div>
    </div>
    <div class="page-content">
      <div class="empty-state">
        <div class="empty-state__icon">🚧</div>
        <div class="empty-state__title">Under Construction</div>
        <div class="empty-state__subtitle">The School section is planned but not built yet. Check back soon.</div>
      </div>
    </div>
  `;
}

export function init() {}
