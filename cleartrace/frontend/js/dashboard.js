/* ─────────────────────────────────────────────────────────────────────────────
   ClearTrace — dashboard.js
   Real API calls only — no hardcoded data.
   Chart rendering matches the prototype SVG structure exactly.
   ───────────────────────────────────────────────────────────────────────────── */

// ── Auth guard ────────────────────────────────────────────────────────────────
const token   = localStorage.getItem('ct_token');
if (!token) window.location.replace('/login.html');

const COMPANY = localStorage.getItem('ct_company') || '';
const EMAIL   = localStorage.getItem('ct_email')   || '';

// Populate sidebar
const initials = COMPANY.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '—';
document.getElementById('company-avatar').textContent   = initials;
document.getElementById('sidebar-company').textContent  = COMPANY;
document.getElementById('page-sub').textContent =
  `Reporting period: ${new Date().getFullYear()} · ${EMAIL}`;

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.clear();
  window.location.replace('/login.html');
});

// ── Nav item click (visual only — single-page for now) ────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');
  });
});

// ── Add Data button scrolls to form ──────────────────────────────────────────
document.getElementById('add-data-btn').addEventListener('click', () => {
  document.getElementById('entry-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
});

// ── API helper ────────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Authorization': `Bearer ${token}`, ...(opts.headers || {}) }
  });
  if (res.status === 401) {
    localStorage.clear();
    window.location.replace('/login.html');
    return null;
  }
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

