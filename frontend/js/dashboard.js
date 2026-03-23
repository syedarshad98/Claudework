/* OpsCommand Dashboard — API-driven frontend
 * Fetches all data from /api/* and renders into the existing HTML structure.
 */

const API = '';   // Same origin. Change to e.g. 'http://localhost:3000' for dev cross-origin.

// ── Utilities ─────────────────────────────────────────────────────────────────
function fmt(n)  { return Number(n).toLocaleString(); }
function pct(n)  { return Number(n).toFixed(1) + '%'; }
function abs(n)  { return Math.abs(Number(n)).toFixed(1); }

async function apiFetch(path) {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
}

// ── KPI Cards ─────────────────────────────────────────────────────────────────
async function loadKPI() {
  const d = await apiFetch('/api/kpi');

  document.getElementById('kpi-units').textContent       = fmt(d.units_produced);
  document.getElementById('kpi-units-delta').innerHTML   =
    `Target: ${fmt(d.units_target)} &nbsp; <span class="up">↑ ${((d.units_produced / d.units_target) * 100).toFixed(1)}%</span>`;

  document.getElementById('kpi-uptime').textContent      = pct(d.machine_uptime_pct);
  document.getElementById('kpi-uptime-delta').innerHTML  =
    `${d.machines_offline} machines offline &nbsp; <span class="down">↓ ${abs(d.uptime_delta)}%</span>`;

  document.getElementById('kpi-defect').textContent      = pct(d.defect_rate_pct);
  document.getElementById('kpi-defect-delta').innerHTML  =
    `Threshold: ${d.defect_threshold_pct}% &nbsp; <span class="up">↓ OK</span>`;

  document.getElementById('kpi-inv').textContent         = d.inventory_alerts;
  document.getElementById('kpi-inv-delta').innerHTML     =
    `${d.inventory_critical} critical, ${d.inventory_low} low &nbsp; <span class="down">↑ Action needed</span>`;

  document.getElementById('kpi-wo').textContent          = d.open_work_orders;
  document.getElementById('kpi-wo-delta').innerHTML      =
    `${d.work_orders_in_progress} in progress &nbsp; <span class="up">${d.work_orders_completed_today} completed today</span>`;

  // Also wire the work orders subtitle
  document.getElementById('wo-sub').textContent = `Active · ${d.open_work_orders} open orders`;
}

// ── Production Chart ──────────────────────────────────────────────────────────
const CHART = { X0: 40, X1: 510, Y0: 155, Y1: 20, MAX: 600 };

function toY(units) {
  return CHART.Y0 - (units / CHART.MAX) * (CHART.Y0 - CHART.Y1);
}

