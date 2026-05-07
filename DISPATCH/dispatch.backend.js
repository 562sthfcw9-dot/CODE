/* ============================================================
   TRAPICO — Dispatch frontend backend connector
   ============================================================ */

'use strict';

let DISPATCH_USER = null;
let QUEUE_DATA = [];
let FIELD_OFFICERS_DATA = [];
let DISPATCH_OFFICERS_DATA = [];
let OFFICERS_DATA = [];
let ACTIVE_CASES = [];
let dispatchSelectedOfficerId = null;
let dispatchNotifOpen = false;
let dispatchActiveQueueTab = 'submitted';
let activeChat = null;
let chatInterval = null;
let chatLastId = 0;
let officerChatAlertInterval = null;
let officerChatAlertMap = {};
let officerLastIncomingMap = {};
let officerUnreadCountMap = {};

/* ── Live Officer Map state ── */
let _dashMap = null;
let _dashMarkers = {};
let _officersMap = null;
let _officersMarkers = {};
let _mapRefreshInterval = null;

const BRGY_CENTERS = {
    'Commonwealth':  [14.6760, 121.0437],
    'Batasan Hills': [14.6915, 121.0507],
    'Central':       [14.6390, 121.0100],
    'Sto. Cristo':   [14.6280, 120.9872],
};

function _officerLatLng(o) {
    if (o.lat && o.lng) return [parseFloat(o.lat), parseFloat(o.lng)];
    return BRGY_CENTERS[o.brgy] || [14.6760, 121.0437];
}

function _normalizeOfficerSets(resp = {}) {
  const field = Array.isArray(resp.field_officers) ? resp.field_officers : (Array.isArray(resp.officers) ? resp.officers : []);
  const dispatch = Array.isArray(resp.dispatch_officers) ? resp.dispatch_officers : [];
  const all = Array.isArray(resp.all_officers) ? resp.all_officers : [...field, ...dispatch];

  FIELD_OFFICERS_DATA = field;
  DISPATCH_OFFICERS_DATA = dispatch;
  OFFICERS_DATA = all;
}

function _badgeClassByStatus(status) {
  return (status === 'available' || status === 'on_duty') ? 'badge-verified' : 'badge-assigned';
}

function _officerRoleLabel(officer) {
  return officer.officer_role === 'dispatch_officer' ? 'Dispatch' : 'Field';
}

function _chatReceiverRole(officer) {
    return officer?.officer_role === 'dispatch_officer' ? 'dispatch' : 'field';
}

function _chatPartnerKey(receiverRole, receiverId) {
    return `${String(receiverRole)}:${String(receiverId)}`;
}

function getOfficerUnreadTotal() {
  return Object.values(officerUnreadCountMap).reduce((sum, n) => sum + Number(n || 0), 0);
}

function updateOfficerNavBadge() {
  const badge = document.getElementById('badge-officers-msg');
  if (!badge) return;
  const total = getOfficerUnreadTotal();
  badge.textContent = String(total);
  badge.classList.toggle('hidden', total <= 0);
}

function clearOfficerMessageAlerts() {
  Object.keys(officerChatAlertMap).forEach(key => { officerChatAlertMap[key] = false; });
  Object.keys(officerUnreadCountMap).forEach(key => { officerUnreadCountMap[key] = 0; });
  refreshOfficerContactButtonStyles();
  updateOfficerNavBadge();
}

function _officerIcon(status) {
    const colors = {available: '#2A9D5C', busy: '#E63946', offline: '#8A8A8A'};
    const c = colors[status] || colors.offline;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 40'><path d='M14 0C6.268 0 0 6.268 0 14c0 10.5 14 26 14 26S28 24.5 28 14C28 6.268 21.732 0 14 0z' fill='${c}'/><circle cx='14' cy='14' r='6' fill='white'/></svg>`;
    return L.divIcon({
        html: `<div style="width:28px;height:40px">${svg}</div>`,
        className: '',
        iconSize: [28, 40],
        iconAnchor: [14, 40],
        popupAnchor: [0, -40],
    });
}

function _buildOfficerPopup(o) {
    const statusLabel = {available: '● Available', busy: '● On Duty', offline: '○ Offline'};
    const statusColor = {available: '#2A9D5C', busy: '#E63946', offline: '#8A8A8A'};
    const s = o.status || 'offline';
    return `<div style="font-family:var(--font-body,sans-serif);min-width:160px">
      <div style="font-weight:700;font-size:13px;margin-bottom:4px">${safeText(o.name)}</div>
      <div style="font-size:12px;color:#555;margin-bottom:4px">Brgy. ${safeText(o.brgy)}</div>
      <div style="font-size:12px;font-weight:600;color:${statusColor[s]}">${statusLabel[s] || s}</div>
      ${o.gps_last_updated ? `<div style="font-size:10px;color:#999;margin-top:4px">Updated: ${new Date(o.gps_last_updated).toLocaleTimeString()}</div>` : ''}
    </div>`;
}

function _syncMarkersToMap(mapInstance, markersObj, officers) {
    if (!mapInstance) return;
    const seen = new Set();
    for (const o of officers) {
    const key = `${o.officer_role || 'field_officer'}:${o.id}`;
        seen.add(key);
        const pos = _officerLatLng(o);
        if (markersObj[key]) {
            markersObj[key].setLatLng(pos);
            markersObj[key].setIcon(_officerIcon(o.status));
            markersObj[key].getPopup()?.setContent(_buildOfficerPopup(o));
        } else {
            const m = L.marker(pos, {icon: _officerIcon(o.status)})
                .bindPopup(_buildOfficerPopup(o))
                .addTo(mapInstance);
            markersObj[key] = m;
        }
    }
    for (const key of Object.keys(markersObj)) {
        if (!seen.has(key)) {
            markersObj[key].remove();
            delete markersObj[key];
        }
    }
}

