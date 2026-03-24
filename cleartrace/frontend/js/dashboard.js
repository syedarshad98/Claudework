/* ─────────────────────────────────────────────────────────────────────────────
   ClearTrace — dashboard.js
   All API calls, chart rendering and form handling for the main dashboard.
   No hardcoded data — everything comes from the authenticated API.
   ───────────────────────────────────────────────────────────────────────────── */

// ── Auth guard ────────────────────────────────────────────────────────────────
const token = localStorage.getItem('ct_token');
if (!token) window.location.replace('/login.html');

const COMPANY = localStorage.getItem('ct_company') || '';
const EMAIL   = localStorage.getItem('ct_email')   || '';

document.getElementById('header-company').textContent  = COMPANY.toUpperCase();
document.getElementById('user-company-name').textContent = COMPANY;
document.getElementById('user-email').textContent        = EMAIL;

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.clear();
  window.location.replace('/login.html');
});

// ── Fetch helper ──────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${token}`,
      ...(opts.headers || {})
    }
  });
  if (res.status === 401) {
    localStorage.clear();
    window.location.replace('/login.html');
    return null;
  }
  return res;
}

// ── Number formatting ─────────────────────────────────────────────────────────
function fmt(n, decimals = 0) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function deltaHtml(delta) {
  if (delta == null) return '<span class="kpi-delta null">vs last month: no data</span>';
  const sign = delta > 0 ? '↑' : '↓';
  const cls  = delta > 0 ? 'up' : 'down';
  return `<span class="kpi-delta ${cls}">${sign} ${Math.abs(delta)}% vs last month</span>`;
}

// ══════════════════════════════════════════════════════════════════════════════
//  KPI + SCORE BANNER
// ══════════════════════════════════════════════════════════════════════════════
async function loadKPI() {
  const res  = await api('/api/kpi');
  if (!res) return;
  const data = await res.json();

  // Score banner
  document.getElementById('score-value').textContent = data.esgScore;
  const ratingEl = document.getElementById('score-rating');
  ratingEl.textContent = data.esgRating;
  ratingEl.className = `score-rating ${data.esgRating}`;

  const labels = { A: 'Excellent', B: 'Good', C: 'Developing', D: 'Getting Started' };
  document.getElementById('score-label').textContent = labels[data.esgRating] || '';
  document.getElementById('score-meta').textContent  =
    `Based on ${data.totalEntries} data ${data.totalEntries === 1 ? 'entry' : 'entries'} · ESG rating ${data.esgRating}`;

  // KPI cards
  document.getElementById('kpi-energy').textContent = fmt(data.energy.value);
  document.getElementById('kpi-energy-delta').outerHTML = deltaHtml(data.energy.delta).replace('class="kpi-delta', 'id="kpi-energy-delta" class="kpi-delta');

  document.getElementById('kpi-fuel').textContent = fmt(data.fuel.value);
  document.getElementById('kpi-fuel-delta').outerHTML = deltaHtml(data.fuel.delta).replace('class="kpi-delta', 'id="kpi-fuel-delta" class="kpi-delta');

  document.getElementById('kpi-water').textContent = fmt(data.water.value);
  document.getElementById('kpi-water-delta').outerHTML = deltaHtml(data.water.delta).replace('class="kpi-delta', 'id="kpi-water-delta" class="kpi-delta');

  document.getElementById('kpi-waste').textContent = fmt(data.waste.value);
  document.getElementById('kpi-waste-delta').outerHTML = deltaHtml(data.waste.delta).replace('class="kpi-delta', 'id="kpi-waste-delta" class="kpi-delta');
}