function trendHtml(delta, id) {
  if (delta == null) return `<div class="kpi-trend trend-none" id="${id}">no prior data</div>`;
  if (delta < 0)     return `<div class="kpi-trend trend-good" id="${id}">↓ ${Math.abs(delta)}%</div>`;
  if (delta > 0)     return `<div class="kpi-trend trend-bad"  id="${id}">↑ ${delta}%</div>`;
  return `<div class="kpi-trend trend-none" id="${id}">0% change</div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
//  KPI + SCORE BANNER
// ══════════════════════════════════════════════════════════════════════════════
async function loadKPI() {
  const res = await api('/api/kpi');
  if (!res) return;
  const d = await res.json();

  // Score ring arc: circumference of r=30 circle = 188.5
  const arcLen = (d.esgScore / 100) * 188.5;
  document.getElementById('score-arc').setAttribute('stroke-dasharray', `${arcLen} 188.5`);
  document.getElementById('score-val').textContent = d.esgScore;

  const ratings = { A: 'Excellent standing', B: 'Good standing', C: 'Developing', D: 'Getting started' };
  document.getElementById('score-desc').textContent =
    `${ratings[d.esgRating] || ''} · ESG rating ${d.esgRating}`;

  document.getElementById('stat-entries').textContent = d.totalEntries;
  document.getElementById('stat-framework').innerHTML =
    d.esgScore >= 60 ? '<span class="score-stat-val green">GRI ready</span>' :
                       '<span class="score-stat-val warn">In progress</span>';

  // KPI cards
  document.getElementById('kpi-energy').innerHTML = `${fmt(d.energy.value)} <span class="kpi-unit">kWh</span>`;
  document.getElementById('kpi-fuel').innerHTML   = `${fmt(d.fuel.value)}   <span class="kpi-unit">litres</span>`;
  document.getElementById('kpi-water').innerHTML  = `${fmt(d.water.value)}  <span class="kpi-unit">m³</span>`;
  document.getElementById('kpi-waste').innerHTML  = `${fmt(d.waste.value)}  <span class="kpi-unit">kg</span>`;

  document.getElementById('kpi-energy-trend').outerHTML = trendHtml(d.energy.delta, 'kpi-energy-trend');
  document.getElementById('kpi-fuel-trend').outerHTML   = trendHtml(d.fuel.delta,   'kpi-fuel-trend');
  document.getElementById('kpi-water-trend').outerHTML  = trendHtml(d.water.delta,  'kpi-water-trend');
  document.getElementById('kpi-waste-trend').outerHTML  = trendHtml(d.waste.delta,  'kpi-waste-trend');
}

// ══════════════════════════════════════════════════════════════════════════════
//  STACKED AREA TREND CHART  (matches prototype SVG structure)
// ══════════════════════════════════════════════════════════════════════════════
async function loadTrendChart() {
  const res = await api('/api/charts/trend');
  if (!res) return;
  const d = await res.json();

  const wrap = document.getElementById('trend-chart-wrap');

  // Chart dimensions — match prototype proportions
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

  // Areas: each band is top-line + reversed bottom-line
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

  // X-axis labels (month abbreviations)
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let xLabels = '';
  d.labels.forEach((lbl, i) => {
    const month = parseInt(lbl.slice(5)) - 1;
    xLabels += `<text x="${xPos(i)}" y="${H - 4}" fill="#8a8880" font-size="10" text-anchor="middle" font-family="DM Mono,monospace">${MON[month]}</text>`;
  });

  // Inline legend (top-right, matching prototype)
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
  const tooltip = document.getElementById('trend-tooltip');

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

function niceMax(v) {
  const mag  = Math.pow(10, Math.floor(Math.log10(v)));
  const nice = [1, 2, 2.5, 5, 10].map(n => n * mag);
  const step = nice.find(n => n >= v / 3) || mag;
  return Math.ceil(v / step) * step;
}

// ══════════════════════════════════════════════════════════════════════════════
//  DONUT CHART  (stroke-dasharray on concentric circles, matching prototype)
// ══════════════════════════════════════════════════════════════════════════════
async function loadDonutChart() {
  const res = await api('/api/charts/breakdown');
  if (!res) return;
  const d = await res.json();

  document.getElementById('donut-total').textContent = fmt(d.total, 1);
  document.getElementById('leg-s1').textContent = `${fmt(d.scope1, 1)} t · ${d.scope1Pct}%`;
  document.getElementById('leg-s2').textContent = `${fmt(d.scope2, 1)} t · ${d.scope2Pct}%`;
  document.getElementById('leg-s3').textContent = `${fmt(d.scope3, 1)} t · ${d.scope3Pct}%`;

  // Circumference of r=58: 2π×58 ≈ 364.4
  const C   = 2 * Math.PI * 58;
  const svg = document.getElementById('donut-svg');

  if (d.total === 0) {
    svg.innerHTML = `<circle cx="80" cy="80" r="58" fill="none" stroke="#f4f3ee" stroke-width="20"/>`;
    return;
  }

  const s1Len = d.scope1Pct / 100 * C;
  const s2Len = d.scope2Pct / 100 * C;
  const s3Len = d.scope3Pct / 100 * C;

  // Each circle starts (offset) where the previous ended
  // stroke-dashoffset is negative to advance the start position
  const s2Offset = -(s1Len);
  const s3Offset = -(s1Len + s2Len);

  svg.innerHTML = `
    <circle cx="80" cy="80" r="58" fill="none" stroke="#f4f3ee" stroke-width="20"/>
    <circle cx="80" cy="80" r="58" fill="none" stroke="#1a6b4a" stroke-width="20"
      stroke-dasharray="${s1Len} ${C - s1Len}"
      stroke-dashoffset="0"
      transform="rotate(-90 80 80)"/>
    <circle cx="80" cy="80" r="58" fill="none" stroke="#2d5be3" stroke-width="20"
      stroke-dasharray="${s2Len} ${C - s2Len}"
      stroke-dashoffset="${s2Offset}"
      transform="rotate(-90 80 80)"/>
    <circle cx="80" cy="80" r="58" fill="none" stroke="#c47d1a" stroke-width="20"
      stroke-dasharray="${s3Len} ${C - s3Len}"
      stroke-dashoffset="${s3Offset}"
      transform="rotate(-90 80 80)"/>
  `;
}

// ══════════════════════════════════════════════════════════════════════════════
//  FRAMEWORK ALIGNMENT
// ══════════════════════════════════════════════════════════════════════════════
const FW_FULL = {
  GRI:   'Global Reporting Initiative',
  TCFD:  'Climate Financial Disclosure',
  SASB:  'Sustainability Accounting',
  LOCAL: 'Jurisdiction compliance'
};

async function loadFrameworks() {
  const res = await api('/api/frameworks');
  if (!res) return;
  const rows = await res.json();

  const grid = document.getElementById('framework-grid');
  grid.innerHTML = rows.map(fw => {
    const isActive  = fw.status === 'aligned';
    const cls       = isActive ? 'framework-item active' : 'framework-item';
    const statusCls = fw.status === 'aligned' ? 'status-ready'
                    : fw.status === 'partial'  ? 'status-partial' : 'status-pending';
    const statusTxt = fw.status === 'aligned'     ? '✓ Ready to report'
                    : fw.status === 'partial'      ? `⚠ ${fw.details || 'In progress'}`
                    : '— Not started';

    return `<div class="${cls}" data-fw="${fw.framework}">
      <div class="framework-name">${fw.framework === 'LOCAL' ? 'Local Regs' : fw.framework}</div>
      <div class="framework-desc">${FW_FULL[fw.framework] || ''}</div>
      <div class="framework-status ${statusCls}">${statusTxt}</div>
    </div>`;
  }).join('');

  // Click to toggle active highlight (visual only)
  grid.querySelectorAll('.framework-item').forEach(item => {
    item.addEventListener('click', () => {
      grid.querySelectorAll('.framework-item').forEach(x => x.classList.remove('active'));
      item.classList.add('active');
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  RECENT ENTRIES TABLE
// ══════════════════════════════════════════════════════════════════════════════
async function loadEntries() {
  const res = await api('/api/emissions?page=1&limit=20');
  if (!res) return;
  const data = await res.json();

  document.getElementById('entries-count-tag').textContent = `${data.total} total`;

  const tbody = document.getElementById('entries-tbody');
  if (!data.entries.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No entries yet — add your first one above.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.entries.map(e => `
    <tr>
      <td>${e.category}</td>
      <td><span class="scope-badge s${e.scope}">Scope ${e.scope}</span></td>
      <td style="font-family:var(--font-mono)">${fmt(parseFloat(e.amount), 2)}</td>
      <td style="font-family:var(--font-mono);color:var(--muted)">${e.unit}</td>
      <td style="font-family:var(--font-mono)">${fmt(parseFloat(e.co2e_tonnes), 4)}</td>
      <td style="font-family:var(--font-mono)">${e.period}</td>
      <td><span class="source-badge source-${e.source}">${e.source}</span></td>
      <td><button class="del-btn" data-id="${e.id}">✕</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this entry?')) return;
      const r = await api(`/api/emissions/${btn.dataset.id}`, { method: 'DELETE' });
      if (r && r.ok) refreshAll();
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  ALL-TIME CO₂e TOTAL FOR BANNER
// ══════════════════════════════════════════════════════════════════════════════
async function loadBannerStats() {
  const res = await api('/api/charts/breakdown');
  if (!res) return;
  const d = await res.json();
  document.getElementById('stat-total').textContent = fmt(d.total, 0) + ' tCO₂e';
  document.getElementById('stat-yoy').textContent   = d.total > 0 ? 'Active' : 'No data';
}

// ══════════════════════════════════════════════════════════════════════════════
//  MANUAL ENTRY FORM
// ══════════════════════════════════════════════════════════════════════════════

// Pre-fill current month
const now = new Date();
document.getElementById('f-period').value =
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

// Auto-select scope from category
const CAT_SCOPE = {
  'Natural Gas': 1, 'Diesel Generator': 1, 'Company Vehicles': 1,
  'Refrigerants': 1, 'Other Scope 1': 1,
  'Grid Electricity': 2, 'District Heating': 2,
  'Business Travel': 3, 'Employee Commuting': 3, 'Waste': 3,
  'Water Usage': 3, 'Purchased Goods': 3, 'Upstream Transport': 3, 'Other Scope 3': 3
};
document.getElementById('f-category').addEventListener('change', (e) => {
  const s = CAT_SCOPE[e.target.value];
  if (s) document.getElementById('f-scope').value = String(s);
});

document.getElementById('entry-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fb  = document.getElementById('entry-feedback');
  const btn = document.getElementById('entry-submit-btn');
  fb.className = 'form-feedback';

  btn.textContent = 'Saving…';
  btn.disabled    = true;

  try {
    const res  = await api('/api/emissions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category:        document.getElementById('f-category').value,
        scope:           parseInt(document.getElementById('f-scope').value),
        amount:          parseFloat(document.getElementById('f-amount').value),
        unit:            document.getElementById('f-unit').value,
        period:          document.getElementById('f-period').value,
        emission_factor: parseFloat(document.getElementById('f-ef').value) || 1.0
      })
    });
    const data = await res.json();

    if (!res.ok) {
      fb.textContent = data.error || 'Failed to save';
      fb.className   = 'form-feedback error';
    } else {
      fb.textContent = `✓ Entry saved — ${fmt(parseFloat(data.co2e_tonnes), 4)} tCO₂e calculated.`;
      fb.className   = 'form-feedback success';
      e.target.reset();
      document.getElementById('f-period').value =
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      document.getElementById('f-ef').value = '1.0';
      setTimeout(() => { fb.className = 'form-feedback'; }, 5000);
      refreshAll();
    }
  } catch {
    fb.textContent = 'Network error — please try again';
    fb.className   = 'form-feedback error';
  } finally {
    btn.textContent = 'Calculate & Save Entry';
    btn.disabled    = false;
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  FORM TABS (Manual / Upload)
// ══════════════════════════════════════════════════════════════════════════════
document.querySelectorAll('.form-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.form-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-manual').style.display    = tab.dataset.tab === 'manual'     ? '' : 'none';
    document.getElementById('panel-upload-tab').style.display = tab.dataset.tab === 'upload-tab' ? '' : 'none';
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  UPLOAD (both zones)
// ══════════════════════════════════════════════════════════════════════════════
function wireUploadZone(zoneId, inputId, resultId, titleId) {
  const zone   = document.getElementById(zoneId);
  const input  = document.getElementById(inputId);
  const result = document.getElementById(resultId);
  const title  = titleId ? document.getElementById(titleId) : zone.querySelector('.upload-title');

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) doUpload(e.dataTransfer.files[0], result, title);
  });
  input.addEventListener('change', () => {
    if (input.files[0]) doUpload(input.files[0], result, title);
  });
}

