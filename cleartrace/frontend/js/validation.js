/* ─────────────────────────────────────────────────────────────────────────────
   ClearTrace — validation.js
   ───────────────────────────────────────────────────────────────────────────── */

const token = localStorage.getItem('ct_token');
if (!token) window.location.replace('/login.html');
if (localStorage.getItem('ct_onboarding') !== 'complete') window.location.replace('/onboarding.html');

const COMPANY = localStorage.getItem('ct_company') || '';
const ROLE    = localStorage.getItem('ct_role')    || 'viewer';

const initials = COMPANY.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '—';
document.getElementById('company-avatar').textContent  = initials;
document.getElementById('sidebar-company').textContent = COMPANY;
document.getElementById('page-sub').textContent = `Review and action flagged entries for ${COMPANY}`;

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.clear(); window.location.replace('/login.html');
});
document.querySelectorAll('.nav-item[data-href]').forEach(el =>
  el.addEventListener('click', () => window.location.href = el.dataset.href)
);

// ── Helpers ───────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (res.status === 401) { localStorage.clear(); window.location.replace('/login.html'); return null; }
  return res;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const RULE_META = {
  negative_value: { label: 'Negative value',    cls: 'vl-rule-danger' },
  spike:          { label: 'Unusual spike',      cls: 'vl-rule-warn'   },
  duplicate:      { label: 'Possible duplicate', cls: 'vl-rule-warn'   },
  missing_field:  { label: 'Missing field',      cls: 'vl-rule-danger' },
};

// ── Summary ───────────────────────────────────────────────────────────────────
async function loadSummary() {
  const [sumRes, approvedRes, lockedRes] = await Promise.all([
    api('GET', '/api/validation/summary'),
    api('GET', '/api/validation/flags?status=approved&limit=1'),
    api('GET', '/api/validation/locked'),
  ]);

  if (sumRes?.ok) {
    const d = await sumRes.json();
    document.getElementById('vl-pending-count').textContent = d.pending;
    document.getElementById('tab-pending-count').textContent = d.pending > 0 ? ` (${d.pending})` : '';
  }
  if (approvedRes?.ok) {
    const d = await approvedRes.json();
    document.getElementById('vl-approved-count').textContent = d.total;
  }
  if (lockedRes?.ok) {
    const d = await lockedRes.json();
    document.getElementById('vl-locked-count').textContent = d.length;
  }
}

// ── Pending flags ─────────────────────────────────────────────────────────────
let pendingPage = 1;
const PAGE = 20;

async function loadPending(page = 1) {
  pendingPage = page;
  const res = await api('GET', `/api/validation/flags?status=pending&page=${page}&limit=${PAGE}`);
  if (!res) return;
  const data = await res.json();
  const tbody = document.getElementById('pending-tbody');
  const card  = document.getElementById('pending-card');
  const empty = document.getElementById('pending-empty');

  if (!data.flags.length && page === 1) {
    card.style.display  = 'none';
    empty.style.display = 'flex';
    return;
  }
  card.style.display  = '';
  empty.style.display = 'none';

  tbody.innerHTML = data.flags.map(f => {
    const rm  = RULE_META[f.rule] || { label: f.rule, cls: 'vl-rule-warn' };
    const lock = f.locked ? '<span class="vl-lock-icon" title="Period locked">🔒</span>' : '';
    return `<tr id="flag-row-${f.id}">
      <td>
        <div class="vl-entry-name">${f.category} ${lock}</div>
        <div class="vl-entry-meta">Scope ${f.scope} · ${f.amount} ${f.unit} · <span class="al-mono">${parseFloat(f.co2e_tonnes || 0).toFixed(3)} tCO₂e</span></div>
      </td>
      <td class="al-mono">${f.period}</td>
      <td><span class="vl-rule-badge ${rm.cls}">${rm.label}</span></td>
      <td class="vl-message">${f.message}</td>
      <td class="vl-actions">
        <button class="btn btn-outline vl-btn-approve" data-id="${f.id}">✓ Approve</button>
        <button class="btn vl-btn-delete" data-id="${f.id}" ${f.locked ? 'disabled title="Period locked"' : ''}>✕ Delete</button>
      </td>
    </tr>`;
  }).join('');

  // Bind buttons
  tbody.querySelectorAll('.vl-btn-approve').forEach(btn => {
    btn.addEventListener('click', () => approveFlag(parseInt(btn.dataset.id)));
  });
  tbody.querySelectorAll('.vl-btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteFlag(parseInt(btn.dataset.id)));
  });

  const total = data.total;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  document.getElementById('pending-page-info').textContent = `Page ${page} of ${pages} · ${total} warnings`;
  document.getElementById('pending-prev').disabled = page <= 1;
  document.getElementById('pending-next').disabled = page >= pages;
}

async function approveFlag(flagId) {
  const row = document.getElementById(`flag-row-${flagId}`);
  if (row) row.style.opacity = '0.4';
  const res = await api('POST', `/api/validation/flags/${flagId}/approve`);
  if (res?.ok) {
    await loadPending(pendingPage);
    await loadSummary();
  } else {
    if (row) row.style.opacity = '';
    alert('Could not approve — please try again.');
  }
}