function initDashMap() {
    const el = document.getElementById('officer-live-map');
    if (!el || _dashMap) return;
    _dashMap = L.map('officer-live-map', {zoomControl: true, scrollWheelZoom: false})
        .setView([14.6760, 121.0437], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
    }).addTo(_dashMap);
    _syncMarkersToMap(_dashMap, _dashMarkers, FIELD_OFFICERS_DATA);
}

function initOfficersPageMap() {
    const el = document.getElementById('officers-page-map');
    if (!el || _officersMap) return;
    _officersMap = L.map('officers-page-map', {zoomControl: true, scrollWheelZoom: false})
        .setView([14.6760, 121.0437], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
    }).addTo(_officersMap);
    _syncMarkersToMap(_officersMap, _officersMarkers, FIELD_OFFICERS_DATA);
}

async function refreshOfficerMap() {
    try {
        const resp = await apiFetch('dispatch.php', {action: 'officers'});
    _normalizeOfficerSets(resp);
    _syncMarkersToMap(_dashMap, _dashMarkers, FIELD_OFFICERS_DATA);
    _syncMarkersToMap(_officersMap, _officersMarkers, FIELD_OFFICERS_DATA);
        const el = document.getElementById('map-last-updated');
        if (el) el.textContent = 'Updated ' + new Date().toLocaleTimeString();
        renderOfficers();
    } catch (e) {
        console.warn('Officer map refresh failed:', e.message);
    }
}

function startMapPolling() {
    if (_mapRefreshInterval) clearInterval(_mapRefreshInterval);
    _mapRefreshInterval = setInterval(refreshOfficerMap, 15000);
}

window.addEventListener('DOMContentLoaded', initDispatch);

async function initDispatch() {
    const user = await requireLoginRedirect();
    if (!user) return;
    DISPATCH_USER = user;

    await loadDispatchData();
    renderDashboard();
    renderAnalytics();
    renderProfile();
    renderProfileCard();
    renderQueueTable();
    renderActiveCases();
    renderOfficers();
    startOfficerChatAlertPolling();
    /* Init maps after first data load */
    initDashMap();
    startMapPolling();
}

async function loadDispatchData() {
  const [dashboardResp, queueResp, officersResp, activeResp] = await Promise.allSettled([
    apiFetch('dispatch.php', {action: 'dashboard'}),
    apiFetch('dispatch.php', {action: 'queue'}),
    apiFetch('dispatch.php', {action: 'officers'}),
    apiFetch('dispatch.php', {action: 'activeCases'}),
  ]);

  if (dashboardResp.status === 'fulfilled') {
    window.dispatchCounts = dashboardResp.value.counts || {pending: 0, dup_count: 0, active_cases: 0};
  } else {
    window.dispatchCounts = window.dispatchCounts || {pending: 0, dup_count: 0, active_cases: 0};
  }

  if (queueResp.status === 'fulfilled') {
    QUEUE_DATA = queueResp.value.complaints || [];
  }

  if (officersResp.status === 'fulfilled') {
    _normalizeOfficerSets(officersResp.value);
  }

  if (activeResp.status === 'fulfilled') {
    ACTIVE_CASES = activeResp.value.activeCases || [];
  }
}

function toggleNotif() {
    dispatchNotifOpen = !dispatchNotifOpen;
    document.getElementById('notif-panel').classList.toggle('hidden', !dispatchNotifOpen);
}

document.addEventListener('click', e => {
    if (!e.target.closest('#notif-btn') && dispatchNotifOpen) {
        document.getElementById('notif-panel').classList.add('hidden');
        dispatchNotifOpen = false;
    }
});

function renderDashboard() {
    const counts = window.dispatchCounts || {pending: 0, dup_count: 0, active_cases: 0};
    document.getElementById('stat-pending').textContent = counts.pending;
    document.getElementById('stat-dups').textContent = counts.dup_count;
    document.getElementById('stat-active-count').textContent = counts.active_cases;
    document.getElementById('badge-queue').textContent = counts.pending;
    document.getElementById('badge-active').textContent = counts.active_cases;

    const queueList = document.getElementById('dash-queue-list');
    if (queueList) {
        queueList.innerHTML = QUEUE_DATA.slice(0, 4).map(c => `
          <div class="queue-preview-item">
            <div class="queue-preview-body">
              <div class="queue-preview-id">${safeText(c.id)}</div>
              <div class="queue-preview-meta">${safeText(c.cat)} · ${safeText(c.brgy)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              ${priorityBadge(c.priority)}
              ${c.duplicate ? '<span class="dup-flag">⚠ Dup.</span>' : ''}
              ${statusBadge(c.status)}
            </div>
          </div>`).join('');
    }

    const officerList = document.getElementById('dash-officer-list');
    if (officerList) {
        officerList.innerHTML = OFFICERS_DATA.map(o => `
          <div class="officer-status-item">
            <div class="officer-initials">${safeText(o.code.slice(-2) || o.name.split(' ').map(x => x[0]).join(''))}</div>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600">${safeText(o.name)}</div>
              <div style="font-family:var(--font-mono);font-size:11px;color:var(--mist)">${_officerRoleLabel(o)} · Brgy. ${safeText(o.brgy || 'N/A')}</div>
            </div>
            <span class="badge ${_badgeClassByStatus(o.status)}">${safeText(o.status)}</span>
          </div>`).join('');
    }
}

