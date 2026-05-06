/* ============================================================
   TRAPICO — Dispatch Officer Logic
   Handles: command center, queue, active cases, officers, analytics
   ============================================================ */

'use strict';

/* ── STATE ─────────────────────────────────────────────────── */
let notifOpen          = false;
let activeQueueTab     = 'submitted';
let selectedOfficerId  = null;
let activeTimers       = {};

/* ── INIT ──────────────────────────────────────────────────── */
(function init() {
  renderDashboard();
  renderAnalytics();
  renderProfile();
  renderProfileCard();
  /* Start countdown timers for active cases */
  startAllCountdowns();
})();

/* ── NOTIF PANEL ───────────────────────────────────────────── */
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
function renderDashboard() {
  const pending  = COMPLAINTS.filter(c => c.status === 'submitted').length;
  const dups     = COMPLAINTS.filter(c => c.duplicate).length;
  const active   = COMPLAINTS.filter(c => ['assigned','in_progress'].includes(c.status)).length;

  document.getElementById('stat-pending').textContent      = pending;
  document.getElementById('stat-dups').textContent         = dups;
  document.getElementById('stat-active-count').textContent = active;
  document.getElementById('badge-queue').textContent       = pending;
  document.getElementById('badge-active').textContent      = active;

  /* Duplicate alert */
  const alertEl = document.getElementById('dup-alert');
  if (dups > 0) {
    alertEl.innerHTML = `⚠️ <div><strong>${dups} complaint(s)</strong> flagged as potential duplicates within 100m / 24hr window. Review before assigning.</div>`;
    alertEl.classList.remove('hidden');
  } else {
    alertEl.classList.add('hidden');
  }

  /* Pending queue preview */
  const queueList = document.getElementById('dash-queue-list');
  const pending4  = COMPLAINTS.filter(c => ['submitted','verified'].includes(c.status)).slice(0, 4);
  queueList.innerHTML = pending4.map(c => `
    <div class="queue-preview-item">
      <div class="queue-preview-body">
        <div class="queue-preview-id">${c.id}</div>
        <div class="queue-preview-meta">${c.cat} · ${c.brgy}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        ${priorityBadge(c.priority)}
        ${c.duplicate ? '<span class="dup-flag">⚠ Dup.</span>' : ''}
        ${statusBadge(c.status)}
      </div>
    </div>`).join('');

  /* Officer status list */
  const officerList = document.getElementById('dash-officer-list');
  officerList.innerHTML = OFFICERS.map(o => `
    <div class="officer-status-item">
      <div class="officer-initials">${o.initials}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600">${o.name}</div>
        <div style="font-family:var(--font-mono);font-size:11px;color:var(--mist)">${o.active} active · Brgy. ${o.brgy}</div>
      </div>
      <span class="badge ${o.status === 'available' ? 'badge-verified' : 'badge-assigned'}">${o.status}</span>
    </div>`).join('');
}