// ══════════════════════════════════════════════════════════════════════════════
//  TREND LINE CHART (SVG)
// ══════════════════════════════════════════════════════════════════════════════
async function loadTrendChart() {
  const res  = await api('/api/charts/trend');
  if (!res) return;
  const data = await res.json();

  const wrap = document.getElementById('trend-chart-wrap');
  const W = wrap.clientWidth || 580;
  const H = 220;
  const pad = { top: 12, right: 16, bottom: 36, left: 48 };
  const iW  = W - pad.left - pad.right;
  const iH  = H - pad.top  - pad.bottom;

  // Combine all values to get y scale
  const allVals = [...data.scope1, ...data.scope2, ...data.scope3];
  const maxVal  = Math.max(...allVals, 0.1);
  const yStep   = niceStep(maxVal, 4);
  const yMax    = Math.ceil(maxVal / yStep) * yStep;

  function xPos(i) { return pad.left + (i / (data.labels.length - 1)) * iW; }
  function yPos(v) { return pad.top  + (1 - v / yMax) * iH; }

  function polyline(values, color) {
    const pts = values.map((v, i) => `${xPos(i)},${yPos(v)}`).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  }

  function area(values, color) {
    const top    = values.map((v, i) => `${xPos(i)},${yPos(v)}`).join(' ');
    const bottom = `${xPos(values.length - 1)},${yPos(0)} ${xPos(0)},${yPos(0)}`;
    return `<polygon points="${top} ${bottom}" fill="${color}" opacity="0.06"/>`;
  }

  // Y-axis grid lines + labels
  let grid = '';
  for (let v = 0; v <= yMax; v += yStep) {
    const y = yPos(v);
    grid += `<line x1="${pad.left}" y1="${y}" x2="${pad.left + iW}" y2="${y}" stroke="#1e2535" stroke-width="1"/>`;
    grid += `<text x="${pad.left - 6}" y="${y + 4}" fill="#5a6680" font-size="10" text-anchor="end" font-family="DM Mono,monospace">${fmt(v, 1)}</text>`;
  }

  // X-axis labels — show every 2nd month
  let xLabels = '';
  data.labels.forEach((lbl, i) => {
    if (i % 2 !== 0 && i !== data.labels.length - 1) return;
    const short = lbl.slice(5) + '/' + lbl.slice(2, 4);
    xLabels += `<text x="${xPos(i)}" y="${H - 6}" fill="#5a6680" font-size="10" text-anchor="middle" font-family="DM Mono,monospace">${short}</text>`;
  });

  // Dot highlights (last data point)
  function dot(values, color) {
    const i = values.length - 1;
    const v = values[i];
    return `<circle cx="${xPos(i)}" cy="${yPos(v)}" r="4" fill="${color}" stroke="#0a0c10" stroke-width="2"/>`;
  }

  const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    ${grid}
    ${area(data.scope1, '#f59e0b')}
    ${area(data.scope2, '#38bdf8')}
    ${area(data.scope3, '#a78bfa')}
    ${polyline(data.scope1, '#f59e0b')}
    ${polyline(data.scope2, '#38bdf8')}
    ${polyline(data.scope3, '#a78bfa')}
    ${dot(data.scope1, '#f59e0b')}
    ${dot(data.scope2, '#38bdf8')}
    ${dot(data.scope3, '#a78bfa')}
    ${xLabels}
  </svg>`;

  wrap.innerHTML = svg;

  // Tooltip on SVG mousemove
  const svgEl   = wrap.querySelector('svg');
  const tooltip = document.getElementById('trend-tooltip');
  svgEl.addEventListener('mousemove', (e) => {
    const rect  = svgEl.getBoundingClientRect();
    const mx    = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, (mx - pad.left) / iW));
    const idx   = Math.round(ratio * (data.labels.length - 1));
    const lbl   = data.labels[idx];

    tooltip.innerHTML =
      `<strong>${lbl}</strong><br>
       <span style="color:#f59e0b">■</span> Scope 1: ${fmt(data.scope1[idx], 2)} t<br>
       <span style="color:#38bdf8">■</span> Scope 2: ${fmt(data.scope2[idx], 2)} t<br>
       <span style="color:#a78bfa">■</span> Scope 3: ${fmt(data.scope3[idx], 2)} t`;
    tooltip.style.display = 'block';
    tooltip.style.left    = `${e.offsetX + 12}px`;
    tooltip.style.top     = `${e.offsetY - 10}px`;
  });
  svgEl.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
}

function niceStep(max, targetSteps) {
  const raw  = max / targetSteps;
  const mag  = Math.pow(10, Math.floor(Math.log10(raw)));
  const nice = [1, 2, 2.5, 5, 10].map(n => n * mag);
  return nice.find(n => n >= raw) || raw;
}

// ══════════════════════════════════════════════════════════════════════════════
//  DONUT CHART (SVG)
// ══════════════════════════════════════════════════════════════════════════════
async function loadDonutChart() {
  const res  = await api('/api/charts/breakdown');
  if (!res) return;
  const d = await res.json();

  document.getElementById('donut-total').textContent = fmt(d.total, 1);
  document.getElementById('leg-s1').textContent = `${fmt(d.scope1, 1)} t (${d.scope1Pct}%)`;
  document.getElementById('leg-s2').textContent = `${fmt(d.scope2, 1)} t (${d.scope2Pct}%)`;
  document.getElementById('leg-s3').textContent = `${fmt(d.scope3, 1)} t (${d.scope3Pct}%)`;

  const svg    = document.getElementById('donut-svg');
  const cx = 90, cy = 90, R = 72, r = 48;
  const colors = ['#f59e0b', '#38bdf8', '#a78bfa'];
  const values = [d.scope1Pct, d.scope2Pct, d.scope3Pct];

  if (d.total === 0) {
    svg.innerHTML = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#1e2535" stroke-width="${R - r}"/>`;
    return;
  }

  let paths  = '';
  let angle  = -90;  // start at top

  values.forEach((pct, i) => {
    if (pct === 0) return;
    const sweep = pct / 100 * 360;
    const start = angle;
    const end   = angle + sweep;

    const x1 = cx + R * Math.cos(start * Math.PI / 180);
    const y1 = cy + R * Math.sin(start * Math.PI / 180);
    const x2 = cx + R * Math.cos(end   * Math.PI / 180);
    const y2 = cy + R * Math.sin(end   * Math.PI / 180);
    const ix1 = cx + r * Math.cos(end   * Math.PI / 180);
    const iy1 = cy + r * Math.sin(end   * Math.PI / 180);
    const ix2 = cx + r * Math.cos(start * Math.PI / 180);
    const iy2 = cy + r * Math.sin(start * Math.PI / 180);

    const large = sweep > 180 ? 1 : 0;

    paths += `<path d="M${x1},${y1} A${R},${R} 0 ${large},1 ${x2},${y2} L${ix1},${iy1} A${r},${r} 0 ${large},0 ${ix2},${iy2} Z"
                    fill="${colors[i]}" opacity="0.85"/>`;
    angle = end;
  });

  // Inner ring background
  svg.innerHTML = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#151a22" stroke-width="${R - r + 2}"/>
    ${paths}
    <circle cx="${cx}" cy="${cy}" r="${r - 2}" fill="#0f1218"/>`;
}

// ══════════════════════════════════════════════════════════════════════════════
//  RECENT ENTRIES TABLE
// ══════════════════════════════════════════════════════════════════════════════
async function loadEntries() {
  const res  = await api('/api/emissions?page=1&limit=20');
  if (!res) return;
  const data = await res.json();

  const tag   = document.getElementById('entries-count-tag');
  const tbody = document.getElementById('entries-tbody');

  tag.textContent = `${data.total} total`;

  if (!data.entries.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No entries yet — add your first one above.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.entries.map(e => `
    <tr data-id="${e.id}">
      <td>${e.category}</td>
      <td><span class="scope-badge s${e.scope}">${e.scope}</span></td>
      <td>${fmt(e.amount, 2)}</td>
      <td style="font-family:var(--font-mono);font-size:12px">${e.unit}</td>
      <td style="font-family:var(--font-mono)">${fmt(e.co2e_tonnes, 4)}</td>
      <td style="font-family:var(--font-mono)">${e.period}</td>
      <td><span class="tag ${e.source === 'manual' ? 'tag-green' : 'tag-blue'}">${e.source}</span></td>
      <td><button class="del-btn" data-id="${e.id}">✕</button></td>
    </tr>
  `).join('');

  // Delete handlers
  tbody.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this entry?')) return;
      const id  = btn.dataset.id;
      const res = await api(`/api/emissions/${id}`, { method: 'DELETE' });
      if (res && res.ok) refreshAll();
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  FRAMEWORKS
// ══════════════════════════════════════════════════════════════════════════════
const FW_NAMES = {
  GRI:   'Global Reporting Initiative',
  TCFD:  'Task Force on Climate Disclosures',
  SASB:  'Sustainability Accounting Standards',
  LOCAL: 'Local Regulations'
};

async function loadFrameworks() {
  const res  = await api('/api/frameworks');
  if (!res) return;
  const rows = await res.json();

  const grid = document.getElementById('frameworks-grid');

  const tagMap = {
    aligned:     { cls: 'tag-green', label: 'Aligned' },
    partial:     { cls: 'tag-amber', label: 'Partial' },
    not_started: { cls: 'tag-red',   label: 'Not Started' }
  };

  grid.innerHTML = rows.map(fw => {
    const t = tagMap[fw.status] || tagMap['not_started'];
    return `
      <div class="fw-card">
        <div class="fw-header">
          <div class="fw-name">${fw.framework}</div>
          <div class="fw-status-dot ${fw.status}"></div>
        </div>
        <div class="fw-full-name">${FW_NAMES[fw.framework] || ''}</div>
        <div class="fw-details">${fw.details || 'No details recorded yet.'}</div>
        <span class="tag ${t.cls} fw-tag">${t.label}</span>
      </div>
    `;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
//  MANUAL ENTRY FORM
// ══════════════════════════════════════════════════════════════════════════════

// Pre-fill period with current month
const now = new Date();
document.getElementById('f-period').value =
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

// Auto-select scope when category changes
const categoryScopes = {
  'Natural Gas': 1, 'Diesel Generator': 1, 'Company Vehicles': 1,
  'Refrigerants': 1, 'Other Scope 1': 1,
  'Grid Electricity': 2, 'District Heating': 2,
  'Business Travel': 3, 'Employee Commuting': 3, 'Waste': 3,
  'Water Usage': 3, 'Purchased Goods': 3, 'Upstream Transport': 3, 'Other Scope 3': 3
};
document.getElementById('f-category').addEventListener('change', (e) => {
  const scope = categoryScopes[e.target.value];
  if (scope) document.getElementById('f-scope').value = String(scope);
});

document.getElementById('entry-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const successEl = document.getElementById('entry-success');
  const errorEl   = document.getElementById('entry-error');
  successEl.classList.remove('visible');
  errorEl.classList.remove('visible');

  const btn = document.getElementById('entry-submit-btn');
  btn.textContent = 'Saving…';
  btn.disabled    = true;

  const body = {
    category:        document.getElementById('f-category').value,
    scope:           parseInt(document.getElementById('f-scope').value),
    amount:          parseFloat(document.getElementById('f-amount').value),
    unit:            document.getElementById('f-unit').value,
    period:          document.getElementById('f-period').value,
    emission_factor: parseFloat(document.getElementById('f-ef').value) || 1.0,
    notes:           document.getElementById('f-notes').value.trim() || null
  };

  try {
    const res  = await api('/api/emissions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body)
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Failed to save entry';
      errorEl.classList.add('visible');
    } else {
      successEl.classList.add('visible');
      e.target.reset();
      document.getElementById('f-period').value =
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      document.getElementById('f-ef').value = '1.0';
      setTimeout(() => successEl.classList.remove('visible'), 4000);
      refreshAll();
    }
  } catch {
    errorEl.textContent = 'Network error — please try again';
    errorEl.classList.add('visible');
  } finally {
    btn.textContent = 'Save Entry';
    btn.disabled    = false;
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  SPREADSHEET UPLOAD
// ══════════════════════════════════════════════════════════════════════════════
const uploadZone   = document.getElementById('upload-zone');
const uploadInput  = document.getElementById('upload-input');
const uploadResult = document.getElementById('upload-result');

uploadZone.addEventListener('click', () => uploadInput.click());
uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', ()  => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) uploadFile(file);
});

uploadInput.addEventListener('change', () => {
  if (uploadInput.files[0]) uploadFile(uploadInput.files[0]);
});

async function uploadFile(file) {
  uploadResult.className = 'upload-result';
  uploadResult.style.display = 'none';

  const zone = document.getElementById('upload-zone');
  zone.querySelector('.upload-title').textContent = 'Uploading…';

  const form = new FormData();
  form.append('file', file);

  try {
    const res  = await api('/api/upload', { method: 'POST', body: form });
    const data = await res.json();

    if (!res.ok) {
      uploadResult.className   = 'upload-result error';
      uploadResult.textContent = data.error || 'Upload failed';
    } else {
      let msg = `✓ Imported ${data.imported} of ${data.total} rows from ${file.name}`;
      if (data.errors && data.errors.length) {
        msg += `\n${data.errors.slice(0, 5).join('\n')}`;
        if (data.errors.length > 5) msg += `\n…and ${data.errors.length - 5} more`;
      }
      uploadResult.className   = 'upload-result success';
      uploadResult.textContent = msg;
      refreshAll();
    }
  } catch {
    uploadResult.className   = 'upload-result error';
    uploadResult.textContent = 'Network error — upload failed';
  } finally {
    uploadResult.style.display = '';
    zone.querySelector('.upload-title').textContent = 'Drop your file here';
    uploadInput.value = '';
  }
}

// Download template CSV
document.getElementById('download-template').addEventListener('click', () => {
  const csv = 'category,scope,amount,unit,period,emission_factor,notes\n' +
              'Grid Electricity,2,45000,kWh,2026-01,0.233,Main office meter\n' +
              'Natural Gas,1,4200,m³,2026-01,2.204,\n' +
              'Waste,3,2400,kg,2026-01,0.587,General waste\n';
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'cleartrace-template.csv';
  a.click();
  URL.revokeObjectURL(url);
});

// ══════════════════════════════════════════════════════════════════════════════
//  INIT + REFRESH
// ══════════════════════════════════════════════════════════════════════════════
async function refreshAll() {
  await Promise.all([
    loadKPI(),
    loadTrendChart(),
    loadDonutChart(),
    loadEntries(),
    loadFrameworks()
  ]);
}

refreshAll();
