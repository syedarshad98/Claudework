/* ─────────────────────────────────────────────────────────────────────────────
   ClearTrace — reporting.js
   ───────────────────────────────────────────────────────────────────────────── */

// ── Auth guard ────────────────────────────────────────────────────────────────
const token = localStorage.getItem('ct_token');
if (!token) window.location.replace('/login.html');
if (localStorage.getItem('ct_onboarding') !== 'complete') window.location.replace('/onboarding.html');

const COMPANY = localStorage.getItem('ct_company') || '';

const initials = COMPANY.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '—';
document.getElementById('company-avatar').textContent  = initials;
document.getElementById('sidebar-company').textContent = COMPANY;

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.clear(); window.location.replace('/login.html');
});
document.querySelectorAll('.nav-item[data-href]').forEach(el =>
  el.addEventListener('click', () => window.location.href = el.dataset.href)
);

// ── API helper ────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (res.status === 401) { localStorage.clear(); window.location.replace('/login.html'); return null; }
  return res;
}

// ── Framework Alignment card ──────────────────────────────────────────────────
async function loadFrameworks() {
  const res = await api('GET', '/api/frameworks');
  if (!res || !res.ok) return;
  const rows = await res.json();

  const container = document.getElementById('rp-fw-status');
  const FWS = ['GRI', 'TCFD', 'SASB'];
  container.innerHTML = FWS.map(name => {
    const fw     = rows.find(f => f.framework === name);
    const status = fw ? fw.status : 'not_started';
    const cls    = status === 'aligned' ? 'rp-fw-aligned'
                 : status === 'partial' ? 'rp-fw-partial'
                 : 'rp-fw-pending';
    const lbl    = status === 'aligned' ? '✓ On Track'
                 : status === 'partial' ? '⚠ At Risk'
                 : '— Behind';
    return `<div class="rp-fw-row">
      <span class="rp-fw-name">${name}</span>
      <span class="rp-fw-badge ${cls}">${lbl}</span>
    </div>`;
  }).join('');
}

// ── Generate Report button ────────────────────────────────────────────────────
document.getElementById('rp-generate-btn').addEventListener('click', async () => {
  const btn    = document.getElementById('rp-generate-btn');
  const status = document.getElementById('rp-generate-status');
  const orig   = btn.textContent;
  btn.textContent = '⏳ Generating…';
  btn.disabled    = true;
  status.textContent = '';
  status.className   = 'rp-generate-status';

  try {
    const res = await fetch('/api/report', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res || !res.ok) throw new Error('Server error');
    const blob = await res.blob();
    const a = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(blob),
      download: `ClearTrace-ESG-Report-${new Date().getFullYear()}.pdf`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
    status.textContent = '✓ Report downloaded';
  } catch {
    status.textContent = 'Could not generate report — please try again.';
    status.className   = 'rp-generate-status error';
  } finally {
    btn.textContent = orig;
    btn.disabled    = false;
  }
});

// ── Audit & Submissions card ──────────────────────────────────────────────────
async function loadAuditStats() {
  try {
    const [auditRes, valRes] = await Promise.all([
      api('GET', '/api/audit?limit=1'),
      api('GET', '/api/validation/summary'),
    ]);

    if (auditRes && auditRes.ok) {
      const data = await auditRes.json();
      const total = data.total ?? (data.entries?.length ?? '—');
      document.getElementById('rp-audit-count').textContent = total.toLocaleString();
    }

    if (valRes && valRes.ok) {
      const data = await valRes.json();
      const pending = data.pending ?? 0;
      const el = document.getElementById('rp-validation-count');
      el.textContent = pending;
      el.className = `rp-stat-val${pending > 0 ? ' warn' : ''}`;
    }
  } catch (_) { /* non-critical */ }
}

// ── Init ──────────────────────────────────────────────────────────────────────
loadFrameworks();
loadAuditStats();