function switchQueueTab(el) {
    document.querySelectorAll('#queue-tabs .tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    dispatchActiveQueueTab = el.dataset.tab;
    renderQueueTable();
}

function renderQueueTable() {
    const search = (document.getElementById('queue-search')?.value || '').toLowerCase();
    const priority = document.getElementById('queue-priority')?.value || '';
    const brgy = document.getElementById('queue-brgy')?.value || '';

  // De-duplicate by tracking ID to prevent join-expanded rows from rendering repeatedly.
  const deduped = [];
  const seen = new Set();
  for (const c of QUEUE_DATA) {
    const key = String(c.id || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
  }

  const submitted = deduped.filter(c => c.status === 'submitted');
  const verified = deduped.filter(c => c.status === 'verified');

    document.getElementById('tab-submitted-count').textContent = `(${submitted.length})`;
    document.getElementById('tab-verified-count').textContent = `(${verified.length})`;

    let list = dispatchActiveQueueTab === 'submitted' ? submitted : verified;
    list = list.filter(c => {
      const id = String(c.id || '').toLowerCase();
      const cat = String(c.cat || '').toLowerCase();
      const ms = !search || id.includes(search) || cat.includes(search);
      const mp = !priority || String(c.priority || '') === priority;
      const mb = !brgy || String(c.brgy || '') === brgy;
        return ms && mp && mb;
    });

    const tbody = document.getElementById('queue-tbody');
    if (!tbody) return;

    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">No complaints</div></div></td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(c => `
      <tr>
        <td class="track-id">${safeText(c.id)}</td>
        <td>${safeText(c.cat)}</td>
        <td class="mono" style="font-size:12px">${c.anon ? 'Anonymous' : safeText(c.user || 'Citizen')}</td>
        <td style="font-size:12px">${safeText(c.brgy)}</td>
        <td>${priorityBadge(c.priority)}</td>
        <td class="mono" style="font-size:12px">${formatDateTime(c.date)}</td>
        <td>${c.duplicate ? '<span class="dup-flag">⚠ Dup.</span>' : '—'}</td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn-secondary btn-sm" onclick="openReviewModal('${safeText(c.id)}')">Review</button>
            <button class="btn-success btn-sm" onclick="openVerifyModal('${safeText(c.id)}')">✓ Verify</button>
            <button class="btn-danger btn-sm" onclick="openRejectModal('${safeText(c.id)}')">✗ Reject</button>
          </div>
        </td>
      </tr>`).join('');
}

function renderActiveCases() {
    const activeCasesList = document.getElementById('active-cases-list');
    if (!activeCasesList) return;

    if (!ACTIVE_CASES.length) {
        activeCasesList.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">No active cases</div><div class="empty-sub">All cases are pending dispatch or completed.</div></div>`;
        return;
    }

    activeCasesList.innerHTML = ACTIVE_CASES.map(c => {
      const lat = Number.parseFloat(c.lat);
      const lng = Number.parseFloat(c.lng);
      const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
      const coordLabel = hasCoords ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : 'Location unavailable';

      return `
      <div class="active-case-card">
        <div class="active-case-header">
          <div>
            <div class="active-case-title-row">
              <span class="track-id">${safeText(c.id)}</span>
              ${statusBadge(c.status)}
              ${priorityBadge(c.priority)}
              ${c.status === 'assigned' ? `<span class="timer-badge" id="timer-${safeText(c.id)}">⏱ 18:42</span>` : ''}
            </div>
            <div class="active-case-meta">${safeText(c.cat)} · Brgy. ${safeText(c.brgy)} · ${formatDateTime(c.date)}</div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn-secondary btn-sm" onclick="openCaseTimelineModal('${safeText(c.id)}')">CASE TIMELINE</button>
            ${c.status === 'assigned' ? `<button class="btn-danger btn-sm" onclick="openReviewModal('${safeText(c.id)}')">Reassign</button>` : ''}
          </div>
        </div>
        <div class="active-case-body">
          <div>
            <div class="active-case-desc-label">Description</div>
            <div class="active-case-desc">${safeText(c.desc || c.description || '')}</div>
          </div>
          <div class="map-placeholder" style="height:120px">
            <div class="map-icon">📍</div>
            <div class="map-label">${safeText(coordLabel)}</div>
          </div>
        </div>
        <div class="active-case-footer">
          <span class="officer-assigned-label">Assigned to:</span>
          <span class="officer-assigned-name">Field Officer</span>
          <span class="officer-en-route">● En route</span>
        </div>
      </div>`;
    }).join('');
}

function buildCaseTimelineItems(currentStatus, timelineMap) {
    const statusOrder = ['submitted', 'verified', 'assigned', 'en_route', 'in_progress', 'resolved', 'validated', 'closed'];
    const titleMap = {
        submitted: 'Submitted',
        verified: 'Verified',
        assigned: 'Assigned',
        en_route: 'En Route',
        in_progress: 'In Progress',
        resolved: 'Resolved',
        validated: 'Validated',
        closed: 'Closed',
    };
    const fallbackNotes = {
        submitted: 'Complaint received. Tracking ID generated.',
        verified: 'Dispatch Officer validated complaint details.',
        assigned: 'Assigned to a Field Officer.',
        en_route: 'Officer departed to incident site.',
        in_progress: 'Officer checked in at incident site (GPS confirmed).',
        resolved: 'Resolution report submitted by officer.',
        validated: 'Dispatch Officer confirmed resolution.',
        closed: 'Case officially closed.',
    };

    const currentIdx = statusOrder.indexOf(String(currentStatus || '').toLowerCase());

    return statusOrder.map((status, idx) => {
        const reached = currentIdx >= 0 && idx <= currentIdx;
        const item = timelineMap[status] || null;
        const title = titleMap[status] || status;
        const timeText = item?.changed_at ? formatDateTime(item.changed_at) : '--';
        const noteText = item?.notes ? safeText(item.notes) : fallbackNotes[status];

        return `
          <div class="dispatch-timeline-item ${reached ? 'done' : 'pending'}">
            <div class="dispatch-timeline-dot"></div>
            <div class="dispatch-timeline-content">
              <div class="dispatch-timeline-title">${safeText(title)}</div>
              <div class="dispatch-timeline-time">${safeText(timeText)}</div>
              <div class="dispatch-timeline-note">${safeText(noteText)}</div>
            </div>
          </div>`;
    }).join('');
}

async function toggleCaseTimeline(id) {
    const c = ACTIVE_CASES.find(x => x.id === id) || QUEUE_DATA.find(x => x.id === id);
    if (!c) return;

    let timelineEntries = [];
    try {
        const resp = await apiFetch('dispatch.php', {action: 'caseTimeline', id});
        timelineEntries = Array.isArray(resp.timeline) ? resp.timeline : [];
    } catch (_) {
        timelineEntries = [];
    }

    const timelineMap = {};
    timelineEntries.forEach(entry => {
        const key = String(entry.status || '').toLowerCase();
        timelineMap[key] = entry;
    });

    if (!timelineMap.submitted && c?.date) {
        timelineMap.submitted = {
            status: 'submitted',
            changed_at: c.date,
            notes: 'Complaint received. Tracking ID generated.',
        };
    }

    openModal(`
      <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="modal modal-lg">
          <div class="modal-head">
            <div>
              <div class="modal-title">Case Timeline</div>
              <div class="modal-subtitle">${safeText(c.id)}</div>
            </div>
            <button class="modal-close" onclick="closeModal()">✕</button>
          </div>
          <div class="modal-body">
            <div class="dispatch-timeline-wrap">
              <div class="dispatch-timeline-heading">CASE TIMELINE</div>
              ${buildCaseTimelineItems(c.status, timelineMap)}
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="closeModal()">Close</button>
          </div>
        </div>
      </div>`);
}

async function openCaseTimelineModal(id) {
    await toggleCaseTimeline(id);
}

function openReviewModal(id) {
    const c = QUEUE_DATA.find(x => x.id === id);
    if (!c) return;
    dispatchSelectedOfficerId = null;

    const officerCards = FIELD_OFFICERS_DATA.map(o => {
        const blocked = parseInt(o.is_assigned) === 1;
        const statusLabel = blocked ? '⬤ On Assignment' : (o.status === 'available' ? '● Available' : `○ ${o.status}`);
        const statusClass = blocked ? 'busy' : (o.status === 'available' ? 'available' : 'busy');
        return `<div class="officer-card${blocked ? ' disabled' : ''}" id="ocard-${safeText(o.id)}" onclick="${blocked ? 'void(0)' : `selectOfficer('${safeText(o.id)}')`}">
        <div class="officer-name">${safeText(o.name)}</div>
        <div class="officer-meta">Badge: ${safeText(o.code)} · ${safeText(o.brgy)}</div>
        <div class="officer-status ${statusClass}">${statusLabel}</div>
      </div>`;
    }).join('');

    const canAction = ['submitted', 'verified'].includes(c.status);
    openModal(`
      <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="modal modal-lg">
          <div class="modal-head">
            <div>
              <div class="modal-title">Complaint Review</div>
              <div class="modal-subtitle">${safeText(c.id)}</div>
            </div>
            <button class="modal-close" onclick="closeModal()">✕</button>
          </div>
          <div class="modal-body">
            <div class="badge-row">
              ${statusBadge(c.status)} ${priorityBadge(c.priority)}
              ${c.duplicate ? '<span class="dup-flag">⚠ Potential Duplicate within 100m / 24hr window</span>' : ''}
            </div>
            <div class="detail-grid">
              <div class="detail-item"><label>Category</label><span>${safeText(c.cat)}</span></div>
              <div class="detail-item"><label>Barangay</label><span>${safeText(c.brgy)}</span></div>
              <div class="detail-item"><label>Reporter</label><span>${c.anon ? 'Anonymous' : safeText(c.user || 'Citizen')}</span></div>
              <div class="detail-item"><label>Date / Time</label><span>${formatDateTime(c.date)}</span></div>
            </div>
            <div class="complaint-desc">${safeText(c.desc)}</div>
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
              <button class="btn-danger" onclick="confirmReject('${safeText(c.id)}')">✗ Reject</button>
              <button class="btn-success" onclick="confirmVerifyAssign('${safeText(c.id)}')">✓ Verify & Assign</button>` : ''}
          </div>
        </div>
      </div>`);
}

function selectOfficer(id) {
    document.querySelectorAll('.officer-card').forEach(c => c.classList.remove('selected'));
    const el = document.getElementById('ocard-' + id);
    if (el) el.classList.add('selected');
    dispatchSelectedOfficerId = id;
}

async function confirmVerifyAssign(id) {
    if (!dispatchSelectedOfficerId) {
        showToast('Please select a field officer before assigning.');
        return;
    }
    const officer = FIELD_OFFICERS_DATA.find(o => o.id === dispatchSelectedOfficerId);
    closeModal();
    try {
        await apiFetch('dispatch.php', {action: 'verifyAssign', id, officer_id: dispatchSelectedOfficerId}, 'POST');
        showToast(`✓ Complaint verified and assigned to ${safeText(officer?.name || 'officer')}.`);
        await loadDispatchData();
        renderDashboard();
        renderQueueTable();
        renderActiveCases();
    } catch (error) {
        showToast(error.message);
    }
}

function openVerifyModal(id) {
    const c = QUEUE_DATA.find(x => x.id === id);
    if (!c) return;
    dispatchSelectedOfficerId = null;

    const officerCards = FIELD_OFFICERS_DATA.map(o => {
        const blocked = parseInt(o.is_assigned) === 1;
        const statusLabel = blocked ? '⬤ On Assignment' : (o.status === 'available' ? '● Available' : `○ ${o.status}`);
        const statusClass = blocked ? 'busy' : (o.status === 'available' ? 'available' : 'busy');
        return `<div class="officer-card${blocked ? ' disabled' : ''}" id="vocard-${safeText(o.id)}" onclick="${blocked ? 'void(0)' : `selectOfficerVerify('${safeText(o.id)}')`}">
        <div class="officer-name">${safeText(o.name)}</div>
        <div class="officer-meta">Badge: ${safeText(o.code)} · ${safeText(o.brgy)}</div>
        <div class="officer-status ${statusClass}">${statusLabel}</div>
      </div>`;
    }).join('');

    openModal(`
      <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="modal">
          <div class="modal-head">
            <div>
              <div class="modal-title">Verify & Assign</div>
              <div class="modal-subtitle">${safeText(c.id)}</div>
            </div>
            <button class="modal-close" onclick="closeModal()">✕</button>
          </div>
          <div class="modal-body">
            <div class="badge-row">${statusBadge(c.status)} ${priorityBadge(c.priority)}</div>
            <div class="complaint-desc">${safeText(c.desc)}</div>
            <div class="section-title">Select Field Officer</div>
            <div class="officer-grid">${officerCards}</div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn-success" onclick="confirmVerifyModal('${safeText(c.id)}')">✓ Assign</button>
          </div>
        </div>
      </div>`);
}

function selectOfficerVerify(id) {
    document.querySelectorAll('.officer-card').forEach(c => c.classList.remove('selected'));
    const el = document.getElementById('vocard-' + id);
    if (el) el.classList.add('selected');
    dispatchSelectedOfficerId = id;
}

async function confirmVerifyModal(id) {
    if (!dispatchSelectedOfficerId) {
        showToast('Please select an officer first.');
        return;
    }
    const officer = FIELD_OFFICERS_DATA.find(o => o.id === dispatchSelectedOfficerId);
    closeModal();
    try {
        await apiFetch('dispatch.php', {action: 'verifyAssign', id, officer_id: dispatchSelectedOfficerId}, 'POST');
        showToast(`✓ Complaint verified and assigned to ${safeText(officer?.name || 'officer')}.`);
        await loadDispatchData();
        renderDashboard();
        renderQueueTable();
        renderActiveCases();
    } catch (error) {
        showToast(error.message);
    }
}

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
            <button class="btn-danger" onclick="submitReject('${safeText(id)}')">Confirm Rejection</button>
          </div>
        </div>
      </div>`);
}

