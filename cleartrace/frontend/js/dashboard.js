/* ─────────────────────────────────────────────────────────────────────────────
   ClearTrace — dashboard.js
   Real API calls only — no hardcoded data.
   Chart rendering matches the prototype SVG structure exactly.
   ───────────────────────────────────────────────────────────────────────────── */

// ── Auth guard ────────────────────────────────────────────────────────────────
const token   = localStorage.getItem('ct_token');
if (!token) window.location.replace('/login.html');

// Redirect to onboarding if not yet complete
if (localStorage.getItem('ct_onboarding') !== 'complete') {
  window.location.replace('/onboarding.html');
}

const COMPANY = localStorage.getItem('ct_company') || '';
const EMAIL   = localStorage.getItem('ct_email')   || '';
const ROLE    = localStorage.getItem('ct_role')    || 'viewer';


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

// ── Frontend role enforcement (UX only — backend is the security layer) ───────
(function applyRoleRestrictions() {
  if (ROLE === 'viewer') {
    // Viewers: hide data entry controls, upload zone, export PDF button
    const hide = ['add-data-btn', 'export-btn', 'entry-submit-btn',
                  'entry-form', 'panel-upload-tab'];
    hide.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    // Hide the tab bar that shows Manual Entry / Upload File
    document.querySelectorAll('.form-tab').forEach(el => { el.style.display = 'none'; });
    // Hide upload zones
    document.querySelectorAll('.upload-zone').forEach(el => { el.style.display = 'none'; });
  }
})();

