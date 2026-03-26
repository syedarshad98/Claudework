/* ─────────────────────────────────────────────────────────────────────────────
   ClearTrace — onboarding.js
   Drives the 5-step post-registration wizard.
   ───────────────────────────────────────────────────────────────────────────── */

// ── Auth guard ────────────────────────────────────────────────────────────────
const token = localStorage.getItem('ct_token');
if (!token) window.location.replace('/login.html');

const COMPANY = localStorage.getItem('ct_company') || '';
document.getElementById('ob-company-name').textContent = COMPANY;

// ── State ─────────────────────────────────────────────────────────────────────
let currentStep = 1;
const TOTAL     = 5;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const nextBtn    = document.getElementById('ob-next-btn');
const backBtn    = document.getElementById('ob-back-btn');
const errorEl    = document.getElementById('ob-error');
const progressEl = document.getElementById('ob-progress-bar');
const skipLink   = document.getElementById('ob-skip-link');

// ── API helper ────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    localStorage.clear();
    window.location.replace('/login.html');
    return null;
  }
  return res;
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.style.display = msg ? 'block' : 'none';
}

// ── Year dropdowns ────────────────────────────────────────────────────────────
(function populateYears() {
  const yr      = new Date().getFullYear();
  const baseYr  = document.getElementById('p3-year');
  const targetYr = document.getElementById('p4-year');

  for (let y = yr - 1; y >= yr - 5; y--) {
    const o = document.createElement('option');
    o.value = y;
    o.textContent = y;
    if (y === yr - 1) o.selected = true;
    baseYr.appendChild(o);
  }

  for (let y = yr + 1; y <= yr + 20; y++) {
    const o = document.createElement('option');
    o.value = y;
    o.textContent = y;
    targetYr.appendChild(o);
  }
})();

// ── Invite rows ───────────────────────────────────────────────────────────────
function addInviteRow(email = '', role = 'editor') {
  const list = document.getElementById('invite-list');
  const row  = document.createElement('div');
  row.className = 'ob-invite-row';
  row.innerHTML = `
    <div class="ob-field" style="flex:1">
      <label>Email address</label>
      <input type="email" class="invite-email" placeholder="colleague@company.com" value="${email}" autocomplete="off">
    </div>
    <div class="ob-field ob-invite-role">
      <label>Role</label>
      <select class="invite-role">
        <option value="admin"  ${role === 'admin'  ? 'selected' : ''}>Admin</option>
        <option value="editor" ${role === 'editor' ? 'selected' : ''}>Editor</option>
        <option value="viewer" ${role === 'viewer' ? 'selected' : ''}>Viewer</option>
      </select>
    </div>
    <button type="button" class="ob-remove-invite" title="Remove">✕</button>
  `;
  row.querySelector('.ob-remove-invite').addEventListener('click', () => row.remove());
  list.appendChild(row);
}

document.getElementById('add-invite-btn').addEventListener('click', () => addInviteRow());
// Start with one empty row
addInviteRow();

