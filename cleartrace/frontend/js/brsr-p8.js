/* ─────────────────────────────────────────────────────────────────────────────
   ClearTrace — brsr-p8.js
   BRSR Principle 8 — Inclusive Growth & Equitable Development data entry form.
   ───────────────────────────────────────────────────────────────────────────── */

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

function showToast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `sa-toast sa-toast-${type}`;
  el.textContent = message;
  document.getElementById('sa-toast-container').appendChild(el);
  setTimeout(() => el.classList.add('sa-toast-show'), 10);
  setTimeout(() => { el.classList.remove('sa-toast-show'); setTimeout(() => el.remove(), 300); }, 3500);
}

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const escAttr = escHtml;

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

let submissionId      = null;
let currentFY         = null;
let currentCategories = [];
let editMode          = false;
let unsavedChanges    = false;
let autoSaveTimer     = null;
let _isLocked         = false;

const STATUS_LABELS = {
  draft:     { label: 'Draft',     cls: 'sa-status-draft'  },
  in_review: { label: 'In Review', cls: 'sa-status-review' },
  locked:    { label: 'Locked',    cls: 'sa-status-locked' },
  filed:     { label: 'Filed',     cls: 'sa-status-filed'  },
};
function renderStatusBadge(status) {
  const s  = STATUS_LABELS[status] || { label: status, cls: '' };
  const el = document.getElementById('status-badge');
  el.textContent = s.label;
  el.className   = `sa-status-badge ${s.cls}`;
}

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

function updateCompletion() {
  let total = 0, filled = 0;
  for (const cat of currentCategories) {
    for (const f of cat.fields) {
      total++;
      const v = f.value;
      if      (f.type === 'specialist_table') { if (v && typeof v === 'object' && Object.keys(v).length) filled++; }
      else if (f.type === 'dynamic_table')    { if (Array.isArray(v) && v.length) filled++; }
      else                                    { if (v != null && v !== '') filled++; }
    }
  }
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  document.getElementById('completion-bar').style.width  = `${pct}%`;
  document.getElementById('completion-pct').textContent  = `${pct}% complete`;
  document.getElementById('completion-wrap').style.display = '';
  const reviewBtn = document.getElementById('review-btn');
  if (reviewBtn) reviewBtn.style.display = (CAN_EDIT && pct >= 80 && !_isLocked) ? '' : 'none';
}

window.togglePanel = function(header) {
  header.closest('.sa-panel').classList.toggle('sa-panel--collapsed');
};
window.toggleLeadership = function(header) {
  const body = document.getElementById('p8-leadership-body');
  if (!body) return;
  body.classList.toggle('p6-leadership-body--collapsed');
  const chev = header.querySelector('.p6-leadership-chevron');
  if (chev) chev.style.transform = body.classList.contains('p6-leadership-body--collapsed') ? 'rotate(-90deg)' : '';
};

function getFieldByKey(key) {
  for (const cat of currentCategories) {
    const f = cat.fields.find(f => f.key === key);
    if (f) return f;
  }
  return null;
}

function parseFormula(formula) {
  return (formula || '').match(/^pct\((\w+),\s*(\w+)\)$/) || null;
}

function computeCalcFromRow(formula, rowVal) {
  const m = parseFormula(formula);
  if (!m) return '—';
  const num = parseFloat(rowVal[m[1]]);
  const den = parseFloat(rowVal[m[2]]);
  if (isNaN(num) || isNaN(den) || den === 0) return '—';
  return (num / den * 100).toFixed(1) + '%';
}

function recalcSpecialistRow(fieldKey, rowKey) {
  const field = getFieldByKey(fieldKey);
  if (!field?.table_schema) return;
  for (const col of field.table_schema.columns) {
    if (col.type !== 'calc') continue;
    const cellEl = document.getElementById(`p8-calc-${fieldKey}-${rowKey}-${col.key}`);
    if (!cellEl) continue;
    const m = parseFormula(col.formula);
    if (!m) continue;
    const numInp = document.querySelector(`[data-spec-field="${fieldKey}"][data-spec-row="${rowKey}"][data-spec-col="${m[1]}"]`);
    const denInp = document.querySelector(`[data-spec-field="${fieldKey}"][data-spec-row="${rowKey}"][data-spec-col="${m[2]}"]`);
    const num = numInp ? parseFloat(numInp.value) : NaN;
    const den = denInp ? parseFloat(denInp.value) : NaN;
    cellEl.textContent = (!isNaN(num) && !isNaN(den) && den !== 0)
      ? (num / den * 100).toFixed(1) + '%'
      : '—';
  }
}