async function deleteFlag(flagId) {
  if (!confirm('Delete this emission entry permanently? This cannot be undone.')) return;
  const row = document.getElementById(`flag-row-${flagId}`);
  if (row) row.style.opacity = '0.4';
  const res = await api('DELETE', `/api/validation/flags/${flagId}`);
  if (res?.ok) {
    await loadPending(pendingPage);
    await loadSummary();
  } else {
    if (row) row.style.opacity = '';
    const err = res ? await res.json() : {};
    alert(err.error || 'Could not delete — please try again.');
  }
}

document.getElementById('pending-prev').addEventListener('click', () => loadPending(pendingPage - 1));
document.getElementById('pending-next').addEventListener('click', () => loadPending(pendingPage + 1));

// ── Approved flags ────────────────────────────────────────────────────────────
let approvedPage = 1;

async function loadApproved(page = 1) {
  approvedPage = page;
  const res = await api('GET', `/api/validation/flags?status=approved&page=${page}&limit=${PAGE}`);
  if (!res) return;
  const data = await res.json();
  const tbody = document.getElementById('approved-tbody');

  if (!data.flags.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="al-empty">No approved flags yet.</td></tr>';
    return;
  }

  tbody.innerHTML = data.flags.map(f => {
    const rm = RULE_META[f.rule] || { label: f.rule, cls: 'vl-rule-warn' };
    return `<tr>
      <td>
        <div class="vl-entry-name">${f.category}</div>
        <div class="vl-entry-meta">Scope ${f.scope} · ${f.amount} ${f.unit}</div>
      </td>
      <td class="al-mono">${f.period}</td>
      <td><span class="vl-rule-badge ${rm.cls}">${rm.label}</span></td>
      <td class="vl-message">${f.message}</td>
      <td class="al-mono al-muted">${fmtDate(f.reviewed_at)}</td>
    </tr>`;
  }).join('');

  const total = data.total;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  document.getElementById('approved-page-info').textContent = `Page ${page} of ${pages} · ${total} entries`;
  document.getElementById('approved-prev').disabled = page <= 1;
  document.getElementById('approved-next').disabled = page >= pages;
}

document.getElementById('approved-prev').addEventListener('click', () => loadApproved(approvedPage - 1));
document.getElementById('approved-next').addEventListener('click', () => loadApproved(approvedPage + 1));

// ── Locked periods ────────────────────────────────────────────────────────────
async function loadLocked() {
  const res = await api('GET', '/api/validation/locked');
  if (!res) return;
  const rows = await res.json();
  const el   = document.getElementById('locked-list');

  // Show/hide lock form based on role
  document.getElementById('lock-form-wrap').style.display = ROLE === 'admin' ? '' : 'none';

  if (!rows.length) {
    el.innerHTML = '<div class="al-empty">No periods are locked.</div>';
    return;
  }

  el.innerHTML = `<table class="al-table">
    <thead><tr><th>Period</th><th>Locked by</th><th>Locked at</th><th></th></tr></thead>
    <tbody>
      ${rows.map(r => `
        <tr>
          <td class="al-mono">${r.period}</td>
          <td>${r.locked_by_email || '—'}</td>
          <td class="al-mono al-muted">${fmtDate(r.locked_at)}</td>
          <td>${ROLE === 'admin'
            ? `<button class="btn btn-outline vl-unlock-btn" data-period="${r.period}">🔓 Unlock</button>`
            : '<span class="al-muted">Admin required</span>'
          }</td>
        </tr>`).join('')}
    </tbody>
  </table>`;

  el.querySelectorAll('.vl-unlock-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Unlock ${btn.dataset.period}? Entries will become editable again.`)) return;
      const r = await api('DELETE', `/api/validation/locked/${btn.dataset.period}`);
      if (r?.ok) { await loadLocked(); await loadSummary(); }
      else alert('Could not unlock period.');
    });
  });
}

document.getElementById('lock-btn').addEventListener('click', async () => {
  const val = document.getElementById('lock-period-input').value;
  if (!val) { alert('Select a period first.'); return; }
  // Convert YYYY-MM from <input type="month"> which is already that format
  if (!confirm(`Lock period ${val}? No entries can be edited or deleted without admin override.`)) return;
  const res = await api('POST', '/api/validation/locked', { period: val });
  if (res?.ok) {
    document.getElementById('lock-period-input').value = '';
    await loadLocked();
    await loadSummary();
  } else {
    const err = res ? await res.json() : {};
    alert(err.error || 'Could not lock period.');
  }
});

// ── Tab switching ─────────────────────────────────────────────────────────────
const PANELS = { pending: 'panel-pending', approved: 'panel-approved', locked: 'panel-locked' };

document.querySelectorAll('.vl-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.vl-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    Object.values(PANELS).forEach(p => document.getElementById(p).style.display = 'none');
    const panel = PANELS[tab.dataset.tab];
    document.getElementById(panel).style.display = '';
    if (tab.dataset.tab === 'approved') loadApproved(1);
    if (tab.dataset.tab === 'locked')   loadLocked();
  });
});

// ── Init ──────────────────────────────────────────────────────────────────────
Promise.all([loadSummary(), loadPending(1)]);
