/* ─────────────────────────────────────────────────────────────────────────────
   ClearTrace — recommendations.js
   ───────────────────────────────────────────────────────────────────────────── */

// ── Auth guard ─────────────────────────────────────────────────────────────────
const token = localStorage.getItem('ct_token');
if (!token) window.location.replace('/login.html');
if (localStorage.getItem('ct_onboarding') !== 'complete') window.location.replace('/onboarding.html');

const COMPANY  = localStorage.getItem('ct_company') || '';
const MY_ROLE  = localStorage.getItem('ct_role')    || 'viewer';
const CAN_EDIT = MY_ROLE === 'admin' || MY_ROLE === 'editor';

const initials = COMPANY.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '—';
document.getElementById('company-avatar').textContent  = initials;
document.getElementById('sidebar-company').textContent = COMPANY;

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.clear(); window.location.replace('/login.html');
});
document.querySelectorAll('.nav-item[data-href]').forEach(el =>
  el.addEventListener('click', () => window.location.href = el.dataset.href)
);

// ── API helper ─────────────────────────────────────────────────────────────────
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

// ── Toast ──────────────────────────────────────────────────────────────────────
function showToast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `rc-toast rc-toast-${type}`;
  el.textContent = message;
  document.getElementById('rc-toast-container').appendChild(el);
  setTimeout(() => el.classList.add('rc-toast-show'), 10);
  setTimeout(() => {
    el.classList.remove('rc-toast-show');
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// ── Badge helpers ──────────────────────────────────────────────────────────────
const SCOPE_LABELS = { scope1: 'Scope 1', scope2: 'Scope 2', scope3: 'Scope 3' };

function scopeBadgeHtml(scope) {
  // scope may be 'scope1', 'scope2', 'scope3', or combined like 'scope1,scope2,scope3'
  const parts = scope.split(',').map(s => s.trim());
  return parts.map(s => {
    const label = SCOPE_LABELS[s] || s.replace('scope', 'Scope ');
    return `<span class="rc-scope-badge rc-scope-${s}">${label}</span>`;
  }).join('');
}

function costBadgeHtml(band) {
  const map = { low: 'rc-cost-low', medium: 'rc-cost-medium', high: 'rc-cost-high' };
  const label = { low: 'Low Cost', medium: 'Medium Cost', high: 'High Cost' };
  return `<span class="rc-badge ${map[band] || ''}">${label[band] || band}</span>`;
}

function timeBadgeHtml(time) {
  const map   = { quick_win: 'rc-time-quick', medium_term: 'rc-time-medium', long_term: 'rc-time-long' };
  const label = { quick_win: 'Quick Win', medium_term: 'Medium Term', long_term: 'Long Term' };
  return `<span class="rc-badge ${map[time] || ''}">${label[time] || time}</span>`;
}

function fwTagsHtml(rec) {
  const tags = [];
  if (rec.gri_reference)  tags.push(`<span class="rc-fw-tag">${rec.gri_reference}</span>`);
  if (rec.tcfd_reference) tags.push(`<span class="rc-fw-tag">${rec.tcfd_reference}</span>`);
  if (rec.sasb_reference) tags.push(`<span class="rc-fw-tag">${rec.sasb_reference}</span>`);
  return tags.join('');
}

function savingHtml(rec) {
  const min = rec.co2e_saving_min;
  const max = rec.co2e_saving_max;
  if (!max && !min) return '';
  if (max === 0 && min === 0) return '';
  const unit = rec.co2e_saving_unit || 'tCO₂e/year';
  if (min && max) return `<span class="rc-saving">💚 ${min}–${max} ${unit}</span>`;
  if (max)        return `<span class="rc-saving">💚 up to ${max} ${unit}</span>`;
  return '';
}

function statusSelectHtml(rec) {
  if (!CAN_EDIT) {
    const labels = { new: 'New', saved: 'Saved', in_progress: 'In Progress', completed: 'Completed', dismissed: 'Dismissed' };
    return `<span class="rc-status-badge rc-status-${rec.status}">${labels[rec.status] || rec.status}</span>`;
  }
  const options = [
    ['new',        'New'],
    ['saved',      'Save'],
    ['in_progress','In Progress'],
    ['completed',  'Completed'],
    ['dismissed',  'Dismiss'],
  ].map(([val, lbl]) =>
    `<option value="${val}"${rec.status === val ? ' selected' : ''}>${lbl}</option>`
  ).join('');
  return `<select class="rc-status-select" data-id="${rec.id}">${options}</select>`;
}

// ── Build a single card ────────────────────────────────────────────────────────
function buildCard(rec) {
  const card = document.createElement('div');
  card.className = `rc-card rc-card-status-${rec.status}`;
  card.dataset.id = rec.id;

  card.innerHTML = `
    <div class="rc-card-top">
      <div class="rc-card-badges">
        ${scopeBadgeHtml(rec.scope)}
        ${costBadgeHtml(rec.cost_band)}
        ${timeBadgeHtml(rec.time_to_impact)}
      </div>
      <div class="rc-card-actions">${statusSelectHtml(rec)}</div>
    </div>
    <div class="rc-card-title">${rec.title}</div>
    <div class="rc-card-desc">${rec.description}</div>
    <div class="rc-card-footer">
      <div class="rc-card-meta">
        ${savingHtml(rec)}
        ${fwTagsHtml(rec)}
      </div>
      <button class="rc-why-btn" data-trigger="${rec.trigger_label || ''}">Why this?</button>
    </div>
    <div class="rc-why-panel" style="display:none">
      <span class="rc-why-icon">ℹ️</span> ${rec.trigger_label || ''}
    </div>`;

  // Why this? toggle
  card.querySelector('.rc-why-btn').addEventListener('click', e => {
    const panel = card.querySelector('.rc-why-panel');
    const btn   = e.currentTarget;
    const open  = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : 'flex';
    btn.textContent = open ? 'Why this?' : 'Hide';
  });

  // Status change
  const sel = card.querySelector('.rc-status-select');
  if (sel) {
    sel.addEventListener('change', async e => {
      const newStatus = e.target.value;
      const r = await api('PATCH', `/api/recommendations/${rec.id}/status`, { status: newStatus });
      if (!r || !r.ok) {
        showToast('Failed to update status', 'error');
        sel.value = rec.status; // revert
        return;
      }
      rec.status = newStatus;
      card.className = `rc-card rc-card-status-${newStatus}`;
      showToast('Status updated');
    });
  }

  return card;
}

// ── Group headings ─────────────────────────────────────────────────────────────
const GROUP_ORDER = ['quick_win', 'medium_term', 'long_term'];
const GROUP_LABELS = {
  quick_win:   'Quick Wins',
  medium_term: 'Medium Term',
  long_term:   'Long Term',
};

// ── Filter state ───────────────────────────────────────────────────────────────
const filters = { scope: '', cost: '', time: '', status: '' };
let allRecs = [];

function applyFilters() {
  const filtered = allRecs.filter(r => {
    if (filters.scope && !r.scope.includes(filters.scope)) return false;
    if (filters.cost   && r.cost_band      !== filters.cost)   return false;
    if (filters.time   && r.time_to_impact !== filters.time)   return false;
    if (filters.status && r.status         !== filters.status) return false;
    return true;
  });

  const list = document.getElementById('rc-list');
  list.innerHTML = '';

  if (!filtered.length) {
    list.innerHTML = `<div class="rc-empty">
      <div class="rc-empty-icon">💡</div>
      <div class="rc-empty-msg">No recommendations match your current filters.</div>
      <button class="btn btn-outline rc-clear-btn" id="rc-clear-filters">Clear filters</button>
    </div>`;
    document.getElementById('rc-clear-filters').addEventListener('click', clearFilters);
    return;
  }

  const useGrouping = !filters.scope && !filters.cost && !filters.time && !filters.status;

  if (useGrouping) {
    const grouped = { quick_win: [], medium_term: [], long_term: [] };
    for (const r of filtered) grouped[r.time_to_impact]?.push(r);

    for (const key of GROUP_ORDER) {
      const group = grouped[key];
      if (!group || !group.length) continue;
      const sorted = [...group].sort((a, b) => {
        const cOrder = { low: 0, medium: 1, high: 2 };
        return (cOrder[a.cost_band] || 0) - (cOrder[b.cost_band] || 0);
      });
      const heading = document.createElement('div');
      heading.className = 'rc-group-heading';
      heading.textContent = GROUP_LABELS[key];
      list.appendChild(heading);
      sorted.forEach(r => list.appendChild(buildCard(r)));
    }
  } else {
    filtered.forEach(r => list.appendChild(buildCard(r)));
  }
}

// ── Pill filter wiring ─────────────────────────────────────────────────────────
document.querySelectorAll('.rc-pills').forEach(group => {
  const key = group.id.replace('filter-', '');
  group.querySelectorAll('.rc-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('.rc-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filters[key] = btn.dataset.val;
      applyFilters();
    });
  });
});

