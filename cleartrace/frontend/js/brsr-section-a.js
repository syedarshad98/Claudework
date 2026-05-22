/* ─────────────────────────────────────────────────────────────────────────────
   ClearTrace — brsr-section-a.js
   BRSR Section A — General Disclosures data entry form.
   Follows the social.js pattern: HTML shell, API-driven rendering, edit/save cycle.
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

function calcPct(num, denom) {
  if (num == null || denom == null || Number(denom) === 0) return '—';
  return (Number(num) / Number(denom) * 100).toFixed(1) + '%';
}

function sumNulls(arr) {
  const nums = arr.map(Number).filter(v => !isNaN(v));
  return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
}

// ── FY helpers ────────────────────────────────────────────────────────────────
function currentIndianFY() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return m >= 4
    ? `${y}-${String(y + 1).slice(2)}`
    : `${y - 1}-${String(y).slice(2)}`;
}

// Returns [2 years prior, 1 year prior, fy] as FY strings
function fyLabels(fy) {
  const startYear = parseInt(fy.split('-')[0], 10);
  return [
    `${startYear - 2}-${String(startYear - 1).slice(2)}`,
    `${startYear - 1}-${String(startYear).slice(2)}`,
    fy,
  ];
}

function buildFYOptions() {
  const sel = document.getElementById('fy-select');
  const now = new Date();
  const baseYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  for (let i = 0; i < 3; i++) {
    const startYear = baseYear - i;
    const fy  = `${startYear}-${String(startYear + 1).slice(2)}`;
    const opt = document.createElement('option');
    opt.value       = fy;
    opt.textContent = `FY ${fy}`;
    sel.appendChild(opt);
  }
}

// ── State ─────────────────────────────────────────────────────────────────────
let submissionId      = null;
let currentFY         = null;
let currentCategories = [];
let companyMeta       = {};
let userMeta          = {};
let editMode          = false;
let unsavedChanges    = false;
let autoSaveTimer     = null;

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_LABELS = {
  draft:      { label: 'Draft',      cls: 'sa-status-draft' },
  in_review:  { label: 'In Review',  cls: 'sa-status-review' },
  locked:     { label: 'Locked',     cls: 'sa-status-locked' },
  filed:      { label: 'Filed',      cls: 'sa-status-filed' },
};

function renderStatusBadge(status) {
  const s = STATUS_LABELS[status] || { label: status, cls: '' };
  const el = document.getElementById('status-badge');
  el.textContent = s.label;
  el.className   = `sa-status-badge ${s.cls}`;
}

// ── Save-status indicator ─────────────────────────────────────────────────────
function setSaveStatus(state) {
  const el = document.getElementById('save-status');
  if (!el) return;
  el.style.display = state ? '' : 'none';
  if (state === 'saving') { el.textContent = 'Saving…'; el.className = 'sa-save-status sa-save-saving'; }
  if (state === 'saved')  { el.textContent = '✓ Saved'; el.className = 'sa-save-status sa-save-saved';  }
  if (state === 'unsaved'){ el.textContent = '● Unsaved'; el.className = 'sa-save-status sa-save-unsaved'; }
}

function setUnsaved(val) {
  unsavedChanges = val;
  if (val) setSaveStatus('unsaved'); else setSaveStatus('saved');
}

// ── Completion bar ────────────────────────────────────────────────────────────
function updateCompletion() {
  let total = 0, filled = 0;
  for (const cat of currentCategories) {
    for (const f of cat.fields) {
      total++;
      const v = f.value;
      if      (f.type === 'dynamic_table') { if (Array.isArray(v) && v.length > 0) filled++; }
      else if (f.type === 'matrix')        { if (v && typeof v === 'object' && Object.keys(v).length > 0) filled++; }
      else if (f.type === 'multiselect')   { if (Array.isArray(v) && v.length > 0) filled++; }
      else                                 { if (v != null && v !== '') filled++; }
    }
  }
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  document.getElementById('completion-bar').style.width = `${pct}%`;
  document.getElementById('completion-pct').textContent = `${pct}% complete`;
  document.getElementById('completion-wrap').style.display = '';

  const reviewBtn = document.getElementById('review-btn');
  if (reviewBtn) reviewBtn.style.display = (CAN_EDIT && pct >= 80) ? '' : 'none';
}

// ── Field lookup ──────────────────────────────────────────────────────────────
function getFieldByKey(key) {
  for (const cat of currentCategories) {
    const f = cat.fields.find(f => f.key === key);
    if (f) return f;
  }
  return null;
}

// ── Panel toggle ──────────────────────────────────────────────────────────────
window.togglePanel = function(header) {
  header.closest('.sa-panel').classList.toggle('sa-panel--collapsed');
};

// ── Render: dynamic table ─────────────────────────────────────────────────────
function renderDynamicTable(field, em) {
  const { key, columns } = field;
  const rows = Array.isArray(field.value) ? field.value : [];

  if (!em) {
    if (!rows.length) return '<span class="sa-no-data">No entries</span>';
    return `<div class="sa-dt-scroll"><table class="sa-dt-table">
      <thead><tr>${columns.map(c => `<th class="sa-dt-th">${escHtml(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(row =>
        `<tr>${columns.map(c => `<td class="sa-dt-td">${escHtml(String(row[c.key] ?? '—'))}</td>`).join('')}</tr>`
      ).join('')}</tbody>
    </table></div>`;
  }

  const ensuredRows = rows.length ? rows : [{}];

  const makeRow = (row, idx, isOnly) => `
    <tr data-dt-row="${idx}">
      ${columns.map(c => {
        const val = row[c.key] ?? '';
        let cell;
        if (c.type === 'select') {
          const opts = c.options.map(o =>
            `<option value="${escAttr(o)}" ${val === o ? 'selected' : ''}>${escHtml(o)}</option>`
          ).join('');
          cell = `<select class="sa-dt-input" data-dt-col="${c.key}" data-dt-type="select"><option value="">—</option>${opts}</select>`;
        } else if (c.type === 'number') {
          cell = `<input class="sa-dt-input" type="number" step="any" data-dt-col="${c.key}" data-dt-type="number" ${c.sum_warning ? `data-sum-col="${c.key}"` : ''} value="${escAttr(String(val))}">`;
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

  const sumCols = columns.filter(c => c.sum_warning);
  const sumBar  = sumCols.length
    ? `<div class="sa-dt-sum-bar">${sumCols.map(c =>
        `<span class="sa-dt-sum-item" id="sa-dt-sum-${key}-${c.key}" data-dt-sum-key="${key}" data-dt-sum-col="${c.key}">
           ${c.label}: —
        </span>`
      ).join('')}</div>`
    : '';

  return `<div class="sa-dt-wrap" data-dt-container="${key}">
    <div class="sa-dt-scroll"><table class="sa-dt-table">
      <thead><tr>
        ${columns.map(c => `<th class="sa-dt-th">${escHtml(c.label)}</th>`).join('')}
        <th class="sa-dt-th sa-dt-th-action"></th>
      </tr></thead>
      <tbody>${tbodyRows}</tbody>
    </table></div>
    ${sumBar}
    <button class="sa-dt-add-btn btn btn-outline" onclick="addDTRow('${key}')">+ Add Row</button>
  </div>`;
}

// ── Render: matrix headcount ──────────────────────────────────────────────────
function renderMatrixHeadcount(field, em) {
  const k   = field.key;
  const val = field.value || {};
  const groups = [...new Set(field.rows.filter(r => r.group).map(r => r.group))];
  const GROUP_LABELS = { employees: 'Total Employees', workers: 'Total Workers' };

  let html = `<div class="sa-matrix-wrap" data-matrix-container="${k}" data-matrix-type="headcount">
    <div class="sa-matrix-scroll"><table class="sa-matrix-table">
      <thead><tr>
        <th class="sa-matrix-th sa-matrix-label-col">Category</th>
        <th class="sa-matrix-th">Total</th>
        <th class="sa-matrix-th">Male No.</th>
        <th class="sa-matrix-th">Male %</th>
        <th class="sa-matrix-th">Female No.</th>
        <th class="sa-matrix-th">Female %</th>
      </tr></thead>
      <tbody>`;

  for (const group of groups) {
    const groupRows = field.rows.filter(r => r.group === group);
    for (const row of groupRows) {
      const rv = val[row.key] || {};
      if (em) {
        html += `<tr data-matrix-row="${row.key}" data-matrix-group="${group}">
          <td class="sa-matrix-label">${escHtml(row.label)}</td>
          <td><input class="sa-matrix-input" data-matrix-container="${k}" data-row="${row.key}" data-col="total"  type="number" min="0" step="1" value="${rv.total  ?? ''}"></td>
          <td><input class="sa-matrix-input" data-matrix-container="${k}" data-row="${row.key}" data-col="male"   type="number" min="0" step="1" value="${rv.male   ?? ''}"></td>
          <td class="sa-matrix-derived" id="sa-m-${k}-${row.key}-male_pct">${calcPct(rv.male, rv.total)}</td>
          <td><input class="sa-matrix-input" data-matrix-container="${k}" data-row="${row.key}" data-col="female" type="number" min="0" step="1" value="${rv.female ?? ''}"></td>
          <td class="sa-matrix-derived" id="sa-m-${k}-${row.key}-female_pct">${calcPct(rv.female, rv.total)}</td>
        </tr>`;
      } else {
        html += `<tr>
          <td class="sa-matrix-label">${escHtml(row.label)}</td>
          <td class="sa-matrix-val">${rv.total  ?? '—'}</td>
          <td class="sa-matrix-val">${rv.male   ?? '—'}</td>
          <td class="sa-matrix-val sa-matrix-pct">${calcPct(rv.male, rv.total)}</td>
          <td class="sa-matrix-val">${rv.female ?? '—'}</td>
          <td class="sa-matrix-val sa-matrix-pct">${calcPct(rv.female, rv.total)}</td>
        </tr>`;
      }
    }

    // Group total row
    const gVals   = groupRows.map(r => val[r.key] || {});
    const gTotal  = sumNulls(gVals.map(rv => rv.total  != null ? Number(rv.total)  : null));
    const gMale   = sumNulls(gVals.map(rv => rv.male   != null ? Number(rv.male)   : null));
    const gFemale = sumNulls(gVals.map(rv => rv.female != null ? Number(rv.female) : null));
    const gLabel  = GROUP_LABELS[group] || `Total ${group}`;

    if (em) {
      html += `<tr class="sa-matrix-total-row">
        <td class="sa-matrix-label sa-matrix-total-label"><strong>${escHtml(gLabel)}</strong></td>
        <td class="sa-matrix-derived" id="sa-gt-${k}-${group}-total">${gTotal  ?? '—'}</td>
        <td class="sa-matrix-derived" id="sa-gt-${k}-${group}-male">${gMale   ?? '—'}</td>
        <td class="sa-matrix-derived" id="sa-gt-${k}-${group}-male_pct">${calcPct(gMale, gTotal)}</td>
        <td class="sa-matrix-derived" id="sa-gt-${k}-${group}-female">${gFemale ?? '—'}</td>
        <td class="sa-matrix-derived" id="sa-gt-${k}-${group}-female_pct">${calcPct(gFemale, gTotal)}</td>
      </tr>`;
    } else {
      html += `<tr class="sa-matrix-total-row">
        <td class="sa-matrix-label sa-matrix-total-label"><strong>${escHtml(gLabel)}</strong></td>
        <td class="sa-matrix-val"><strong>${gTotal  ?? '—'}</strong></td>
        <td class="sa-matrix-val"><strong>${gMale   ?? '—'}</strong></td>
        <td class="sa-matrix-val sa-matrix-pct"><strong>${calcPct(gMale, gTotal)}</strong></td>
        <td class="sa-matrix-val"><strong>${gFemale ?? '—'}</strong></td>
        <td class="sa-matrix-val sa-matrix-pct"><strong>${calcPct(gFemale, gTotal)}</strong></td>
      </tr>`;
    }
  }

  html += `</tbody></table></div></div>`;
  return html;
}

// ── Render: matrix women_rep ──────────────────────────────────────────────────
function renderMatrixWomenRep(field, em) {
  const k   = field.key;
  const val = field.value || {};

  let html = `<div class="sa-matrix-wrap" data-matrix-container="${k}" data-matrix-type="women_rep">
    <div class="sa-matrix-scroll"><table class="sa-matrix-table">
      <thead><tr>
        <th class="sa-matrix-th sa-matrix-label-col">Category</th>
        <th class="sa-matrix-th">Total</th>
        <th class="sa-matrix-th">Female No.</th>
        <th class="sa-matrix-th">Female %</th>
      </tr></thead>
      <tbody>`;

  for (const row of field.rows) {
    const rv = val[row.key] || {};
    if (em) {
      html += `<tr data-matrix-row="${row.key}">
        <td class="sa-matrix-label">${escHtml(row.label)}</td>
        <td><input class="sa-matrix-input" data-matrix-container="${k}" data-row="${row.key}" data-col="total"  type="number" min="0" step="1" value="${rv.total  ?? ''}"></td>
        <td><input class="sa-matrix-input" data-matrix-container="${k}" data-row="${row.key}" data-col="female" type="number" min="0" step="1" value="${rv.female ?? ''}"></td>
        <td class="sa-matrix-derived" id="sa-m-${k}-${row.key}-female_pct">${calcPct(rv.female, rv.total)}</td>
      </tr>`;
    } else {
      html += `<tr>
        <td class="sa-matrix-label">${escHtml(row.label)}</td>
        <td class="sa-matrix-val">${rv.total  ?? '—'}</td>
        <td class="sa-matrix-val">${rv.female ?? '—'}</td>
        <td class="sa-matrix-val sa-matrix-pct">${calcPct(rv.female, rv.total)}</td>
      </tr>`;
    }
  }

  html += `</tbody></table></div></div>`;
  return html;
}

// ── Render: matrix turnover ───────────────────────────────────────────────────
function renderMatrixTurnover(field, em) {
  const k    = field.key;
  const val  = field.value || {};
  const fys  = fyLabels(currentFY);

  let html = `<div class="sa-matrix-wrap" data-matrix-container="${k}" data-matrix-type="turnover">
    <div class="sa-matrix-scroll"><table class="sa-matrix-table sa-matrix-wide">
      <thead>
        <tr>
          <th class="sa-matrix-th sa-matrix-label-col" rowspan="2">Category</th>
          ${fys.map(fy => `<th class="sa-matrix-th" colspan="3">FY ${fy}</th>`).join('')}
        </tr>
        <tr>
          ${fys.map(() => '<th class="sa-matrix-th-sub">Male</th><th class="sa-matrix-th-sub">Female</th><th class="sa-matrix-th-sub">Total</th>').join('')}
        </tr>
      </thead>
      <tbody>`;

  for (const row of field.rows) {
    const rv = val[row.key] || {};
    html += `<tr data-matrix-row="${row.key}"><td class="sa-matrix-label">${escHtml(row.label)}</td>`;
    for (const fy of fys) {
      const fv    = rv[fy] || {};
      const total = sumNulls([fv.male != null ? Number(fv.male) : null, fv.female != null ? Number(fv.female) : null]);
      if (em) {
        html += `
          <td><input class="sa-matrix-input" data-matrix-container="${k}" data-row="${row.key}" data-fy="${fy}" data-col="male"   type="number" min="0" step="0.01" value="${fv.male   ?? ''}"></td>
          <td><input class="sa-matrix-input" data-matrix-container="${k}" data-row="${row.key}" data-fy="${fy}" data-col="female" type="number" min="0" step="0.01" value="${fv.female ?? ''}"></td>
          <td class="sa-matrix-derived" id="sa-t-${k}-${row.key}-${fy.replace('-','_')}-total">${total ?? '—'}</td>`;
      } else {
        html += `
          <td class="sa-matrix-val">${fv.male   ?? '—'}</td>
          <td class="sa-matrix-val">${fv.female ?? '—'}</td>
          <td class="sa-matrix-val"><strong>${total ?? '—'}</strong></td>`;
      }
    }
    html += `</tr>`;
  }

  html += `</tbody></table></div></div>`;
  return html;
}

// ── Render: individual field ──────────────────────────────────────────────────
function renderField(field, em) {
  const { key, type, value, options } = field;

  if (!em) {
    switch (type) {
      case 'text':
        return value ? `<span class="sa-field-value">${escHtml(value)}</span>` : '<span class="sa-no-data">—</span>';
      case 'textarea':
        return value ? `<span class="sa-field-value sa-field-multiline">${escHtml(value)}</span>` : '<span class="sa-no-data">—</span>';
      case 'number':
        return value != null ? `<span class="sa-field-value">${Number(value).toLocaleString()}</span>` : '<span class="sa-no-data">—</span>';
      case 'currency':
        return value != null ? `<span class="sa-field-value">₹&nbsp;${Number(value).toLocaleString()}</span>` : '<span class="sa-no-data">—</span>';
      case 'select':
        return value ? `<span class="sa-badge">${escHtml(value)}</span>` : '<span class="sa-no-data">—</span>';
      case 'multiselect': {
        const arr = Array.isArray(value) ? value : [];
        return arr.length
          ? arr.map(v => `<span class="sa-badge">${escHtml(v)}</span>`).join(' ')
          : '<span class="sa-no-data">—</span>';
      }
      case 'dynamic_table':
        return renderDynamicTable(field, false);
      case 'matrix':
        return renderMatrix(field, false);
      default:
        return '<span class="sa-no-data">—</span>';
    }
  }

  // Edit mode
  switch (type) {
    case 'text':
      return `<input class="sa-input" type="text" data-key="${key}" data-type="${type}" value="${escAttr(value || '')}">`;
    case 'textarea':
      return `<textarea class="sa-input sa-textarea" data-key="${key}" data-type="${type}" rows="3">${escHtml(value || '')}</textarea>`;
    case 'number':
      return `<input class="sa-input" type="number" step="any" data-key="${key}" data-type="${type}" value="${value != null ? value : ''}">`;
    case 'currency':
      return `<div class="sa-currency-wrap"><span class="sa-currency-sym">₹</span><input class="sa-input sa-currency-input" type="number" step="any" data-key="${key}" data-type="${type}" value="${value != null ? value : ''}"></div>`;
    case 'select': {
      const selOpts = (options || []).map(o =>
        `<option value="${escAttr(o)}" ${value === o ? 'selected' : ''}>${escHtml(o)}</option>`
      ).join('');
      return `<select class="sa-input" data-key="${key}" data-type="${type}"><option value="">—</option>${selOpts}</select>`;
    }
    case 'multiselect': {
      const sel = Array.isArray(value) ? value : [];
      return `<div class="sa-ms-wrap" data-ms-key="${key}">
        ${(options || []).map(o => `
          <label class="sa-checkbox-label">
            <input type="checkbox" class="sa-checkbox" value="${escAttr(o)}" ${sel.includes(o) ? 'checked' : ''}>
            ${escHtml(o)}
          </label>`).join('')}
      </div>`;
    }
    case 'dynamic_table':
      return renderDynamicTable(field, true);
    case 'matrix':
      return renderMatrix(field, true);
    default:
      return '<span class="sa-no-data">—</span>';
  }
}

function renderMatrix(field, em) {
  if (field.matrix_type === 'headcount')  return renderMatrixHeadcount(field, em);
  if (field.matrix_type === 'women_rep')  return renderMatrixWomenRep(field, em);
  if (field.matrix_type === 'turnover')   return renderMatrixTurnover(field, em);
  return '<span class="sa-no-data">—</span>';
}

// ── Render: all panels ────────────────────────────────────────────────────────
function renderPanels(em) {
  const container = document.getElementById('sa-panels');
  container.innerHTML = '';

  for (const cat of currentCategories) {
    const panel = document.createElement('div');
    panel.className = 'card sa-panel';

    const coreTag = cat.brsr_core
      ? '<span class="sa-core-badge">BRSR Core</span>'
      : '';

    const fieldRows = cat.fields.map(f => `
      <div class="sa-field-row">
        <div class="sa-field-label">${escHtml(f.label)}</div>
        <div class="sa-field-value-wrap">${renderField(f, em)}</div>
      </div>`).join('');

    panel.innerHTML = `
      <div class="sa-panel-header" onclick="togglePanel(this)">
        <div class="sa-panel-header-left">
          <div class="sa-panel-title">${escHtml(cat.label)}</div>
          ${coreTag}
        </div>
        <div class="sa-panel-chevron">▾</div>
      </div>
      <div class="sa-panel-body">${fieldRows}</div>`;

    container.appendChild(panel);
  }
}

// ── Matrix live recalculation ─────────────────────────────────────────────────
function recalcMatrix(container) {
  const mtype = container.dataset.matrixType;
  const k     = container.dataset.matrixContainer;

  if (mtype === 'headcount') {
    // Per-row percentages
    container.querySelectorAll('[data-matrix-row]').forEach(tr => {
      const row = tr.dataset.matrixRow;
      if (!row) return;
      const total  = parseFloat(container.querySelector(`[data-row="${row}"][data-col="total"]`)?.value);
      const male   = parseFloat(container.querySelector(`[data-row="${row}"][data-col="male"]`)?.value);
      const female = parseFloat(container.querySelector(`[data-row="${row}"][data-col="female"]`)?.value);
      const setD = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setD(`sa-m-${k}-${row}-male_pct`,   calcPct(isNaN(male)   ? null : male,   isNaN(total) ? null : total));
      setD(`sa-m-${k}-${row}-female_pct`, calcPct(isNaN(female) ? null : female, isNaN(total) ? null : total));
    });

    // Group totals
    const groups = [...new Set(
      [...container.querySelectorAll('[data-matrix-group]')].map(el => el.dataset.matrixGroup).filter(Boolean)
    )];
    for (const group of groups) {
      let gT = null, gM = null, gF = null;
      container.querySelectorAll(`[data-matrix-group="${group}"][data-matrix-row]`).forEach(tr => {
        const row = tr.dataset.matrixRow;
        const t = parseFloat(container.querySelector(`[data-row="${row}"][data-col="total"]`)?.value);
        const m = parseFloat(container.querySelector(`[data-row="${row}"][data-col="male"]`)?.value);
        const f = parseFloat(container.querySelector(`[data-row="${row}"][data-col="female"]`)?.value);
        if (!isNaN(t)) gT = (gT || 0) + t;
        if (!isNaN(m)) gM = (gM || 0) + m;
        if (!isNaN(f)) gF = (gF || 0) + f;
      });
      const setG = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? '—'; };
      setG(`sa-gt-${k}-${group}-total`,    gT);
      setG(`sa-gt-${k}-${group}-male`,     gM);
      setG(`sa-gt-${k}-${group}-female`,   gF);
      setG(`sa-gt-${k}-${group}-male_pct`,   calcPct(gM, gT));
      setG(`sa-gt-${k}-${group}-female_pct`, calcPct(gF, gT));
    }
  }

  if (mtype === 'women_rep') {
    container.querySelectorAll('[data-matrix-row]').forEach(tr => {
      const row    = tr.dataset.matrixRow;
      const total  = parseFloat(container.querySelector(`[data-row="${row}"][data-col="total"]`)?.value);
      const female = parseFloat(container.querySelector(`[data-row="${row}"][data-col="female"]`)?.value);
      const el = document.getElementById(`sa-m-${k}-${row}-female_pct`);
      if (el) el.textContent = calcPct(isNaN(female) ? null : female, isNaN(total) ? null : total);
    });
  }

  if (mtype === 'turnover') {
    container.querySelectorAll('[data-matrix-row]').forEach(tr => {
      const row = tr.dataset.matrixRow;
      // Collect all fys for this row
      const fyInputs = [...container.querySelectorAll(`[data-row="${row}"][data-fy]`)];
      const fys = [...new Set(fyInputs.map(i => i.dataset.fy))];
      for (const fy of fys) {
        const male   = parseFloat(container.querySelector(`[data-row="${row}"][data-fy="${fy}"][data-col="male"]`)?.value);
        const female = parseFloat(container.querySelector(`[data-row="${row}"][data-fy="${fy}"][data-col="female"]`)?.value);
        const total  = sumNulls([isNaN(male) ? null : male, isNaN(female) ? null : female]);
        const safeId = fy.replace('-', '_');
        const el = document.getElementById(`sa-t-${k}-${row}-${safeId}-total`);
        if (el) el.textContent = total ?? '—';
      }
    });
  }
}

// ── DT sum warnings ───────────────────────────────────────────────────────────
function updateDTSumWarnings(container) {
  const dtKey = container.dataset.dtContainer;
  // Find all unique sum-warn columns in this container
  const sumCols = [...new Set(
    [...container.querySelectorAll('[data-sum-col]')].map(i => i.dataset.sumCol)
  )];
  for (const colKey of sumCols) {
    const inputs = container.querySelectorAll(`[data-dt-col="${colKey}"]`);
    const sum    = [...inputs].reduce((acc, inp) => acc + (parseFloat(inp.value) || 0), 0);
    const el     = document.getElementById(`sa-dt-sum-${dtKey}-${colKey}`);
    if (!el) continue;
    const isWarn = sum > 0 && Math.abs(sum - 100) > 0.05;
    el.textContent = `${el.closest('[data-dt-sum-col]')?.dataset?.label || colKey}: ${sum.toFixed(1)}%${isWarn ? ' ⚠ Should total 100%' : sum > 0 ? ' ✓' : ''}`;
    el.className   = `sa-dt-sum-item${isWarn ? ' sa-dt-sum-warn' : ' sa-dt-sum-ok'}`;
  }
  // Simpler: just re-run using the sum-bar span's data attributes
  container.querySelectorAll('.sa-dt-sum-item[data-dt-sum-col]').forEach(el => {
    const col    = el.dataset.dtSumCol;
    const inputs = container.querySelectorAll(`[data-dt-col="${col}"]`);
    const sum    = [...inputs].reduce((acc, inp) => acc + (parseFloat(inp.value) || 0), 0);
    const warn   = sum > 0 && Math.abs(sum - 100) > 0.05;
    el.textContent = `% of Turnover: ${sum.toFixed(1)}%${warn ? ' ⚠ Should total 100%' : sum > 0 ? ' ✓' : ''}`;
    el.className   = `sa-dt-sum-item${warn ? ' sa-dt-sum-warn' : ' sa-dt-sum-ok'}`;
  });
}

// ── DT add / remove row ───────────────────────────────────────────────────────
window.addDTRow = function(key) {
  const container = document.querySelector(`[data-dt-container="${key}"]`);
  if (!container) return;
  const tbody  = container.querySelector('tbody');
  const field  = getFieldByKey(key);
  if (!field) return;
  const newIdx = tbody.querySelectorAll('[data-dt-row]').length;

  const tr = document.createElement('tr');
  tr.dataset.dtRow = newIdx;
  tr.innerHTML = field.columns.map(c => {
    let cell;
    if (c.type === 'select') {
      const opts = c.options.map(o => `<option value="${escAttr(o)}">${escHtml(o)}</option>`).join('');
      cell = `<select class="sa-dt-input" data-dt-col="${c.key}" data-dt-type="select"><option value="">—</option>${opts}</select>`;
    } else if (c.type === 'number') {
      cell = `<input class="sa-dt-input" type="number" step="any" data-dt-col="${c.key}" data-dt-type="number" ${c.sum_warning ? `data-sum-col="${c.key}"` : ''} value="">`;
    } else {
      cell = `<input class="sa-dt-input" type="text" data-dt-col="${c.key}" data-dt-type="text" value="">`;
    }
    return `<td class="sa-dt-td">${cell}</td>`;
  }).join('') + `<td class="sa-dt-td sa-dt-td-action">
    <button class="sa-dt-remove-btn" onclick="removeDTRow(this,'${key}')">✕</button>
  </td>`;

  tbody.appendChild(tr);
  container.querySelectorAll('.sa-dt-remove-btn').forEach(btn => { btn.disabled = false; });
  setUnsaved(true);
  scheduleAutoSave();
};

window.removeDTRow = function(btn, key) {
  const tr        = btn.closest('[data-dt-row]');
  const container = btn.closest('[data-dt-container]');
  tr.remove();
  const rows = container.querySelectorAll('[data-dt-row]');
  rows.forEach((r, i) => { r.dataset.dtRow = i; });
  if (rows.length === 1) container.querySelector('.sa-dt-remove-btn').disabled = true;
  updateDTSumWarnings(container);
  setUnsaved(true);
  scheduleAutoSave();
};

// ── Input event delegation ────────────────────────────────────────────────────
document.getElementById('sa-panels').addEventListener('input', e => {
  if (!editMode) return;
  const inp = e.target;

  const matrixWrap = inp.closest('[data-matrix-container]');
  if (matrixWrap) recalcMatrix(matrixWrap);

  const dtWrap = inp.closest('[data-dt-container]');
  if (dtWrap) updateDTSumWarnings(dtWrap);

  setUnsaved(true);
  scheduleAutoSave();
});

// ── Collect field values from DOM ─────────────────────────────────────────────
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

function collectMatrix(key) {
  const container = document.querySelector(`[data-matrix-container="${key}"]`);
  if (!container) return undefined;
  const mtype  = container.dataset.matrixType;
  const result = {};

  if (mtype === 'headcount' || mtype === 'women_rep') {
    container.querySelectorAll('.sa-matrix-input[data-row][data-col]').forEach(inp => {
      const row = inp.dataset.row;
      const col = inp.dataset.col;
      if (!result[row]) result[row] = {};
      result[row][col] = inp.value === '' ? null : parseFloat(inp.value);
    });
  }
  if (mtype === 'turnover') {
    container.querySelectorAll('.sa-matrix-input[data-row][data-fy][data-col]').forEach(inp => {
      const row = inp.dataset.row;
      const fy  = inp.dataset.fy;
      const col = inp.dataset.col;
      if (!result[row]) result[row] = {};
      if (!result[row][fy]) result[row][fy] = {};
      result[row][fy][col] = inp.value === '' ? null : parseFloat(inp.value);
    });
  }
  return result;
}

function collectMultiselect(key) {
  const wrap = document.querySelector(`[data-ms-key="${key}"]`);
  if (!wrap) return undefined;
  return [...wrap.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.value);
}

function collectFieldValue(field) {
  const { key, type } = field;
  if (type === 'dynamic_table') return collectDynamicTable(key);
  if (type === 'matrix')        return collectMatrix(key);
  if (type === 'multiselect')   return collectMultiselect(key);

  const inp = document.querySelector(`[data-key="${key}"]`);
  if (!inp) return undefined;
  if (type === 'number' || type === 'currency') {
    return inp.value === '' ? null : parseFloat(inp.value);
  }
  return inp.value || null;
}

// ── Save all ──────────────────────────────────────────────────────────────────
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
    const r = await api('PUT', `/api/brsr/section-a/${submissionId}`, payload);
    if (!r || !r.ok) errors++;
  }

  if (errors) {
    showToast(`${errors} field(s) failed to save`, 'error');
    setSaveStatus('unsaved');
  } else {
    setUnsaved(false);
    await reloadSectionA();
  }
}

// ── Auto-save ─────────────────────────────────────────────────────────────────
function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(saveAll, 800);
}

// ── Load data ─────────────────────────────────────────────────────────────────
async function loadSubmission(fy) {
  const res = await api('GET', `/api/brsr/submission?fy=${fy}`);
  if (!res || !res.ok) { showToast('Failed to load submission', 'error'); return false; }
  const data    = await res.json();
  submissionId  = data.submission.id;
  companyMeta   = data.company;
  userMeta      = data.user;
  renderStatusBadge(data.submission.status);
  return data.submission;
}

async function reloadSectionA() {
  const res = await api('GET', `/api/brsr/section-a/${submissionId}`);
  if (!res || !res.ok) { showToast('Failed to load Section A', 'error'); return; }
  const data        = await res.json();
  currentCategories = data.categories;
  renderPanels(editMode);
  updateCompletion();
}

async function init(fy) {
  currentFY    = fy;
  editMode     = false;
  unsavedChanges = false;

  const submission = await loadSubmission(fy);
  if (!submission) return;
  await reloadSectionA();

  const isLocked = submission.status === 'locked' || submission.status === 'filed';

  if (CAN_EDIT && !isLocked) {
    document.getElementById('edit-btn').style.display = '';
    document.getElementById('save-btn').style.display = 'none';
  } else {
    document.getElementById('edit-btn').style.display = 'none';
    document.getElementById('save-btn').style.display = 'none';
  }
  document.getElementById('save-status').style.display = 'none';

  // Pre-populate on empty submission
  const allNull = currentCategories.every(cat => cat.fields.every(f => f.value == null));
  if (allNull && companyMeta.name) {
    const entityField = currentCategories[0]?.fields.find(f => f.key === 'entity_name');
    const emailField  = currentCategories[0]?.fields.find(f => f.key === 'contact_email');
    const prePops = [];
    if (entityField) prePops.push({ key: 'entity_name',  value: companyMeta.name });
    if (emailField)  prePops.push({ key: 'contact_email', value: userMeta.email  });
    if (prePops.length) {
      for (const p of prePops) await api('PUT', `/api/brsr/section-a/${submissionId}`, p);
      await reloadSectionA();
    }
  }
}

// ── Edit button ───────────────────────────────────────────────────────────────
document.getElementById('edit-btn')?.addEventListener('click', () => {
  editMode = true;
  renderPanels(true);
  document.getElementById('edit-btn').style.display = 'none';
  document.getElementById('save-btn').style.display = '';
  document.getElementById('save-status').style.display = '';
  setSaveStatus('unsaved');
});

// ── Save button ───────────────────────────────────────────────────────────────
document.getElementById('save-btn')?.addEventListener('click', async () => {
  clearTimeout(autoSaveTimer);
  await saveAll();
  editMode = false;
  document.getElementById('save-btn').style.display = 'none';
  document.getElementById('edit-btn').style.display = '';
});

// ── Review button ─────────────────────────────────────────────────────────────
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
      e.target.value = currentFY; // revert
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
