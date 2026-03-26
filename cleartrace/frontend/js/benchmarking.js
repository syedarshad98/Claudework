/* ─────────────────────────────────────────────────────────────────────────────
   ClearTrace — benchmarking.js
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

// ── State ─────────────────────────────────────────────────────────────────────
let mode        = 'intensity'; // 'intensity' | 'absolute'
let summaryData = null;
let breakdownData = null;

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

// ── Formatters ────────────────────────────────────────────────────────────────
function fmt(n, dp = 1) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-GB', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

function unitLabel() {
  return mode === 'intensity' ? 'tCO₂e / £1m' : 'tCO₂e';
}

function companyValue(co2eAbs, intensityVal) {
  return mode === 'intensity' ? intensityVal : co2eAbs;
}

// ── Toggle ────────────────────────────────────────────────────────────────────
document.querySelectorAll('.bm-toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.mode === mode) return;
    mode = btn.dataset.mode;
    document.querySelectorAll('.bm-toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    renderAll();
  });
});

// ── Show/hide panels ──────────────────────────────────────────────────────────
function showPanels(show) {
  ['panel-position','panel-breakdown','panel-peer','panel-regulatory'].forEach(id => {
    document.getElementById(id).style.display = show ? '' : 'none';
  });
}

// ── Sector settings form ──────────────────────────────────────────────────────
async function loadSectors() {
  const res = await api('GET', '/api/benchmarking/sectors');
  if (!res || !res.ok) return;
  const sectors = await res.json();
  const sel = document.getElementById('sf-sector');
  sectors.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    sel.appendChild(opt);
  });
}

function openSectorForm(currentSector, currentRevenue) {
  const form = document.getElementById('sector-form');
  form.style.display = '';
  if (currentSector) document.getElementById('sf-sector').value = currentSector;
  if (currentRevenue) document.getElementById('sf-revenue').value = currentRevenue;
  document.getElementById('sf-error').style.display = 'none';
}

function closeSectorForm() {
  document.getElementById('sector-form').style.display = 'none';
}

document.getElementById('open-sector-settings').addEventListener('click', () => {
  openSectorForm(summaryData?.company?.industry_sector, summaryData?.company?.annual_revenue_gbp_m);
});
document.getElementById('change-sector-btn').addEventListener('click', () => {
  openSectorForm(summaryData?.company?.industry_sector, summaryData?.company?.annual_revenue_gbp_m);
});
document.getElementById('sf-cancel-btn').addEventListener('click', closeSectorForm);

document.getElementById('sf-save-btn').addEventListener('click', async () => {
  const sector  = document.getElementById('sf-sector').value;
  const revenue = document.getElementById('sf-revenue').value;
  const errEl   = document.getElementById('sf-error');
  errEl.style.display = 'none';

  if (!sector) {
    errEl.textContent = 'Please select a sector.';
    errEl.style.display = '';
    return;
  }

  const btn = document.getElementById('sf-save-btn');
  btn.disabled = true; btn.textContent = 'Saving…';

  const body = { industry_sector: sector };
  if (revenue && !isNaN(parseFloat(revenue))) body.annual_revenue_gbp_m = parseFloat(revenue);

  const res = await api('PATCH', '/api/company/sector', body);
  btn.disabled = false; btn.textContent = 'Save';

  if (!res || !res.ok) {
    const d = res ? await res.json() : {};
    errEl.textContent = d.error || 'Failed to save. Please try again.';
    errEl.style.display = '';
    return;
  }

  closeSectorForm();
  await loadData();
});

// ── Position bar SVG renderer ─────────────────────────────────────────────────
function renderPositionBar(container, compVal, bm, label) {
  if (!bm) {
    container.innerHTML = '<div class="al-empty">No benchmark data available for this sector.</div>';
    return;
  }

  const p25 = mode === 'intensity' ? bm.p25_intensity : bm.p25_absolute;
  const p50 = mode === 'intensity' ? bm.p50_intensity : bm.p50_absolute;
  const p75 = mode === 'intensity' ? bm.p75_intensity : bm.p75_absolute;
  const p90 = mode === 'intensity' ? bm.p90_intensity : bm.p90_absolute;

  if (!p90) {
    container.innerHTML = '<div class="al-empty">No benchmark data available.</div>';
    return;
  }

  // Scale: 0 to max (130% of P90 or 110% of company value, whichever is higher)
  const maxVal   = Math.max(p90 * 1.3, (compVal || 0) * 1.1, 1);
  const W        = 560;  // SVG inner width
  const H        = 56;
  const trackY   = 32;
  const trackH   = 10;

  function xOf(v) { return Math.min(W, Math.max(0, (v / maxVal) * W)); }

  const regions = [
    { x: 0,        w: xOf(p25), fill: '#dcfce7' },
    { x: xOf(p25), w: xOf(p50) - xOf(p25), fill: '#fef9c3' },
    { x: xOf(p50), w: xOf(p75) - xOf(p50), fill: '#fef3c7' },
    { x: xOf(p75), w: Math.max(xOf(p90) - xOf(p75), 4), fill: '#fee2e2' },
  ];

  const markers = [
    { x: xOf(p25), label: `P25\n${fmt(p25, 1)}`, anchor: 'middle' },
    { x: xOf(p50), label: `Median\n${fmt(p50, 1)}`, anchor: 'middle' },
    { x: xOf(p75), label: `P75\n${fmt(p75, 1)}`, anchor: 'middle' },
    { x: xOf(p90), label: `Best\n${fmt(p90, 1)}`,  anchor: 'middle' },
  ];

  const cx = compVal != null ? xOf(compVal) : null;

  let svgContent = `<svg viewBox="0 0 ${W + 40} ${H + 40}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W + 40}px">`;
  svgContent += `<g transform="translate(20,20)">`;

  // Track background
  svgContent += `<rect x="0" y="${trackY - trackH/2}" width="${W}" height="${trackH}" rx="5" fill="#f0ede6"/>`;

  // Coloured regions
  for (const r of regions) {
    if (r.w > 0) {
      svgContent += `<rect x="${r.x}" y="${trackY - trackH/2}" width="${r.w}" height="${trackH}" fill="${r.fill}"/>`;
    }
  }

  // Marker lines + labels (below track)
  for (const m of markers) {
    svgContent += `<line x1="${m.x}" y1="${trackY - trackH/2 - 2}" x2="${m.x}" y2="${trackY + trackH/2 + 2}" stroke="#a09880" stroke-width="1.5"/>`;
    const parts = m.label.split('\n');
    const labelY = trackY + trackH/2 + 14;
    svgContent += `<text x="${m.x}" y="${labelY}" text-anchor="${m.anchor}" font-size="9" fill="#8a8880" font-family="'DM Mono',monospace">${parts[0]}</text>`;
    svgContent += `<text x="${m.x}" y="${labelY + 10}" text-anchor="${m.anchor}" font-size="9" fill="#8a8880" font-family="'DM Mono',monospace">${parts[1]}</text>`;
  }

  // Company marker
  if (cx != null) {
    const markerColor = compVal <= p50 ? '#1a6b4a' : compVal <= p75 ? '#c47d1a' : '#c0392b';
    svgContent += `<line x1="${cx}" y1="${trackY - trackH/2 - 8}" x2="${cx}" y2="${trackY + trackH/2 + 8}" stroke="${markerColor}" stroke-width="2.5" stroke-linecap="round"/>`;
    svgContent += `<circle cx="${cx}" cy="${trackY - trackH/2 - 12}" r="7" fill="${markerColor}"/>`;
    svgContent += `<text x="${cx}" y="${trackY - trackH/2 - 8.5}" text-anchor="middle" font-size="8" fill="white" font-weight="bold" font-family="'DM Mono',monospace">You</text>`;
  } else {
    svgContent += `<text x="${W/2}" y="${trackY}" text-anchor="middle" font-size="10" fill="#8a8880" font-style="italic">No emissions data for this year</text>`;
  }

  svgContent += `</g></svg>`;
  container.innerHTML = svgContent;
}

// ── Peer band chart ───────────────────────────────────────────────────────────
function renderPeerChart(bm, compVal) {
  const svg = document.getElementById('peer-chart');
  if (!bm) { svg.innerHTML = '<text x="300" y="120" text-anchor="middle" font-size="12" fill="#8a8880">No data</text>'; return; }

  const p25 = mode === 'intensity' ? bm.p25_intensity : bm.p25_absolute;
  const p50 = mode === 'intensity' ? bm.p50_intensity : bm.p50_absolute;
  const p75 = mode === 'intensity' ? bm.p75_intensity : bm.p75_absolute;
  const p90 = mode === 'intensity' ? bm.p90_intensity : bm.p90_absolute;

  if (!p90) { svg.innerHTML = '<text x="300" y="120" text-anchor="middle" font-size="12" fill="#8a8880">No benchmark data</text>'; return; }

  const COLS  = [{ label: 'Bottom 25%', val: p25, color: '#a7f3d0' },
                 { label: 'Median',     val: p50, color: '#6ee7b7' },
                 { label: 'Top 25%',    val: p75, color: '#34d399' },
                 { label: 'Best-in-class', val: p90, color: '#059669' }];

  const W = 560, H = 200, PAD_L = 40, PAD_B = 30, BAR_W = 80, GAP = 40;
  const maxVal   = Math.max(p90 * 1.2, (compVal || 0) * 1.15, 1);
  const chartH   = H - PAD_B;
  function barH(v) { return (v / maxVal) * chartH; }
  function barY(v) { return chartH - barH(v); }

  let out = '';

  // Y gridlines
  for (let i = 0; i <= 4; i++) {
    const gv  = (maxVal / 4) * i;
    const gy  = chartH - (gv / maxVal) * chartH;
    out += `<line x1="${PAD_L}" y1="${gy}" x2="${W}" y2="${gy}" stroke="#e5e2d9" stroke-width="1"/>`;
    out += `<text x="${PAD_L - 4}" y="${gy + 4}" text-anchor="end" font-size="9" fill="#8a8880" font-family="'DM Mono',monospace">${fmt(gv, 0)}</text>`;
  }

  // Bars
  COLS.forEach((col, i) => {
    const x = PAD_L + i * (BAR_W + GAP);
    const bh = barH(col.val);
    const by = barY(col.val);
    out += `<rect x="${x}" y="${by}" width="${BAR_W}" height="${bh}" rx="4" fill="${col.color}"/>`;
    out += `<text x="${x + BAR_W/2}" y="${by - 5}" text-anchor="middle" font-size="10" fill="#1a1a18" font-family="'DM Mono',monospace">${fmt(col.val, 1)}</text>`;
    out += `<text x="${x + BAR_W/2}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#8a8880" font-family="'Instrument Sans',sans-serif">${col.label}</text>`;
  });

  // Company overlay line
  if (compVal != null) {
    const lineY = barY(Math.min(compVal, maxVal));
    const lineColor = compVal <= p50 ? '#1a6b4a' : compVal <= p75 ? '#c47d1a' : '#c0392b';
    out += `<line x1="${PAD_L}" y1="${lineY}" x2="${W}" y2="${lineY}" stroke="${lineColor}" stroke-width="2" stroke-dasharray="6 3"/>`;
    out += `<text x="${W - 2}" y="${lineY - 4}" text-anchor="end" font-size="10" fill="${lineColor}" font-weight="600" font-family="'Instrument Sans',sans-serif">You — ${fmt(compVal, 1)}</text>`;
  }

  svg.innerHTML = out;
}

// ── Regulatory context ────────────────────────────────────────────────────────
function renderRegulatory(company, baselineTotal) {
  const grid = document.getElementById('reg-grid');
  const totalCo2e  = company.total_co2e;
  const targetPct  = company.reduction_target_pct;
  const targetYear = company.target_year;
  const standard   = company.alignment_standard;

  // Simple trajectory: compare current vs baseline
  function getStatus(requiredReductionPct) {
    if (!baselineTotal || baselineTotal <= 0) return 'no_data';
    const actualReduction = ((baselineTotal - totalCo2e) / baselineTotal) * 100;
    if (actualReduction >= requiredReductionPct)        return 'on_track';
    if (actualReduction >= requiredReductionPct * 0.5)  return 'at_risk';
    return 'behind';
  }

  const now = new Date().getFullYear();
  // Annual reduction rate needed (assume baseline ~5 years ago for GRI/TCFD)
  const parisRate  = 4.2; // Paris-aligned: ~4.2% per year
  const gri_needed  = parisRate * 5; // ~21% over 5 years
  const tcfd_needed = parisRate * 5;
  const sasb_needed = parisRate * 3; // SASB is less prescriptive

  const griStatus  = getStatus(gri_needed);
  const tcfdStatus = getStatus(tcfd_needed);
  const sasbStatus = getStatus(sasb_needed);

  function statusBadge(s) {
    const map = {
      on_track: { cls: 'bm-reg-badge-green',  label: 'On Track' },
      at_risk:  { cls: 'bm-reg-badge-amber',  label: 'At Risk'  },
      behind:   { cls: 'bm-reg-badge-red',    label: 'Behind'   },
      no_data:  { cls: 'bm-reg-badge-grey',   label: 'No Data'  },
    };
    const m = map[s] || map.no_data;
    return `<span class="bm-reg-badge ${m.cls}">${m.label}</span>`;
  }

  const actualPct = baselineTotal > 0
    ? parseFloat(((baselineTotal - totalCo2e) / baselineTotal * 100).toFixed(1))
    : null;

  function griContext() {
    if (!baselineTotal) return 'Add baseline emissions in onboarding to enable GRI trajectory analysis.';
    if (actualPct == null) return 'Insufficient data for trajectory assessment.';
    if (griStatus === 'on_track')
      return `Your emissions have reduced by ${actualPct}% from baseline — consistent with GRI Sustainability Disclosure Standards' implied 4.2% annual reduction.`;
    if (griStatus === 'at_risk')
      return `GRI Standards expect sustained annual reductions. Your ${actualPct}% reduction from baseline is below the ~${gri_needed.toFixed(0)}% expected over this period.`;
    return `Your emissions are ${actualPct < 0 ? 'higher than' : Math.abs(actualPct).toFixed(1) + '% below'} baseline — GRI reporting requires disclosure of emissions and reduction plans.`;
  }

  function tcfdContext() {
    if (!baselineTotal) return 'TCFD requires disclosure of climate risks and scenario analysis. Set baseline data to assess trajectory.';
    if (tcfdStatus === 'on_track')
      return `TCFD recommends Paris-aligned targets. Your trajectory suggests alignment with a 2°C or below scenario.`;
    if (tcfdStatus === 'at_risk')
      return `TCFD scenario analysis suggests your current pace may not align with a below-2°C pathway. Consider strengthening reduction plans.`;
    return `TCFD disclosure requires a credible transition plan. Current trajectory lags behind 1.5°C alignment — review your climate risk strategy.`;
  }

  function sasbContext() {
    if (!baselineTotal) return 'SASB standards require industry-specific environmental metrics. Ensure Scope 1, 2 and 3 data is complete.';
    if (sasbStatus === 'on_track')
      return `Your emissions management appears consistent with SASB sector standards for ${company.industry_sector || 'your industry'}.`;
    if (sasbStatus === 'at_risk')
      return `SASB requires quantitative emissions targets. Your reduction rate may fall short of sector-specific expectations.`;
    return `SASB standards for ${company.industry_sector || 'your sector'} expect clear emissions reduction commitments — consider setting a formal target.`;
  }

  const frameworks = [
    { name: 'GRI', full: 'Global Reporting Initiative', status: griStatus,  context: griContext(),  icon: '📋' },
    { name: 'TCFD', full: 'Task Force on Climate-related Disclosures', status: tcfdStatus, context: tcfdContext(), icon: '🌡️' },
    { name: 'SASB', full: 'Sustainability Accounting Standards Board', status: sasbStatus, context: sasbContext(), icon: '📊' },
  ];

  grid.innerHTML = frameworks.map(fw => `
    <div class="bm-reg-card">
      <div class="bm-reg-card-header">
        <div class="bm-reg-icon">${fw.icon}</div>
        <div>
          <div class="bm-reg-name">${fw.name}</div>
          <div class="bm-reg-full">${fw.full}</div>
        </div>
        <div class="bm-reg-badge-wrap">${statusBadge(fw.status)}</div>
      </div>
      <p class="bm-reg-context">${fw.context}</p>
    </div>
  `).join('');
}

// ── Main render ───────────────────────────────────────────────────────────────
function renderAll() {
  if (!summaryData || !breakdownData) return;

  const { company, benchmarks, baselineTotal } = summaryData;
  const { benchmarks: scopeBm, worst_scope } = breakdownData;

  const hasEmissions = company.total_co2e > 0;
  const hasRevenue   = company.annual_revenue_gbp_m > 0;

  // Toggle visibility: disable intensity if no revenue
  const toggle = document.getElementById('mode-toggle');
  toggle.style.display = '';
  if (!hasRevenue && mode === 'intensity') {
    mode = 'absolute';
    document.querySelectorAll('.bm-toggle-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === mode));
  }
  // Disable intensity button if no revenue
  document.querySelector('[data-mode="intensity"]').disabled = !hasRevenue;
  if (!hasRevenue) {
    document.querySelector('[data-mode="intensity"]').title = 'Set annual revenue to enable intensity benchmarking';
  }

  // No-data state
  document.getElementById('no-data-banner').style.display = !hasEmissions ? '' : 'none';
  showPanels(hasEmissions);
  if (!hasEmissions) return;

  // Panel 1 — Position
  const compTotal  = companyValue(company.total_co2e, company.intensity);
  const container  = document.getElementById('pos-bar-container');
  renderPositionBar(container, compTotal, benchmarks.total, 'All Scopes');

  const bm = benchmarks.total;
  const p50 = mode === 'intensity' ? bm?.p50_intensity : bm?.p50_absolute;
  const p75 = mode === 'intensity' ? bm?.p75_intensity : bm?.p75_absolute;

  if (compTotal != null && p50 != null) {
    const pctVsMedian = p50 > 0 ? ((compTotal - p50) / p50 * 100).toFixed(1) : null;
    let verdict = '', verdictCls = '';
    if (compTotal <= p50) {
      verdict    = `Your emissions are ${Math.abs(pctVsMedian)}% below the industry median — you're ahead of most peers.`;
      verdictCls = 'bm-verdict-green';
    } else if (compTotal <= p75) {
      verdict    = `Your emissions are ${pctVsMedian}% above the industry median — room for improvement.`;
      verdictCls = 'bm-verdict-amber';
    } else {
      verdict    = `Your emissions are ${pctVsMedian}% above the industry median — in the highest-emitting quarter of your sector.`;
      verdictCls = 'bm-verdict-red';
    }
    document.getElementById('pos-verdict').innerHTML = `<span class="${verdictCls}">${verdict}</span>`;
  } else {
    document.getElementById('pos-verdict').innerHTML = '';
  }

  document.getElementById('pos-footnote').textContent =
    bm?.source ? `Based on ${bm.source} data for ${company.industry_sector}` : '';

  document.getElementById('position-sub').textContent =
    `${company.industry_sector} · ${mode === 'intensity' ? `${fmt(compTotal, 1)} tCO₂e / £1m` : `${fmt(compTotal, 1)} tCO₂e total`}`;

  // Panel 2 — Scope breakdown
  const scopeRows  = document.getElementById('breakdown-rows');
  const scopeNames = { scope1: 'Scope 1 — Direct', scope2: 'Scope 2 — Energy', scope3: 'Scope 3 — Value Chain' };
  const scopeKeys  = ['scope1', 'scope2', 'scope3'];
  const scopeAbs   = { scope1: company.scope1_co2e, scope2: company.scope2_co2e, scope3: company.scope3_co2e };
  const scopeInt   = { scope1: company.scope1_intensity, scope2: company.scope2_intensity, scope3: company.scope3_intensity };

  scopeRows.innerHTML = scopeKeys.map(sk => {
    const bms     = scopeBm[sk];
    const compV   = companyValue(scopeAbs[sk], scopeInt[sk]);
    const p50_    = bms ? (mode === 'intensity' ? bms.p50_intensity : bms.p50_absolute) : null;
    const isWorst = parseInt(sk.replace('scope','')) === worst_scope;

    const barH  = 8;
    const W     = 300;
    const maxV  = bms ? Math.max((mode === 'intensity' ? bms.p90_intensity : bms.p90_absolute) * 1.3, (compV || 0) * 1.2, 1) : 1;
    const cx    = compV != null ? Math.min(W, (compV / maxV) * W) : null;
    const p50x  = p50_ != null ? Math.min(W, (p50_ / maxV) * W) : null;
    const p75x  = bms  ? Math.min(W, ((mode === 'intensity' ? bms.p75_intensity : bms.p75_absolute) / maxV) * W) : null;
    const markerColor = compV != null && p50_ != null
      ? (compV <= p50_ ? '#1a6b4a' : compV <= (mode === 'intensity' ? bms?.p75_intensity : bms?.p75_absolute) ? '#c47d1a' : '#c0392b')
      : '#8a8880';

    const miniSvg = `<svg viewBox="0 0 ${W} 24" style="width:100%;max-width:${W}px;overflow:visible">
      <rect x="0" y="8" width="${W}" height="${barH}" rx="4" fill="#f0ede6"/>
      ${p75x ? `<rect x="0" y="8" width="${Math.min(p75x,W)}" height="${barH}" rx="4" fill="#fef3c7"/>` : ''}
      ${p50x ? `<rect x="0" y="8" width="${Math.min(p50x,W)}" height="${barH}" rx="4" fill="#dcfce7"/>` : ''}
      ${p50x ? `<line x1="${p50x}" y1="4" x2="${p50x}" y2="20" stroke="#a09880" stroke-width="1.5"/>` : ''}
      ${cx   ? `<circle cx="${cx}" cy="12" r="6" fill="${markerColor}"/>` : ''}
    </svg>`;

    return `<div class="bm-scope-row">
      <div class="bm-scope-name">
        ${scopeNames[sk]}
        ${isWorst ? '<span class="bm-worst-badge">Highest gap</span>' : ''}
      </div>
      <div class="bm-scope-bar-wrap">${miniSvg}</div>
      <div class="bm-scope-stats">
        <div class="bm-scope-stat">
          <div class="bm-scope-stat-val">${fmt(compV, 1)}</div>
          <div class="bm-scope-stat-label">Yours</div>
        </div>
        <div class="bm-scope-stat">
          <div class="bm-scope-stat-val al-muted">${fmt(p50_, 1)}</div>
          <div class="bm-scope-stat-label">Median</div>
        </div>
        <div class="bm-scope-stat-unit">${unitLabel()}</div>
      </div>
    </div>`;
  }).join('');

  // Panel 3 — Peer band
  renderPeerChart(bm, compTotal);

  // Panel 4 — Regulatory context
  renderRegulatory(company, baselineTotal);
}

// ── Load data ─────────────────────────────────────────────────────────────────
async function loadData() {
  const [sumRes, brkRes] = await Promise.all([
    api('GET', '/api/benchmarking/summary'),
    api('GET', '/api/benchmarking/breakdown'),
  ]);

  if (!sumRes || !brkRes) return;

  const sumJson = await sumRes.json();
  const brkJson = await brkRes.json();

  const sectorBanner = document.getElementById('sector-banner');
  const sectorInfo   = document.getElementById('sector-info');
  const changeBtn    = document.getElementById('change-sector-btn');
  const noData       = document.getElementById('no-data-banner');

  if (sumJson.sector_required) {
    sectorBanner.style.display = '';
    sectorInfo.style.display   = 'none';
    document.getElementById('mode-toggle').style.display = 'none';
    showPanels(false);
    noData.style.display = 'none';
    return;
  }

  sectorBanner.style.display = 'none';
  sectorInfo.style.display   = '';

  const sector   = sumJson.company?.industry_sector || '—';
  const dataYear = sumJson.benchmarks?.total?.year;
  document.getElementById('sector-pill').textContent      = sector;
  document.getElementById('sector-data-year').textContent = dataYear ? `· Data: ${dataYear}` : '';

  // Only admins can change sector
  changeBtn.style.display = ROLE === 'admin' ? '' : 'none';
  // Only admins see the settings button on the banner
  document.getElementById('open-sector-settings').style.display = ROLE === 'admin' ? '' : 'none';

  summaryData   = sumJson;
  breakdownData = brkJson;

  document.getElementById('no-data-year').textContent = sumJson.year;
  renderAll();
}

// ── Init ──────────────────────────────────────────────────────────────────────
loadSectors();
loadData();