async function submitReject(id) {
    const reason = document.getElementById('stand-reject-reason')?.value.trim();
    if (!reason) {
        showToast('Please enter a rejection reason.');
        return;
    }
    closeModal();
    try {
        await apiFetch('dispatch.php', {action: 'reject', id, reason}, 'POST');
        showToast('Complaint rejected. Reason sent to user.');
        await loadDispatchData();
        renderDashboard();
        renderQueueTable();
    } catch (error) {
        showToast(error.message);
    }
}

async function reassignCase(id) {
    const availableOfficers = FIELD_OFFICERS_DATA.filter(o => o.status === 'available');
    if (!availableOfficers.length) {
        showToast('No available officers to reassign.');
        return;
    }
    const officerOptions = availableOfficers.map(o => `<option value="${safeText(o.id)}">${safeText(o.name)} (${safeText(o.brgy)})</option>`).join('');
    openModal(`
      <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="modal" style="max-width:520px">
          <div class="modal-head">
            <div>
              <div class="modal-title">Reassign Case</div>
              <div class="modal-subtitle">${safeText(id)}</div>
            </div>
            <button class="modal-close" onclick="closeModal()">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label>Select new officer</label>
              <select id="reassign-officer" class="form-select">${officerOptions}</select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn-success" onclick="submitReassign('${safeText(id)}')">Reassign</button>
          </div>
        </div>
      </div>`);
}