/* ── COMPLAINT QUEUE ───────────────────────────────────────── */
function switchQueueTab(el) {
  document.querySelectorAll('#queue-tabs .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  activeQueueTab = el.dataset.tab;
  renderQueueTable();
}

function renderQueueTable() {
  const search    = (document.getElementById('queue-search')?.value  || '').toLowerCase();
  const priority  = document.getElementById('queue-priority')?.value || '';
  const brgy      = document.getElementById('queue-brgy')?.value     || '';

  const submitted = COMPLAINTS.filter(c => c.status === 'submitted');
  const verified  = COMPLAINTS.filter(c => c.status === 'verified');

  /* Update tab counts */
  document.getElementById('tab-submitted-count').textContent = `(${submitted.length})`;
  document.getElementById('tab-verified-count').textContent  = `(${verified.length})`;

  let list = activeQueueTab === 'submitted' ? submitted : verified;

  list = list.filter(c => {
    const ms = !search   || c.id.toLowerCase().includes(search) || c.cat.toLowerCase().includes(search);
    const mp = !priority || c.priority === priority;
    const mb = !brgy     || c.brgy === brgy;
    return ms && mp && mb;
  });

  const tbody = document.getElementById('queue-tbody');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">No complaints</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(c => `
    <tr>
      <td class="track-id">${c.id}</td>
      <td>${c.cat}</td>
      <td class="mono" style="font-size:12px">${c.anon ? 'Anonymous' : c.user}</td>
      <td style="font-size:12px">${c.brgy}</td>
      <td>${priorityBadge(c.priority)}</td>
      <td class="mono" style="font-size:12px">${c.date}</td>
      <td>${c.duplicate ? '<span class="dup-flag">⚠ Dup.</span>' : '—'}</td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn-secondary btn-sm" onclick="openReviewModal('${c.id}')">Review</button>
          <button class="btn-success btn-sm"   onclick="openVerifyModal('${c.id}')">✓ Verify</button>
          <button class="btn-danger btn-sm"    onclick="openRejectModal('${c.id}')">✗ Reject</button>
        </div>
      </td>
    </tr>`).join('');
}

/* ── ACTIVE CASES ──────────────────────────────────────────── */
function renderActiveCases() {
  const active = COMPLAINTS.filter(c => ['assigned','in_progress'].includes(c.status));
  const list   = document.getElementById('active-cases-list');

  if (!active.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">No active cases</div><div class="empty-sub">All cases have been resolved or are pending dispatch.</div></div>`;
    return;
  }

  list.innerHTML = active.map(c => `
    <div class="active-case-card">
      <div class="active-case-header">
        <div>
          <div class="active-case-title-row">
            <span class="track-id">${c.id}</span>
            ${statusBadge(c.status)}
            ${priorityBadge(c.priority)}
            ${c.status === 'assigned' ? `<span class="timer-badge" id="timer-${c.id}">⏱ 18:42</span>` : ''}
          </div>
          <div class="active-case-meta">${c.cat} · Brgy. ${c.brgy} · ${c.date}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn-secondary btn-sm" onclick="openReviewModal('${c.id}')">Details</button>
          ${c.status === 'assigned' ? `<button class="btn-danger btn-sm" onclick="reassignCase('${c.id}')">Reassign</button>` : ''}
        </div>
      </div>
      <div class="active-case-body">
        <div>
          <div class="active-case-desc-label">Description</div>
          <div class="active-case-desc">${c.desc}</div>
        </div>
        <div class="map-placeholder" style="height:120px">
          <div class="map-icon">📍</div>
          <div class="map-label">${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}</div>
        </div>
      </div>
      <div class="active-case-footer">
        <span class="officer-assigned-label">Assigned to:</span>
        <span class="officer-assigned-name">Ofc. Ramon Reyes</span>
        <span class="officer-en-route">● En route</span>
      </div>
    </div>`).join('');

  startAllCountdowns();
}

/* ── FIELD OFFICERS ────────────────────────────────────────── */
function renderOfficers() {
  const grid = document.getElementById('officers-grid');
  grid.innerHTML = OFFICERS.map(o => `
    <div class="officer-full-card">
      <div class="officer-full-header">
        <div class="officer-avatar-lg">${o.initials}</div>
        <div style="flex:1">
          <div class="officer-full-name">${o.name}</div>
          <div class="officer-full-brgy">Brgy. ${o.brgy}</div>
        </div>
        <span class="badge ${o.status === 'available' ? 'badge-verified' : 'badge-assigned'}">${o.status}</span>
      </div>
      <div class="officer-stats-row">
        <div class="officer-stat-box">
          <div class="officer-stat-val">${o.active}</div>
          <div class="officer-stat-label">Active Cases</div>
        </div>
        <div class="officer-stat-box">
          <div class="officer-stat-val">${o.onTime}%</div>
          <div class="officer-stat-label">On-Time Rate</div>
        </div>
        <div class="officer-stat-box">
          <div class="officer-stat-val">${o.distance}</div>
          <div class="officer-stat-label">Distance</div>
        </div>
      </div>
      ${perfBar('Workload', o.active * 20)}
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn-secondary btn-sm" style="flex:1" onclick="showToast('Viewing cases for ${o.name}')">View Cases</button>
        <button class="btn-secondary btn-sm" style="flex:1" onclick="showToast('Message sent to ${o.name}.')">Contact</button>
      </div>
    </div>`).join('');
}

