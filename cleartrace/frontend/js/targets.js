/* ─────────────────────────────────────────────────────────────────────────────
   ClearTrace — targets.js
   Drives the Targets & Goals page.
   ───────────────────────────────────────────────────────────────────────────── */

// ── Auth + onboarding guard ───────────────────────────────────────────────────
const token = localStorage.getItem('ct_token');
if (!token) window.location.replace('/login.html');
if (localStorage.getItem('ct_onboarding') !== 'complete') {
  window.location.replace('/onboarding.html');
}

const COMPANY = localStorage.getItem('ct_company') || '';
const EMAIL   = localStorage.getItem('ct_email')   || '';

// Populate sidebar
const initials = COMPANY.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '—';
document.getElementById('company-avatar').textContent  = initials;
document.getElementById('sidebar-company').textContent = COMPANY;

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.clear();
  window.location.replace('/login.html');
});

// Sidebar nav: items with data-href navigate on click
document.querySelectorAll('.nav-item[data-href]').forEach(item => {
  item.addEventListener('click', () => window.location.href = item.dataset.href);
});

// ── API helper ────────────────────────────────────────────────────────────────
async function api(path) {
  const res = await fetch(path, {
    headers: { 'Authorization': `Bearer ${token}` },
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
    maximumFractionDigits: dp,
  });
}

function niceMax(v) {
  if (!v || v === 0) return 10;
  const mag  = Math.pow(10, Math.floor(Math.log10(v)));
  const nice = [1, 2, 2.5, 5, 10].map(n => n * mag);
  const step = nice.find(n => n >= v / 3) || mag;
  return Math.ceil(v / step) * step;
}

