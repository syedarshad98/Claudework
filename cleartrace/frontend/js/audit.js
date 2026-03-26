/* ─────────────────────────────────────────────────────────────────────────────
   ClearTrace — audit.js
   ───────────────────────────────────────────────────────────────────────────── */

const token = localStorage.getItem('ct_token');
if (!token) window.location.replace('/login.html');
if (localStorage.getItem('ct_onboarding') !== 'complete') window.location.replace('/onboarding.html');

const COMPANY = localStorage.getItem('ct_company') || '';
const EMAIL   = localStorage.getItem('ct_email')   || '';
const initials = COMPANY.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '—';
document.getElementById('company-avatar').textContent  = initials;
document.getElementById('sidebar-company').textContent = COMPANY;
document.getElementById('page-sub').textContent = `All data actions for ${COMPANY}`;

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.clear(); window.location.replace('/login.html');
});
document.querySelectorAll('.nav-item[data-href]').forEach(el =>
  el.addEventListener('click', () => window.location.href = el.dataset.href)
);

async function api(path) {
  const res = await fetch(path, { headers: { 'Authorization': `Bearer ${token}` } });
  if (res.status === 401) { localStorage.clear(); window.location.replace('/login.html'); return null; }
  return res;
}

// ── State ─────────────────────────────────────────────────────────────────────
let currentPage = 1;
const PAGE_SIZE = 50;

// ── Action badge config ────────────────────────────────────────────────────────
const ACTION_META = {
  create:  { label: 'Create',  cls: 'al-badge-create'  },
  edit:    { label: 'Edit',    cls: 'al-badge-edit'    },
  delete:  { label: 'Delete',  cls: 'al-badge-delete'  },
  approve: { label: 'Approve', cls: 'al-badge-approve' },
  lock:    { label: 'Lock',    cls: 'al-badge-lock'    },
  unlock:  { label: 'Unlock',  cls: 'al-badge-unlock'  },
};

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function diffHtml(oldV, newV) {
  if (!oldV && !newV) return '<span class="al-dim">—</span>';

  const o = typeof oldV === 'string' ? JSON.parse(oldV) : (oldV || {});
  const n = typeof newV === 'string' ? JSON.parse(newV) : (newV || {});

  // Show relevant fields only
  const fields = [...new Set([...Object.keys(o), ...Object.keys(n)])].filter(
    k => !['deleted_via'].includes(k)
  );

  if (fields.length === 0) return '<span class="al-dim">—</span>';

  const parts = [];
  for (const k of fields) {
    const ov = o[k], nv = n[k];
    if (ov !== undefined && nv !== undefined && String(ov) !== String(nv)) {
      parts.push(`<span class="al-diff-key">${k}:</span> <span class="al-diff-old">${ov}</span> → <span class="al-diff-new">${nv}</span>`);
    } else if (nv !== undefined && ov === undefined) {
      parts.push(`<span class="al-diff-key">${k}:</span> <span class="al-diff-new">${nv}</span>`);
    } else if (ov !== undefined && nv === undefined) {
      parts.push(`<span class="al-diff-key">${k}:</span> <span class="al-diff-old">${ov}</span>`);
    }
  }

  if (parts.length === 0) {
    // No diffs — just show new values summary if available
    const summary = Object.entries(n).slice(0, 3).map(([k, v]) =>
      `<span class="al-diff-key">${k}:</span> ${v}`
    ).join(' · ');
    return summary || '<span class="al-dim">—</span>';
  }
  return parts.join('<br>');
}

function renderRows(logs) {
  const tbody = document.getElementById('audit-tbody');
  if (!logs.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="al-empty">No audit entries found.</td></tr>';
    return;
  }
  tbody.innerHTML = logs.map(log => {
    const meta = ACTION_META[log.action] || { label: log.action, cls: 'al-badge-edit' };
    const record = log.record_id
      ? `<span class="al-mono">${log.record_type} #${log.record_id}</span>`
      : `<span class="al-mono">${log.record_type}</span>`;
    return `<tr>
      <td class="al-mono al-nowrap">${fmtDate(log.created_at)}</td>
      <td class="al-email" title="${log.user_email}">${log.user_email || '—'}</td>
      <td><span class="al-badge ${meta.cls}">${meta.label}</span></td>
      <td>${record}</td>
      <td class="al-diff">${diffHtml(log.old_values, log.new_values)}</td>
      <td class="al-mono al-muted">${log.ip_address || '—'}</td>
    </tr>`;
  }).join('');
}

function getFilters() {
  return {
    action:     document.getElementById('f-action').value,
    user_email: document.getElementById('f-email').value.trim(),
    from:       document.getElementById('f-from').value,
    to:         document.getElementById('f-to').value,
  };
}

async function loadPage(page = 1) {
  currentPage = page;
  const f = getFilters();
  const params = new URLSearchParams({ page, limit: PAGE_SIZE });
  if (f.action)     params.set('action',     f.action);
  if (f.user_email) params.set('user_email', f.user_email);
  if (f.from)       params.set('from',       f.from);
  if (f.to)         params.set('to',         f.to);

  const res = await api(`/api/audit?${params}`);
  if (!res) return;
  const data = await res.json();

  renderRows(data.logs || []);

  const total = data.total || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  document.getElementById('page-info').textContent =
    `Page ${page} of ${pages} · ${total.toLocaleString()} entries`;
  document.getElementById('page-prev').disabled = page <= 1;
  document.getElementById('page-next').disabled = page >= pages;
}

document.getElementById('apply-filters-btn').addEventListener('click', () => loadPage(1));
document.getElementById('page-prev').addEventListener('click', () => loadPage(currentPage - 1));
document.getElementById('page-next').addEventListener('click', () => loadPage(currentPage + 1));

// Enter key in text/date filters
['f-email','f-from','f-to'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') loadPage(1);
  });
});

loadPage(1);
