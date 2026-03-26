/* ─────────────────────────────────────────────────────────────────────────────
   ClearTrace — governance.js
   ───────────────────────────────────────────────────────────────────────────── */

// ── Auth guard ────────────────────────────────────────────────────────────────
const token = localStorage.getItem('ct_token');
if (!token) window.location.replace('/login.html');
if (localStorage.getItem('ct_onboarding') !== 'complete') window.location.replace('/onboarding.html');

const COMPANY = localStorage.getItem('ct_company') || '';
const MY_ROLE = localStorage.getItem('ct_role')    || 'viewer';
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

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `gv-toast gv-toast-${type}`;
  el.textContent = message;
  document.getElementById('gv-toast-container').appendChild(el);
  setTimeout(() => el.classList.add('gv-toast-show'), 10);
  setTimeout(() => {
    el.classList.remove('gv-toast-show');
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// ── Period selector ───────────────────────────────────────────────────────────
function buildPeriodOptions() {
  const sel = document.getElementById('period-select');
  const now = new Date();
  for (let i = 0; i < 8; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    sel.appendChild(opt);
  }
}

// ── Sparkline SVG ─────────────────────────────────────────────────────────────
function sparklineSvg(data) {
  const values = data.map(d => d.value).filter(v => v !== null);
  if (values.length < 2) return '<span class="gv-spark-empty">—</span>';

  const W = 60, H = 24, pad = 2;
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const range = mx - mn || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v - mn) / range) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return `<svg width="${W}" height="${H}" class="gv-sparkline">
    <polyline points="${pts}" fill="none" stroke="var(--gov-color,#3b5bdb)" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`;
}

// ── Render helpers ────────────────────────────────────────────────────────────
function fmtValue(metric, editMode) {
  const { key, type, unit, value, text } = metric;
  const displayVal = value !== null ? value : (text || null);

  if (editMode) {
    if (type === 'yesno') {
      const yes = text === 'yes' ? 'selected' : '';
      const no  = text === 'no'  ? 'selected' : '';
      return `<select class="gv-input" data-key="${key}" data-type="yesno">
        <option value="">—</option>
        <option value="yes" ${yes}>Yes</option>
        <option value="no"  ${no}>No</option>
      </select>`;
    }
    return `<input class="gv-input" type="number" step="any" data-key="${key}" data-type="${type}"
              value="${value !== null ? value : ''}" placeholder="—">`;
  }

  // View mode
  if (type === 'yesno') {
    if (text === null) return '<span class="gv-no-data">—</span>';
    const cls = text === 'yes' ? 'gv-badge-yes' : 'gv-badge-no';
    return `<span class="gv-badge ${cls}">${text === 'yes' ? 'Yes' : 'No'}</span>`;
  }
  if (displayVal === null) return '<span class="gv-no-data">—</span>';
  const unitStr = unit ? ` <span class="gv-unit">${unit}</span>` : '';
  return `<span class="gv-metric-value">${Number(displayVal).toLocaleString()}</span>${unitStr}`;
}

function renderPanels(categories, period, editMode) {
  const container = document.getElementById('gv-panels');
  container.innerHTML = '';

  for (const [catName, cat] of Object.entries(categories)) {
    const panel = document.createElement('div');
    panel.className = 'card gv-panel';

    const header = `
      <div class="gv-panel-header">
        <div class="gv-panel-title">${catName}</div>
        <span class="gv-gri-tag">${cat.gri}</span>
      </div>`;

    const rows = cat.metrics.map(m => `
      <tr class="gv-metric-row">
        <td class="gv-metric-label">${m.label}</td>
        <td class="gv-metric-val">${fmtValue(m, editMode)}</td>
        <td class="gv-metric-spark">${m.type !== 'yesno' ? sparklineSvg(m.sparkline) : ''}</td>
      </tr>`).join('');

    panel.innerHTML = `
      ${header}
      <table class="gv-table">
        <tbody>${rows}</tbody>
      </table>`;

    if (editMode) {
      panel.querySelectorAll('.gv-input').forEach(inp => {
        inp.dataset.category = catName;
        inp.dataset.period   = period;
      });
    }

    container.appendChild(panel);
  }
}

// ── State ─────────────────────────────────────────────────────────────────────
let currentPeriod = null;
let currentData   = null;
let editMode      = false;

// ── Load metrics ──────────────────────────────────────────────────────────────
async function loadMetrics(period) {
  const res = await api('GET', `/api/governance/metrics?period=${period}`);
  if (!res || !res.ok) { showToast('Failed to load governance metrics', 'error'); return; }
  const data = await res.json();
  currentData   = data;
  currentPeriod = data.period;
  editMode      = false;
  renderPanels(data.categories, data.period, false);
  if (CAN_EDIT) {
    document.getElementById('edit-btn').style.display = '';
    document.getElementById('save-btn').style.display = 'none';
  }
}

// ── Edit / Save ───────────────────────────────────────────────────────────────
document.getElementById('edit-btn')?.addEventListener('click', () => {
  editMode = true;
  renderPanels(currentData.categories, currentPeriod, true);
  document.getElementById('edit-btn').style.display = 'none';
  document.getElementById('save-btn').style.display = '';
});

document.getElementById('save-btn')?.addEventListener('click', async () => {
  const inputs = document.querySelectorAll('.gv-input');
  const saves  = [];

  for (const inp of inputs) {
    const { key, type, category, period } = inp.dataset;
    const raw = inp.value.trim();

    if (type === 'yesno') {
      saves.push({ period, category, metric_key: key, metric_value: null, metric_text: raw || null });
    } else {
      const num = raw === '' ? null : parseFloat(raw);
      saves.push({ period, category, metric_key: key, metric_value: num, metric_text: null });
    }
  }

  let errors = 0;
  for (const payload of saves) {
    const r = await api('POST', '/api/governance/metrics', payload);
    if (!r || !r.ok) errors++;
  }

  if (errors) {
    showToast(`${errors} metric(s) failed to save`, 'error');
  } else {
    showToast('Governance metrics saved');
  }

  await loadMetrics(currentPeriod);
});

// ── Period change ─────────────────────────────────────────────────────────────
document.getElementById('period-select').addEventListener('change', e => {
  loadMetrics(e.target.value);
});

// ── Init ──────────────────────────────────────────────────────────────────────
buildPeriodOptions();
const defaultPeriod = document.getElementById('period-select').value;
loadMetrics(defaultPeriod);