async function loadProduction() {
  const { today, yesterday } = await apiFetch('/api/production/hourly');

  const xPos = today.map((_, i) => {
    return Math.round(CHART.X0 + (i / (today.length - 1)) * (CHART.X1 - CHART.X0));
  });

  const todayPts     = today.map((d, i)     => `${xPos[i]},${toY(d.units).toFixed(1)}`).join(' ');
  const yesterdayPts = yesterday.map((d, i) => `${xPos[i]},${toY(d.units).toFixed(1)}`).join(' ');

  // Peak
  const peakIdx   = today.reduce((mi, d, i, arr) => d.units > arr[mi].units ? i : mi, 0);
  const peakX     = xPos[peakIdx];
  const peakY     = toY(today[peakIdx].units);
  const peakUnits = today[peakIdx].units;

  // Area fill (today line closed to bottom)
  const areaPts = `${todayPts} ${xPos[xPos.length - 1]},${CHART.Y0} ${xPos[0]},${CHART.Y0}`;

  // Dots
  const dots = today.map((d, i) => {
    const isMax  = i === peakIdx;
    const extra  = isMax ? ` stroke="#0a0c10" stroke-width="2"` : '';
    return `<circle cx="${xPos[i]}" cy="${toY(d.units).toFixed(1)}" r="${isMax ? 5 : 4}" fill="#00e5a0"${extra}/>`;
  }).join('');

  // X-axis labels
  const xLabels = today.map((d, i) =>
    `<text x="${xPos[i]}" y="170" fill="#5a6478" font-size="10" text-anchor="middle">${d.hour_label}</text>`
  ).join('');

  document.getElementById('chart-wrap').innerHTML = `
    <svg viewBox="0 0 520 180" width="100%" style="overflow:visible">
      <!-- Axes -->
      <line x1="40" y1="20"  x2="40"  y2="155" stroke="#232830" stroke-width="1"/>
      <line x1="40" y1="155" x2="510" y2="155" stroke="#232830" stroke-width="1"/>
      <!-- Grid -->
      <line x1="40" y1="100" x2="510" y2="100" stroke="#232830" stroke-width="0.5" stroke-dasharray="4,4"/>
      <line x1="40" y1="57"  x2="510" y2="57"  stroke="#232830" stroke-width="0.5" stroke-dasharray="4,4"/>
      <!-- Y labels -->
      <text x="32" y="159" fill="#5a6478" font-size="10" text-anchor="end">0</text>
      <text x="32" y="104" fill="#5a6478" font-size="10" text-anchor="end">250</text>
      <text x="32" y="61"  fill="#5a6478" font-size="10" text-anchor="end">420</text>
      <text x="32" y="24"  fill="#5a6478" font-size="10" text-anchor="end">600</text>
      <!-- Yesterday -->
      <polyline points="${yesterdayPts}" fill="none" stroke="#2a3040" stroke-width="2" stroke-linejoin="round"/>
      <!-- Today area fill -->
      <polygon  points="${areaPts}" fill="url(#prodGrad)" opacity="0.5"/>
      <!-- Today line -->
      <polyline points="${todayPts}" fill="none" stroke="#00e5a0" stroke-width="2.5" stroke-linejoin="round"/>
      <!-- Dots -->
      ${dots}
      <!-- Peak annotation -->
      <line x1="${peakX}" y1="${(peakY - 18).toFixed(1)}" x2="${peakX}" y2="${(peakY - 3).toFixed(1)}"
            stroke="#00e5a0" stroke-width="1" stroke-dasharray="3,3"/>
      <text x="${peakX}" y="${(peakY - 22).toFixed(1)}" fill="#00e5a0" font-size="10" text-anchor="middle">Peak: ${fmt(peakUnits)}/hr</text>
      <!-- X labels -->
      ${xLabels}
      <!-- Legend -->
      <line x1="360" y1="12" x2="380" y2="12" stroke="#00e5a0" stroke-width="2.5"/>
      <text x="384" y="16" fill="#5a6478" font-size="10">Today</text>
      <line x1="420" y1="12" x2="440" y2="12" stroke="#2a3040" stroke-width="2"/>
      <text x="444" y="16" fill="#5a6478" font-size="10">Yesterday</text>
      <defs>
        <linearGradient id="prodGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="#00e5a0" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#00e5a0" stop-opacity="0"/>
        </linearGradient>
      </defs>
    </svg>`;
}

// ── Machine Status ────────────────────────────────────────────────────────────
async function loadMachines() {
  const machines = await apiFetch('/api/machines');

  const offlineCount = machines.filter(m => m.status === 'offline').length;
  const warnCount    = machines.filter(m => m.status === 'warn').length;

  const tagEl = document.getElementById('machine-tag');
  tagEl.textContent = `${offlineCount} Offline`;
  tagEl.className   = offlineCount > 0 ? 'tag tag-warn' : 'tag tag-green';

  document.getElementById('machine-sub').textContent =
    `Real-time uptime · ${machines.length} machines monitored`;

  function fillClass(m) {
    if (m.status === 'offline') return 'fill-danger';
    if (m.status === 'warn')    return 'fill-warn';
    return 'fill-green';
  }

  document.getElementById('machine-grid').innerHTML = machines.map(m => `
    <div class="machine-item">
      <div class="machine-top">
        <div class="machine-name">${m.name}</div>
        <div class="status-dot ${m.status}"></div>
      </div>
      <div class="machine-uptime">${m.status_message}</div>
      <div class="progress-bar">
        <div class="progress-fill ${fillClass(m)}" style="width:${m.uptime_pct}%"></div>
      </div>
    </div>`).join('');
}

