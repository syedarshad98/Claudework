/* ─────────────────────────────────────────────────────────────────────────────
   ClearTrace — team.js
   ───────────────────────────────────────────────────────────────────────────── */

// ── Auth guard ────────────────────────────────────────────────────────────────
const token = localStorage.getItem('ct_token');
if (!token) window.location.replace('/login.html');
if (localStorage.getItem('ct_onboarding') !== 'complete') window.location.replace('/onboarding.html');

const COMPANY  = localStorage.getItem('ct_company') || '';
const MY_ROLE  = localStorage.getItem('ct_role')    || 'viewer';
const MY_EMAIL = localStorage.getItem('ct_email')   || '';

let MY_ID = null; // resolved after first team fetch

const initials = COMPANY.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '—';
document.getElementById('company-avatar').textContent  = initials;
document.getElementById('sidebar-company').textContent = COMPANY;
document.getElementById('page-sub').textContent        = `Manage members and permissions for ${COMPANY}`;

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
  el.className = `tm-toast tm-toast-${type}`;
  el.textContent = message;
  document.getElementById('tm-toast-container').appendChild(el);
  setTimeout(() => el.classList.add('tm-toast-show'), 10);
  setTimeout(() => {
    el.classList.remove('tm-toast-show');
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function roleBadgeHtml(role) {
  const map = {
    admin:  'tm-badge-admin',
    editor: 'tm-badge-editor',
    viewer: 'tm-badge-viewer',
  };
  const label = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };
  return `<span class="tm-badge ${map[role] || 'tm-badge-viewer'}">${label[role] || role}</span>`;
}

// ── Role visibility setup ─────────────────────────────────────────────────────
function applyRoleUI() {
  const canInvite  = MY_ROLE === 'admin' || MY_ROLE === 'editor';
  const isAdmin    = MY_ROLE === 'admin';

  // Show invite button for admin/editor
  document.getElementById('invite-btn').style.display = canInvite ? '' : 'none';

  // Show pending invites card for admin/editor
  if (canInvite) document.getElementById('invites-card').style.display = '';

  // Show actions column header for admin/editor
  if (canInvite) document.getElementById('actions-th').style.display = '';

  // Restrict invite role selector for editors
  if (MY_ROLE === 'editor') {
    const sel = document.getElementById('invite-role');
    Array.from(sel.options).forEach(opt => {
      if (opt.value !== 'viewer') opt.disabled = true;
    });
    sel.value = 'viewer';
  }
}

// ── Render members table ──────────────────────────────────────────────────────
function renderMembers(members) {
  const tbody = document.getElementById('members-tbody');
  document.getElementById('member-count').textContent = `${members.length} member${members.length !== 1 ? 's' : ''}`;

  if (!members.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="al-empty">No members found.</td></tr>';
    return;
  }

  tbody.innerHTML = members.map(m => {
    const isMe      = m.email === MY_EMAIL;
    const nameCell  = `
      <div class="tm-member-name">${m.name || ''}</div>
      <div class="tm-member-email">${m.email}${isMe ? ' <span class="tm-you-badge">you</span>' : ''}</div>
    `;

    let actionsCell = '';
    if (MY_ROLE === 'admin' || MY_ROLE === 'editor') {
      const canChangeRole   = MY_ROLE === 'admin' || (MY_ROLE === 'editor' && m.role === 'viewer');
      const canRemove       = MY_ROLE === 'admin' && !isMe;

      let roleDropdown = '';
      if (canChangeRole && !isMe) {
        const opts = ['admin', 'editor', 'viewer']
          .map(r => `<option value="${r}"${r === m.role ? ' selected' : ''}>${r.charAt(0).toUpperCase() + r.slice(1)}</option>`)
          .join('');
        // Editors can only keep viewer
        const editorRestrict = MY_ROLE === 'editor'
          ? 'admin editor'.split(' ').map(r => `document.querySelector(\`[data-uid="${m.id}"] option[value="${r}"]\`).disabled=true;`).join('')
          : '';
        roleDropdown = `
          <select class="tm-role-select" data-uid="${m.id}" onchange="changeRole(${m.id}, this.value)">
            ${opts}
          </select>`;
      }

      const removeBtn = canRemove
        ? `<button class="btn tm-remove-btn" onclick="removeMember(${m.id}, '${m.email.replace(/'/g, "\\'")}')">Remove</button>`
        : '';

      actionsCell = `<div class="tm-actions-cell">${roleDropdown}${removeBtn}</div>`;
    }

    const showActions = MY_ROLE === 'admin' || MY_ROLE === 'editor';

    return `<tr>
      <td>${nameCell}</td>
      <td>${roleBadgeHtml(m.role)}</td>
      <td class="al-nowrap al-muted">${fmtDate(m.created_at)}</td>
      ${showActions ? `<td>${actionsCell}</td>` : ''}
    </tr>`;
  }).join('');

  // After rendering, disable non-viewer options for editor role dropdowns
  if (MY_ROLE === 'editor') {
    document.querySelectorAll('.tm-role-select').forEach(sel => {
      Array.from(sel.options).forEach(opt => {
        if (opt.value !== 'viewer') opt.disabled = true;
      });
    });
  }
}

// ── Render pending invites ────────────────────────────────────────────────────
function renderInvites(pending) {
  const tbody = document.getElementById('invites-tbody');
  if (!pending.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="al-empty">No pending invites.</td></tr>';
    return;
  }

  tbody.innerHTML = pending.map(inv => {
    const cancelBtn = MY_ROLE === 'admin'
      ? `<button class="btn tm-remove-btn" onclick="cancelInvite(${inv.id})">Cancel</button>`
      : '—';
    return `<tr>
      <td class="tm-member-email">${inv.email}</td>
      <td>${roleBadgeHtml(inv.role)}</td>
      <td class="al-nowrap al-muted">${fmtDate(inv.created_at)}</td>
      <td class="al-nowrap al-muted">${fmtDate(inv.expires_at)}</td>
      <td>${cancelBtn}</td>
    </tr>`;
  }).join('');
}

// ── Load team data ────────────────────────────────────────────────────────────
async function loadTeam() {
  const res = await api('GET', '/api/team');
  if (!res) return;
  if (!res.ok) {
    showToast('Failed to load team data.', 'error');
    return;
  }
  const { members, pending } = await res.json();

  // Resolve my own ID from the members list
  const me = members.find(m => m.email === MY_EMAIL);
  if (me) MY_ID = me.id;

  renderMembers(members);
  renderInvites(pending);
}

// ── Change role ───────────────────────────────────────────────────────────────
async function changeRole(userId, newRole) {
  const res = await api('PATCH', `/api/team/${userId}/role`, { role: newRole });
  if (!res) return;
  const data = await res.json();
  if (!res.ok) {
    showToast(data.error || 'Failed to update role.', 'error');
    await loadTeam(); // revert the dropdown
    return;
  }
  showToast('Role updated.');
  await loadTeam();
}

// ── Remove member ─────────────────────────────────────────────────────────────
async function removeMember(userId, email) {
  if (!confirm(`Remove ${email} from the team? This cannot be undone.`)) return;
  const res = await api('DELETE', `/api/team/${userId}`);
  if (!res) return;
  const data = await res.json();
  if (!res.ok) { showToast(data.error || 'Failed to remove member.', 'error'); return; }
  showToast(`${email} removed from the team.`);
  await loadTeam();
}

// ── Cancel invite ─────────────────────────────────────────────────────────────
async function cancelInvite(inviteId) {
  const res = await api('DELETE', `/api/team/invites/${inviteId}`);
  if (!res) return;
  const data = await res.json();
  if (!res.ok) { showToast(data.error || 'Failed to cancel invite.', 'error'); return; }
  showToast('Invite cancelled.');
  await loadTeam();
}

// ── Invite modal ──────────────────────────────────────────────────────────────
const inviteModal  = document.getElementById('invite-modal');
const inviteEmail  = document.getElementById('invite-email');
const inviteRole   = document.getElementById('invite-role');
const inviteError  = document.getElementById('invite-error');

document.getElementById('invite-btn').addEventListener('click', () => {
  inviteEmail.value = '';
  inviteError.style.display = 'none';
  inviteModal.style.display = 'flex';
  inviteEmail.focus();
});

function closeModal() {
  inviteModal.style.display = 'none';
}
document.getElementById('invite-modal-close').addEventListener('click', closeModal);
document.getElementById('invite-cancel-btn').addEventListener('click', closeModal);
inviteModal.addEventListener('click', e => { if (e.target === inviteModal) closeModal(); });

document.getElementById('invite-send-btn').addEventListener('click', async () => {
  const email = inviteEmail.value.trim();
  const role  = inviteRole.value;
  inviteError.style.display = 'none';

  if (!email) {
    inviteError.textContent  = 'Please enter an email address.';
    inviteError.style.display = '';
    return;
  }

  const btn = document.getElementById('invite-send-btn');
  btn.disabled    = true;
  btn.textContent = 'Sending…';

  const res = await api('POST', '/api/team/invite', { email, role });
  btn.disabled    = false;
  btn.textContent = 'Send Invite';

  if (!res) return;
  const data = await res.json();

  if (!res.ok) {
    inviteError.textContent  = data.error || 'Failed to send invite.';
    inviteError.style.display = '';
    return;
  }

  closeModal();
  if (data.added) {
    showToast(`${email} added to the team as ${role}.`);
  } else {
    showToast(`Invite sent to ${email}.`);
  }
  await loadTeam();
});

// ── Init ──────────────────────────────────────────────────────────────────────
applyRoleUI();
loadTeam();