/* ── ANALYTICS ─────────────────────────────────────────────── */
function renderAnalytics() {
  /* Category bars */
  const catData = [
    ['Traffic Obstruction', 15, 32],
    ['Illegal Parking',     12, 26],
    ['Road Damage',          9, 19],
    ['Accident',             6, 13],
    ['Signal Malfunction',   3,  6],
    ['Traffic Violation',    2,  4],
  ];
  const catEl = document.getElementById('cat-bars');
  if (catEl) catEl.innerHTML = catData.map(([n,v,pct]) => perfBar(`${n} (${v})`, pct)).join('');

  /* Officer performance */
  const perfEl = document.getElementById('officer-perf-list');
  if (perfEl) {
    perfEl.innerHTML = OFFICERS.map(o => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px;border:1px solid var(--border);margin-bottom:8px">
        <div class="officer-initials" style="width:32px;height:32px;font-size:11px">${o.initials}</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600">${o.name}</div>
          <div class="mono" style="font-size:11px;color:var(--mist)">On-time: ${o.onTime}%</div>
        </div>
        <div style="font-family:var(--font-head);font-size:22px;font-weight:800;color:var(--green)">${o.onTime}%</div>
      </div>`).join('');
  }

  /* Trend bar chart */
  const trendEl = document.getElementById('trend-chart');
  if (trendEl) {
    const vals = [65,80,55,90,72,85,60,78,95,68,82,88,70,75,92,84,65,78,90,72,85,88,70,92,80,75,85,88];
    trendEl.innerHTML = vals.map((v, i) => `
      <div class="bar-col">
        <div class="bar-fill" style="height:${v}%;background:${i >= 24 ? 'var(--ink)' : 'var(--border)'}"></div>
      </div>`).join('');
  }
}

/* ── COUNTDOWN TIMERS ──────────────────────────────────────── */
function startAllCountdowns() {
  /* Clear old intervals */
  Object.values(activeTimers).forEach(clearInterval);
  activeTimers = {};

  COMPLAINTS.filter(c => c.status === 'assigned').forEach(c => {
    let secs = 18 * 60 + 42;
    const el = document.getElementById('timer-' + c.id);
    if (!el) return;

    const tick = () => {
      if (!document.contains(el)) { clearInterval(activeTimers[c.id]); return; }
      const m = Math.floor(secs / 60).toString().padStart(2, '0');
      const s = (secs % 60).toString().padStart(2, '0');
      el.textContent = `⏱ ${m}:${s}`;
      el.classList.toggle('urgent', secs < 300);
      if (secs <= 0) { el.textContent = '⚠ OVERDUE'; el.classList.add('urgent'); clearInterval(activeTimers[c.id]); return; }
      secs--;
    };
    tick();
    activeTimers[c.id] = setInterval(tick, 1000);
  });
}

/* ── MODAL: REVIEW / ASSIGN ────────────────────────────────── */
function openReviewModal(id) {
  const c = COMPLAINTS.find(x => x.id === id);
  if (!c) return;
  selectedOfficerId = null;

  const officerCards = OFFICERS.map(o => `
    <div class="officer-card${o.status !== 'available' ? ' disabled' : ''}" id="ocard-${o.id}"
      onclick="${o.status === 'available' ? `selectOfficer('${o.id}')` : 'void(0)'}">
      <div class="officer-name">${o.name}</div>
      <div class="officer-meta">${o.active}/5 active · ${o.brgy} · ${o.distance}</div>
      <div class="officer-status ${o.status === 'available' ? 'available' : 'busy'}">
        ${o.status === 'available' ? '● Available' : '⬤ At Capacity'}
      </div>
    </div>`).join('');

  const canAction = ['submitted','verified'].includes(c.status);

  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal modal-lg">
        <div class="modal-head">
          <div>
            <div class="modal-title">Complaint Review</div>
            <div class="modal-subtitle">${c.id}</div>
          </div>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div class="badge-row">
            ${statusBadge(c.status)} ${priorityBadge(c.priority)}
            ${c.duplicate ? '<span class="dup-flag">⚠ Potential Duplicate within 100m / 24hr window</span>' : ''}
          </div>
          <div class="detail-grid">
            <div class="detail-item"><label>Category</label><span>${c.cat}</span></div>
            <div class="detail-item"><label>Barangay</label><span>${c.brgy}</span></div>
            <div class="detail-item"><label>Reporter</label><span>${c.anon ? 'Anonymous' : c.user}</span></div>
            <div class="detail-item"><label>Date / Time</label><span>${c.date}</span></div>
          </div>
          <div class="complaint-desc">${c.desc}</div>
          ${mapPlaceholder(160, '', c.lat, c.lng)}
          ${uploadBox(80, '📷 View uploaded evidence')}
          ${canAction ? `
            <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
              <div class="section-title">Assign Field Officer</div>
              <div class="officer-grid">${officerCards}</div>
              <div class="reject-section">
                <div class="form-group" style="margin-bottom:0">
                  <label>Rejection Reason (required if rejecting)</label>
                  <textarea class="form-input" id="reject-reason-inline" rows="2" placeholder="Enter reason for rejection…"></textarea>
                </div>
              </div>
            </div>` : ''}
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal()">Cancel</button>
          ${canAction ? `
            <button class="btn-danger"  onclick="confirmReject('${c.id}')">✗ Reject</button>
            <button class="btn-success" onclick="confirmVerifyAssign('${c.id}')">✓ Verify &amp; Assign</button>` : ''}
        </div>
      </div>
    </div>`);
}

function selectOfficer(id) {
  document.querySelectorAll('.officer-card').forEach(c => c.classList.remove('selected'));
  const el = document.getElementById('ocard-' + id);
  if (el) el.classList.add('selected');
  selectedOfficerId = id;
}

function confirmVerifyAssign(id) {
  if (!selectedOfficerId) { showToast('Please select a field officer before assigning.'); return; }
  const officer = OFFICERS.find(o => o.id === selectedOfficerId);
  closeModal();
  showToast(`✓ Complaint verified and assigned to ${officer.name}.`);
  renderQueueTable();
}

function confirmReject(id) {
  const reason = document.getElementById('reject-reason-inline')?.value.trim();
  if (!reason) { showToast('Please enter a rejection reason before rejecting.'); return; }
  closeModal();
  showToast('Complaint rejected. Reason sent to user.');
  renderQueueTable();
}

/* ── MODAL: VERIFY ─────────────────────────────────────────── */
function openVerifyModal(id) {
  const c = COMPLAINTS.find(x => x.id === id);
  if (!c) return;
  selectedOfficerId = null;

  const officerCards = OFFICERS.filter(o => o.status === 'available').map(o => `
    <div class="officer-card" id="vocard-${o.id}" onclick="selectOfficerVerify('${o.id}')">
      <div class="officer-name">${o.name}</div>
      <div class="officer-meta">${o.active}/5 active · ${o.brgy} · ${o.distance}</div>
      <div class="officer-status available">● Available</div>
    </div>`).join('');

  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal">
        <div class="modal-head">
          <div>
            <div class="modal-title">Verify &amp; Assign</div>
            <div class="modal-subtitle">${c.id}</div>
          </div>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div class="badge-row">${statusBadge(c.status)} ${priorityBadge(c.priority)}</div>
          <div class="complaint-desc">${c.desc}</div>
          <div class="section-title">Select Field Officer</div>
          <div class="officer-grid">${officerCards}</div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn-success"   onclick="confirmVerifyModal('${c.id}')">✓ Assign</button>
        </div>
      </div>
    </div>`);
}

function selectOfficerVerify(id) {
  document.querySelectorAll('.officer-card').forEach(c => c.classList.remove('selected'));
  const el = document.getElementById('vocard-' + id);
  if (el) el.classList.add('selected');
  selectedOfficerId = id;
}

function confirmVerifyModal(id) {
  if (!selectedOfficerId) { showToast('Please select an officer first.'); return; }
  const officer = OFFICERS.find(o => o.id === selectedOfficerId);
  closeModal();
  showToast(`✓ Complaint verified and assigned to ${officer.name}.`);
  renderQueueTable();
}

/* ── MODAL: REJECT ─────────────────────────────────────────── */
function openRejectModal(id) {
  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal" style="max-width:460px">
        <div class="modal-head">
          <div class="modal-title">Reject Complaint</div>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          ${alertBox('warn', '⚠️', 'A rejection reason is required and will be displayed to the commuter on their Transparency Timeline.')}
          <div class="form-group">
            <label>Rejection Reason *</label>
            <textarea class="form-input" id="stand-reject-reason" rows="4" placeholder="Provide a clear reason for rejection…"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn-danger" onclick="submitReject('${id}')">Confirm Rejection</button>
        </div>
      </div>
    </div>`);
}

