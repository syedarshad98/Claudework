/* ─────────────────────────────────────────────────────────────────────────────
   ClearTrace — brsr-p6.js
   BRSR Principle 6 — Environment data entry form.
   Follows brsr-section-a.js patterns throughout.
   ───────────────────────────────────────────────────────────────────────────── */

// ── Auth guard ────────────────────────────────────────────────────────────────
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
  el.className = `sa-toast sa-toast-${type}`;
  el.textContent = message;
  document.getElementById('sa-toast-container').appendChild(el);
  setTimeout(() => el.classList.add('sa-toast-show'), 10);
  setTimeout(() => { el.classList.remove('sa-toast-show'); setTimeout(() => el.remove(), 300); }, 3500);
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const escAttr = escHtml;

// ── FY helpers ────────────────────────────────────────────────────────────────
function currentIndianFY() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return m >= 4
    ? `${y}-${String(y + 1).slice(2)}`
    : `${y - 1}-${String(y).slice(2)}`;
}

function buildFYOptions() {
  const sel = document.getElementById('fy-select');
  const now = new Date();
  const baseYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  for (let i = 0; i < 3; i++) {
    const startYear = baseYear - i;
    const fy  = `${startYear}-${String(startYear + 1).slice(2)}`;
    const opt = document.createElement('option');
    opt.value = fy; opt.textContent = `FY ${fy}`;
    sel.appendChild(opt);
  }
}

// ── State ─────────────────────────────────────────────────────────────────────
let submissionId      = null;
let currentFY         = null;
let currentCategories = [];
let companyMeta       = {};
let annualRevenueCr   = null;
let editMode          = false;
let unsavedChanges    = false;
let autoSaveTimer     = null;
let _isLocked         = false;

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_LABELS = {
  draft:            { label: 'Draft',            cls: 'sa-status-draft'   },
  in_review:        { label: 'In Review',         cls: 'sa-status-review'  },
  locked:           { label: 'Locked',            cls: 'sa-status-locked'  },
  unlock_requested: { label: 'Unlock Requested',  cls: 'sa-status-pending' },
  filed:            { label: 'Filed',             cls: 'sa-status-filed'   },
};
function renderStatusBadge(status) {
  const s  = STATUS_LABELS[status] || { label: status, cls: '' };
  const el = document.getElementById('status-badge');
  el.textContent = s.label;
  el.className   = `sa-status-badge ${s.cls}`;
}

// ── Save status ───────────────────────────────────────────────────────────────
function setSaveStatus(state) {
  const el = document.getElementById('save-status');
  if (!el) return;
  el.style.display = state ? '' : 'none';
  if (state === 'saving') { el.textContent = 'Saving…';   el.className = 'sa-save-status sa-save-saving'; }
  if (state === 'saved')  { el.textContent = '✓ Saved';   el.className = 'sa-save-status sa-save-saved';  }
  if (state === 'unsaved'){ el.textContent = '● Unsaved'; el.className = 'sa-save-status sa-save-unsaved';}
}
function setUnsaved(val) {
  unsavedChanges = val;
  if (val) setSaveStatus('unsaved'); else setSaveStatus('saved');
}

// ── Completion bar ────────────────────────────────────────────────────────────
const SPECIALIST_TYPES = new Set([
  'water_withdrawal_table','air_emissions_table','waste_table',
  'waste_recovery_table','waste_disposal_table',
]);

function updateCompletion() {
  let total = 0, filled = 0;
  for (const cat of currentCategories) {
    for (const f of cat.fields) {
      total++;
      const v = f.value;
      if      (SPECIALIST_TYPES.has(f.type)) { if (v && typeof v === 'object' && Object.keys(v).length) filled++; }
      else if (f.type === 'dynamic_table')   { if (Array.isArray(v) && v.length) filled++; }
      else if (f.type === 'multiselect')     { if (Array.isArray(v) && v.length) filled++; }
      else                                   { if (v != null && v !== '') filled++; }
    }
  }
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  document.getElementById('completion-bar').style.width  = `${pct}%`;
  document.getElementById('completion-pct').textContent  = `${pct}% complete`;
  document.getElementById('completion-wrap').style.display = '';
  const reviewBtn = document.getElementById('review-btn');
  if (reviewBtn) reviewBtn.style.display = (CAN_EDIT && pct >= 80 && !_isLocked) ? '' : 'none';
}