function renderSpecialistTable(field, em) {
  const schema = field.table_schema;
  const value  = (field.value && typeof field.value === 'object') ? field.value : {};
  if (!schema) return '<span class="sa-no-data">—</span>';

  const { rows, columns } = schema;
  let html = `<div class="p6-spec-wrap"><div class="p6-spec-scroll"><table class="p6-spec-table">
    <thead><tr>
      <th class="p6-spec-th p6-spec-label-col">Parameter</th>
      ${columns.map(c => `<th class="p6-spec-th${c.type === 'calc' ? ' p3-calc-header' : ''}">${escHtml(c.label)}</th>`).join('')}
    </tr></thead>
    <tbody>`;

  for (const row of rows) {
    const rowVal  = value[row.key] || {};
    const boldCls = row.bold ? ' p6-spec-bold' : '';
    html += `<tr><td class="p6-spec-label${boldCls}">${escHtml(row.label)}</td>`;

    for (const col of columns) {
      const cellVal = rowVal[col.key] ?? '';

      if (col.type === 'calc') {
        const display = computeCalcFromRow(col.formula, rowVal);
        if (em) {
          html += `<td class="p6-spec-td p3-calc-td">
            <span class="p3-calc-cell"
              id="p8-calc-${escAttr(field.key)}-${escAttr(row.key)}-${escAttr(col.key)}">
              ${display}
            </span>
          </td>`;
        } else {
          html += `<td class="p6-spec-td p3-calc-td">${display}</td>`;
        }
      } else if (em) {
        if (col.type === 'select') {
          const opts = (col.options || []).map(o =>
            `<option value="${escAttr(o)}" ${cellVal === o ? 'selected' : ''}>${escHtml(o)}</option>`
          ).join('');
          html += `<td class="p6-spec-td">
            <select class="p6-spec-input p6-spec-select"
              data-spec-field="${escAttr(field.key)}"
              data-spec-row="${escAttr(row.key)}"
              data-spec-col="${escAttr(col.key)}">
              <option value="">—</option>${opts}
            </select>
          </td>`;
        } else {
          html += `<td class="p6-spec-td">
            <input class="p6-spec-input" type="number" step="any" min="0"
              data-spec-field="${escAttr(field.key)}"
              data-spec-row="${escAttr(row.key)}"
              data-spec-col="${escAttr(col.key)}"
              value="${escAttr(String(cellVal))}">
          </td>`;
        }
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
  document.querySelectorAll(`[data-spec-field="${key}"][data-spec-col]`).forEach(inp => {
    const row = inp.dataset.specRow;
    const col = inp.dataset.specCol;
    if (!result[row]) result[row] = {};
    const raw = inp.value.trim();
    result[row][col] = (inp.tagName === 'SELECT' || inp.type === 'text')
      ? (raw || null)
      : (raw === '' ? null : parseFloat(raw));
  });
  return Object.keys(result).length ? result : null;
}

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

function renderField(field, em) {
  const { key, type, value, options } = field;

  if (type === 'specialist_table') return renderSpecialistTable(field, em);

  if (!em) {
    switch (type) {
      case 'text':     return value ? `<span class="sa-field-value">${escHtml(value)}</span>` : '<span class="sa-no-data">—</span>';
      case 'textarea': return value ? `<span class="sa-field-value sa-field-multiline">${escHtml(value)}</span>` : '<span class="sa-no-data">—</span>';
      case 'number':   return value != null ? `<span class="sa-field-value">${Number(value).toLocaleString()}${field.unit ? ' ' + field.unit : ''}</span>` : '<span class="sa-no-data">—</span>';
      case 'select':   return value ? `<span class="sa-badge">${escHtml(value)}</span>` : '<span class="sa-no-data">—</span>';
      case 'dynamic_table': return renderDynamicTable(field, false);
      default: return '<span class="sa-no-data">—</span>';
    }
  }

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

document.getElementById('p8-panels').addEventListener('input', e => {
  if (!editMode) return;
  const inp       = e.target;
  const specField = inp.dataset.specField;
  const specRow   = inp.dataset.specRow;
  if (specField && specRow) recalcSpecialistRow(specField, specRow);
  setUnsaved(true);
  scheduleAutoSave();
});

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
  if (type === 'specialist_table') return collectSpecialistTable(key);
  if (type === 'dynamic_table')    return collectDynamicTable(key);

  const inp = document.querySelector(`[data-key="${key}"]`);
  if (!inp) return undefined;
  if (type === 'number') return inp.value === '' ? null : parseFloat(inp.value);
  return inp.value || null;
}

function renderPanels(em) {
  const container = document.getElementById('p8-panels');
  container.innerHTML = '';

  const essentialCats  = currentCategories.filter(c => !c.leadership);
  const leadershipCats = currentCategories.filter(c =>  c.leadership);

  for (const cat of essentialCats) {
    container.appendChild(buildPanel(cat, em));
  }

  if (leadershipCats.length) {
    const section = document.createElement('div');
    section.className = 'p6-leadership-section';
    section.innerHTML = `
      <div class="p6-leadership-header" onclick="toggleLeadership(this)">
        <span>Leadership Indicators (voluntary)</span>
        <span class="p6-leadership-chevron" style="transform:rotate(-90deg);transition:transform .2s">▾</span>
      </div>
      <div class="p6-leadership-body p6-leadership-body--collapsed" id="p8-leadership-body"></div>`;
    container.appendChild(section);
    const body = section.querySelector('#p8-leadership-body');
    for (const cat of leadershipCats) {
      body.appendChild(buildPanel(cat, em));
    }
  }
}

function buildPanel(cat, em) {
  const panel = document.createElement('div');
  panel.className = 'card sa-panel';
  panel.dataset.category = cat.category;

  const fieldRows = cat.fields.map(f => `
    <div class="sa-field-row">
      <div class="sa-field-label">${escHtml(f.label)}${f.unit ? `<span class="p6-unit-hint"> (${escHtml(f.unit)})</span>` : ''}</div>
      <div class="sa-field-value-wrap">${renderField(f, em)}</div>
    </div>`).join('');

  panel.innerHTML = `
    <div class="sa-panel-header" onclick="togglePanel(this)">
      <div class="sa-panel-header-left">
        <div class="sa-panel-title">${escHtml(cat.label)}</div>
      </div>
      <div class="sa-panel-chevron">▾</div>
    </div>
    <div class="sa-panel-body">${fieldRows}</div>`;

  return panel;
}

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
    const r = await api('PUT', `/api/brsr/p8/${submissionId}`, payload);
    if (!r || !r.ok) errors++;
  }

  if (errors) {
    showToast(`${errors} field(s) failed to save`, 'error');
    setSaveStatus('unsaved');
  } else {
    setUnsaved(false);
    await reloadP8();
  }
}

function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(saveAll, 800);
}