function submitReject(id) {
  const reason = document.getElementById('stand-reject-reason')?.value.trim();
  if (!reason) { showToast('Please enter a rejection reason.'); return; }
  closeModal();
  showToast('Complaint rejected. Reason sent to user.');
  renderQueueTable();
}

/* ── REASSIGN ──────────────────────────────────────────────── */
function reassignCase(id) {
  openVerifyModal(id);
}

/* ── PAGE CHANGE HOOK — re-render dynamic pages on visit ───── */
const _origSetActivePage = typeof setActivePage === 'function' ? setActivePage : null;

/* Patch setActivePage to trigger renders */
const __base_setActivePage = typeof setActivePage === 'function' ? setActivePage : null;
function setActivePage(pageId) {
  if (__base_setActivePage) {
    __base_setActivePage(pageId);
  } else {
    console.warn('Base setActivePage not found; fallback route:', pageId);
    navigateToPage(pageId);
  }

  if (pageId === 'active')   renderActiveCases();
  if (pageId === 'officers') renderOfficers();
  if (pageId === 'queue')    renderQueueTable();
  if (pageId === 'profile')  renderProfile();
}

/* ── PROFILE PAGE ──────────────────────────────────────────── */
function renderProfileCard() {
  const dispatchUser = USERS.dispatch;
  const mini = document.getElementById('profile-mini-card');
  if (!mini) return;

  mini.innerHTML = `
    <div class="card" style="display:flex;align-items:center;gap:14px;padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--surface)">
      <img src="${dispatchUser.profilePicture || 'https://i.pravatar.cc/120?img=68'}" alt="Profile" style="width:48px;height:48px;border-radius:50%;object-fit:cover" />
      <div style="flex:1">
        <div style="font-weight:700;font-size:14px">${dispatchUser.name}</div>
        <div style="color:var(--mist);font-size:12px">Dispatch Officer • ${dispatchUser.brgy}</div>
      </div>
      <button class="btn-secondary btn-sm" onclick="setActivePage('profile')">View Profile</button>
    </div>
  `;
}

