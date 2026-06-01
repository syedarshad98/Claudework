/* ─────────────────────────────────────────────────────────────────────────────
   brsr-lock-banner.js — Reusable BRSR period-lock banner with unlock workflow.
   Exposes window.mountLockBanner(containerEl, submissionId, userRole, onStatusChange).
   ───────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  let stylesInjected = false;

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const s = document.createElement('style');
    s.textContent = `
/* ── Lock banner ── */
.lock-banner{margin:0 0 16px;padding:12px 16px;border-radius:8px;display:flex;align-items:flex-start;gap:12px;font-size:14px;line-height:1.5}
.lock-banner--open{background:#f0fdf4;border:1px solid #bbf7d0}
.lock-banner--locked{background:#fef2f2;border:1px solid #fecaca}
.lock-banner--pending{background:#fffbeb;border:1px solid #fde68a}
.lock-banner-icon{font-size:20px;flex-shrink:0;margin-top:1px}
.lock-banner-body{flex:1;min-width:0}
.lock-banner-title{font-weight:600;margin-bottom:3px;color:#111827}
.lock-banner-meta{color:#6b7280;font-size:13px}
.lock-banner-reason{font-style:italic;color:#374151;margin-top:3px;word-break:break-word}
.lock-banner-actions{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.lock-banner-audit-toggle{display:inline-block;margin-top:8px;font-size:12px;color:#6b7280;cursor:pointer;text-decoration:underline;background:none;border:none;padding:0}
.lock-banner-audit-wrap{margin-top:8px;display:none}
.lock-banner-audit-wrap.open{display:block}
.lock-audit-table{width:100%;border-collapse:collapse;font-size:12px}
.lock-audit-table th{text-align:left;padding:4px 8px;background:rgba(0,0,0,0.04);font-weight:600;border-bottom:1px solid rgba(0,0,0,0.08)}
.lock-audit-table td{padding:4px 8px;border-bottom:1px solid rgba(0,0,0,0.05);vertical-align:top;color:#374151}
.lock-audit-pill{display:inline-block;padding:1px 7px;border-radius:4px;font-weight:500;font-size:11px}
.lock-audit-pill--locked{background:#fee2e2;color:#b91c1c}
.lock-audit-pill--unlock_requested{background:#fef3c7;color:#92400e}
.lock-audit-pill--unlock_approved{background:#dcfce7;color:#166534}
.lock-audit-pill--unlock_rejected{background:#f3f4f6;color:#374151}
/* Status badge override for unlock_requested */
.sa-status-pending{background:#fef3c7;color:#92400e;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:600}
/* ── Lock modal ── */
.lock-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}
.lock-modal{background:#fff;border-radius:12px;padding:24px;width:100%;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,0.2)}
.lock-modal-title{font-size:16px;font-weight:700;margin-bottom:6px;color:#111827}
.lock-modal-desc{font-size:14px;color:#6b7280;margin-bottom:14px}
.lock-modal-input{width:100%;box-sizing:border-box;padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;resize:vertical;font-family:inherit;min-height:72px}
.lock-modal-input:focus{outline:none;border-color:#10b981;box-shadow:0 0 0 2px rgba(16,185,129,0.15)}
.lock-modal-error{color:#dc2626;font-size:13px;margin-top:5px;display:none}
.lock-modal-footer{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}
    `;
    document.head.appendChild(s);
  }

  function apiCall(method, path, body) {
    const token = localStorage.getItem('ct_token');
    const opts = {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    return fetch(path, opts).then(res => {
      if (res.status === 401) { localStorage.clear(); window.location.replace('/login.html'); return null; }
      return res;
    });
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function escHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function openModal({ title, desc, placeholder, confirmLabel, onConfirm }) {
    const overlay = document.createElement('div');
    overlay.className = 'lock-modal-overlay';
    overlay.innerHTML = `
      <div class="lock-modal">
        <div class="lock-modal-title">${escHtml(title)}</div>
        <div class="lock-modal-desc">${escHtml(desc)}</div>
        <textarea class="lock-modal-input" rows="3" placeholder="${escHtml(placeholder)}"></textarea>
        <div class="lock-modal-error">Please enter a reason before continuing.</div>
        <div class="lock-modal-footer">
          <button class="btn btn-outline" data-cancel>Cancel</button>
          <button class="btn btn-primary" data-confirm>${escHtml(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const textarea = overlay.querySelector('.lock-modal-input');
    const errEl    = overlay.querySelector('.lock-modal-error');
    const confirmBtn = overlay.querySelector('[data-confirm]');
    const cancelBtn  = overlay.querySelector('[data-cancel]');

    const close = () => overlay.remove();
    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    confirmBtn.addEventListener('click', async () => {
      const val = textarea.value.trim();
      if (!val) { errEl.style.display = 'block'; textarea.focus(); return; }
      errEl.style.display = 'none';
      confirmBtn.disabled = true;
      cancelBtn.disabled  = true;
      confirmBtn.textContent = '…';
      try { await onConfirm(val); } finally { overlay.remove(); }
    });

    setTimeout(() => textarea.focus(), 50);
  }

  async function renderBanner(containerEl, submissionId, userRole, onStatusChange) {
    const res = await apiCall('GET', `/api/brsr/submission/${submissionId}/lock-status`);
    if (!res || !res.ok) { containerEl.innerHTML = ''; return; }
    const data = await res.json();
    const { lock, audit } = data;

    const isOpen          = !lock;
    const isLocked        = lock && !lock.unlock_requested_at;
    const isUnlockPending = lock && lock.unlock_requested_at;
    const isAdmin         = userRole === 'admin';
    const canEdit         = userRole === 'admin' || userRole === 'editor';

    let bannerClass, iconHtml, bodyHtml;

    if (isOpen) {
      bannerClass = 'lock-banner--open';
      iconHtml    = '🔓';
      bodyHtml    = `
        <div class="lock-banner-title">Open for editing</div>
        <div class="lock-banner-meta">This submission is unlocked and editable.</div>
        ${canEdit ? `<div class="lock-banner-actions">
          <button class="btn btn-outline" id="lb-lock-btn">Lock Submission</button>
        </div>` : ''}`;

    } else if (isLocked) {
      bannerClass = 'lock-banner--locked';
      iconHtml    = '🔒';
      bodyHtml    = `
        <div class="lock-banner-title">Locked on ${fmtDate(lock.locked_at)}${lock.locker_name ? ' by ' + escHtml(lock.locker_name) : ''}</div>
        ${lock.lock_reason ? `<div class="lock-banner-reason">"${escHtml(lock.lock_reason)}"</div>` : '<div class="lock-banner-meta">No reason provided.</div>'}
        ${canEdit ? `<div class="lock-banner-actions">
          <button class="btn btn-outline" id="lb-unlock-request-btn">Request Unlock</button>
        </div>` : ''}`;

    } else {
      bannerClass = 'lock-banner--pending';
      if (isAdmin) {
        iconHtml = '⚠️';
        bodyHtml = `
          <div class="lock-banner-title">Unlock requested${lock.requester_name ? ' by ' + escHtml(lock.requester_name) : ''} on ${fmtDate(lock.unlock_requested_at)}</div>
          ${lock.unlock_request_reason ? `<div class="lock-banner-reason">"${escHtml(lock.unlock_request_reason)}"</div>` : ''}
          <div class="lock-banner-actions">
            <button class="btn btn-primary" id="lb-approve-btn">Approve Unlock</button>
            <button class="btn btn-outline" id="lb-reject-btn">Reject</button>
          </div>`;
      } else {
        iconHtml = '⏳';
        bodyHtml = `
          <div class="lock-banner-title">Unlock requested on ${fmtDate(lock.unlock_requested_at)}</div>
          <div class="lock-banner-meta">Awaiting admin approval.</div>
          ${lock.unlock_request_reason ? `<div class="lock-banner-reason">"${escHtml(lock.unlock_request_reason)}"</div>` : ''}`;
      }
    }

    const ACTION_LABELS = {
      locked:           'Locked',
      unlock_requested: 'Unlock Requested',
      unlock_approved:  'Approved',
      unlock_rejected:  'Rejected',
    };

    const auditRows = (audit || []).map(row => {
      const lbl = ACTION_LABELS[row.action] || row.action;
      return `<tr>
        <td><span class="lock-audit-pill lock-audit-pill--${escHtml(row.action)}">${escHtml(lbl)}</span></td>
        <td>${escHtml(row.performed_by_name || ('#' + row.performed_by))}</td>
        <td style="white-space:nowrap">${fmtDate(row.performed_at)}</td>
        <td>${escHtml(row.reason || row.notes || '—')}</td>
      </tr>`;
    }).join('');

    const auditSection = audit && audit.length ? `
      <button class="lock-banner-audit-toggle" id="lb-audit-toggle">View history (${Math.min(audit.length, 10)})</button>
      <div class="lock-banner-audit-wrap" id="lb-audit-wrap">
        <table class="lock-audit-table">
          <thead><tr><th>Action</th><th>By</th><th>Date</th><th>Reason / Notes</th></tr></thead>
          <tbody>${auditRows}</tbody>
        </table>
      </div>` : '';

    containerEl.innerHTML = `
      <div class="lock-banner ${bannerClass}">
        <div class="lock-banner-icon">${iconHtml}</div>
        <div class="lock-banner-body">
          ${bodyHtml}
          ${auditSection}
        </div>
      </div>`;

    const lockBtn       = containerEl.querySelector('#lb-lock-btn');
    const unlockReqBtn  = containerEl.querySelector('#lb-unlock-request-btn');
    const approveBtn    = containerEl.querySelector('#lb-approve-btn');
    const rejectBtn     = containerEl.querySelector('#lb-reject-btn');
    const auditToggle   = containerEl.querySelector('#lb-audit-toggle');
    const auditWrap     = containerEl.querySelector('#lb-audit-wrap');

    if (auditToggle && auditWrap) {
      auditToggle.addEventListener('click', () => {
        const open = auditWrap.classList.toggle('open');
        auditToggle.textContent = open
          ? 'Hide history'
          : `View history (${Math.min(audit.length, 10)})`;
      });
    }

    if (lockBtn) {
      lockBtn.addEventListener('click', () => openModal({
        title:         'Lock Submission',
        desc:          'Locking prevents all edits until an admin approves an unlock request.',
        placeholder:   'e.g. FY 2024-25 data finalised for assurance.',
        confirmLabel:  'Lock',
        onConfirm: async (reason) => {
          const r = await apiCall('POST', `/api/brsr/submission/${submissionId}/lock`, { reason });
          if (!r || !r.ok) { alert('Failed to lock submission. Please try again.'); return; }
          await renderBanner(containerEl, submissionId, userRole, onStatusChange);
          if (onStatusChange) onStatusChange('locked');
        },
      }));
    }

    if (unlockReqBtn) {
      unlockReqBtn.addEventListener('click', () => openModal({
        title:        'Request Unlock',
        desc:         'Your request will be sent to an admin for approval. The submission remains locked until approved.',
        placeholder:  'e.g. Correction needed in Scope 2 figures.',
        confirmLabel: 'Send Request',
        onConfirm: async (reason) => {
          const r = await apiCall('POST', `/api/brsr/submission/${submissionId}/unlock-request`, { reason });
          if (!r || !r.ok) { alert('Failed to send unlock request. Please try again.'); return; }
          await renderBanner(containerEl, submissionId, userRole, onStatusChange);
          if (onStatusChange) onStatusChange('unlock_requested');
        },
      }));
    }

    if (approveBtn) {
      approveBtn.addEventListener('click', async () => {
        if (!confirm('Approve this unlock request? The submission will return to "In Review" and become editable.')) return;
        approveBtn.disabled = true;
        approveBtn.textContent = '…';
        const r = await apiCall('POST', `/api/brsr/submission/${submissionId}/unlock-approve`, {});
        if (!r || !r.ok) { alert('Failed to approve unlock. Please try again.'); approveBtn.disabled = false; approveBtn.textContent = 'Approve Unlock'; return; }
        await renderBanner(containerEl, submissionId, userRole, onStatusChange);
        if (onStatusChange) onStatusChange('in_review');
      });
    }

    if (rejectBtn) {
      rejectBtn.addEventListener('click', () => openModal({
        title:        'Reject Unlock Request',
        desc:         'The submission will remain locked. Enter notes explaining the rejection.',
        placeholder:  'e.g. Data needs further validation before any changes can be made.',
        confirmLabel: 'Reject Request',
        onConfirm: async (notes) => {
          const r = await apiCall('POST', `/api/brsr/submission/${submissionId}/unlock-reject`, { notes });
          if (!r || !r.ok) { alert('Failed to reject request. Please try again.'); return; }
          await renderBanner(containerEl, submissionId, userRole, onStatusChange);
          if (onStatusChange) onStatusChange('locked');
        },
      }));
    }
  }

  window.mountLockBanner = async function (containerEl, submissionId, userRole, onStatusChange) {
    injectStyles();
    await renderBanner(containerEl, submissionId, userRole, onStatusChange);
  };
})();