async function submitReassign(id) {
    const officerId = document.getElementById('reassign-officer')?.value;
    if (!officerId) {
        showToast('Please select an officer to reassign.');
        return;
    }
    closeModal();
    try {
        await apiFetch('dispatch.php', {action: 'reassign', id, officer_id: officerId}, 'POST');
        showToast('Case reassigned successfully.');
        await loadDispatchData();
        renderDashboard();
        renderQueueTable();
        renderActiveCases();
    } catch (error) {
        showToast(error.message);
    }
}

function renderProfileCard() {
    const user = DISPATCH_USER;
    const mini = document.getElementById('profile-mini-card');
    if (!mini) return;
    mini.innerHTML = `
      <div class="card" style="display:flex;align-items:center;gap:14px;padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--surface)">
        <img src="https://i.pravatar.cc/120?img=68" alt="Profile" style="width:48px;height:48px;border-radius:50%;object-fit:cover" />
        <div style="flex:1">
          <div style="font-weight:700;font-size:14px">${safeText(user.name)}</div>
          <div style="color:var(--mist);font-size:12px">Dispatch Officer • ${safeText(user.name)}</div>
        </div>
        <button class="btn-secondary btn-sm" onclick="setActivePage('profile')">View Profile</button>
      </div>`;
}

function renderProfile() {
    const user = DISPATCH_USER;
    if (!user) return;

    const initial = (user.name || 'D').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const topbarName = document.getElementById('topbar-user-name');
    if (topbarName) topbarName.textContent = user.name;

    const profAvatar = document.getElementById('prof-avatar');
    if (profAvatar) {
        profAvatar.textContent = initial;
        profAvatar.style.backgroundImage = '';
    }

    document.getElementById('prof-name').textContent = user.name || '—';
    document.getElementById('prof-position').textContent = 'Dispatch Officer';
    document.getElementById('prof-email').textContent = user.email || '—';
    document.getElementById('prof-phone').textContent = user.phone || '—';
    document.getElementById('prof-badgeid').textContent = 'DSP-' + String(user.id || '001').padStart(4, '0');
    document.getElementById('prof-brgy').textContent = user.home_barangay || 'QC Command';
    document.getElementById('prof-cases').textContent = ACTIVE_CASES.length;
    document.getElementById('prof-closed').textContent = window.dispatchCounts?.closed_cases ?? 0;
    document.getElementById('prof-avgtime').textContent = '1.8 hours';
    document.getElementById('prof-caseload').textContent = ACTIVE_CASES.length;
    document.getElementById('prof-officers-count').textContent = OFFICERS_DATA.length;
    document.getElementById('prof-active-brgy').textContent = 4;
    document.getElementById('prof-resolution-rate').textContent = '91%';
    document.getElementById('prof-on-time').textContent = '94%';
    document.getElementById('prof-avg-rating').textContent = '4.6★';
    document.getElementById('prof-efficiency').textContent = '92/100';

    /* Also update sidebar badge */
    const sbName = document.querySelector('.srb-name');
    if (sbName) sbName.textContent = user.name;
    /* Update topbar user chip */
    const chip = document.querySelector('.user-chip-name');
    if (chip) chip.textContent = user.name.split(' ').slice(-1)[0];
    const avatar = document.querySelector('.user-avatar');
    if (avatar) avatar.textContent = initial;
}