function renderProfile() {
  const dispatchUser = USERS.dispatch;
  const caseCount = COMPLAINTS.length;
  const closedCount = COMPLAINTS.filter(c => ['closed','resolved'].includes(c.status)).length;
  const activeCount = COMPLAINTS.filter(c => ['assigned','in_progress'].includes(c.status)).length;

  const topbarPhoto = document.getElementById('topbar-user-photo');
  const topbarName = document.getElementById('topbar-user-name');
  if (topbarPhoto) topbarPhoto.src = dispatchUser.profilePicture || 'https://i.pravatar.cc/120?img=68';
  if (topbarName) topbarName.textContent = dispatchUser.name;

  const avatarElement = document.getElementById('prof-avatar');
  if (avatarElement) {
    avatarElement.textContent = '';
    avatarElement.style.backgroundImage = `url(${dispatchUser.profilePicture || 'https://i.pravatar.cc/120?img=68'})`;
    avatarElement.style.backgroundSize = 'cover';
    avatarElement.style.backgroundPosition = 'center';
    avatarElement.style.textIndent = '-9999px';
  }

  document.getElementById('prof-name').textContent = dispatchUser.name;
  document.getElementById('prof-position').textContent = 'Dispatch Officer';
  document.getElementById('prof-email').textContent = dispatchUser.email;
  document.getElementById('prof-phone').textContent = dispatchUser.phone;
  document.getElementById('prof-badgeid').textContent = 'CPT-0001';
  document.getElementById('prof-brgy').textContent = dispatchUser.brgy;

  document.getElementById('prof-cases').textContent = caseCount;
  document.getElementById('prof-closed').textContent = closedCount;
  document.getElementById('prof-avgtime').textContent = '1.8 hours';
  document.getElementById('prof-caseload').textContent = activeCount;
  document.getElementById('prof-officers-count').textContent = OFFICERS.length;
  document.getElementById('prof-active-brgy').textContent = BARANGAYS.length;

  document.getElementById('prof-resolution-rate').textContent = '91%';
  document.getElementById('prof-on-time').textContent = '94%';
  document.getElementById('prof-avg-rating').textContent = '4.6★';
  document.getElementById('prof-efficiency').textContent = '92/100';
}