// ── Nav item click ────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    if (item.dataset.href && item.dataset.href !== '/') {
      window.location.href = item.dataset.href;
      return;
    }
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

  const breakdown = document.getElementById('score-breakdown');
  if (breakdown && (d.eBreakdown !== undefined || d.sBreakdown !== undefined || d.gBreakdown !== undefined)) {
    const e = d.eBreakdown ?? 0;
    const s = d.sBreakdown ?? 0;
    const g = d.gBreakdown ?? 0;
    breakdown.innerHTML =
      `<span class="score-breakdown-e">E&nbsp;${e}</span>` +
      `<span class="score-breakdown-sep"> · </span>` +
      `<span class="score-breakdown-s">S&nbsp;${s}</span>` +
      `<span class="score-breakdown-sep"> · </span>` +
      `<span class="score-breakdown-g">G&nbsp;${g}</span>`;
    breakdown.style.display = '';
  }

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
//  ONBOARDING — PERSONALISED DATA
//  Fetches company setup (targets, baseline, financial year) and enriches
//  the dashboard header and score banner with it.
// ══════════════════════════════════════════════════════════════════════════════
async function loadOnboardingData() {
  const res = await api('/api/onboarding/status');
  if (!res || !res.ok) return;
  const d = await res.json();

  // ── Jurisdiction — drives CEA vs DEFRA default in the entry form ────────
  if (d.profile?.jurisdiction) companyJurisdiction = d.profile.jurisdiction;

  // ── Financial year label in topbar ───────────────────────────────────────
  const fyStart = d.reporting?.financialYearStart || 1;
  const months  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const startLbl = months[fyStart - 1];
  const yr       = new Date().getFullYear();
  const endMon   = months[((fyStart - 2 + 12) % 12)];
  const endYr    = fyStart === 1 ? yr : (fyStart <= new Date().getMonth() + 1 ? yr : yr - 1);
  document.getElementById('page-sub').textContent =
    `FY ${startLbl} ${endYr}–${endMon} ${endYr + 1} · ${EMAIL}`;

  // ── Employee count in sidebar footer ────────────────────────────────────
  if (d.profile?.employeeCount) {
    const planEl = document.querySelector('.company-plan');
    if (planEl) planEl.textContent = `${d.profile.employeeCount.toLocaleString()} employees`;
  }

  // ── Industry label ───────────────────────────────────────────────────────
  if (d.profile?.industry) {
    const planEl = document.querySelector('.company-plan');
    if (planEl && !d.profile.employeeCount) planEl.textContent = d.profile.industry;
  }

  // ── Target banner row ────────────────────────────────────────────────────
  const targetBanner = document.getElementById('target-banner');
  if (!targetBanner) return;

  const tgt = d.targets;
  if (tgt?.reductionTargetPct && tgt?.targetYear) {
    // Compute progress: total current CO2e vs baseline total
    const baselineTotal = d.baseline.reduce((s, b) => s + parseFloat(b.co2e_tonnes || 0), 0);

    let progressHtml = '';
    if (baselineTotal > 0) {
      const breakdownRes = await api('/api/charts/breakdown');
      const bd = breakdownRes ? await breakdownRes.json() : null;
      if (bd) {
        const currentTotal = parseFloat(bd.total) || 0;
        const targetTotal  = baselineTotal * (1 - tgt.reductionTargetPct / 100);
        const pct          = Math.min(100, Math.max(0, Math.round(
          ((baselineTotal - currentTotal) / (baselineTotal - targetTotal)) * 100
        )));
        progressHtml = `
          <div class="target-progress-wrap">
            <div class="target-progress-track">
              <div class="target-progress-fill" style="width:${pct}%"></div>
            </div>
            <span class="target-progress-pct">${pct}%</span>
          </div>`;
      }
    }

    const std = tgt.alignmentStandard ? ` · ${tgt.alignmentStandard}` : '';
    targetBanner.innerHTML = `
      <div class="target-banner-label">🎯 Target: −${tgt.reductionTargetPct}% by ${tgt.targetYear}${std}</div>
      ${progressHtml}
    `;
    targetBanner.style.display = 'flex';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  MANUAL ENTRY FORM
// ══════════════════════════════════════════════════════════════════════════════

// Pre-fill current month
const now = new Date();
document.getElementById('f-period').value =
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

// Company jurisdiction resolved from /api/onboarding/status — drives CEA vs DEFRA default.
let companyJurisdiction = 'UK';

// ── Emission factors ───────────────────────────────────────────────────────
// Mirrors cleartrace/backend/db/emission_factors.js — keep in sync.
// factor = kg CO₂e per unit. custom:true means no standard factor — user supplies.
const DEFRA_FACTORS = {
  // Scope 1
  'Natural Gas':                         { factor: 2.02263, unit: 'm³',    scope: 1 },
  'Diesel (Stationary)':                 { factor: 2.51920, unit: 'litres',scope: 1 },
  'Petrol (Stationary)':                 { factor: 2.16280, unit: 'litres',scope: 1 },
  'LPG':                                 { factor: 1.55400, unit: 'litres',scope: 1 },
  'Company Car (Diesel)':                { factor: 0.17123, unit: 'km',    scope: 1 },
  'Company Car (Petrol)':                { factor: 0.18110, unit: 'km',    scope: 1 },
  'Company Car (Average)':               { factor: 0.17068, unit: 'km',    scope: 1 },
  'Refrigerants (R-134a)':               { factor: 1430.00, unit: 'kg',    scope: 1 },
  'Refrigerants (R-410A)':              { factor: 2088.00, unit: 'kg',    scope: 1 },
  // Scope 2
  'Grid Electricity (UK)':               { factor: 0.20493, unit: 'kWh',   scope: 2 },
  'District Heating':                    { factor: 0.18400, unit: 'kWh',   scope: 2 },
  // Scope 3
  'Business Travel (Car)':               { factor: 0.17068, unit: 'km',    scope: 3 },
  'Business Travel (Rail)':              { factor: 0.00604, unit: 'km',    scope: 3 },
  'Business Travel (Short-haul Flight)': { factor: 0.15477, unit: 'km',    scope: 3 },
  'Business Travel (Long-haul Flight)':  { factor: 0.19304, unit: 'km',    scope: 3 },
  'Employee Commuting (Car)':            { factor: 0.17068, unit: 'km',    scope: 3 },
  'Employee Commuting (Rail)':           { factor: 0.00604, unit: 'km',    scope: 3 },
  'Waste (Landfill)':                    { factor: 0.58700, unit: 'kg',    scope: 3 },
  'Waste (Recycled)':                    { factor: 0.02100, unit: 'kg',    scope: 3 },
  'Waste (Composted)':                   { factor: 0.01100, unit: 'kg',    scope: 3 },
  'Water Supply':                        { factor: 0.14900, unit: 'm³',    scope: 3 },
  'Water Treatment':                     { factor: 0.27200, unit: 'm³',    scope: 3 },
  'Purchased Goods':                     { factor: null,    unit: 'kg',    scope: 3, custom: true },
  'Upstream Transport':                  { factor: null,    unit: 'km',    scope: 3, custom: true },
  'Other Scope 3':                       { factor: null,    unit: 'kg',    scope: 3, custom: true },
};

// CEA India grid factors — mirrors cleartrace/backend/db/emission_factors.js — keep in sync.
const CEA_FACTORS = {
  versions: {
    'V21.0': { fy: '2024-25', published: '2025-11', gridEF: 0.7117 },
    'V20.0': { fy: '2023-24', published: '2025-01', gridEF: 0.727  },
    'V19.0': { fy: '2022-23', published: '2024-01', gridEF: 0.716  },
  },
  latest: 'V21.0',
  source: 'Central Electricity Authority, CO₂ Baseline Database for the Indian Power Sector',
  scope: 2,
  unit: 'tCO2/MWh',
  applicability: 'India grid-connected electricity (location-based, GHG Protocol Scope 2)',
};

const GRID_ELECTRICITY_CATEGORIES = new Set(['Grid Electricity (UK)', 'Grid Electricity']);

function setFormUnit(unit) {
  const sel = document.getElementById('f-unit');
  for (const opt of sel.options) { if (opt.value === unit) { sel.value = unit; break; } }
}

function updateGridElecBadge() {
  const badge    = document.getElementById('defra-ef-badge');
  const selector = document.getElementById('ef-source-selector');
  const source   = selector ? selector.value : (companyJurisdiction === 'IN' ? 'CEA' : 'DEFRA');

  if (source === 'CEA') {
    const ver = CEA_FACTORS.versions[CEA_FACTORS.latest];
    badge.innerHTML =
      `<span>&#x2705; <strong>${ver.gridEF}</strong> tCO₂/MWh</span>` +
      `<span class="defra-source">CEA ${CEA_FACTORS.latest} — FY ${ver.fy}</span>`;
  } else {
    const f = DEFRA_FACTORS['Grid Electricity (UK)'];
    badge.innerHTML =
      `<span>&#x2705; <strong>${f.factor}</strong> kg CO₂e / ${f.unit}</span>` +
      `<span class="defra-source">DEFRA 2023</span>`;
  }
}

function applyEmissionFactor(category) {
  const defraGroup  = document.getElementById('defra-ef-group');
  const customGroup = document.getElementById('custom-ef-group');
  const selector    = document.getElementById('ef-source-selector');
  const ceaTooltip  = document.getElementById('ef-cea-tooltip');

  const isGridElec = GRID_ELECTRICITY_CATEGORIES.has(category);

  if (selector)   selector.style.display  = isGridElec ? '' : 'none';
  if (ceaTooltip) ceaTooltip.style.display = (isGridElec && companyJurisdiction === 'IN') ? '' : 'none';

  if (isGridElec) {
    if (selector) selector.value = (companyJurisdiction === 'IN') ? 'CEA' : 'DEFRA';
    document.getElementById('f-scope').value = '2';
    setFormUnit('kWh');
    updateGridElecBadge();
    defraGroup.style.display  = '';
    customGroup.style.display = 'none';
    return;
  }

  const entry = DEFRA_FACTORS[category];
  if (!entry) {
    defraGroup.style.display  = 'none';
    customGroup.style.display = '';
    return;
  }

  document.getElementById('f-scope').value = String(entry.scope);
  setFormUnit(entry.unit);

  if (entry.custom) {
    defraGroup.style.display  = 'none';
    customGroup.style.display = '';
  } else {
    document.getElementById('defra-ef-badge').innerHTML =
      `<span>&#x2705; <strong>${entry.factor}</strong> kg CO₂e / ${entry.unit}</span>` +
      `<span class="defra-source">DEFRA 2023</span>`;
    defraGroup.style.display  = '';
    customGroup.style.display = 'none';
  }
}

// Backward-compatible alias
const applyDefraFactor = applyEmissionFactor;

document.getElementById('f-category').addEventListener('change', (e) => {
  applyEmissionFactor(e.target.value);
});

// Factor source selector — live badge update when user switches CEA ↔ DEFRA
document.getElementById('ef-source-selector').addEventListener('change', () => {
  updateGridElecBadge();
});

document.getElementById('entry-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fb  = document.getElementById('entry-feedback');
  const btn = document.getElementById('entry-submit-btn');
  fb.className = 'form-feedback';

  btn.textContent = 'Saving…';
  btn.disabled    = true;

  try {
    const category    = document.getElementById('f-category').value;
    const defraEntry  = DEFRA_FACTORS[category];
    const isGridElec  = GRID_ELECTRICITY_CATEGORIES.has(category);
    const selector    = document.getElementById('ef-source-selector');

    let efExtras = {};
    if (isGridElec && selector && selector.style.display !== 'none') {
      // Always send an explicit factor + source for grid electricity so the backend
      // uses exactly what the user selected rather than auto-detecting from jurisdiction.
      if (selector.value === 'CEA') {
        const ver = CEA_FACTORS.versions[CEA_FACTORS.latest];
        efExtras = {
          emission_factor:     ver.gridEF,
          factor_source:       `CEA ${CEA_FACTORS.latest} — FY ${ver.fy}`,
          factor_jurisdiction: 'IN',
        };
      } else {
        const f = DEFRA_FACTORS['Grid Electricity (UK)'];
        efExtras = {
          emission_factor:     f.factor,
          factor_source:       'DEFRA 2023',
          factor_jurisdiction: 'UK',
        };
      }
    } else if (!defraEntry || defraEntry.custom) {
      efExtras = { emission_factor: parseFloat(document.getElementById('f-ef').value) || 1.0 };
    }
    // For non-Grid non-custom DEFRA categories, omit emission_factor — backend applies its own.

    const payload = {
      category,
      scope:  parseInt(document.getElementById('f-scope').value),
      amount: parseFloat(document.getElementById('f-amount').value),
      unit:   document.getElementById('f-unit').value,
      period: document.getElementById('f-period').value,
      ...efExtras,
    };

    const res  = await api('/api/emissions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) {
      fb.textContent = data.error || 'Failed to save';
      fb.className   = 'form-feedback error';
    } else {
      let efLabel;
      if (isGridElec && efExtras.factor_source) {
        efLabel = `${efExtras.factor_source} · ${efExtras.emission_factor} kg CO₂e/kWh`;
      } else if (defraEntry && !defraEntry.custom) {
        efLabel = `DEFRA 2023 · ${defraEntry.factor} kg CO₂e/${defraEntry.unit}`;
      } else {
        efLabel = `EF ${(payload.emission_factor || 1.0)} kg CO₂e/unit`;
      }
      fb.textContent = `✓ Entry saved — ${fmt(parseFloat(data.co2e_tonnes), 4)} tCO₂e  [${efLabel}]`;
      fb.className   = 'form-feedback success';
      e.target.reset();
      document.getElementById('f-period').value =
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      document.getElementById('f-ef').value = '1.0';
      // Reset EF display to custom input (no category selected after reset)
      document.getElementById('defra-ef-group').style.display  = 'none';
      document.getElementById('custom-ef-group').style.display = '';
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
//  PDF EXPORT
// ══════════════════════════════════════════════════════════════════════════════
document.getElementById('export-btn').addEventListener('click', async () => {
  const btn = document.getElementById('export-btn');
  const orig = btn.textContent;
  btn.textContent = '⏳ Generating…';
  btn.disabled = true;
  try {
    const res = await api('/api/report');
    if (!res || !res.ok) throw new Error('Server error');
    const blob = await res.blob();
    const year = new Date().getFullYear();
    const a = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(blob),
      download: `ClearTrace-ESG-Report-${year}.pdf`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    alert('Could not generate report — please try again.');
  } finally {
    btn.textContent = orig;
    btn.disabled = false;
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  VALIDATION WARNING BANNER
// ══════════════════════════════════════════════════════════════════════════════
async function loadValidationBanner() {
  const res = await api('/api/validation/summary');
  if (!res || !res.ok) return;
  const { pending } = await res.json();
  const banner = document.getElementById('validation-banner');
  if (!banner) return;
  if (pending > 0) {
    banner.innerHTML = `
      <span class="vb-icon">⚠️</span>
      <span class="vb-text">
        <strong>${pending} validation warning${pending === 1 ? '' : 's'}</strong>
        — ${pending === 1 ? 'one entry has' : 'some entries have'} been flagged for review.
      </span>
      <a href="/validation.html" class="vb-link btn btn-outline">Review →</a>
    `;
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
//  RECOMMENDED ACTIONS PANEL
// ══════════════════════════════════════════════════════════════════════════════
async function loadRecommendationsSummary() {
  const panel = document.getElementById('rc-dash-panel');
  if (!panel) return;

  try {
    const res = await api('/api/recommendations/summary');
    if (!res || !res.ok) {
      panel.innerHTML = '<div class="rc-dash-empty">Run your first gap analysis to see recommendations.</div>';
      return;
    }
    const data = await res.json();
    const quickWins = data.quick_wins || [];

    if (!quickWins.length) {
      panel.innerHTML = '<div class="rc-dash-empty">Run your first gap analysis to see recommendations.</div>';
      return;
    }

    const rows = quickWins.map(qw => {
      const saving = qw.co2e_saving_max
        ? ` <span class="rc-dash-saving">${qw.co2e_saving_min ?? ''}${qw.co2e_saving_min ? '–' : 'up to '}${qw.co2e_saving_max} ${qw.unit || 'tCO₂e/year'}</span>`
        : '';
      return `<div class="rc-dash-row">
        <span class="rc-dash-icon">💡</span>
        <span class="rc-dash-title">${qw.title}</span>
        ${saving}
      </div>`;
    }).join('');

    panel.innerHTML = rows;
  } catch (_) {
    panel.innerHTML = '<div class="rc-dash-empty">Run your first gap analysis to see recommendations.</div>';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  WATER & WASTE KPI CARDS  (from dedicated metrics APIs)
// ══════════════════════════════════════════════════════════════════════════════
async function loadWaterWasteKPI() {
  // Water
  try {
    const [sumRes, histRes] = await Promise.all([
      api('/api/water/summary'),
      api('/api/water/history/total_water_withdrawn'),
    ]);
    if (sumRes && sumRes.ok) {
      const sum = await sumRes.json();
      const val = sum.categories?.['Water']?.total_water_withdrawn ?? null;
      if (val !== null) {
        document.getElementById('kpi-water').innerHTML =
          `${fmt(val, 0)} <span class="kpi-unit">m³</span>`;
        if (histRes && histRes.ok) {
          const hist = await histRes.json();
          const rows = hist.history || [];
          if (rows.length >= 2) {
            const delta = rows[0].value && rows[1].value
              ? parseFloat(((rows[0].value - rows[1].value) / rows[1].value * 100).toFixed(1))
              : null;
            document.getElementById('kpi-water-trend').outerHTML =
              trendHtml(delta, 'kpi-water-trend');
          }
        }
      }
    }
  } catch (_) { /* table not ready yet, kpi.js fallback already shown */ }

  // Waste
  try {
    const [sumRes, histRes] = await Promise.all([
      api('/api/waste/summary'),
      api('/api/waste/history/total_waste_generated'),
    ]);
    if (sumRes && sumRes.ok) {
      const sum = await sumRes.json();
      const val = sum.categories?.['Waste']?.total_waste_generated ?? null;
      if (val !== null) {
        document.getElementById('kpi-waste').innerHTML =
          `${fmt(val, 0)} <span class="kpi-unit">t</span>`;
        if (histRes && histRes.ok) {
          const hist = await histRes.json();
          const rows = hist.history || [];
          if (rows.length >= 2) {
            const delta = rows[0].value && rows[1].value
              ? parseFloat(((rows[0].value - rows[1].value) / rows[1].value * 100).toFixed(1))
              : null;
            document.getElementById('kpi-waste-trend').outerHTML =
              trendHtml(delta, 'kpi-waste-trend');
          }
        }
      }
    }
  } catch (_) { /* table not ready yet */ }
}

async function refreshAll() {
  await Promise.all([
    loadKPI(),
    loadTrendChart(),
    loadDonutChart(),
    loadBannerStats(),
    loadEntries(),
    loadFrameworks(),
    loadOnboardingData(),
    loadValidationBanner(),
    loadRecommendationsSummary(),
    loadWaterWasteKPI(),
  ]);
}

refreshAll();