async function loadSubmission(fy) {
  const res = await api('GET', `/api/brsr/submission?fy=${fy}`);
  if (!res || !res.ok) { showToast('Failed to load submission', 'error'); return false; }
  const data = await res.json();
  submissionId = data.submission.id;
  renderStatusBadge(data.submission.status);
  return data.submission;
}

async function reloadP8() {
  const res = await api('GET', `/api/brsr/p8/${submissionId}`);
  if (!res || !res.ok) { showToast('Failed to load P8 data', 'error'); return; }
  const data = await res.json();
  currentCategories = data.categories;
  renderPanels(editMode);
  updateCompletion();
}

async function init(fy) {
  currentFY      = fy;
  editMode       = false;
  unsavedChanges = false;

  const submission = await loadSubmission(fy);
  if (!submission) return;

  _isLocked = submission.status === 'locked' || submission.status === 'filed';

  await reloadP8();

  if (CAN_EDIT && !_isLocked) {
    document.getElementById('edit-btn').style.display = '';
    document.getElementById('save-btn').style.display = 'none';
  } else {
    document.getElementById('edit-btn').style.display = 'none';
    document.getElementById('save-btn').style.display = 'none';
  }
  document.getElementById('save-status').style.display = 'none';
}

document.getElementById('edit-btn')?.addEventListener('click', () => {
  editMode = true;
  renderPanels(true);
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

buildFYOptions();
init(document.getElementById('fy-select').value);
