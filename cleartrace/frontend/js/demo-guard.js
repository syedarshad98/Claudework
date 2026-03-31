/**
 * demo-guard.js — client-side demo mode enforcement.
 *
 * Included on every page with a sidebar.
 * Reads ct_demo from localStorage (set at login).
 * If demo mode:
 *   - Shows the #demo-banner element
 *   - Adds body.has-demo-banner so CSS can adjust layout
 *   - Disables write buttons and edit toggles (UX only — backend is the real guard)
 */

(function () {
  if (localStorage.getItem('ct_demo') !== 'true') return;

  // Pattern matching button text that triggers a write operation
  const WRITE_RE = /^(save|submit|add|upload|delete|remove|approve|generate|invite|edit|lock|unlock)/i;

  function disableWriteButtons() {
    document.querySelectorAll('button').forEach(function (btn) {
      // Skip buttons already handled or explicitly exempted
      if (btn.dataset.demoAllow || btn.classList.contains('demo-disabled')) return;
      const text = btn.textContent.trim();
      if (WRITE_RE.test(text)) {
        btn.disabled = true;
        btn.title    = 'Disabled in demo mode';
        btn.classList.add('demo-disabled');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    // Show fixed banner
    var banner = document.getElementById('demo-banner');
    if (banner) banner.style.display = '';

    // Shift layout down so banner doesn't overlap content
    document.body.classList.add('has-demo-banner');

    // Disable write buttons present at page load
    disableWriteButtons();

    // Re-run after async content renders (social, governance, water, waste edit buttons)
    setTimeout(disableWriteButtons, 700);
    setTimeout(disableWriteButtons, 1800);
  });
})();