function clearFilters() {
  Object.keys(filters).forEach(k => { filters[k] = ''; });
  document.querySelectorAll('.rc-pill').forEach(b => {
    b.classList.toggle('active', b.dataset.val === '');
  });
  applyFilters();
}

// ── Load data ──────────────────────────────────────────────────────────────────
async function loadRecommendations() {
  document.getElementById('rc-list').innerHTML =
    '<div class="rc-loading">Running gap analysis…</div>';

  const res = await api('GET', '/api/recommendations');
  if (!res || !res.ok) {
    document.getElementById('rc-list').innerHTML =
      '<div class="rc-empty"><div class="rc-empty-msg">Failed to load recommendations.</div></div>';
    return;
  }
  const data = await res.json();
  allRecs = data.recommendations || [];

  // Summary bar
  document.getElementById('rc-total').textContent = allRecs.length;

  // Calculate total possible saving
  const totalSaving = allRecs
    .filter(r => r.co2e_saving_max && r.status !== 'dismissed')
    .reduce((sum, r) => sum + (parseFloat(r.co2e_saving_max) || 0), 0);
  document.getElementById('rc-saving').textContent =
    totalSaving > 0 ? `${totalSaving.toFixed(0)}` : '—';

  const inProgress = allRecs.filter(r => r.status === 'in_progress').length;
  document.getElementById('rc-inprogress').textContent = inProgress;

  applyFilters();
}

loadRecommendations();