// ── Work Orders ───────────────────────────────────────────────────────────────
const WO_STATUS = {
  on_time:   { tag: 'tag-green',  fill: 'fill-green',  label: 'On Time'   },
  done:      { tag: 'tag-blue',   fill: 'fill-green',  label: 'Done'      },
  on_track:  { tag: 'tag-green',  fill: 'fill-green',  label: 'On Track'  },
  delayed:   { tag: 'tag-danger', fill: 'fill-danger', label: 'Delayed'   },
  scheduled: { tag: 'tag-blue',   fill: 'fill-blue',   label: 'Scheduled' },
};

async function loadWorkOrders() {
  const orders = await apiFetch('/api/workorders');

  document.getElementById('wo-list').innerHTML = orders.map(wo => {
    const s       = WO_STATUS[wo.status] || WO_STATUS.scheduled;
    const dueLine = wo.due_time === 'Tomorrow' ? 'Due: Tomorrow' : `Due: ${wo.due_time}`;
    return `
      <div class="wo-item">
        <div class="wo-id">${wo.order_id}</div>
        <div class="wo-info">
          <div class="wo-name">${wo.name}</div>
          <div class="wo-meta">${dueLine} · ${wo.line}</div>
        </div>
        <div class="wo-progress-wrap">
          <div class="wo-pct">${wo.progress_pct}%</div>
          <div class="progress-bar">
            <div class="progress-fill ${s.fill}" style="width:${wo.progress_pct}%"></div>
          </div>
        </div>
        <span class="tag ${s.tag}">${s.label}</span>
      </div>`;
  }).join('');
}

// ── Inventory ─────────────────────────────────────────────────────────────────
const INV_COLOR = { critical: '#ff4455', low: '#ffaa00', ok: '#00e5a0' };
const INV_FILL  = { critical: 'fill-danger', low: 'fill-warn', ok: 'fill-green' };
const INV_LABEL = { critical: 'CRITICAL', low: 'LOW', ok: 'OK' };

async function loadInventory() {
  const items      = await apiFetch('/api/inventory');
  const alertCount = items.filter(i => i.alert_level !== 'ok').length;

  const tagEl     = document.getElementById('inv-tag');
  tagEl.textContent = `${alertCount} Alert${alertCount !== 1 ? 's' : ''}`;
  tagEl.className   = alertCount > 0 ? 'tag tag-danger' : 'tag tag-green';

  document.getElementById('inv-list').innerHTML = items.map(item => `
    <div class="inv-item">
      <div class="inv-name">${item.name}</div>
      <div class="inv-bar-wrap">
        <div class="inv-levels">
          <span style="color:${INV_COLOR[item.alert_level]}">${INV_LABEL[item.alert_level]} — ${item.level_pct}%</span>
          <span>Reorder: ${item.reorder_threshold_pct}%</span>
        </div>
        <div class="progress-bar" style="height:6px">
          <div class="progress-fill ${INV_FILL[item.alert_level]}" style="width:${item.level_pct}%"></div>
        </div>
      </div>
    </div>`).join('');
}

