/* ============================================================
   TRAPICO — Civilian User Logic
   Handles: dashboard, complaint form, complaints list, profile
   ============================================================ */

'use strict';

/* ── INIT ──────────────────────────────────────────────────── */
(function init() {
  const user = sessionStorage.getItem('trapico_user') || 'jdoe';
  document.getElementById('sb-name').textContent     = user;
  document.getElementById('topbar-username').textContent = user;

  renderDashboard();
  renderComplaintsTable();
  renderBrgyGrid();
})();

/* ── NOTIF PANEL TOGGLE ────────────────────────────────────── */
let notifOpen = false;

function toggleNotif() {
  notifOpen = !notifOpen;
  document.getElementById('notif-panel').classList.toggle('hidden', !notifOpen);
}

document.addEventListener('click', e => {
  if (!e.target.closest('#notif-btn') && notifOpen) {
    document.getElementById('notif-panel').classList.add('hidden');
    notifOpen = false;
  }
});

/* ── DASHBOARD ─────────────────────────────────────────────── */
function getMyComplaints() {
  return COMPLAINTS.filter(c => c.user === 'jdoe' || c.anon);
}

function renderDashboard() {
  const my       = getMyComplaints();
  const active   = my.filter(c => !['closed','cancelled'].includes(c.status)).length;
  const resolved = my.filter(c => ['resolved','closed'].includes(c.status)).length;

  document.getElementById('stat-total').textContent    = my.length;
  document.getElementById('stat-active').textContent   = active;
  document.getElementById('stat-resolved').textContent = resolved;
  document.getElementById('badge-complaints').textContent = active;

  /* Recent complaints table */
  const tbody = document.getElementById('dash-recent-tbody');
  tbody.innerHTML = my.slice(0, 5).map(c => `
    <tr>
      <td class="track-id">${c.id}</td>
      <td>${c.cat}</td>
      <td>${priorityBadge(c.priority)}</td>
      <td>${statusBadge(c.status)}</td>
      <td class="mono" style="font-size:12px">${c.date}</td>
      <td>
        <button class="btn-secondary btn-sm" onclick="showTimeline('${c.id}')">Track</button>
      </td>
    </tr>`).join('');
}

function renderBrgyGrid() {
  const grid = document.getElementById('brgy-grid');
  grid.innerHTML = BARANGAYS.map(b => `
    <div class="brgy-card">
      <div class="brgy-card-icon">📍</div>
      <div class="brgy-card-name">${b}</div>
      <div class="brgy-card-label"><span class="brgy-card-dot"></span>Active</div>
    </div>`).join('');
}

/* ── MY COMPLAINTS TABLE ───────────────────────────────────── */
function renderComplaintsTable() {
  const search    = (document.getElementById('complaints-search')?.value || '').toLowerCase();
  const statusFil = document.getElementById('complaints-filter')?.value || '';

  const my = getMyComplaints().filter(c => {
    const matchSearch = !search || c.id.toLowerCase().includes(search) || c.cat.toLowerCase().includes(search);
    const matchStatus = !statusFil || c.status === statusFil;
    return matchSearch && matchStatus;
  });

  const tbody = document.getElementById('complaints-tbody');
  if (!tbody) return;

  if (!my.length) {
    tbody.innerHTML = `
      <tr><td colspan="7">
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <div class="empty-title">No complaints found</div>
          <div class="empty-sub">Try adjusting your search or filter.</div>
        </div>
      </td></tr>`;
    return;
  }

  tbody.innerHTML = my.map(c => `
    <tr>
      <td class="track-id">${c.id}</td>
      <td>${c.cat}</td>
      <td style="font-size:12px">${c.brgy}</td>
      <td>${priorityBadge(c.priority)}</td>
      <td>${statusBadge(c.status)}</td>
      <td class="mono" style="font-size:12px">${c.date}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn-secondary btn-sm" onclick="showTimeline('${c.id}')">Track</button>
        ${c.status === 'submitted'
          ? `<button class="btn-danger btn-sm" onclick="cancelComplaint('${c.id}')">Cancel</button>`
          : ''}
      </td>
    </tr>`).join('');
}