function renderOfficers() {
    const grid = document.getElementById('officers-grid');
    if (!grid) return;

    grid.innerHTML = OFFICERS_DATA.map(o => `
      <div class="officer-full-card">
        <div class="officer-full-header">
          <div class="officer-avatar-lg">${safeText(o.code.slice(-2) || o.name.split(' ').map(x => x[0]).join(''))}</div>
          <div style="flex:1">
            <div class="officer-full-name">${safeText(o.name)}</div>
            <div class="officer-full-brgy">${_officerRoleLabel(o)} · Brgy. ${safeText(o.brgy || 'N/A')}</div>
          </div>
          <span class="badge ${_badgeClassByStatus(o.status)}">${safeText(o.status)}</span>
        </div>
        <div class="officer-stats-row">
          <div class="officer-stat-box">
            <div class="officer-stat-val">${safeText(o.cases_closed ?? 0)}</div>
            <div class="officer-stat-label">Handled</div>
          </div>
          <div class="officer-stat-box">
            <div class="officer-stat-val">${safeText(o.rating ?? 0)}</div>
            <div class="officer-stat-label">Score</div>
          </div>
          <div class="officer-stat-box">
            <div class="officer-stat-val">${safeText(_officerRoleLabel(o))}</div>
            <div class="officer-stat-label">Duty</div>
          </div>
        </div>
        ${perfBar('Workload', Math.min(100, (o.cases_closed ?? 0) * 12))}
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn-secondary btn-sm" style="flex:1" onclick="showToast('Viewing cases for ${safeText(o.name)}')">View Cases</button>
          <button id="contact-btn-${safeText(_chatPartnerKey(_chatReceiverRole(o), o.id))}" class="${officerChatAlertMap[_chatPartnerKey(_chatReceiverRole(o), o.id)] ? 'btn-danger' : 'btn-secondary'} btn-sm" style="flex:1" onclick="openChatModal('${safeText(o.id)}','${safeText(o.name)}','${_chatReceiverRole(o)}')">Contact</button>
        </div>
      </div>`).join('');
}

    function refreshOfficerContactButtonStyles() {
      OFFICERS_DATA.forEach(o => {
        const key = _chatPartnerKey(_chatReceiverRole(o), o.id);
        const btn = document.getElementById(`contact-btn-${key}`);
        if (!btn) return;
        btn.classList.remove('btn-secondary', 'btn-danger');
        btn.classList.add(officerChatAlertMap[key] ? 'btn-danger' : 'btn-secondary');
      });
      updateOfficerNavBadge();
    }

    async function refreshOfficerChatAlerts({baselineOnly = false} = {}) {
      if (!OFFICERS_DATA.length) return;

      const checks = OFFICERS_DATA.map(async o => {
        const receiverRole = _chatReceiverRole(o);
        const receiverId = String(o.id ?? '');
        if (!receiverId) return;

        const chatKey = _chatPartnerKey(receiverRole, receiverId);
        try {
          const resp = await apiFetch('messages.php', {action: 'thread', receiver_role: receiverRole, receiver_id: receiverId});
          const messages = Array.isArray(resp.messages) ? resp.messages : [];
          const incoming = messages.filter(m => String(m.senderRole || '') !== 'dispatch');
          const lastIncomingId = incoming.length ? Number(incoming[incoming.length - 1].id || 0) : 0;
          const prevIncomingId = Number(officerLastIncomingMap[chatKey] || 0);

          if (!Object.prototype.hasOwnProperty.call(officerLastIncomingMap, chatKey) || baselineOnly) {
            officerLastIncomingMap[chatKey] = lastIncomingId;
            officerUnreadCountMap[chatKey] = 0;
            return;
          }

          const newIncomingCount = incoming.filter(m => Number(m.id || 0) > prevIncomingId).length;
          if (newIncomingCount > 0) {
            officerUnreadCountMap[chatKey] = Number(officerUnreadCountMap[chatKey] || 0) + newIncomingCount;
            officerChatAlertMap[chatKey] = true;
          }
          officerLastIncomingMap[chatKey] = Math.max(prevIncomingId, lastIncomingId);
        } catch (error) {
          console.warn('Unable to refresh officer chat alerts:', error.message);
        }
      });

      await Promise.all(checks);
      refreshOfficerContactButtonStyles();
    }

    function startOfficerChatAlertPolling() {
      if (officerChatAlertInterval) clearInterval(officerChatAlertInterval);
      refreshOfficerChatAlerts({baselineOnly: true});
      officerChatAlertInterval = setInterval(() => {
        refreshOfficerChatAlerts();
      }, 5000);
    }

