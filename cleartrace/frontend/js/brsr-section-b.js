/* ─────────────────────────────────────────────────────────────────────────────
   ClearTrace — brsr-section-b.js
   BRSR Section B — Management and Process Disclosures data entry form.
   Follows brsr-section-a.js exactly; adds the principle_grid field type.
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

// ── Principles constant ───────────────────────────────────────────────────────
const PRINCIPLES = [
  { key: 'p1', label: 'P1' },
  { key: 'p2', label: 'P2' },
  { key: 'p3', label: 'P3' },
  { key: 'p4', label: 'P4' },
  { key: 'p5', label: 'P5' },
  { key: 'p6', label: 'P6' },
  { key: 'p7', label: 'P7' },
  { key: 'p8', label: 'P8' },
  { key: 'p9', label: 'P9' },
];

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
    opt.value       = fy;
    opt.textContent = `FY ${fy}`;
    sel.appendChild(opt);
  }
}

// ── State ─────────────────────────────────────────────────────────────────────
let submissionId      = null;
let currentFY         = null;
let currentCategories = [];
let editMode          = false;
let unsavedChanges    = false;
let autoSaveTimer     = null;

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_LABELS = {
  draft:     { label: 'Draft',     cls: 'sa-status-draft'  },
  in_review: { label: 'In Review', cls: 'sa-status-review' },
  locked:    { label: 'Locked',    cls: 'sa-status-locked' },
  filed:     { label: 'Filed',     cls: 'sa-status-filed'  },
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
  if (state === 'saving') { el.textContent = 'Saving…';   el.className = 'sa-save-status sa-save-saving';  }
  if (state === 'saved')  { el.textContent = '✓ Saved';   el.className = 'sa-save-status sa-save-saved';   }
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
      if (f.type === 'principle_grid') {
        // Complete if at least 5 of 9 principles have the first sub_row filled
        const firstKey = f.sub_rows?.[0]?.key;
        if (firstKey && v && typeof v === 'object') {
          const count = PRINCIPLES.filter(p => {
            const cell = v[p.key]?.[firstKey];
            return cell != null && cell !== '';
          }).length;
          if (count >= 5) filled++;
        }
      } else {
        if (v != null && v !== '') filled++;
      }
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

function getCategoryByFieldKey(key) {
  for (const cat of currentCategories) {
    if (cat.fields.find(f => f.key === key)) return cat;
  }
  return null;
}

// ── Panel toggle ──────────────────────────────────────────────────────────────
window.togglePanel = function(header) {
  header.closest('.sa-panel').classList.toggle('sa-panel--collapsed');
};

// ── Render: principle_grid ────────────────────────────────────────────────────
function renderPrincipleGrid(field, value, em) {
  const { key, sub_rows } = field;
  const cat = getCategoryByFieldKey(key);
  const catKey = cat?.category || '';
  const gridVal = (value && typeof value === 'object') ? value : {};

  if (!em) {
    // View mode
    return `<div class="sa-dt-scroll"><table class="sa-pg-table">
      <thead><tr>
        <th class="sa-pg-th sa-pg-label-col">Question</th>
        ${PRINCIPLES.map(p => `<th class="sa-pg-th">${escHtml(p.label)}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${sub_rows.map(sr => `<tr>
          <td class="sa-pg-row-label">${escHtml(sr.label)}</td>
          ${PRINCIPLES.map(p => {
            const cell = gridVal[p.key]?.[sr.key];
            return `<td class="sa-pg-td">${cell != null && cell !== '' ? escHtml(String(cell)) : '<span class="sa-no-data">—</span>'}</td>`;
          }).join('')}
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  }

  // Edit mode
  return `<div class="sa-dt-scroll"><div class="sa-pg-wrap" data-pg-container="${escAttr(key)}" data-pg-category="${escAttr(catKey)}">
    <table class="sa-pg-table sa-pg-table--edit">
      <thead><tr>
        <th class="sa-pg-th sa-pg-label-col">Question</th>
        ${PRINCIPLES.map(p => `<th class="sa-pg-th">${escHtml(p.label)}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${sub_rows.map(sr => `<tr>
          <td class="sa-pg-row-label">${escHtml(sr.label)}</td>
          ${PRINCIPLES.map(p => {
            const cellVal = gridVal[p.key]?.[sr.key] ?? '';
            let input;
            if (sr.cell_type === 'yesno') {
              input = `<select class="sa-pg-input"
                data-key="${escAttr(key)}"
                data-sub-row="${escAttr(sr.key)}"
                data-principle="${escAttr(p.key)}"
                data-type="principle_grid"
                data-category="${escAttr(catKey)}">
                <option value="">—</option>
                <option value="Yes" ${cellVal === 'Yes' ? 'selected' : ''}>Yes</option>
                <option value="No"  ${cellVal === 'No'  ? 'selected' : ''}>No</option>
              </select>`;
            } else if (sr.cell_type === 'select') {
              const opts = (sr.options || []).map(o =>
                `<option value="${escAttr(o)}" ${cellVal === o ? 'selected' : ''}>${escHtml(o)}</option>`
              ).join('');
              input = `<select class="sa-pg-input"
                data-key="${escAttr(key)}"
                data-sub-row="${escAttr(sr.key)}"
                data-principle="${escAttr(p.key)}"
                data-type="principle_grid"
                data-category="${escAttr(catKey)}">
                <option value="">—</option>${opts}
              </select>`;
            } else {
              input = `<input type="text" class="sa-pg-input sa-pg-input--text"
                data-key="${escAttr(key)}"
                data-sub-row="${escAttr(sr.key)}"
                data-principle="${escAttr(p.key)}"
                data-type="principle_grid"
                data-category="${escAttr(catKey)}"
                value="${escAttr(cellVal)}">`;
            }
            return `<td class="sa-pg-td">${input}</td>`;
          }).join('')}
        </tr>`).join('')}
      </tbody>
    </table>
  </div></div>`;
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
      case 'select':
        return value ? `<span class="sa-badge">${escHtml(value)}</span>` : '<span class="sa-no-data">—</span>';
      case 'principle_grid':
        return renderPrincipleGrid(field, value, false);
      default:
        return '<span class="sa-no-data">—</span>';
    }
  }

  // Edit mode
  switch (type) {
    case 'text':
      return `<input class="sa-input" type="text" data-key="${key}" data-type="${type}" value="${escAttr(value || '')}">`;
    case 'textarea':
      return `<textarea class="sa-input sa-textarea" data-key="${key}" data-type="${type}" rows="4">${escHtml(value || '')}</textarea>`;
    case 'select': {
      const selOpts = (options || []).map(o =>
        `<option value="${escAttr(o)}" ${value === o ? 'selected' : ''}>${escHtml(o)}</option>`
      ).join('');
      return `<select class="sa-input" data-key="${key}" data-type="${type}"><option value="">—</option>${selOpts}</select>`;
    }
    case 'principle_grid':
      return renderPrincipleGrid(field, value, true);
    default:
      return '<span class="sa-no-data">—</span>';
  }
}

// ── Render: all panels ────────────────────────────────────────────────────────
function renderPanels(em) {
  const container = document.getElementById('sb-panels');
  container.innerHTML = '';

  for (const cat of currentCategories) {
    const panel = document.createElement('div');
    panel.className = 'card sa-panel';

    const fieldRows = cat.fields.map(f => `
      <div class="sa-field-row">
        <div class="sa-field-label">${escHtml(f.label)}</div>
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

    container.appendChild(panel);
  }
}

// ── Collect: principle_grid ───────────────────────────────────────────────────
function collectPrincipleGrid(key) {
  const container = document.querySelector(`[data-pg-container="${key}"]`);
  if (!container) return undefined;
  const result = {};
  container.querySelectorAll('[data-principle][data-sub-row]').forEach(inp => {
    const p  = inp.dataset.principle;
    const sr = inp.dataset.subRow;
    if (!result[p]) result[p] = {};
    result[p][sr] = inp.value || null;
  });
  return result;
}

// ── Collect: scalar field from DOM ────────────────────────────────────────────
function collectFieldValue(field) {
  const { key, type } = field;
  if (type === 'principle_grid') return collectPrincipleGrid(key);

  const inp = document.querySelector(`[data-key="${key}"]`);
  if (!inp) return undefined;
  return inp.value || null;
}

// ── Input event delegation ────────────────────────────────────────────────────
document.getElementById('sb-panels').addEventListener('input', e => {
  if (!editMode) return;
  setUnsaved(true);
  scheduleAutoSave();
});

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
    const r = await api('PUT', `/api/brsr/section-b/${submissionId}`, payload);
    if (!r || !r.ok) errors++;
  }

  if (errors) {
    showToast(`${errors} field(s) failed to save`, 'error');
    setSaveStatus('unsaved');
  } else {
    setUnsaved(false);
    await reloadSectionB();
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
  const data   = await res.json();
  submissionId = data.submission.id;
  renderStatusBadge(data.submission.status);
  return data.submission;
}

async function reloadSectionB() {
  const res = await api('GET', `/api/brsr/section-b/${submissionId}`);
  if (!res || !res.ok) { showToast('Failed to load Section B', 'error'); return; }
  const data        = await res.json();
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
  await reloadSectionB();

  const isLocked = submission.status === 'locked' || submission.status === 'filed';

  if (CAN_EDIT && !isLocked) {
    document.getElementById('edit-btn').style.display = '';
    document.getElementById('save-btn').style.display = 'none';
  } else {
    document.getElementById('edit-btn').style.display = 'none';
    document.getElementById('save-btn').style.display = 'none';
  }
  document.getElementById('save-status').style.display = 'none';
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