function editProfile() {
  const user = USERS.dispatch;
  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal" style="max-width:520px">
        <div class="modal-head">
          <div>
            <div class="modal-title">Edit Profile</div>
            <div class="modal-subtitle">Update dispatch officer details</div>
          </div>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div style="text-align:center; margin-bottom:16px">
            <img id="edit-profile-photo-preview" src="${user.profilePicture || 'https://i.pravatar.cc/120?img=68'}" style="width:84px;height:84px;border-radius:50%;object-fit:cover;border:2px solid var(--border)" alt="Profile Photo" />
          </div>
          <div class="form-group">
            <label for="edit-profile-photo">Profile Picture</label>
            <input id="edit-profile-photo" type="file" class="form-input" accept="image/*" onchange="previewProfileImage(event)" />
          </div>
          <div class="form-group">
            <label for="edit-profile-name">Full Name</label>
            <input id="edit-profile-name" class="form-input" type="text" value="${user.name}" />
          </div>
          <div class="form-group">
            <label for="edit-profile-email">Email</label>
            <input id="edit-profile-email" class="form-input" type="email" value="${user.email}" />
          </div>
          <div class="form-group">
            <label for="edit-profile-phone">Phone</label>
            <input id="edit-profile-phone" class="form-input" type="tel" value="${user.phone}" />
          </div>
          <div class="form-group">
            <label for="edit-profile-brgy">Barangay</label>
            <input id="edit-profile-brgy" class="form-input" type="text" value="${user.brgy}" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn-primary" onclick="submitProfileEdit()">Save Changes</button>
        </div>
      </div>
    </div>`);
}

function previewProfileImage(event) {
  const input = event.target;
  const preview = document.getElementById('edit-profile-photo-preview');
  if (input.files && input.files[0] && preview) {
    const reader = new FileReader();
    reader.onload = e => {
      preview.src = e.target.result;
      preview.dataset.newImage = e.target.result;
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function submitProfileEdit() {
  const user = USERS.dispatch;
  const name = document.getElementById('edit-profile-name')?.value.trim();
  const email = document.getElementById('edit-profile-email')?.value.trim();
  const phone = document.getElementById('edit-profile-phone')?.value.trim();
  const brgy = document.getElementById('edit-profile-brgy')?.value.trim();
  const preview = document.getElementById('edit-profile-photo-preview');

  if (!name || !email || !phone || !brgy) {
    showToast('All fields are required.');
    return;
  }

  user.name = name;
  user.email = email;
  user.phone = phone;
  user.brgy = brgy;

  if (preview?.dataset?.newImage) {
    user.profilePicture = preview.dataset.newImage;
  }

  closeModal();
  renderProfile();
  showToast('✓ Profile updated successfully.');
}

function changePassword() {
  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal" style="max-width:450px">
        <div class="modal-head">
          <div class="modal-title">Change Password</div>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label for="current-pass">Current Password <span style="color:var(--accent)*">*</span></label>
            <input id="current-pass" class="form-input" type="password" placeholder="Enter current password" />
          </div>
          <div class="form-group">
            <label for="new-pass">New Password <span style="color:var(--accent)*">*</span></label>
            <input id="new-pass" class="form-input" type="password" placeholder="Enter new password" />
          </div>
          <div class="form-group">
            <label for="confirm-pass">Confirm Password <span style="color:var(--accent)*">*</span></label>
            <input id="confirm-pass" class="form-input" type="password" placeholder="Confirm new password" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn-primary" onclick="submitPasswordChange()">✓ Change Password</button>
        </div>
      </div>
    </div>`);
}