// ── Status helpers ─────────────────────────────────────────────────────────────
const STATUS_META = {
  on_track:    { label: '✓ On Track',    cls: 'status-on-track' },
  at_risk:     { label: '⚠ At Risk',     cls: 'status-at-risk'  },
  behind:      { label: '✕ Behind',      cls: 'status-behind'   },
  no_baseline: { label: '— No baseline', cls: 'status-none'     },
};

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 1 — OVERALL PROGRESS CARD
// ══════════════════════════════════════════════════════════════════════════════
function renderOverview(d) {
  const { setup, overview } = d;

  // Sub-heading
  const std = setup.alignmentStandard ? ` · ${setup.alignmentStandard}` : '';
  document.getElementById('tg-hero-sub').textContent =
    setup.hasTarget
      ? `Target: −${setup.reductionTargetPct}% by ${setup.targetYear}${std}`
      : 'No reduction target set — complete setup to add one';

  // Big reduction %
  const redPct = overview.currentReductionPct;
  const redEl  = document.getElementById('tg-reduction-pct');
  redEl.textContent = redPct !== null ? (redPct >= 0 ? '+' : '') + fmt(redPct, 1) : '—';
  redEl.className   = `tg-big-val ${redPct < 0 ? 'color-bad' : 'color-good'}`;

  // Target label
  document.getElementById('tg-target-label').textContent =
    setup.hasTarget
      ? `Expected reduction so far: ${overview.expectedPct !== null ? overview.expectedPct + '%' : '—'}`
      : 'Set a target in your setup to track progress';

  // Progress bar: fill = current reduction / target reduction
  const barPct = setup.hasTarget && setup.reductionTargetPct > 0
    ? Math.min(100, Math.max(0, (redPct || 0) / setup.reductionTargetPct * 100))
    : 0;
  document.getElementById('tg-hero-fill').style.width = `${barPct}%`;

  // Marker at expected %
  if (overview.expectedPct !== null && setup.reductionTargetPct > 0) {
    const markerPct = Math.min(100, Math.max(0, overview.expectedPct / setup.reductionTargetPct * 100));
    const marker = document.getElementById('tg-hero-marker');
    marker.style.left    = `${markerPct}%`;
    marker.style.display = 'block';
    marker.title         = `Expected: ${overview.expectedPct}%`;
  }

  // Track labels
  document.getElementById('tg-baseline-label').textContent = `Baseline ${setup.baselineYear}`;
  document.getElementById('tg-target-year-label').textContent =
    setup.targetYear ? `${setup.targetYear} target` : 'Target';

  // Status badge
  const meta = STATUS_META[overview.status] || STATUS_META.no_baseline;
  const badge = document.getElementById('tg-status-badge');
  badge.textContent  = meta.label;
  badge.className    = `tg-status-badge ${meta.cls}`;

  // Stats
  document.getElementById('tg-baseline-total').textContent = fmt(overview.baselineTotal, 1);
  document.getElementById('tg-current-total').textContent  = fmt(overview.currentYearTotal, 1);
  document.getElementById('tg-years-left').textContent     =
    overview.yearsRemaining !== null ? overview.yearsRemaining : '—';

  const targetTotal = setup.hasTarget
    ? overview.baselineTotal * (1 - setup.reductionTargetPct / 100)
    : null;
  document.getElementById('tg-target-total').textContent = fmt(targetTotal, 1);

  document.getElementById('page-sub').textContent =
    `${COMPANY} · ${new Date().getFullYear()} · ${EMAIL}`;
}

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 2 — PER-SCOPE BREAKDOWN
// ══════════════════════════════════════════════════════════════════════════════
function renderScopes(d) {
  const { scopes, overview } = d;

  const SCOPE_META = {
    1: { name: 'Scope 1 — Direct',          icon: '🏭', color: 'var(--scope1)', cls: 'scope1' },
    2: { name: 'Scope 2 — Energy',          icon: '⚡', color: 'var(--scope2)', cls: 'scope2' },
    3: { name: 'Scope 3 — Value Chain',     icon: '🔄', color: 'var(--scope3)', cls: 'scope3' },
  };

  const grid = document.getElementById('tg-scope-grid');
  grid.innerHTML = '';

  scopes.forEach(s => {
    const meta   = SCOPE_META[s.scope];
    const red    = s.reductionPct;
    const sm     = STATUS_META[s.status] || STATUS_META.no_baseline;
    const barW   = d.setup.reductionTargetPct > 0 && red !== null
      ? Math.min(100, Math.max(0, red / d.setup.reductionTargetPct * 100))
      : 0;

    // YoY trend arrow
    let trendHtml = '';
    if (s.lastYear > 0 && s.current > 0) {
      const delta = ((s.current - s.lastYear) / s.lastYear * 100).toFixed(1);
      if (delta < 0)  trendHtml = `<span class="tg-trend tg-trend-good">↓ ${Math.abs(delta)}%</span>`;
      else if (delta > 0) trendHtml = `<span class="tg-trend tg-trend-bad">↑ ${delta}%</span>`;
      else            trendHtml = `<span class="tg-trend tg-trend-none">→ 0%</span>`;
    }

    const card = document.createElement('div');
    card.className = `card tg-scope-card tg-scope-${meta.cls}`;
    card.innerHTML = `
      <div class="tg-scope-top">
        <div class="tg-scope-icon" style="background:${meta.color}1a;color:${meta.color}">${meta.icon}</div>
        <div class="tg-scope-name">${meta.name}</div>
        <div class="tg-scope-status ${sm.cls}">${sm.label}</div>
      </div>

      <div class="tg-scope-numbers">
        <div class="tg-scope-num">
          <div class="tg-scope-num-val">${fmt(s.baseline, 1)}</div>
          <div class="tg-scope-num-label">Baseline tCO₂e</div>
        </div>
        <div class="tg-scope-arrow">→</div>
        <div class="tg-scope-num">
          <div class="tg-scope-num-val">${fmt(s.current, 1)}</div>
          <div class="tg-scope-num-label">Current year ${trendHtml}</div>
        </div>
      </div>

      <div class="tg-scope-bar-wrap">
        <div class="tg-scope-bar-track">
          <div class="tg-scope-bar-fill" style="width:${barW}%;background:${meta.color}"></div>
        </div>
        <span class="tg-scope-bar-label">${red !== null ? (red >= 0 ? '+' : '') + fmt(red, 1) + '% reduced' : 'No baseline data'}</span>
      </div>
    `;
    grid.appendChild(card);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 3 — YEAR-ON-YEAR GROUPED BAR CHART
// ══════════════════════════════════════════════════════════════════════════════
function renderYoY(d) {
  const { yoy } = d;
  if (!yoy || yoy.length === 0) {
    document.getElementById('yoy-chart').innerHTML =
      '<div class="tg-no-data">No annual data available yet.</div>';
    return;
  }

  const W = 600, H = 220;
  const padL = 52, padR = 16, padT = 16, padB = 36;
  const iW = W - padL - padR;
  const iH = H - padT - padB;

  const maxVal = Math.max(...yoy.map(y => y.total), 0.1);
  const yMax   = niceMax(maxVal);

  const groups  = yoy.length;
  const barW    = Math.max(8, Math.min(28, (iW / groups) * 0.24));
  const groupW  = iW / groups;

  function xGroup(i) { return padL + i * groupW + groupW / 2; }
  function yPos(v)   { return padT + (1 - v / yMax) * iH; }

  // Grid lines
  const gridVals = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax].map(v => Math.round(v));
  let gridLines  = '';
  gridVals.forEach(v => {
    const y = yPos(v);
    gridLines += `<line x1="${padL}" y1="${y}" x2="${padL + iW}" y2="${y}" stroke="#e5e2d9" stroke-width="${v === 0 ? 1 : 0.5}" ${v > 0 ? 'stroke-dasharray="4,4"' : ''}/>`;
    gridLines += `<text x="${padL - 6}" y="${y + 4}" fill="#8a8880" font-size="10" text-anchor="end" font-family="DM Mono,monospace">${fmt(v, 0)}</text>`;
  });

  const COLORS = { scope1: '#1a6b4a', scope2: '#2d5be3', scope3: '#c47d1a' };

  let bars = '', xLabels = '';
  yoy.forEach((yr, i) => {
    const cx = xGroup(i);
    const fields = [
      { key: 'scope1', color: COLORS.scope1, offset: -barW - 2 },
      { key: 'scope2', color: COLORS.scope2, offset: 0 },
      { key: 'scope3', color: COLORS.scope3, offset: barW + 2 },
    ];
    fields.forEach(f => {
      const v  = yr[f.key] || 0;
      const bH = Math.max(0, iH - (yPos(v) - padT));
      const bY = yPos(v);
      const bX = cx + f.offset - barW / 2;
      // Baseline year gets lighter opacity
      const op = yr.isBaseline ? '0.45' : '1';
      bars += `<rect x="${bX}" y="${bY}" width="${barW}" height="${bH}"
        fill="${f.color}" opacity="${op}" rx="2"
        data-label="${yr.year} Scope ${f.key.slice(-1)}: ${fmt(v, 1)} tCO₂e"/>`;
    });

    // Year label + total
    const isBase = yr.isBaseline ? ' (baseline)' : '';
    xLabels += `<text x="${cx}" y="${H - 4}" fill="#8a8880" font-size="10" text-anchor="middle" font-family="DM Mono,monospace">${yr.year}${isBase}</text>`;
    // Total above group
    const totalY = yPos(yr.total) - 6;
    xLabels += `<text x="${cx}" y="${Math.max(padT + 4, totalY)}" fill="#1a1a18" font-size="10" text-anchor="middle" font-family="DM Mono,monospace" font-weight="500">${fmt(yr.total, 0)}</text>`;
  });

  const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;width:100%">
    ${gridLines}
    ${bars}
    ${xLabels}
  </svg>`;

  const wrap = document.getElementById('yoy-chart');
  wrap.innerHTML = svg;

  // Tooltip
  wrap.querySelectorAll('rect[data-label]').forEach(rect => {
    rect.style.cursor = 'pointer';
    rect.addEventListener('mouseenter', (e) => {
      const tip = document.createElement('div');
      tip.className = 'trend-tooltip';
      tip.style.cssText = 'display:block;position:fixed;pointer-events:none;z-index:999';
      tip.textContent = rect.dataset.label;
      document.body.appendChild(tip);
      const move = (ev) => {
        tip.style.left = (ev.clientX + 12) + 'px';
        tip.style.top  = (ev.clientY - 28) + 'px';
      };
      document.addEventListener('mousemove', move);
      rect.addEventListener('mouseleave', () => {
        tip.remove();
        document.removeEventListener('mousemove', move);
      }, { once: true });
    });
  });

  const subYears = yoy.map(y => y.year).join(' · ');
  document.getElementById('yoy-sub').textContent = subYears;
}

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 4 — FRAMEWORK MILESTONES
// ══════════════════════════════════════════════════════════════════════════════
function renderFrameworks(d) {
  const { frameworks } = d;
  const grid = document.getElementById('tg-fw-grid');
  grid.innerHTML = '';

  if (!frameworks || frameworks.length === 0) {
    grid.innerHTML = '<div class="tg-no-data">No frameworks selected during setup.</div>';
    return;
  }

  const FW_FULL = {
    GRI:   'Global Reporting Initiative',
    TCFD:  'Climate Financial Disclosures',
    SASB:  'Sustainability Accounting Standards',
    LOCAL: 'Local / Regulatory',
  };

  const STATUS_TAG = {
    aligned:     '<span class="tag tag-green">Aligned</span>',
    partial:     '<span class="tag tag-warn">Partial</span>',
    not_started: '<span class="tag tag-red">Not started</span>',
  };

  frameworks.forEach(fw => {
    const card = document.createElement('div');
    card.className = 'card tg-fw-card';

    const msHtml = fw.milestones.map(m => `
      <div class="tg-ms-row ${m.complete ? 'tg-ms-done' : ''}">
        <span class="tg-ms-check">${m.complete ? '✓' : '○'}</span>
        <span class="tg-ms-label">${m.label}</span>
      </div>
    `).join('');

    // Circular progress ring for completePct
    const r   = 22;
    const C   = 2 * Math.PI * r;
    const arc = (fw.completePct / 100) * C;
    const ring = `<svg width="52" height="52" viewBox="0 0 52 52">
      <circle cx="26" cy="26" r="${r}" fill="none" stroke="#e5e2d9" stroke-width="5"/>
      <circle cx="26" cy="26" r="${r}" fill="none" stroke="var(--accent)" stroke-width="5"
        stroke-dasharray="${arc} ${C - arc}" stroke-dashoffset="${C / 4}"
        transform="rotate(-90 26 26)" stroke-linecap="round"/>
      <text x="26" y="31" text-anchor="middle" font-size="11" font-weight="700"
        fill="var(--accent)" font-family="DM Mono,monospace">${fw.completePct}%</text>
    </svg>`;

    card.innerHTML = `
      <div class="tg-fw-header">
        <div>
          <div class="tg-fw-name">${fw.framework}</div>
          <div class="tg-fw-full">${FW_FULL[fw.framework] || fw.framework}</div>
        </div>
        <div class="tg-fw-meta">
          ${ring}
          ${STATUS_TAG[fw.status] || ''}
        </div>
      </div>
      <div class="tg-ms-list">${msHtml}</div>
    `;
    grid.appendChild(card);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION 5 — PROJECTED TRAJECTORY LINE CHART
// ══════════════════════════════════════════════════════════════════════════════
function renderTrajectory(d) {
  const { trajectory, setup, overview } = d;
  const wrap = document.getElementById('traj-chart');

  if (!trajectory || trajectory.length === 0) {
    wrap.innerHTML = '<div class="tg-no-data">No data to project from yet.</div>';
    return;
  }

  const W = 600, H = 230;
  const padL = 52, padR = 80, padT = 20, padB = 36;
  const iW = W - padL - padR;
  const iH = H - padT - padB;

  const allVals = trajectory.flatMap(t => [t.actual, t.projected, t.target].filter(v => v !== null));
  const maxVal  = Math.max(...allVals, 0.1);
  const yMax    = niceMax(maxVal);
  const years   = trajectory.map(t => t.year);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const yearSpan = maxYear - minYear || 1;

  function xPos(yr) { return padL + ((yr - minYear) / yearSpan) * iW; }
  function yPos(v)  { return padT + (1 - v / yMax) * iH; }

  // Grid
  const gridVals = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax].map(v => Math.round(v));
  let gridLines  = '';
  gridVals.forEach(v => {
    const y = yPos(v);
    gridLines += `<line x1="${padL}" y1="${y}" x2="${padL + iW}" y2="${y}" stroke="#e5e2d9" stroke-width="${v === 0 ? 1 : 0.5}" ${v > 0 ? 'stroke-dasharray="4,4"' : ''}/>`;
    gridLines += `<text x="${padL - 6}" y="${y + 4}" fill="#8a8880" font-size="10" text-anchor="end" font-family="DM Mono,monospace">${fmt(v, 0)}</text>`;
  });

  // X labels
  let xLabels = '';
  trajectory.forEach(t => {
    xLabels += `<text x="${xPos(t.year)}" y="${H - 4}" fill="#8a8880" font-size="10" text-anchor="middle" font-family="DM Mono,monospace">${t.year}</text>`;
  });

  // Actual line (solid green)
  const actualPts = trajectory.filter(t => t.actual !== null);
  let actualLine  = '';
  if (actualPts.length >= 2) {
    const pts = actualPts.map(t => `${xPos(t.year)},${yPos(t.actual)}`).join(' ');
    actualLine = `<polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>`;
    actualPts.forEach(t => {
      actualLine += `<circle cx="${xPos(t.year)}" cy="${yPos(t.actual)}" r="4" fill="var(--accent)"/>`;
    });
  } else if (actualPts.length === 1) {
    const t = actualPts[0];
    actualLine = `<circle cx="${xPos(t.year)}" cy="${yPos(t.actual)}" r="4" fill="var(--accent)"/>`;
  }

  // Projected line (dashed, lighter green)
  const projPts = trajectory.filter(t => t.projected !== null);
  let projLine  = '';
  if (projPts.length >= 2) {
    const pts = projPts.map(t => `${xPos(t.year)},${yPos(t.projected)}`).join(' ');
    projLine = `<polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2"
      stroke-dasharray="6,4" opacity="0.55" stroke-linejoin="round"/>`;
    // End-point label
    const last = projPts[projPts.length - 1];
    projLine += `<text x="${xPos(last.year) + 6}" y="${yPos(last.projected) + 4}" fill="var(--accent)"
      font-size="10" font-family="DM Mono,monospace" opacity="0.7">${fmt(last.projected, 0)} t</text>`;
  }

  // Target point & horizontal guide
  let targetMark = '';
  const targetPt = trajectory.find(t => t.target !== null);
  if (targetPt) {
    const tx = xPos(targetPt.year);
    const ty = yPos(targetPt.target);
    // dashed horizontal line from left edge to target point
    targetMark += `<line x1="${padL}" y1="${ty}" x2="${tx}" y2="${ty}" stroke="#c0392b"
      stroke-width="1" stroke-dasharray="4,3" opacity="0.5"/>`;
    targetMark += `<circle cx="${tx}" cy="${ty}" r="6" fill="#c0392b" opacity="0.85"/>`;
    targetMark += `<text x="${tx + 9}" y="${ty + 4}" fill="#c0392b" font-size="10"
      font-family="DM Mono,monospace">${fmt(targetPt.target, 0)} t target</text>`;
  }

  // Shaded area between projected and target
  let shadedArea = '';
  if (targetPt && projPts.length > 0) {
    const targetY = yPos(targetPt.target);
    const lastProj = projPts[projPts.length - 1];
    const lastProjY = yPos(lastProj.projected);
    const firstProj = projPts[0];
    const areaColor = lastProjY < targetY ? 'var(--accent)' : '#c0392b';
    // Simple shaded polygon between proj line and target level
    const areaTop = projPts.map(t => `${xPos(t.year)},${yPos(t.projected)}`).join(' ');
    const areaBot = [...projPts].reverse().map(t => `${xPos(t.year)},${targetY}`).join(' ');
    shadedArea = `<polygon points="${areaTop} ${areaBot}" fill="${areaColor}" opacity="0.06"/>`;
  }

  const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;width:100%">
    ${gridLines}
    ${shadedArea}
    ${projLine}
    ${actualLine}
    ${targetMark}
    ${xLabels}
  </svg>`;

  wrap.innerHTML = svg;

  // Verdict
  const verdictEl = document.getElementById('traj-verdict');
  if (!setup.hasTarget || !setup.hasBaseline) {
    verdictEl.textContent = '';
    return;
  }

  const targetPt2 = trajectory.find(t => t.target !== null);
  if (targetPt2 && overview.status !== 'no_baseline') {
    const projAtTarget = trajectory.find(t => t.year === setup.targetYear && t.projected !== null);
    if (projAtTarget) {
      const gap     = projAtTarget.projected - targetPt2.target;
      const gapFmt  = fmt(Math.abs(gap), 1);
      if (gap <= 0) {
        verdictEl.innerHTML = `<span class="tg-verdict-good">✓ At current pace you will meet your ${setup.targetYear} target — projected ${gapFmt} tCO₂e below target.</span>`;
      } else {
        verdictEl.innerHTML = `<span class="tg-verdict-warn">⚠ At current pace you will be ${gapFmt} tCO₂e above your ${setup.targetYear} target. Increase your annual reduction rate to close the gap.</span>`;
      }
    }
  }

  // Sub text for trajectory card
  const subEl = document.getElementById('traj-sub');
  if (setup.targetYear) {
    subEl.textContent = `From ${setup.baselineYear} baseline to ${setup.targetYear} target`;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════════════════
async function init() {
  const res = await api('/api/targets');
  if (!res) return;

  if (!res.ok) {
    document.getElementById('tg-empty').style.display = 'flex';
    return;
  }

  const d = await res.json();

  // Show empty state if no target or no baseline at all
  if (!d.setup.hasTarget && !d.setup.hasBaseline && d.overview.currentYearTotal === 0) {
    document.getElementById('tg-empty').style.display = 'flex';
    return;
  }

  document.getElementById('tg-content').style.display = 'block';

  renderOverview(d);
  renderScopes(d);
  renderYoY(d);
  renderFrameworks(d);
  renderTrajectory(d);
}

init();