// ── Step navigation ───────────────────────────────────────────────────────────
function updateUI() {
  // Panels
  document.querySelectorAll('.ob-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`panel-${currentStep}`).classList.add('active');

  // Sidebar steps
  document.querySelectorAll('.ob-step').forEach(s => {
    const n = parseInt(s.dataset.step);
    s.classList.toggle('active',    n === currentStep);
    s.classList.toggle('completed', n < currentStep);
  });

  // Progress bar
  progressEl.style.width = `${(currentStep / TOTAL) * 100}%`;

  // Buttons
  backBtn.style.visibility = currentStep > 1 ? 'visible' : 'hidden';
  nextBtn.textContent      = currentStep === TOTAL ? 'Finish Setup →' : 'Continue →';

  showError('');
}

// ── Save each step ────────────────────────────────────────────────────────────
async function saveStep(step) {
  showError('');

  if (step === 1) {
    const name      = document.getElementById('p1-name').value.trim();
    const industry  = document.getElementById('p1-industry').value;
    const country   = document.getElementById('p1-country').value.trim();
    const employees = document.getElementById('p1-employees').value;

    if (!name) { showError('Company name is required.'); return false; }

    const res = await api('PUT', '/api/onboarding/profile', {
      name, industry, country,
      employeeCount: employees ? parseInt(employees) : null,
    });
    if (!res || !res.ok) {
      const data = res ? await res.json() : {};
      showError(data.error || 'Failed to save — please try again.');
      return false;
    }
    // Update sidebar company name
    localStorage.setItem('ct_company', name);
    document.getElementById('ob-company-name').textContent = name;
    return true;
  }

  if (step === 2) {
    const fyStart    = document.getElementById('p2-fy').value;
    const checkboxes = document.querySelectorAll('input[name="framework"]');
    const frameworks = Array.from(checkboxes).map(cb => ({
      framework: cb.value,
      selected:  cb.checked,
    }));

    const res = await api('PUT', '/api/onboarding/reporting', {
      financialYearStart: parseInt(fyStart),
      frameworks,
    });
    if (!res || !res.ok) {
      const data = res ? await res.json() : {};
      showError(data.error || 'Failed to save — please try again.');
      return false;
    }
    return true;
  }

  if (step === 3) {
    const year = parseInt(document.getElementById('p3-year').value);
    const s1   = document.getElementById('p3-s1').value;
    const s2   = document.getElementById('p3-s2').value;
    const s3   = document.getElementById('p3-s3').value;

    const baseline = [];
    if (s1) baseline.push({ scope: 1, co2e_tonnes: parseFloat(s1) });
    if (s2) baseline.push({ scope: 2, co2e_tonnes: parseFloat(s2) });
    if (s3) baseline.push({ scope: 3, co2e_tonnes: parseFloat(s3) });

    const res = await api('PUT', '/api/onboarding/baseline', { baseline, year });
    if (!res || !res.ok) {
      const data = res ? await res.json() : {};
      showError(data.error || 'Failed to save — please try again.');
      return false;
    }
    return true;
  }

  if (step === 4) {
    const pct      = document.getElementById('p4-pct').value;
    const yr       = document.getElementById('p4-year').value;
    const standard = document.querySelector('input[name="standard"]:checked')?.value || null;

    const res = await api('PUT', '/api/onboarding/targets', {
      reductionTargetPct: pct  ? parseFloat(pct) : null,
      targetYear:         yr   ? parseInt(yr)    : null,
      alignmentStandard:  standard,
    });
    if (!res || !res.ok) {
      const data = res ? await res.json() : {};
      showError(data.error || 'Failed to save — please try again.');
      return false;
    }
    return true;
  }

  if (step === 5) {
    const rows = document.querySelectorAll('.ob-invite-row');
    const invites = [];
    rows.forEach(row => {
      const email = row.querySelector('.invite-email').value.trim();
      const role  = row.querySelector('.invite-role').value;
      if (email && email.includes('@')) invites.push({ email, role });
    });

    const res = await api('PUT', '/api/onboarding/invites', { invites });
    if (!res || !res.ok) {
      const data = res ? await res.json() : {};
      showError(data.error || 'Failed to save — please try again.');
      return false;
    }
    return true;
  }

  return true;
}

// ── Complete ──────────────────────────────────────────────────────────────────
async function completeOnboarding() {
  const res = await api('POST', '/api/onboarding/complete');
  if (!res || !res.ok) return;
  localStorage.setItem('ct_onboarding', 'complete');
  window.location.replace('/');
}

// ── Button handlers ───────────────────────────────────────────────────────────
nextBtn.addEventListener('click', async () => {
  nextBtn.disabled    = true;
  nextBtn.textContent = 'Saving…';

  const ok = await saveStep(currentStep);
  if (!ok) {
    nextBtn.disabled    = false;
    nextBtn.textContent = currentStep === TOTAL ? 'Finish Setup →' : 'Continue →';
    return;
  }

  if (currentStep === TOTAL) {
    await completeOnboarding();
    return;
  }

  currentStep++;
  updateUI();
  nextBtn.disabled = false;
});

backBtn.addEventListener('click', () => {
  if (currentStep > 1) {
    currentStep--;
    updateUI();
  }
});

skipLink.addEventListener('click', async () => {
  if (!confirm('Skip setup? You can complete it later from your dashboard settings.')) return;
  await api('POST', '/api/onboarding/complete');
  localStorage.setItem('ct_onboarding', 'complete');
  window.location.replace('/');
});

// ── Pre-fill from saved data ──────────────────────────────────────────────────
async function prefill() {
  const res = await api('GET', '/api/onboarding/status');
  if (!res || !res.ok) return;
  const d = await res.json();

  if (d.onboardingComplete) {
    window.location.replace('/');
    return;
  }

  // Step 1
  if (d.profile.name)          document.getElementById('p1-name').value = d.profile.name;
  if (d.profile.industry)      document.getElementById('p1-industry').value = d.profile.industry;
  if (d.profile.country)       document.getElementById('p1-country').value = d.profile.country;
  if (d.profile.employeeCount) document.getElementById('p1-employees').value = d.profile.employeeCount;

  // Step 2
  if (d.reporting.financialYearStart) {
    document.getElementById('p2-fy').value = d.reporting.financialYearStart;
  }
  d.reporting.frameworks.forEach(fw => {
    const cb = document.querySelector(`input[name="framework"][value="${fw.framework}"]`);
    if (cb) cb.checked = fw.status !== 'not_started';
  });

  // Step 3
  if (d.baseline.length) {
    const yr = d.baseline[0].year;
    if (yr) document.getElementById('p3-year').value = yr;
    d.baseline.forEach(b => {
      const el = document.getElementById(`p3-s${b.scope}`);
      if (el && b.co2e_tonnes > 0) el.value = b.co2e_tonnes;
    });
  }

  // Step 4
  if (d.targets.reductionTargetPct) document.getElementById('p4-pct').value = d.targets.reductionTargetPct;
  if (d.targets.targetYear)         document.getElementById('p4-year').value = d.targets.targetYear;
  if (d.targets.alignmentStandard) {
    const rb = document.querySelector(`input[name="standard"][value="${d.targets.alignmentStandard}"]`);
    if (rb) rb.checked = true;
  }

  // Step 5 — replace the default empty row if we have saved invites
  if (d.invites.length) {
    document.getElementById('invite-list').innerHTML = '';
    d.invites.forEach(inv => addInviteRow(inv.email, inv.role));
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
prefill().then(() => updateUI());