function submitPasswordChange() {
  const current = document.getElementById('current-pass')?.value;
  const newPass = document.getElementById('new-pass')?.value;
  const confirm = document.getElementById('confirm-pass')?.value;
  if (!current || !newPass || !confirm) { showToast('Please fill in all password fields.'); return; }
  if (newPass !== confirm) { showToast('New passwords do not match.'); return; }
  if (newPass.length < 8) { showToast('Password must be at least 8 characters long.'); return; }
  closeModal();
  showToast('✓ Password changed successfully.');
}

function viewActivityLog() {
  const activities = [
    { time: '2 min ago', action: 'Viewed complaint queue', detail: 'Accessed Complaint Queue page' },
    { time: '5 min ago', action: 'Assigned case to officer', detail: 'TRAPICO-2026-03-000014 → Ofc. Reyes' },
    { time: '12 min ago', action: 'Verified complaint', detail: 'TRAPICO-2026-03-000015 marked as verified' },
    { time: '18 min ago', action: 'Closed case', detail: 'TRAPICO-2026-03-000012 marked as closed' },
    { time: '25 min ago', action: 'Sent message to officer', detail: 'Message to Ofc. Bautista' },
    { time: '42 min ago', action: 'Viewed analytics', detail: 'Accessed Analytics page' },
    { time: '1 hr ago', action: 'Logged in', detail: 'Session started' },
  ];

  const activityHtml = activities.map(a => `
    <div style="padding:12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:start">
      <div style="flex:1">
        <div style="font-weight:600;font-size:13px">${a.action}</div>
        <div style="font-size:12px;color:var(--mist);margin-top:4px">${a.detail}</div>
      </div>
      <div style="font-size:12px;color:var(--mist);white-space:nowrap;margin-left:12px">${a.time}</div>
    </div>
  `).join('');

  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal" style="max-width:600px">
        <div class="modal-head">
          <div>
            <div class="modal-title">Activity Log</div>
            <div class="modal-subtitle">Your recent actions in TRAPICO</div>
          </div>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body" style="padding:0">
          ${activityHtml}
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal()">Close</button>
        </div>
      </div>
    </div>`);
}