function cancelComplaint(id) {
  if (confirm('Are you sure you want to cancel this complaint?')) {
    showToast('Complaint cancelled successfully.');
    renderComplaintsTable();
  }
}

/* ── MULTI-STEP COMPLAINT FORM ─────────────────────────────── */
let currentStep = 1;

function goToStep(step) {
  /* Hide all step forms */
  [1,2,3].forEach(n => {
    document.getElementById('form-step-' + n).classList.add('hidden');
    const stepEl = document.getElementById('step-' + n);
    stepEl.classList.remove('active', 'done');
    if (n < step)     stepEl.classList.add('done');
    if (n === step)   stepEl.classList.add('active');
    /* Update step number display */
    stepEl.querySelector('.step-num').textContent = n < step ? '✓' : n;
  });

  document.getElementById('form-step-' + step).classList.remove('hidden');
  currentStep = step;

  if (step === 3) buildReviewSummary();
  window.scrollTo(0, 0);
}

function updateCharCount(el) {
  const len = el.value.length;
  document.getElementById('char-count').textContent = `${len} / 50 min`;
  document.getElementById('char-count').style.color = len >= 50 ? 'var(--green)' : 'var(--mist)';
}

function selectPriority(el) {
  document.querySelectorAll('.priority-pill').forEach(p => p.classList.remove('sel'));
  el.classList.add('sel');
}

function toggleAnonWarning(checkbox) {
  document.getElementById('anon-warning').classList.toggle('hidden', !checkbox.checked);
}

function buildReviewSummary() {
  const cat      = document.getElementById('f-cat')?.value || '—';
  const brgy     = document.getElementById('f-brgy')?.value || '—';
  const date     = document.getElementById('f-date')?.value || '—';
  const time     = document.getElementById('f-time')?.value || '—';
  const priority = document.querySelector('.priority-pill.sel')?.dataset.p || 'medium';
  const anon     = document.getElementById('anon-toggle')?.checked ? 'Yes' : 'No';

  const rows = [
    ['Category',  cat],
    ['Barangay',  brgy],
    ['Date',      date],
    ['Time',      time],
    ['Priority',  priority.charAt(0).toUpperCase() + priority.slice(1)],
    ['Anonymous', anon],
  ];

  document.getElementById('review-summary').innerHTML = `
    <div class="review-summary-title">Review Your Submission</div>
    ${rows.map(([l,v]) => `
      <div class="review-row">
        <span class="review-label">${l}:</span>
        <span class="review-value">${v}</span>
      </div>`).join('')}`;
}

function submitComplaint() {
  const desc = document.getElementById('f-desc')?.value.trim();
  if (!desc || desc.length < 50) {
    showToast('Please provide a description of at least 50 characters.');
    goToStep(2);
    return;
  }
  showToast('✓ Complaint submitted! Tracking ID: TRAPICO-2026-03-000017');
  goToStep(1);
  setActivePage('complaints');
}

/* ── PROFILE ───────────────────────────────────────────────── */
let isEditing = false;

function toggleProfileEdit() {
  isEditing = !isEditing;
  document.getElementById('profile-view').classList.toggle('hidden', isEditing);
  document.getElementById('profile-edit').classList.toggle('hidden', !isEditing);
  document.getElementById('edit-btn').textContent = isEditing ? '✕ Cancel' : '✎ Edit';
}

function saveProfile() {
  toggleProfileEdit();
  showToast('Profile updated successfully.');
}

function updatePassword() {
  const cur     = document.getElementById('pw-current')?.value;
  const nw      = document.getElementById('pw-new')?.value;
  const confirm = document.getElementById('pw-confirm')?.value;

  if (!cur || !nw || !confirm) { showToast('Please fill in all password fields.'); return; }
  if (nw !== confirm)          { showToast('New passwords do not match.'); return; }
  if (nw.length < 8)           { showToast('Password must be at least 8 characters.'); return; }

  showToast('Password updated successfully.');
  document.getElementById('pw-current').value = '';
  document.getElementById('pw-new').value     = '';
  document.getElementById('pw-confirm').value = '';
}