// ── Quality Control (Donut) ───────────────────────────────────────────────────
async function loadQuality() {
  const { metrics, units_inspected } = await apiFetch('/api/quality');

  const r            = 62;
  const circumference = 2 * Math.PI * r;

  // Render order: defects first (small slices), pass last (dominant)
  const SEGMENT_ORDER = ['surface_defect', 'dimensional_error', 'assembly_fault', 'passed'];
  let accumulated = 0;

  const segments = SEGMENT_ORDER.map(cat => {
    const m = metrics.find(x => x.category === cat);
    if (!m) return '';
    const dash   = (m.pct / 100) * circumference;
    const gap    = circumference - dash;
    const offset = -accumulated;
    accumulated += dash;
    return `<circle cx="80" cy="80" r="${r}" fill="none" stroke="${m.color}" stroke-width="18"
      stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}"
      stroke-dashoffset="${offset.toFixed(2)}"
      transform="rotate(-90 80 80)"/>`;
  }).join('');

  const passed   = metrics.find(m => m.category === 'passed');
  const passRate = passed ? passed.pct.toFixed(1) : '—';

  // Legend sorted: passed first, then defects descending
  const legendOrder  = ['passed', 'surface_defect', 'dimensional_error', 'assembly_fault'];
  const legendItems = legendOrder.map(cat => {
    const m = metrics.find(x => x.category === cat);
    if (!m) return '';
    return `
      <div class="legend-item">
        <div class="legend-dot" style="background:${m.color}"></div>
        <div class="legend-text">${m.label}</div>
        <div class="legend-val">${m.pct}%</div>
      </div>`;
  }).join('');

  document.getElementById('quality-wrap').innerHTML = `
    <div class="donut-wrap">
      <svg viewBox="0 0 160 160" width="160" height="160">
        <circle cx="80" cy="80" r="${r}" fill="none" stroke="#232830" stroke-width="18"/>
        ${segments}
      </svg>
      <div class="donut-center">
        <div class="donut-pct">${passRate}%</div>
        <div class="donut-label">PASS RATE</div>
      </div>
    </div>
    <div class="quality-legend">
      ${legendItems}
      <div style="margin-top:16px; padding-top:16px; border-top:1px solid var(--border)">
        <div style="font-size:12px; color:var(--muted); font-family:'DM Mono',monospace; margin-bottom:6px">Units inspected today</div>
        <div style="font-family:'Syne',sans-serif; font-weight:800; font-size:22px; color:var(--text)">
          ${fmt(units_inspected)}
          <span style="font-size:13px; color:var(--muted); font-family:'DM Mono',monospace">units</span>
        </div>
      </div>
    </div>`;
}

// ── Alert Ticker ──────────────────────────────────────────────────────────────
let _tickerAlerts = [];

function buildTickerItem(alert) {
  const highlight = alert.highlight_class
    ? `<span class="${alert.highlight_class}">${alert.message_highlight}</span>`
    : `<span>${alert.message_highlight}</span>`;
  return `<div class="ticker-item">${alert.message_before}${highlight}</div>`;
}

function rebuildTicker(alerts) {
  if (!alerts.length) return;
  _tickerAlerts = alerts;
  const scroll = document.getElementById('ticker-scroll');
  // Duplicate list so the CSS scroll animation loops seamlessly
  const html = alerts.map(buildTickerItem).join('') + alerts.map(buildTickerItem).join('');
  scroll.innerHTML = html;
  // Scale animation duration to content length
  const duration = Math.max(20, alerts.length * 5);
  scroll.style.animationDuration = `${duration}s`;
}

async function loadAlerts() {
  const alerts = await apiFetch('/api/alerts');
  rebuildTicker(alerts);
}

function connectAlertStream() {
  const es = new EventSource(`${API}/api/alerts/stream`);

  es.addEventListener('new_alert', (e) => {
    try {
      const alert      = JSON.parse(e.data);
      const alreadyHas = _tickerAlerts.some(a => a.id === alert.id);
      if (!alreadyHas) {
        // Add genuinely new alert and rebuild; otherwise just let the cycle run
        rebuildTicker([..._tickerAlerts, alert]);
      }
    } catch (_) { /* ignore malformed events */ }
  });

  es.onerror = () => {
    es.close();
    // Reconnect after 5 s
    setTimeout(connectAlertStream, 5000);
  };
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  try {
    await Promise.all([
      loadKPI(),
      loadProduction(),
      loadMachines(),
      loadWorkOrders(),
      loadInventory(),
      loadQuality(),
      loadAlerts(),
    ]);
  } catch (err) {
    console.error('Dashboard load error:', err);
  }

  connectAlertStream();
}

document.addEventListener('DOMContentLoaded', init);
