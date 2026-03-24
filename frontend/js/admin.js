const TOKEN_KEY = 'ops_admin_token';

// ── Auth helpers ──────────────────────────────────────────────────────────────

const getToken   = () => sessionStorage.getItem(TOKEN_KEY);
const setToken   = t  => sessionStorage.setItem(TOKEN_KEY, t);
const clearToken = () => sessionStorage.removeItem(TOKEN_KEY);

async function api(method, path, body) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`
    }
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch('/api/admin' + path, opts);
  if (res.status === 401) { clearToken(); location.reload(); }
  return res;
}

// ── Login ─────────────────────────────────────────────────────────────────────

document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errEl    = document.getElementById('login-error');
  errEl.hidden   = true;

  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  if (res.ok) {
    const { token } = await res.json();
    setToken(token);
    showAdmin();
  } else {
    errEl.textContent = 'Invalid username or password.';
    errEl.hidden = false;
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  clearToken();
  location.reload();
});

// ── Screen toggle ─────────────────────────────────────────────────────────────

function showAdmin() {
  document.getElementById('login-screen').hidden = true;
  document.getElementById('admin-panel').hidden  = false;
  loadAll();
}

// On page load: skip login if already authenticated
if (getToken()) showAdmin();

// ── Load all sections ─────────────────────────────────────────────────────────

function loadAll() {
  Promise.all([loadKPI(), loadMachines(), loadWorkOrders(), loadInventory(), loadQuality()]);
}

async function loadKPI() {
  const kpi = await fetch('/api/kpi').then(r => r.json());
  document.getElementById('kpi-units').value      = kpi.units_produced;
  document.getElementById('kpi-uptime').value     = kpi.machine_uptime_pct;
  document.getElementById('kpi-defect').value     = kpi.defect_rate_pct;
  document.getElementById('kpi-inv-alerts').value = kpi.inventory_alerts;
  document.getElementById('kpi-workorders').value = kpi.open_work_orders;
}

async function loadMachines() {
  const machines = await fetch('/api/machines').then(r => r.json());
  document.getElementById('machines-list').innerHTML = machines.map(m => `
    <div class="machine-row" data-id="${m.id}">
      <span class="machine-name">${m.name}</span>
      <div class="machine-controls">
        <select class="machine-status">
          <option value="online"  ${m.status === 'online'  ? 'selected' : ''}>Online</option>
          <option value="warn"    ${m.status === 'warn'    ? 'selected' : ''}>Warning</option>
          <option value="offline" ${m.status === 'offline' ? 'selected' : ''}>Offline</option>
        </select>
        <div class="uptime-field">
          <input type="number" class="machine-uptime" value="${m.uptime_pct}" min="0" max="100" step="0.1">
          <span>%</span>
        </div>
      </div>
    </div>
  `).join('');
}

async function loadWorkOrders() {
  const orders = await fetch('/api/workorders').then(r => r.json());
  document.getElementById('workorders-list').innerHTML = orders.map(o => `
    <div class="wo-row" data-id="${o.id}">
      <div class="wo-info">
        <span class="wo-id">${o.order_id}</span>
        <span class="wo-name">${o.name}</span>
      </div>
      <div class="wo-controls">
        <div class="uptime-field">
          <input type="number" class="wo-progress" value="${o.progress_pct}" min="0" max="100">
          <span>%</span>
        </div>
        <select class="wo-status">
          <option value="on_time"   ${o.status === 'on_time'   ? 'selected' : ''}>On Time</option>
          <option value="on_track"  ${o.status === 'on_track'  ? 'selected' : ''}>On Track</option>
          <option value="done"      ${o.status === 'done'      ? 'selected' : ''}>Done</option>
          <option value="delayed"   ${o.status === 'delayed'   ? 'selected' : ''}>Delayed</option>
          <option value="scheduled" ${o.status === 'scheduled' ? 'selected' : ''}>Scheduled</option>
        </select>
      </div>
    </div>
  `).join('');
}

async function loadInventory() {
  const items = await fetch('/api/inventory').then(r => r.json());
  document.getElementById('inventory-list').innerHTML = items.map(item => `
    <div class="inv-row" data-id="${item.id}">
      <span class="inv-name">${item.name}</span>
      <div class="inv-controls">
        <div class="uptime-field">
          <input type="number" class="inv-level" value="${item.level_pct}" min="0" max="100" step="0.1">
          <span>%</span>
        </div>
        <select class="inv-alert">
          <option value="ok"       ${item.alert_level === 'ok'       ? 'selected' : ''}>OK</option>
          <option value="low"      ${item.alert_level === 'low'      ? 'selected' : ''}>Low</option>
          <option value="critical" ${item.alert_level === 'critical' ? 'selected' : ''}>Critical</option>
        </select>
      </div>
    </div>
  `).join('');
}

async function loadQuality() {
  const { metrics } = await fetch('/api/quality').then(r => r.json());
  document.getElementById('quality-list').innerHTML = metrics.map(m => `
    <div class="quality-row" data-id="${m.id}">
      <span class="quality-label">${m.label}</span>
      <div class="uptime-field">
        <input type="number" class="quality-pct" value="${m.pct}" min="0" max="100" step="0.1">
        <span>%</span>
      </div>
    </div>
  `).join('');
}

// ── Save feedback ─────────────────────────────────────────────────────────────

function showStatus(el, ok) {
  el.textContent = ok ? 'Saved!' : 'Error saving.';
  el.className   = 'save-status ' + (ok ? 'ok' : 'err');
  setTimeout(() => { el.textContent = ''; el.className = 'save-status'; }, 2500);
}

// ── Save handlers ─────────────────────────────────────────────────────────────

document.getElementById('kpi-form').addEventListener('submit', async e => {
  e.preventDefault();
  const res = await api('PUT', '/kpi', {
    units_produced:     +document.getElementById('kpi-units').value,
    machine_uptime_pct: +document.getElementById('kpi-uptime').value,
    defect_rate_pct:    +document.getElementById('kpi-defect').value,
    inventory_alerts:   +document.getElementById('kpi-inv-alerts').value,
    open_work_orders:   +document.getElementById('kpi-workorders').value
  });
  showStatus(document.getElementById('kpi-status'), res.ok);
});

document.getElementById('save-machines').addEventListener('click', async () => {
  const statusEl = document.getElementById('machines-status');
  try {
    const rows = document.querySelectorAll('#machines-list .machine-row');
    await Promise.all([...rows].map(row => api('PUT', `/machines/${row.dataset.id}`, {
      status:     row.querySelector('.machine-status').value,
      uptime_pct: +row.querySelector('.machine-uptime').value
    })));
    showStatus(statusEl, true);
  } catch { showStatus(statusEl, false); }
});

document.getElementById('save-workorders').addEventListener('click', async () => {
  const statusEl = document.getElementById('workorders-status');
  try {
    const rows = document.querySelectorAll('#workorders-list .wo-row');
    await Promise.all([...rows].map(row => api('PUT', `/workorders/${row.dataset.id}`, {
      progress_pct: +row.querySelector('.wo-progress').value,
      status:        row.querySelector('.wo-status').value
    })));
    showStatus(statusEl, true);
  } catch { showStatus(statusEl, false); }
});

document.getElementById('save-inventory').addEventListener('click', async () => {
  const statusEl = document.getElementById('inventory-status');
  try {
    const rows = document.querySelectorAll('#inventory-list .inv-row');
    await Promise.all([...rows].map(row => api('PUT', `/inventory/${row.dataset.id}`, {
      level_pct:   +row.querySelector('.inv-level').value,
      alert_level:  row.querySelector('.inv-alert').value
    })));
    showStatus(statusEl, true);
  } catch { showStatus(statusEl, false); }
});

document.getElementById('save-quality').addEventListener('click', async () => {
  const statusEl = document.getElementById('quality-status');
  try {
    const rows = document.querySelectorAll('#quality-list .quality-row');
    await Promise.all([...rows].map(row => api('PUT', `/quality/${row.dataset.id}`, {
      pct: +row.querySelector('.quality-pct').value
    })));
    showStatus(statusEl, true);
  } catch { showStatus(statusEl, false); }
});