async function doUpload(file, resultEl, titleEl) {
  resultEl.className = 'upload-result';
  titleEl.textContent = 'Uploading…';

  const form = new FormData();
  form.append('file', file);

  try {
    const res  = await api('/api/upload', { method: 'POST', body: form });
    const data = await res.json();

    if (!res.ok) {
      resultEl.textContent = data.error || 'Upload failed';
      resultEl.className   = 'upload-result error';
    } else {
      let msg = `✓ Imported ${data.imported} of ${data.total} rows from ${file.name}`;
      if (data.errors && data.errors.length) {
        msg += '\n' + data.errors.slice(0, 3).join('\n');
        if (data.errors.length > 3) msg += `\n…and ${data.errors.length - 3} more`;
      }
      resultEl.textContent = msg;
      resultEl.className   = 'upload-result success';
      refreshAll();
    }
  } catch {
    resultEl.textContent = 'Network error — upload failed';
    resultEl.className   = 'upload-result error';
  } finally {
    titleEl.textContent = 'Drop your file here';
  }
}

wireUploadZone('upload-zone',        'upload-input',        'upload-result',        'upload-zone-title');
wireUploadZone('upload-zone-inline', 'upload-input-inline', 'upload-result-inline', null);

// Template download
function downloadTemplate() {
  const csv = 'category,scope,amount,unit,period,emission_factor,notes\n' +
              'Grid Electricity,2,45000,kWh,2026-01,0.233,Main office meter\n' +
              'Natural Gas,1,4200,m³,2026-01,2.204,\n' +
              'Waste,3,2400,kg,2026-01,0.587,General waste\n';
  const a   = Object.assign(document.createElement('a'), {
    href:     URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: 'cleartrace-template.csv'
  });
  a.click();
}
document.getElementById('download-template').addEventListener('click', downloadTemplate);
document.getElementById('download-template-2').addEventListener('click', downloadTemplate);

// ══════════════════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════════════════
async function refreshAll() {
  await Promise.all([
    loadKPI(),
    loadTrendChart(),
    loadDonutChart(),
    loadBannerStats(),
    loadEntries(),
    loadFrameworks()
  ]);
}

refreshAll();