// ── Panel toggle ──────────────────────────────────────────────────────────────
window.togglePanel = function(header) {
  header.closest('.sa-panel').classList.toggle('sa-panel--collapsed');
};
window.toggleLeadership = function(header) {
  const body = document.getElementById('p6-leadership-body');
  if (!body) return;
  body.classList.toggle('p6-leadership-body--collapsed');
  const chev = header.querySelector('.p6-leadership-chevron');
  if (chev) chev.style.transform = body.classList.contains('p6-leadership-body--collapsed') ? 'rotate(-90deg)' : '';
};

// ── Field lookup ──────────────────────────────────────────────────────────────
function getFieldByKey(key) {
  for (const cat of currentCategories) {
    const f = cat.fields.find(f => f.key === key);
    if (f) return f;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SPECIALIST TABLE RENDERER
// Reads field.table_schema: { rows: [{key,label,bold}], columns: [{key,label,type}] }
// ─────────────────────────────────────────────────────────────────────────────
function renderSpecialistTable(field, em) {
  const schema = field.table_schema;
  const value  = (field.value && typeof field.value === 'object') ? field.value : {};
  if (!schema) return '<span class="sa-no-data">—</span>';

  const { rows, columns } = schema;
  let html = `<div class="p6-spec-wrap"><div class="p6-spec-scroll"><table class="p6-spec-table">
    <thead><tr>
      <th class="p6-spec-th p6-spec-label-col">Parameter</th>
      ${columns.map(c => `<th class="p6-spec-th">${escHtml(c.label)}</th>`).join('')}
    </tr></thead>
    <tbody>`;

  for (const row of rows) {
    const rowVal  = value[row.key] || {};
    const boldCls = row.bold ? ' p6-spec-bold' : '';
    html += `<tr><td class="p6-spec-label${boldCls}">${escHtml(row.label)}</td>`;

    for (const col of columns) {
      const cellVal = rowVal[col.key] ?? '';
      if (em) {
        const inputType = col.type === 'text' ? 'text' : 'number';
        html += `<td class="p6-spec-td">
          <input class="p6-spec-input" type="${inputType}"
            data-spec-field="${escAttr(field.key)}"
            data-spec-row="${escAttr(row.key)}"
            data-spec-col="${escAttr(col.key)}"
            ${col.type !== 'text' ? 'step="any" min="0"' : ''}
            value="${escAttr(String(cellVal))}">
        </td>`;
      } else {
        const display = cellVal !== '' && cellVal !== null ? escHtml(String(cellVal)) : '—';
        html += `<td class="p6-spec-td${boldCls}">${display}</td>`;
      }
    }
    html += '</tr>';
  }

  html += `</tbody></table></div></div>`;
  return html;
}

function collectSpecialistTable(key) {
  const result = {};
  document.querySelectorAll(`[data-spec-field="${key}"]`).forEach(inp => {
    const row = inp.dataset.specRow;
    const col = inp.dataset.specCol;
    if (!result[row]) result[row] = {};
    const raw = inp.value.trim();
    result[row][col] = inp.type === 'number' ? (raw === '' ? null : parseFloat(raw)) : (raw || null);
  });
  return Object.keys(result).length ? result : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD RENDERER  (handles all SA types + specialist tables)
// ─────────────────────────────────────────────────────────────────────────────
function renderField(field, em) {
  const { key, type, value, options } = field;

  // Specialist tables
  if (SPECIALIST_TYPES.has(type)) return renderSpecialistTable(field, em);

  // Readonly (e.g. emission_factor_source)
  if (field.readonly) {
    const display = value != null && value !== '' ? escHtml(value) : '<span class="sa-no-data">—</span>';
    return `<span class="p6-readonly-value">${display}</span>`;
  }

  // Calculated — editable but auto-derived; show unit hint
  if (field.calculated) {
    if (!em) {
      return value != null ? `<span class="sa-field-value">${Number(value).toFixed(field.precision ?? 8)}</span>` : '<span class="sa-no-data">—</span>';
    }
    return `<div style="display:flex;align-items:center;gap:6px">
      <input class="sa-input p6-calc-input" type="number" step="any" data-key="${key}" data-type="number"
        value="${value != null ? value : ''}" readonly>
      <span class="p6-calc-hint">${escHtml(field.unit || '')} · auto-calculated</span>
    </div>`;
  }

  if (!em) {
    switch (type) {
      case 'text':     return value ? `<span class="sa-field-value">${escHtml(value)}</span>` : '<span class="sa-no-data">—</span>';
      case 'textarea': return value ? `<span class="sa-field-value sa-field-multiline">${escHtml(value)}</span>` : '<span class="sa-no-data">—</span>';
      case 'number':   return value != null ? `<span class="sa-field-value">${Number(value).toLocaleString()}</span>` : '<span class="sa-no-data">—</span>';
      case 'select':   return value ? `<span class="sa-badge">${escHtml(value)}</span>` : '<span class="sa-no-data">—</span>';
      case 'dynamic_table': return renderDynamicTable(field, false);
      default: return '<span class="sa-no-data">—</span>';
    }
  }

  // Edit mode
  switch (type) {
    case 'text':
      return `<input class="sa-input" type="text" data-key="${key}" data-type="text" value="${escAttr(value || '')}">`;
    case 'textarea':
      return `<textarea class="sa-input sa-textarea" data-key="${key}" data-type="text" rows="3">${escHtml(value || '')}</textarea>`;
    case 'number':
      return `<input class="sa-input" type="number" step="any" data-key="${key}" data-type="number" value="${value != null ? value : ''}">`;
    case 'select': {
      const selOpts = (options || []).map(o =>
        `<option value="${escAttr(o)}" ${value === o ? 'selected' : ''}>${escHtml(o)}</option>`
      ).join('');
      return `<select class="sa-input" data-key="${key}" data-type="select"><option value="">—</option>${selOpts}</select>`;
    }
    case 'dynamic_table': return renderDynamicTable(field, true);
    default: return '<span class="sa-no-data">—</span>';
  }
}

// ── Dynamic table (reused from Section A) ─────────────────────────────────────
function renderDynamicTable(field, em) {
  const { key, columns } = field;
  const rows = Array.isArray(field.value) ? field.value : [];

  if (!em) {
    if (!rows.length) return '<span class="sa-no-data">No entries</span>';
    return `<div class="sa-dt-scroll"><table class="sa-dt-table">
      <thead><tr>${columns.map(c => `<th class="sa-dt-th">${escHtml(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(row =>
        `<tr>${columns.map(c => `<td class="sa-dt-td">${escHtml(String(row[c.key] ?? '—'))}</td>`).join('')}</tr>`
      ).join('')}</tbody></table></div>`;
  }

  const ensuredRows = rows.length ? rows : [{}];
  const makeRow = (row, idx, isOnly) => `
    <tr data-dt-row="${idx}">
      ${columns.map(c => {
        const val = row[c.key] ?? '';
        let cell;
        if (c.type === 'select') {
          const opts = (c.options || []).map(o =>
            `<option value="${escAttr(o)}" ${val === o ? 'selected' : ''}>${escHtml(o)}</option>`
          ).join('');
          cell = `<select class="sa-dt-input" data-dt-col="${c.key}" data-dt-type="select"><option value="">—</option>${opts}</select>`;
        } else if (c.type === 'number') {
          cell = `<input class="sa-dt-input" type="number" step="any" data-dt-col="${c.key}" data-dt-type="number" value="${escAttr(String(val))}">`;
        } else {
          cell = `<input class="sa-dt-input" type="text" data-dt-col="${c.key}" data-dt-type="text" value="${escAttr(String(val))}">`;
        }
        return `<td class="sa-dt-td">${cell}</td>`;
      }).join('')}
      <td class="sa-dt-td sa-dt-td-action">
        <button class="sa-dt-remove-btn" onclick="removeDTRow(this,'${key}')" ${isOnly ? 'disabled' : ''}>✕</button>
      </td>
    </tr>`;

  const tbodyRows = ensuredRows.map((row, i) => makeRow(row, i, ensuredRows.length === 1)).join('');
  return `<div class="sa-dt-wrap" data-dt-container="${key}">
    <div class="sa-dt-scroll"><table class="sa-dt-table">
      <thead><tr>
        ${columns.map(c => `<th class="sa-dt-th">${escHtml(c.label)}</th>`).join('')}
        <th class="sa-dt-th sa-dt-th-action"></th>
      </tr></thead>
      <tbody>${tbodyRows}</tbody>
    </table></div>
    <button class="sa-dt-add-btn btn btn-outline" onclick="addDTRow('${key}')">+ Add Row</button>
  </div>`;
}

window.addDTRow = function(key) {
  const container = document.querySelector(`[data-dt-container="${key}"]`);
  if (!container) return;
  const tbody = container.querySelector('tbody');
  const field  = getFieldByKey(key);
  if (!field) return;
  const newIdx = tbody.querySelectorAll('[data-dt-row]').length;
  const tr = document.createElement('tr');
  tr.dataset.dtRow = newIdx;
  tr.innerHTML = field.columns.map(c => {
    let cell;
    if (c.type === 'select') {
      const opts = (c.options || []).map(o => `<option value="${escAttr(o)}">${escHtml(o)}</option>`).join('');
      cell = `<select class="sa-dt-input" data-dt-col="${c.key}" data-dt-type="select"><option value="">—</option>${opts}</select>`;
    } else if (c.type === 'number') {
      cell = `<input class="sa-dt-input" type="number" step="any" data-dt-col="${c.key}" data-dt-type="number" value="">`;
    } else {
      cell = `<input class="sa-dt-input" type="text" data-dt-col="${c.key}" data-dt-type="text" value="">`;
    }
    return `<td class="sa-dt-td">${cell}</td>`;
  }).join('') + `<td class="sa-dt-td sa-dt-td-action">
    <button class="sa-dt-remove-btn" onclick="removeDTRow(this,'${key}')">✕</button></td>`;
  tbody.appendChild(tr);
  container.querySelectorAll('.sa-dt-remove-btn').forEach(btn => { btn.disabled = false; });
  setUnsaved(true); scheduleAutoSave();
};

window.removeDTRow = function(btn, key) {
  const tr        = btn.closest('[data-dt-row]');
  const container = btn.closest('[data-dt-container]');
  tr.remove();
  const rows = container.querySelectorAll('[data-dt-row]');
  rows.forEach((r, i) => { r.dataset.dtRow = i; });
  if (rows.length === 1) container.querySelector('.sa-dt-remove-btn').disabled = true;
  setUnsaved(true); scheduleAutoSave();
};

// ─────────────────────────────────────────────────────────────────────────────
// INTENSITY AUTO-CALCULATION
// ─────────────────────────────────────────────────────────────────────────────
// Keys that trigger a recalc when their input changes
const INTENSITY_TRIGGERS = new Set([
  'electricity_consumption_current', 'fuel_consumption_current', 'other_energy_current',
  'electricity_consumption_previous','fuel_consumption_previous','other_energy_previous',
  'water_consumption_current', 'water_consumption_previous',
  'scope1_current','scope2_current','scope1_previous','scope2_previous',
  'scope3_current','scope3_previous',
]);

function getNumVal(key) {
  const inp = document.querySelector(`[data-key="${key}"]`);
  if (!inp) return null;
  const v = parseFloat(inp.value);
  return isNaN(v) ? null : v;
}
function setCalcVal(key, val) {
  const inp = document.querySelector(`[data-key="${key}"]`);
  if (!inp) return;
  inp.value = val !== null ? Number(val.toPrecision(10)) : '';
}

function recalcIntensities() {
  if (!annualRevenueCr) return;
  const rev = annualRevenueCr;

  // Energy
  const elec  = getNumVal('electricity_consumption_current');
  const fuel  = getNumVal('fuel_consumption_current');
  const other = getNumVal('other_energy_current');
  if (elec !== null || fuel !== null || other !== null) {
    setCalcVal('energy_intensity_per_rupee_current', ((elec ?? 0) + (fuel ?? 0) + (other ?? 0)) / rev);
  }
  const elecP  = getNumVal('electricity_consumption_previous');
  const fuelP  = getNumVal('fuel_consumption_previous');
  const otherP = getNumVal('other_energy_previous');
  if (elecP !== null || fuelP !== null || otherP !== null) {
    setCalcVal('energy_intensity_per_rupee_previous', ((elecP ?? 0) + (fuelP ?? 0) + (otherP ?? 0)) / rev);
  }

  // Water
  const water = getNumVal('water_consumption_current');
  if (water !== null) setCalcVal('water_intensity_per_rupee_current', water / rev);
  const waterP = getNumVal('water_consumption_previous');
  if (waterP !== null) setCalcVal('water_intensity_per_rupee_previous', waterP / rev);

  // GHG (Scope 1 + 2)
  const s1 = getNumVal('scope1_current'), s2 = getNumVal('scope2_current');
  if (s1 !== null || s2 !== null) setCalcVal('ghg_intensity_per_rupee_current', ((s1 ?? 0) + (s2 ?? 0)) / rev);
  const s1p = getNumVal('scope1_previous'), s2p = getNumVal('scope2_previous');
  if (s1p !== null || s2p !== null) setCalcVal('ghg_intensity_per_rupee_previous', ((s1p ?? 0) + (s2p ?? 0)) / rev);

  // Scope 3
  const s3 = getNumVal('scope3_current');
  if (s3 !== null) setCalcVal('scope3_intensity_per_rupee_current', s3 / rev);
  const s3p = getNumVal('scope3_previous');
  if (s3p !== null) setCalcVal('scope3_intensity_per_rupee_previous', s3p / rev);
}

// ─────────────────────────────────────────────────────────────────────────────
// INPUT EVENT DELEGATION
// ─────────────────────────────────────────────────────────────────────────────
document.getElementById('p6-panels').addEventListener('input', e => {
  if (!editMode) return;
  const inp = e.target;
  const key = inp.dataset.key;
  if (key && INTENSITY_TRIGGERS.has(key)) recalcIntensities();
  setUnsaved(true);
  scheduleAutoSave();
});

// ─────────────────────────────────────────────────────────────────────────────
// COLLECT FIELD VALUES FROM DOM
// ─────────────────────────────────────────────────────────────────────────────
function collectDynamicTable(key) {
  const container = document.querySelector(`[data-dt-container="${key}"]`);
  if (!container) return undefined;
  const result = [];
  container.querySelectorAll('[data-dt-row]').forEach(tr => {
    const rowData = {};
    tr.querySelectorAll('[data-dt-col]').forEach(inp => {
      const col = inp.dataset.dtCol;
      const raw = inp.value.trim();
      rowData[col] = inp.dataset.dtType === 'number'
        ? (raw === '' ? null : parseFloat(raw))
        : (raw || null);
    });
    result.push(rowData);
  });
  return result;
}

function collectFieldValue(field) {
  const { key, type } = field;
  if (SPECIALIST_TYPES.has(type)) return collectSpecialistTable(key);
  if (type === 'dynamic_table')   return collectDynamicTable(key);
  if (field.readonly) return undefined; // never overwrite server-stamped readonly fields

  const inp = document.querySelector(`[data-key="${key}"]`);
  if (!inp) return undefined;
  if (type === 'number' || field.calculated) {
    return inp.value === '' ? null : parseFloat(inp.value);
  }
  return inp.value || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER PANELS
// ─────────────────────────────────────────────────────────────────────────────
function renderPanels(em) {
  const container = document.getElementById('p6-panels');
  container.innerHTML = '';

  const essentialCats  = currentCategories.filter(c => !c.leadership);
  const leadershipCats = currentCategories.filter(c =>  c.leadership);

  // Essential indicator panels
  for (const cat of essentialCats) {
    const panel = buildPanel(cat, em);
    container.appendChild(panel);
    if (cat.brsr_core && submissionId) {
      const evEl = panel.querySelector(`#ev-${cat.category}`);
      if (evEl) mountEvidenceWidget(evEl, submissionId, cat.field_ref, { readonly: _isLocked });
    }
  }

  // Leadership section (collapsed by default)
  if (leadershipCats.length) {
    const section = document.createElement('div');
    section.className = 'p6-leadership-section';
    section.innerHTML = `
      <div class="p6-leadership-header" onclick="toggleLeadership(this)">
        <span>Leadership Indicators (voluntary)</span>
        <span class="p6-leadership-chevron" style="transition:transform .2s">▾</span>
      </div>
      <div class="p6-leadership-body p6-leadership-body--collapsed" id="p6-leadership-body"></div>`;
    container.appendChild(section);
    const body = section.querySelector('#p6-leadership-body');
    for (const cat of leadershipCats) {
      body.appendChild(buildPanel(cat, em));
    }
  }
}

function buildPanel(cat, em) {
  const panel = document.createElement('div');
  panel.className = 'card sa-panel';
  panel.dataset.category = cat.category;

  const coreBadge = cat.brsr_core
    ? `<span class="p6-core-badge">● BRSR Core — Assurance Required</span>`
    : '';

  const fieldRows = cat.fields.map(f => `
    <div class="sa-field-row">
      <div class="sa-field-label">${escHtml(f.label)}${f.unit ? `<span class="p6-unit-hint"> (${escHtml(f.unit)})</span>` : ''}</div>
      <div class="sa-field-value-wrap">${renderField(f, em)}</div>
    </div>`).join('');

  const evidenceSlot = cat.brsr_core
    ? `<div class="p6-evidence-slot" id="ev-${cat.category}"></div>`
    : '';

  panel.innerHTML = `
    <div class="sa-panel-header" onclick="togglePanel(this)">
      <div class="sa-panel-header-left">
        <div class="sa-panel-title">${escHtml(cat.label)}</div>
        ${coreBadge}
      </div>
      <div class="sa-panel-chevron">▾</div>
    </div>
    <div class="sa-panel-body">
      ${fieldRows}
      ${evidenceSlot}
    </div>`;

  return panel;
}

// ─────────────────────────────────────────────────────────────────────────────
// SAVE
// ─────────────────────────────────────────────────────────────────────────────
async function saveAll() {
  if (!editMode || !submissionId) return;
  setSaveStatus('saving');

  const saves = [];
  for (const cat of currentCategories) {
    for (const f of cat.fields) {
      const value = collectFieldValue(f);
      if (value === undefined) continue;
      saves.push({ key: f.key, value });
    }
  }

  let errors = 0;
  for (const payload of saves) {
    const r = await api('PUT', `/api/brsr/p6/${submissionId}`, payload);
    if (!r || !r.ok) errors++;
  }

  if (errors) {
    showToast(`${errors} field(s) failed to save`, 'error');
    setSaveStatus('unsaved');
  } else {
    setUnsaved(false);
    await reloadP6();
  }
}

function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(saveAll, 800);
}

// ─────────────────────────────────────────────────────────────────────────────
// LOAD DATA
// ─────────────────────────────────────────────────────────────────────────────
function onLockStatusChange(newStatus) {
  _isLocked = newStatus === 'locked' || newStatus === 'unlock_requested';
  renderStatusBadge(newStatus);
  if (_isLocked) {
    if (editMode) { clearTimeout(autoSaveTimer); editMode = false; }
    renderPanels(false);
    document.getElementById('edit-btn').style.display    = 'none';
    document.getElementById('save-btn').style.display    = 'none';
    document.getElementById('save-status').style.display = 'none';
  } else {
    if (CAN_EDIT) document.getElementById('edit-btn').style.display = '';
  }
}

async function loadSubmission(fy) {
  const res = await api('GET', `/api/brsr/submission?fy=${fy}`);
  if (!res || !res.ok) { showToast('Failed to load submission', 'error'); return false; }
  const data = await res.json();
  submissionId = data.submission.id;
  companyMeta  = data.company;
  renderStatusBadge(data.submission.status);
  return data.submission;
}

async function reloadP6() {
  const res = await api('GET', `/api/brsr/p6/${submissionId}`);
  if (!res || !res.ok) { showToast('Failed to load P6 data', 'error'); return; }
  const data = await res.json();

  currentCategories = data.categories;
  annualRevenueCr   = data.annual_revenue_inr_cr ?? null;

  // Pre-populate emission_factor_source as a display value when not yet DB-stamped
  prefillEFSource(data.company?.jurisdiction);

  renderPanels(editMode);
  updateCompletion();
}

function prefillEFSource(jurisdiction) {
  const ghgCat = currentCategories.find(c => c.category === 'ghg');
  if (!ghgCat) return;
  const efField = ghgCat.fields.find(f => f.key === 'emission_factor_source');
  if (efField && !efField.value) {
    efField.value = (jurisdiction === 'IN')
      ? 'CEA V21.0 — FY 2024-25 (0.7117 tCO₂/MWh)'
      : 'DEFRA 2023 (0.20493 kg CO₂e/kWh)';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────
async function init(fy) {
  currentFY      = fy;
  editMode       = false;
  unsavedChanges = false;

  const submission = await loadSubmission(fy);
  if (!submission) return;

  _isLocked = submission.status === 'locked' || submission.status === 'unlock_requested' || submission.status === 'filed';

  await reloadP6();

  // Revenue warning
  document.getElementById('revenue-warning').style.display = annualRevenueCr ? 'none' : '';

  if (CAN_EDIT && !_isLocked) {
    document.getElementById('edit-btn').style.display = '';
    document.getElementById('save-btn').style.display = 'none';
  } else {
    document.getElementById('edit-btn').style.display = 'none';
    document.getElementById('save-btn').style.display = 'none';
  }
  document.getElementById('save-status').style.display = 'none';

  const bannerEl = document.getElementById('lock-banner');
  if (bannerEl && window.mountLockBanner) {
    await window.mountLockBanner(bannerEl, submissionId, MY_ROLE, onLockStatusChange);
  }
}

// ── Button handlers ───────────────────────────────────────────────────────────
document.getElementById('edit-btn')?.addEventListener('click', () => {
  editMode = true;
  renderPanels(true);
  if (annualRevenueCr) recalcIntensities();
  document.getElementById('edit-btn').style.display = 'none';
  document.getElementById('save-btn').style.display = '';
  document.getElementById('save-status').style.display = '';
  setSaveStatus('unsaved');
});

document.getElementById('save-btn')?.addEventListener('click', async () => {
  clearTimeout(autoSaveTimer);
  await saveAll();
  editMode = false;
  document.getElementById('save-btn').style.display  = 'none';
  document.getElementById('edit-btn').style.display  = '';
});

document.getElementById('review-btn')?.addEventListener('click', async () => {
  if (!submissionId) return;
  const r = await api('POST', `/api/brsr/submission/${submissionId}/status`, { status: 'in_review' });
  if (!r || !r.ok) {
    const err = r ? await r.json() : {};
    showToast(err.error || 'Failed to submit for review', 'error');
    return;
  }
  showToast('Submitted for review');
  renderStatusBadge('in_review');
  document.getElementById('review-btn').style.display  = 'none';
  document.getElementById('edit-btn').style.display    = 'none';
  document.getElementById('save-btn').style.display    = 'none';
  document.getElementById('save-status').style.display = 'none';
});

// ── FY change ─────────────────────────────────────────────────────────────────
document.getElementById('fy-select').addEventListener('change', e => {
  const newFY = e.target.value;
  if (unsavedChanges) {
    if (!confirm('You have unsaved changes. Switch FY and discard them?')) {
      e.target.value = currentFY;
      return;
    }
  }
  clearTimeout(autoSaveTimer);
  editMode = false;
  document.getElementById('save-btn').style.display    = 'none';
  document.getElementById('save-status').style.display = 'none';
  init(newFY);
});

// ── Boot ──────────────────────────────────────────────────────────────────────
buildFYOptions();
init(document.getElementById('fy-select').value);
