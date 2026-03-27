/* ─────────────────────────────────────────────────────────────────────────────
   ClearTrace — environment.js
   Handles Emissions, Water and Waste tabs.
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

// ── Formatting ────────────────────────────────────────────────────────────────
function fmt(n, dp = 0) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-GB', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp
  });
}

function niceMax(v) {
  const mag  = Math.pow(10, Math.floor(Math.log10(v)));
  const nice = [1, 2, 2.5, 5, 10].map(n => n * mag);
  const step = nice.find(n => n >= v / 3) || mag;
  return Math.ceil(v / step) * step;
}

// ── Toast helper ──────────────────────────────────────────────────────────────
function showToast(message, type = 'success', toastContainerId = 'env-water-toast-container') {
  const el = document.createElement('div');
  el.className = `sc-toast sc-toast-${type}`;
  el.textContent = message;
  const container = document.getElementById(toastContainerId);
  if (container) container.appendChild(el);
  setTimeout(() => el.classList.add('sc-toast-show'), 10);
  setTimeout(() => {
    el.classList.remove('sc-toast-show');
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
  if (values.length < 2) return '<span class="sc-spark-empty">—</span>';

  const W = 60, H = 24, pad = 2;
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const range = mx - mn || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v - mn) / range) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return `<svg width="${W}" height="${H}" class="sc-sparkline">
    <polyline points="${pts}" fill="none" stroke="var(--green)" stroke-width="1.5" stroke-linejoin="round"/>
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
      return `<select class="sc-input" data-key="${key}" data-type="yesno">
        <option value="">—</option>
        <option value="yes" ${yes}>Yes</option>
        <option value="no"  ${no}>No</option>
      </select>`;
    }
    return `<input class="sc-input" type="number" step="any" data-key="${key}" data-type="${type}"
              value="${value !== null ? value : ''}" placeholder="—">`;
  }

  // View mode
  if (type === 'yesno') {
    if (text === null) return '<span class="sc-no-data">—</span>';
    const cls = text === 'yes' ? 'sc-badge-yes' : 'sc-badge-no';
    return `<span class="sc-badge ${cls}">${text === 'yes' ? 'Yes' : 'No'}</span>`;
  }
  if (displayVal === null) return '<span class="sc-no-data">—</span>';
  const unitStr = unit ? ` <span class="sc-unit">${unit}</span>` : '';
  return `<span class="sc-metric-value">${Number(displayVal).toLocaleString()}</span>${unitStr}`;
}

// ── Generic metric panel renderer ────────────────────────────────────────────
function renderMetricPanels(categories, period, editMode, containerId, toastId, saveEndpoint) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  for (const [catName, cat] of Object.entries(categories)) {
    const panel = document.createElement('div');
    panel.className = 'card sc-panel';

    const header = `
      <div class="sc-panel-header">
        <div class="sc-panel-title">${catName}</div>
        <span class="sc-gri-tag">${cat.gri}</span>
      </div>`;

    const rows = cat.metrics.map(m => `
      <tr class="sc-metric-row">
        <td class="sc-metric-label">${m.label}</td>
        <td class="sc-metric-val">${fmtValue(m, editMode)}</td>
        <td class="sc-metric-spark">${m.type !== 'yesno' ? sparklineSvg(m.sparkline) : ''}</td>
      </tr>`).join('');

    panel.innerHTML = `
      ${header}
      <table class="sc-table">
        <tbody>${rows}</tbody>
      </table>`;

    // Store category metadata on each input for save
    if (editMode) {
      panel.querySelectorAll('.sc-input').forEach(inp => {
        inp.dataset.category    = catName;
        inp.dataset.period      = period;
        inp.dataset.containerId = containerId;
        inp.dataset.toastId     = toastId;
        inp.dataset.endpoint    = saveEndpoint;
      });
    }

    container.appendChild(panel);
  }
}

// ── State ─────────────────────────────────────────────────────────────────────
let currentPeriod   = null;
let currentTab      = 'emissions';
let waterData       = null;
let wasteData       = null;
let waterEditMode   = false;
let wasteEditMode   = false;
let waterLoaded     = false;
let wasteLoaded     = false;

// ── Emissions KPIs ────────────────────────────────────────────────────────────
async function loadEmissionsKPIs() {
  const res = await api('GET', '/api/charts/breakdown');
  if (!res || !res.ok) return;
  const d = await res.json();

  document.getElementById('env-s1-val').textContent = fmt(d.scope1, 1);
  document.getElementById('env-s2-val').textContent = fmt(d.scope2, 1);
  document.getElementById('env-s3-val').textContent = fmt(d.scope3, 1);

  if (d.scope1Pct != null) document.getElementById('env-s1-trend').textContent = `${d.scope1Pct}% of total`;
  if (d.scope2Pct != null) document.getElementById('env-s2-trend').textContent = `${d.scope2Pct}% of total`;
  if (d.scope3Pct != null) document.getElementById('env-s3-trend').textContent = `${d.scope3Pct}% of total`;
}

// ── Emissions trend chart (copied from dashboard.js loadTrendChart) ───────────
async function loadEmissionsTrend() {
  const res = await api('GET', '/api/charts/trend');
  if (!res) return;
  const d = await res.json();

  const wrap = document.getElementById('env-trend-wrap');

  // Chart dimensions
  const W = 560, H = 190;
  const padL = 40, padR = 10, padT = 20, padB = 30;
  const iW = W - padL - padR;
  const iH = H - padT - padB;
  const n  = d.labels.length;

  // Stacked totals: scope3 is bottom, scope2 on top, scope1 on top
  const s3 = d.scope3;
  const s2 = d.scope3.map((v, i) => v + d.scope2[i]);
  const s1 = d.scope3.map((v, i) => v + d.scope2[i] + d.scope1[i]);

  const maxVal = Math.max(...s1, 0.1);
  const yMax   = niceMax(maxVal);

  function xPos(i) { return padL + (i / (n - 1)) * iW; }
  function yPos(v) { return padT + (1 - v / yMax) * iH; }
  function pts(arr) { return arr.map((v, i) => `${xPos(i)},${yPos(v)}`).join(' '); }

  function areaPts(topArr, bottomArr) {
    const top = pts(topArr);
    const bot = [...bottomArr].map((v, i) => `${xPos(n - 1 - i)},${yPos(v)}`).join(' ');
    return `${top} ${bot}`;
  }

  const baseline = new Array(n).fill(0);

  // Grid — 4 horizontal lines
  const gridVals = [0, yMax * 0.33, yMax * 0.67, yMax].map(v => Math.round(v));
  let gridLines = '';
  gridVals.forEach(v => {
    const y = yPos(v);
    gridLines += `<line x1="${padL}" y1="${y}" x2="${padL + iW}" y2="${y}" stroke="#e5e2d9" stroke-width="${v === 0 ? 1 : 0.5}" ${v > 0 ? 'stroke-dasharray="4,4"' : ''}/>`;
    gridLines += `<text x="${padL - 5}" y="${y + 4}" fill="#8a8880" font-size="10" text-anchor="end" font-family="DM Mono,monospace">${fmt(v, 1)}</text>`;
  });

  // X-axis labels
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let xLabels = '';
  d.labels.forEach((lbl, i) => {
    const month = parseInt(lbl.slice(5)) - 1;
    xLabels += `<text x="${xPos(i)}" y="${H - 4}" fill="#8a8880" font-size="10" text-anchor="middle" font-family="DM Mono,monospace">${MON[month]}</text>`;
  });

  // Inline legend
  const legX = padL + iW * 0.55;
  const legend = `
    <line x1="${legX}"      y1="12" x2="${legX+18}"      y2="12" stroke="#1a6b4a" stroke-width="2"/>
    <text x="${legX+22}"    y="16" fill="#8a8880" font-size="10" font-family="DM Mono,monospace">Scope 1</text>
    <line x1="${legX+70}"   y1="12" x2="${legX+88}"  y2="12" stroke="#2d5be3" stroke-width="2"/>
    <text x="${legX+92}"    y="16" fill="#8a8880" font-size="10" font-family="DM Mono,monospace">Scope 2</text>
    <line x1="${legX+140}"  y1="12" x2="${legX+158}" y2="12" stroke="#c47d1a" stroke-width="2"/>
    <text x="${legX+162}"   y="16" fill="#8a8880" font-size="10" font-family="DM Mono,monospace">Scope 3</text>
  `;

  const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
    ${gridLines}
    <!-- Scope 3 area (bottom) -->
    <polygon points="${areaPts(s3, baseline)}" fill="#fef3e2" opacity="0.6"/>
    <!-- Scope 2 area -->
    <polygon points="${areaPts(s2, s3)}"       fill="#edf0fd" opacity="0.7"/>
    <!-- Scope 1 area (top) -->
    <polygon points="${areaPts(s1, s2)}"       fill="#e8f5ef" opacity="0.8"/>
    <!-- Scope 3 line -->
    <polyline points="${pts(s3)}" fill="none" stroke="#c47d1a" stroke-width="2" stroke-linejoin="round"/>
    <!-- Scope 2 line -->
    <polyline points="${pts(s2)}" fill="none" stroke="#2d5be3" stroke-width="2" stroke-linejoin="round"/>
    <!-- Scope 1 line (total) -->
    <polyline points="${pts(s1)}" fill="none" stroke="#1a6b4a" stroke-width="2" stroke-linejoin="round"/>
    ${xLabels}
    ${legend}
  </svg>`;

  wrap.innerHTML = svg;

  // Tooltip
  const svgEl   = wrap.querySelector('svg');
  const tooltip = document.getElementById('env-trend-tooltip');

  svgEl.addEventListener('mousemove', (e) => {
    const rect  = svgEl.getBoundingClientRect();
    const scaleX = W / rect.width;
    const mx    = (e.clientX - rect.left) * scaleX;
    const ratio = Math.max(0, Math.min(1, (mx - padL) / iW));
    const idx   = Math.min(n - 1, Math.round(ratio * (n - 1)));

    tooltip.innerHTML =
      `<strong>${d.labels[idx]}</strong><br>` +
      `<span style="color:#1a6b4a">■</span> Scope 1: ${fmt(d.scope1[idx], 2)} t<br>` +
      `<span style="color:#2d5be3">■</span> Scope 2: ${fmt(d.scope2[idx], 2)} t<br>` +
      `<span style="color:#c47d1a">■</span> Scope 3: ${fmt(d.scope3[idx], 2)} t`;
    tooltip.style.display = 'block';
    tooltip.style.left    = `${e.offsetX + 14}px`;
    tooltip.style.top     = `${Math.max(0, e.offsetY - 70)}px`;
  });
  svgEl.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
}

// ── Water metrics ─────────────────────────────────────────────────────────────
async function loadWaterMetrics(period) {
  const res = await api('GET', `/api/water/metrics?period=${period}`);
  if (!res || !res.ok) { showToast('Failed to load water metrics', 'error', 'env-water-toast-container'); return; }
  const data = await res.json();
  waterData    = data;
  waterLoaded  = true;
  waterEditMode = false;
  renderMetricPanels(data.categories, data.period, false, 'env-water-panels', 'env-water-toast-container', '/api/water/metrics');
  updateEditSaveButtons();
}

// ── Waste metrics ─────────────────────────────────────────────────────────────
async function loadWasteMetrics(period) {
  const res = await api('GET', `/api/waste/metrics?period=${period}`);
  if (!res || !res.ok) { showToast('Failed to load waste metrics', 'error', 'env-waste-toast-container'); return; }
  const data = await res.json();
  wasteData    = data;
  wasteLoaded  = true;
  wasteEditMode = false;
  renderMetricPanels(data.categories, data.period, false, 'env-waste-panels', 'env-waste-toast-container', '/api/waste/metrics');
  updateEditSaveButtons();
}

// ── Edit/Save button visibility ───────────────────────────────────────────────
function updateEditSaveButtons() {
  const editBtn = document.getElementById('env-edit-btn');
  const saveBtn = document.getElementById('env-save-btn');

  if (!CAN_EDIT || currentTab === 'emissions') {
    editBtn.style.display = 'none';
    saveBtn.style.display = 'none';
    return;
  }

  const inEditMode = currentTab === 'water' ? waterEditMode : wasteEditMode;
  editBtn.style.display = inEditMode ? 'none' : '';
  saveBtn.style.display = inEditMode ? '' : 'none';
}

// ── Edit button ───────────────────────────────────────────────────────────────
document.getElementById('env-edit-btn').addEventListener('click', () => {
  if (currentTab === 'water' && waterData) {
    waterEditMode = true;
    renderMetricPanels(waterData.categories, waterData.period, true, 'env-water-panels', 'env-water-toast-container', '/api/water/metrics');
  } else if (currentTab === 'waste' && wasteData) {
    wasteEditMode = true;
    renderMetricPanels(wasteData.categories, wasteData.period, true, 'env-waste-panels', 'env-waste-toast-container', '/api/waste/metrics');
  }
  updateEditSaveButtons();
});

// ── Save button ───────────────────────────────────────────────────────────────
document.getElementById('env-save-btn').addEventListener('click', async () => {
  const containerId = currentTab === 'water' ? 'env-water-panels' : 'env-waste-panels';
  const toastId     = currentTab === 'water' ? 'env-water-toast-container' : 'env-waste-toast-container';
  const endpoint    = currentTab === 'water' ? '/api/water/metrics' : '/api/waste/metrics';

  const inputs = document.querySelectorAll(`#${containerId} .sc-input`);
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
    const r = await api('POST', endpoint, payload);
    if (!r || !r.ok) errors++;
  }

  if (errors) {
    showToast(`${errors} metric(s) failed to save`, 'error', toastId);
  } else {
    showToast('Metrics saved', 'success', toastId);
  }

  // Reload the current tab
  if (currentTab === 'water') {
    waterEditMode = false;
    await loadWaterMetrics(currentPeriod);
  } else {
    wasteEditMode = false;
    await loadWasteMetrics(currentPeriod);
  }
});

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll('.env-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.env-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const tab = btn.dataset.tab;
    currentTab = tab;

    document.querySelectorAll('.env-tab-panel').forEach(p => p.style.display = 'none');
    document.getElementById(`env-tab-${tab}`).style.display = '';

    // Load tab data if needed
    if (tab === 'water' && !waterLoaded) {
      loadWaterMetrics(currentPeriod);
    } else if (tab === 'waste' && !wasteLoaded) {
      loadWasteMetrics(currentPeriod);
    }

    updateEditSaveButtons();
  });
});

// ── Period change ─────────────────────────────────────────────────────────────
document.getElementById('period-select').addEventListener('change', e => {
  currentPeriod = e.target.value;
  // Reset loaded flags so data re-fetches on tab visit
  waterLoaded = false;
  wasteLoaded = false;
  waterData   = null;
  wasteData   = null;

  if (currentTab === 'water') {
    loadWaterMetrics(currentPeriod);
  } else if (currentTab === 'waste') {
    loadWasteMetrics(currentPeriod);
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
buildPeriodOptions();
currentPeriod = document.getElementById('period-select').value;
loadEmissionsKPIs();
loadEmissionsTrend();