function renderAnalytics() {
    const catData = [
        ['Traffic Obstruction', 15, 32],
        ['Illegal Parking', 12, 26],
        ['Road Damage', 9, 19],
        ['Accident', 6, 13],
        ['Signal Malfunction', 3, 6],
        ['Traffic Violation', 2, 4],
    ];
    const catEl = document.getElementById('cat-bars');
    if (catEl) catEl.innerHTML = catData.map(([name, count, pct]) => perfBar(`${name} (${count})`, pct)).join('');

    const perfEl = document.getElementById('officer-perf-list');
    if (perfEl) {
        perfEl.innerHTML = OFFICERS_DATA.map(o => `
          <div style="display:flex;align-items:center;gap:12px;padding:10px;border:1px solid var(--border);margin-bottom:8px">
            <div class="officer-initials" style="width:32px;height:32px;font-size:11px">${safeText(o.code.slice(-2) || o.name.split(' ').map(x => x[0]).join(''))}</div>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600">${safeText(o.name)}</div>
              <div class="mono" style="font-size:11px;color:var(--mist)">${_officerRoleLabel(o)} score: ${safeText(o.rating ?? 0)}</div>
            </div>
            <div style="font-family:var(--font-head);font-size:22px;font-weight:800;color:var(--green)">${safeText(o.rating ?? 0)}</div>
          </div>`).join('');
    }

    const trendEl = document.getElementById('trend-chart');
    if (trendEl) {
        const vals = [65,80,55,90,72,85,60,78,95,68,82,88,70,75,92,84];
        trendEl.innerHTML = vals.map(v => `
          <div class="bar-col"><div class="bar-fill" style="height:${v}%;"></div></div>`).join('');
    }
}

function editProfile() {
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
              <img id="edit-profile-photo-preview" src="https://i.pravatar.cc/120?img=68" style="width:84px;height:84px;border-radius:50%;object-fit:cover;border:2px solid var(--border)" alt="Profile Photo" />
            </div>
            <div class="form-group">
              <label for="edit-profile-name">Full Name</label>
              <input id="edit-profile-name" class="form-input" type="text" value="${safeText(DISPATCH_USER.name)}" />
            </div>
            <div class="form-group">
              <label for="edit-profile-email">Email</label>
              <input id="edit-profile-email" class="form-input" type="email" value="${safeText(DISPATCH_USER.email)}" />
            </div>
            <div class="form-group">
              <label for="edit-profile-phone">Phone</label>
              <input id="edit-profile-phone" class="form-input" type="tel" value="${safeText(DISPATCH_USER.phone || '+63 ')}" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn-primary" onclick="submitProfileEdit()">Save Changes</button>
          </div>
        </div>
      </div>`);
}

async function submitProfileEdit() {
    const name = document.getElementById('edit-profile-name')?.value.trim();
    const email = document.getElementById('edit-profile-email')?.value.trim();
    const phone = document.getElementById('edit-profile-phone')?.value.trim();

    if (!name || !email || !phone) {
        showToast('All fields are required.');
        return;
    }

    try {
        await apiFetch('user.php', {action: 'updateProfile', name, email, phone}, 'POST');
        DISPATCH_USER.name = name;
        DISPATCH_USER.email = email;
        DISPATCH_USER.phone = phone;
        renderProfile();
        closeModal();
        showToast('✓ Profile updated successfully.');
    } catch (error) {
        showToast(error.message);
    }
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
              <label for="current-pass">Current Password</label>
              <input id="current-pass" class="form-input" type="password" placeholder="Enter current password" />
            </div>
            <div class="form-group">
              <label for="new-pass">New Password</label>
              <input id="new-pass" class="form-input" type="password" placeholder="Enter new password" />
            </div>
            <div class="form-group">
              <label for="confirm-pass">Confirm Password</label>
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

async function submitPasswordChange() {
    const current = document.getElementById('current-pass')?.value.trim();
    const nw = document.getElementById('new-pass')?.value.trim();
    const confirm = document.getElementById('confirm-pass')?.value.trim();

    if (!current || !nw || !confirm) {
        showToast('Please fill in all password fields.');
        return;
    }
    if (nw !== confirm) {
        showToast('New passwords do not match.');
        return;
    }
    if (nw.length < 8) {
        showToast('Password must be at least 8 characters long.');
        return;
    }

    try {
        await apiFetch('user.php', {action: 'changePassword', currentPassword: current, newPassword: nw}, 'POST');
        closeModal();
        showToast('✓ Password changed successfully.');
    } catch (error) {
        showToast(error.message);
    }
}

function viewActivityLog() {
    const activities = [
        {time: '2 min ago', action: 'Viewed complaint queue', detail: 'Accessed Complaint Queue page'},
        {time: '5 min ago', action: 'Assigned case to officer', detail: 'TRAPICO-2026-03-000014 → Officer'},
        {time: '12 min ago', action: 'Verified complaint', detail: 'TRAPICO-2026-03-000015 marked as verified'},
        {time: '18 min ago', action: 'Closed case', detail: 'TRAPICO-2026-03-000012 marked as closed'},
        {time: '25 min ago', action: 'Sent message to officer', detail: 'Message to available field officer'},
        {time: '42 min ago', action: 'Viewed analytics', detail: 'Accessed Analytics page'},
        {time: '1 hr ago', action: 'Logged in', detail: 'Session started'},
    ];

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
            ${activities.map(a => `
              <div style="padding:12px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:start">
                <div style="flex:1">
                  <div style="font-weight:600;font-size:13px">${safeText(a.action)}</div>
                  <div style="font-size:12px;color:var(--mist);margin-top:4px">${safeText(a.detail)}</div>
                </div>
                <div style="font-size:12px;color:var(--mist);white-space:nowrap;margin-left:12px">${safeText(a.time)}</div>
              </div>`).join('')}
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" onclick="closeModal()">Close</button>
          </div>
        </div>
      </div>`);
}

