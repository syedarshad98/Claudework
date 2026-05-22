/* ─────────────────────────────────────────────────────────────────────────────
   ClearTrace — brsr-evidence-widget.js
   Reusable evidence upload widget for BRSR disclosure fields.

   Usage:
     mountEvidenceWidget(containerEl, submissionId, fieldRef, { readonly: false })
   ───────────────────────────────────────────────────────────────────────────── */

function mountEvidenceWidget(containerEl, submissionId, fieldRef, options = {}) {
  const readonly = options.readonly === true;
  const token    = localStorage.getItem('ct_token');

  // ── Internal helpers ────────────────────────────────────────────────────────

  function escHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatBytes(n) {
    if (!n) return '—';
    if (n < 1024)        return `${n} B`;
    if (n < 1048576)     return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1048576).toFixed(1)} MB`;
  }

  async function apiJson(method, path) {
    const res = await fetch(path, {
      method,
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.status === 401) { localStorage.clear(); window.location.replace('/login.html'); return null; }
    return res;
  }

  // ── Build initial skeleton ──────────────────────────────────────────────────

  containerEl.innerHTML = `
    <div class="ev-widget">
      ${!readonly ? `
        <button class="ev-attach-btn btn btn-outline" type="button">&#128206; Attach evidence</button>
        <input type="file" class="ev-file-input" style="display:none"
               accept=".pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png">
        <div class="ev-progress" style="display:none">
          <div class="ev-progress-bar"></div>
          <span class="ev-progress-label">Uploading…</span>
        </div>
      ` : ''}
      <ul class="ev-file-list"></ul>
    </div>`;

  const attachBtn   = containerEl.querySelector('.ev-attach-btn');
  const fileInput   = containerEl.querySelector('.ev-file-input');
  const progressWrap = containerEl.querySelector('.ev-progress');
  const progressBar  = containerEl.querySelector('.ev-progress-bar');
  const progressLbl  = containerEl.querySelector('.ev-progress-label');
  const fileList    = containerEl.querySelector('.ev-file-list');

  // ── Render a single file row ─────────────────────────────────────────────────

  function renderRow(item) {
    const li = document.createElement('li');
    li.className  = 'ev-file-item';
    li.dataset.id = item.id;
    li.innerHTML = `
      <span class="ev-file-icon">&#128196;</span>
      <span class="ev-file-name">${escHtml(item.file_name)}</span>
      <span class="ev-file-size">${formatBytes(item.file_size_bytes)}</span>
      ${item.signed_url
        ? `<a class="ev-file-link" href="${escHtml(item.signed_url)}" target="_blank" rel="noopener">Download</a>`
        : ''}
      ${!readonly
        ? `<button class="ev-delete-btn" type="button" data-id="${item.id}" title="Delete">&#128465;</button>`
        : ''}`;
    return li;
  }

  // ── Load existing files ──────────────────────────────────────────────────────

  async function loadFiles() {
    fileList.innerHTML = '<li class="ev-loading">Loading…</li>';
    const res = await apiJson('GET', `/api/brsr/evidence/${submissionId}`);
    if (!res) return;
    if (!res.ok) { fileList.innerHTML = ''; return; }

    const grouped = await res.json();
    const items   = grouped[fieldRef] || [];
    fileList.innerHTML = '';

    if (!items.length) {
      fileList.innerHTML = '<li class="ev-empty">No evidence attached</li>';
      return;
    }
    items.forEach(item => fileList.appendChild(renderRow(item)));
  }

  // ── Upload ────────────────────────────────────────────────────────────────────

  async function doUpload(file) {
    const fd = new FormData();
    fd.append('file', file);

    if (progressWrap) {
      progressWrap.style.display = '';
      progressBar.style.width    = '0%';
      progressLbl.textContent    = 'Uploading…';
    }

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/brsr/evidence/${submissionId}/${encodeURIComponent(fieldRef)}`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable && progressBar) {
          const pct = Math.round((e.loaded / e.total) * 100);
          progressBar.style.width  = `${pct}%`;
          progressLbl.textContent  = `Uploading… ${pct}%`;
        }
      });

      xhr.addEventListener('load', async () => {
        if (progressWrap) progressWrap.style.display = 'none';

        if (xhr.status === 401) {
          localStorage.clear(); window.location.replace('/login.html'); return resolve(null);
        }

        let data;
        try { data = JSON.parse(xhr.responseText); } catch { data = {}; }

        if (xhr.status === 201) {
          // Fetch a signed URL for the new row so the download link works immediately
          const listRes = await apiJson('GET', `/api/brsr/evidence/${submissionId}`);
          if (listRes && listRes.ok) {
            const grouped = await listRes.json();
            const match   = (grouped[fieldRef] || []).find(r => r.id === data.id);
            if (match) {
              const empty = fileList.querySelector('.ev-empty');
              if (empty) empty.remove();
              fileList.appendChild(renderRow(match));
            }
          }
          resolve(data);
        } else {
          alert(data.error || 'Upload failed');
          resolve(null);
        }
      });

      xhr.addEventListener('error', () => {
        if (progressWrap) progressWrap.style.display = 'none';
        alert('Network error — upload failed');
        resolve(null);
      });

      xhr.send(fd);
    });
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  fileList.addEventListener('click', async e => {
    const btn = e.target.closest('.ev-delete-btn');
    if (!btn) return;
    const id = parseInt(btn.dataset.id, 10);
    if (!confirm('Delete this evidence file?')) return;

    btn.disabled = true;
    const res = await apiJson('DELETE', `/api/brsr/evidence/${id}`);
    if (!res) return;

    if (res.ok) {
      const li = fileList.querySelector(`[data-id="${id}"]`);
      if (li) li.remove();
      if (!fileList.children.length) {
        fileList.innerHTML = '<li class="ev-empty">No evidence attached</li>';
      }
    } else {
      btn.disabled = false;
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Delete failed');
    }
  });

  // ── Wire up upload button ─────────────────────────────────────────────────────

  if (attachBtn && fileInput) {
    attachBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      fileInput.value = '';
      await doUpload(file);
    });
  }

  // ── Mount: load existing files ────────────────────────────────────────────────

  loadFiles();
}
