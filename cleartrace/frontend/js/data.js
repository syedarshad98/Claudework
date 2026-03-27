/* ─────────────────────────────────────────────────────────────────────────────
   ClearTrace — data.js
   ───────────────────────────────────────────────────────────────────────────── */

// ── Auth guard ────────────────────────────────────────────────────────────────
const token = localStorage.getItem('ct_token');
if (!token) window.location.replace('/login.html');
if (localStorage.getItem('ct_onboarding') !== 'complete') window.location.replace('/onboarding.html');

const COMPANY = localStorage.getItem('ct_company') || '';
const ROLE    = localStorage.getItem('ct_role')    || 'viewer';

const initials = COMPANY.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '—';
document.getElementById('company-avatar').textContent  = initials;
document.getElementById('sidebar-company').textContent = COMPANY;

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.clear(); window.location.replace('/login.html');
});
document.querySelectorAll('.nav-item[data-href]').forEach(el =>
  el.addEventListener('click', () => window.location.href = el.dataset.href)
);

// ── Role enforcement ──────────────────────────────────────────────────────────
if (ROLE === 'viewer') {
  document.getElementById('dh-manual-editor').style.display = 'none';
  document.getElementById('dh-manual-viewer').style.display = '';
  document.getElementById('dh-upload-editor').style.display = 'none';
  document.getElementById('dh-upload-viewer').style.display = '';
}
