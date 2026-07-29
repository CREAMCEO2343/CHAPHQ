// modal.js
//
// A reusable "bottom sheet" popup — the slide-up panel iOS apps use for
// things like "Add Meal" or the navbar's "More" menu. Any section can
// call openModal() to show one instead of building its own popup logic.
//
// This keeps the animation/backdrop/close behavior consistent everywhere,
// and means each section only has to describe WHAT goes inside the sheet.

const SHEET_TRANSITION_MS = 400; // must match --duration-slow in variables.css

const modalRoot = document.getElementById('app-modal-root');
let onCloseCallback = null;

/**
 * @param {Object} options
 * @param {string} options.title - Shown in the sheet's header.
 * @param {string} options.contentHTML - HTML string for the sheet's body.
 * @param {(sheetRoot: HTMLElement) => void} [options.onOpen] - Runs right
 *   after the sheet is in the DOM, so you can attach event listeners to
 *   whatever's inside contentHTML.
 * @param {() => void} [options.onClose] - Runs after the sheet finishes closing.
 */
export function openModal({ title, contentHTML, onOpen, onClose }) {
  modalRoot.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal-sheet" role="dialog" aria-modal="true">
        <div class="modal-sheet__handle"></div>
        <div class="modal-sheet__header">
          <h2 class="modal-sheet__title">${title}</h2>
          <button class="btn-icon" id="modal-close-btn" aria-label="Close">&#10005;</button>
        </div>
        ${contentHTML}
      </div>
    </div>
  `;

  const overlay = document.getElementById('modal-overlay');

  // Wait one frame before adding "open" so the CSS transition actually plays
  // (if we added it immediately, the browser might skip straight to the end state).
  requestAnimationFrame(() => overlay.classList.add('open'));

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeModal();
  });
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);

  onCloseCallback = onClose || null;
  if (onOpen) onOpen(modalRoot);
}

export function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;

  overlay.classList.remove('open');

  setTimeout(() => {
    modalRoot.innerHTML = '';
    if (onCloseCallback) onCloseCallback();
    onCloseCallback = null;
  }, SHEET_TRANSITION_MS);
}