function openChatModal(officerId, officerName, receiverRole = 'field') {
    if (!officerId) {
        showToast('Officer ID is required for chat.');
        return;
    }
  const chatKey = _chatPartnerKey(receiverRole, officerId);
  officerChatAlertMap[chatKey] = false;
  officerUnreadCountMap[chatKey] = 0;
  refreshOfficerContactButtonStyles();
    activeChat = {receiverRole, receiverId: officerId, name: officerName};
    chatLastId = 0;
    loadChatThread();
    startChatPolling();

    openModal(`
      <div class="modal-overlay" onclick="if(event.target===this) { closeModal(); stopChatPolling(); }">
        <div class="modal" style="max-width:560px;min-height:560px;padding:0;overflow:hidden">
          <div class="modal-head">
            <div>
              <div class="modal-title">Dispatch Messenger</div>
              <div class="modal-subtitle">Chat with ${safeText(officerName)}</div>
            </div>
            <button class="modal-close" onclick="closeModal(); stopChatPolling();">✕</button>
          </div>
          <div class="msg-shell">
            <div class="msg-body" id="chat-body"></div>
            <div class="msg-composer">
              <input id="chat-input" class="form-input msg-input" type="text" placeholder="Type a message…" onkeydown="if(event.key==='Enter') sendChatMessage();" />
              <button class="btn-primary" onclick="sendChatMessage()">Send</button>
            </div>
          </div>
        </div>
      </div>`);
}

async function loadChatThread() {
    if (!activeChat) return;
    try {
        const resp = await apiFetch('messages.php', {action: 'thread', receiver_role: activeChat.receiverRole, receiver_id: activeChat.receiverId});
        const messages = resp.messages || [];
    const chatKey = _chatPartnerKey(activeChat.receiverRole, activeChat.receiverId);
    const incoming = messages.filter(m => String(m.senderRole || '') !== 'dispatch');
    const lastIncomingId = incoming.length ? Number(incoming[incoming.length - 1].id || 0) : 0;
    officerLastIncomingMap[chatKey] = Math.max(Number(officerLastIncomingMap[chatKey] || 0), lastIncomingId);
    officerChatAlertMap[chatKey] = false;
    officerUnreadCountMap[chatKey] = 0;
    refreshOfficerContactButtonStyles();
        chatLastId = messages.length ? messages[messages.length - 1].id : 0;
        renderChatMessages(messages);
    } catch (error) {
        showToast(error.message);
    }
}

function renderChatMessages(messages) {
    const body = document.getElementById('chat-body');
    if (!body) return;
    body.innerHTML = messages.map(msg => {
        const isSent = msg.senderRole === 'dispatch';
    return `<div class="chat-row ${isSent ? 'mine' : 'theirs'}"><div class="chat-bubble ${isSent ? 'chat-sent' : 'chat-received'}"><div>${safeText(msg.message)}</div><div class="chat-meta">${formatDateTime(msg.sentAt)}</div></div></div>`;
    }).join('');
    body.scrollTop = body.scrollHeight;
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    if (!input || !activeChat) return;
    const message = input.value.trim();
    if (!message) return;
    try {
        await apiFetch('messages.php', {
            action: 'send',
            receiver_role: activeChat.receiverRole,
            receiver_id: activeChat.receiverId,
            message,
        }, 'POST');
        input.value = '';
        await loadChatThread();
    } catch (error) {
        showToast(error.message);
    }
}

function startChatPolling() {
    stopChatPolling();
    chatInterval = setInterval(async () => {
        if (!activeChat) return;
        try {
            const resp = await apiFetch('messages.php', {action: 'poll', receiver_role: activeChat.receiverRole, receiver_id: activeChat.receiverId, last_id: chatLastId});
            const messages = resp.messages || [];
            if (messages.length) {
                chatLastId = messages[messages.length - 1].id;
                             showNotification('New message from ' + (activeChat.name || 'Field Officer'), 'You have a new message');
              await loadChatThread();
            }
        } catch (error) {
            console.warn('Chat polling error:', error.message);
        }
    }, 3000);
}

function stopChatPolling() {
    if (chatInterval) {
        clearInterval(chatInterval);
        chatInterval = null;

    function showNotification(title, message) {
      const container = document.getElementById('notif-panel') || document.querySelector('.notif-panel');
      if (!container) return;
    
      const item = document.createElement('div');
      item.className = 'notif-item';
      item.innerHTML = `<div class="notif-dot-inline"></div><div><div class="notif-msg">${safeText(title)}</div><div class="notif-time">${safeText(message)}</div></div>`;
      container.insertBefore(item, container.querySelector('.notif-item') || container.firstChild);
    
      while (container.querySelectorAll('.notif-item').length > 5) {
        container.lastChild?.remove();
      }
    }
    }
}

/* ── Page navigation hook: initialize/invalidate maps on page switch ── */
(function patchSetActivePage() {
    const _prev = typeof setActivePage === 'function' ? setActivePage : null;
    window.setActivePage = function setActivePage(pageId) {
        if (_prev) _prev(pageId);
        if (pageId === 'officers') {
          clearOfficerMessageAlerts();
            if (!_officersMap) {
                setTimeout(initOfficersPageMap, 50);
            } else {
                setTimeout(() => _officersMap.invalidateSize(), 50);
            }
        }
        if (pageId === 'dash' && _dashMap) {
            setTimeout(() => _dashMap.invalidateSize(), 50);
        }
    };
}());
