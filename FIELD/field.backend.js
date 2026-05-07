/* ============================================================
   TRAPICO — Field officer frontend backend connector
   ============================================================ */

'use strict';

let FIELD_USER = null;
let ASSIGNMENTS = [];
let HISTORY_ITEMS = [];
let PERFORMANCE_DATA = {};
let fieldNotifOpen = false;
let fieldCountdownInterval = null;
let activeAssignmentId = null;
let gpsTrackInterval = null;
let evidenceUploads = {before: null, after: null};
let activeJobMap = null;
let activeJobIncidentMarker = null;
let activeJobOfficerMarker = null;
let activeChat = null;
let chatLastId = 0;
let chatInterval = null;

window.addEventListener('DOMContentLoaded', initField);
let notificationLastId = 0;
let notificationInterval = null;
let detailsMapInstance = null;
let detailsMapMarker = null;
let assignedCaseMaps = [];
let draftAutosaveTimer = null;
let performanceRefreshInterval = null;

const FIELD_DRAFT_STORE_KEY = 'field_resolution_drafts_v1';
const FIELD_STATUS_OPTIONS = ['submitted', 'verified', 'assigned', 'en_route', 'in_progress', 'resolved', 'validated', 'closed'];

function getDraftStore() {
    try {
        const raw = localStorage.getItem(FIELD_DRAFT_STORE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        console.warn('Unable to read draft store:', error.message);
        return {};
    }
}

function saveDraftStore(store) {
    try {
        localStorage.setItem(FIELD_DRAFT_STORE_KEY, JSON.stringify(store));
    } catch (error) {
        console.warn('Unable to write draft store:', error.message);
    }
}

function getAssignmentDraft(assignmentId) {
    const store = getDraftStore();
    return store[String(assignmentId)] || null;
}

function persistAssignmentDraft(assignmentId, payload) {
    const store = getDraftStore();
    store[String(assignmentId)] = {
        ...payload,
        saved_at: new Date().toISOString(),
    };
    saveDraftStore(store);
    localStorage.setItem(`field_draft_${assignmentId}`, JSON.stringify(payload));
}

function clearAssignmentDraft(assignmentId) {
    const store = getDraftStore();
    delete store[String(assignmentId)];
    saveDraftStore(store);
    localStorage.removeItem(`field_draft_${assignmentId}`);
}

function cleanupAssignedMaps() {
    assignedCaseMaps.forEach(entry => {
        if (entry?.map) entry.map.remove();
    });
    assignedCaseMaps = [];
}

function computeEfficiencyScore() {
    const serverScore = Number(PERFORMANCE_DATA.efficiency_score || 0);
    if (Number.isFinite(serverScore) && serverScore > 0) {
        return Math.max(0, Math.min(100, Math.round(serverScore)));
    }

    const closure = Number(PERFORMANCE_DATA.closure_rate || 0);
    const onTime = Number(PERFORMANCE_DATA.on_time_rate || 0);
    const satisfaction = Number(PERFORMANCE_DATA.satisfaction || 0) * 20;
    const failurePenalty = 100 - Number(PERFORMANCE_DATA.failure_rate || 0);

    const weighted = (closure * 0.45) + (onTime * 0.30) + (satisfaction * 0.20) + (failurePenalty * 0.05);
    return Math.max(0, Math.min(100, Math.round(weighted)));
}

function startPerformanceRefresh() {
    if (performanceRefreshInterval) {
        clearInterval(performanceRefreshInterval);
    }

    performanceRefreshInterval = setInterval(async () => {
        try {
            await loadPerformance();
            renderDashboard();
            renderPerformance();
        } catch (error) {
            console.warn('Realtime performance refresh failed:', error.message);
        }
    }, 15000);
}

function getCurrentPositionPromise() {
    if (!window.isSecureContext) {
        return Promise.reject(new Error('GPS requires a secure origin. Open this app via https:// or http://localhost.'));
    }
    if (!navigator.geolocation) {
        return Promise.reject(new Error('Geolocation is not supported by your browser.'));
    }

    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
            resolve,
            () => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: false,
                    timeout: 12000,
                    maximumAge: 30000,
                });
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0,
            }
        );
    });
}

async function initField() {
    const user = await requireLoginRedirect();
    if (!user) return;
    FIELD_USER = user;

    await Promise.all([loadAssignedTasks(), loadHistory(), loadPerformance()]);
    renderDashboard();
    renderAssigned();
    renderActiveJob();
    renderHistory();
    renderPerformance();
    startPerformanceRefresh();
}

async function loadAssignedTasks() {
    const resp = await apiFetch('field.php', {action: 'assigned'});
    ASSIGNMENTS = resp.assignments || [];
}

async function loadHistory() {
    const resp = await apiFetch('field.php', {action: 'history'});
    HISTORY_ITEMS = resp.history || [];
}

async function loadPerformance() {
    const resp = await apiFetch('field.php', {action: 'performance'});
    PERFORMANCE_DATA = resp.performance || {};
}

function toggleNotif() {
    fieldNotifOpen = !fieldNotifOpen;
    document.getElementById('notif-panel').classList.toggle('hidden', !fieldNotifOpen);
}

document.addEventListener('click', e => {
    if (!e.target.closest('#notif-btn') && fieldNotifOpen) {
        document.getElementById('notif-panel').classList.add('hidden');
        fieldNotifOpen = false;
    }
});

function fmtTime(secs) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function myAssigned() {
    return ASSIGNMENTS;
}

function getActiveAssignment() {
    if (!ASSIGNMENTS.length) return null;
    if (!activeAssignmentId) {
        activeAssignmentId = ASSIGNMENTS[0].assignment_id;
    }
    return ASSIGNMENTS.find(a => String(a.assignment_id) === String(activeAssignmentId)) || ASSIGNMENTS[0];
}

function openJobByAssignment(assignmentId) {
    activeAssignmentId = assignmentId;
    evidenceUploads = {before: null, after: null};
    renderActiveJob();
    setActivePage('job');
}

function renderDashboard() {
    const assignedCount = ASSIGNMENTS.length;
    const inProgressCount = ASSIGNMENTS.filter(a => a.assignment_status === 'in_progress').length;

    document.getElementById('stat-assigned').textContent = assignedCount;
    document.getElementById('stat-inprog').textContent = inProgressCount;
    document.getElementById('badge-assigned').textContent = assignedCount;

    const efficiencyEl = document.getElementById('stat-efficiency');
    if (efficiencyEl) {
        efficiencyEl.innerHTML = `${computeEfficiencyScore()}<span class="unit">%</span>`;
    }

    const allTasks = ASSIGNMENTS.slice(0, 4);
    const taskList = document.getElementById('dash-task-list');
    if (!taskList) return;

    taskList.innerHTML = allTasks.map((c, i) => `
      <div class="task-card${i === 0 ? ' priority-top' : ''}">
        <div class="task-num">${i + 1}</div>
        <div class="task-body">
          <div class="task-id">${safeText(c.id)}</div>
          <div class="task-cat">${safeText(c.cat)}</div>
          <div class="task-meta">📍 Brgy. ${safeText(c.brgy)} · ${formatDateTime(c.date)}</div>
          <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
            ${statusBadge(c.status)} ${priorityBadge(c.priority)}
          </div>
        </div>
        <div class="task-actions">
                    <button class="btn-primary btn-sm" onclick="openJobByAssignment('${safeText(c.assignment_id)}')">Start Job</button>
          <button class="btn-secondary btn-sm" onclick="showCaseDetailsMap('${safeText(c.id)}')">Details</button>
        </div>
      </div>`).join('');
}

function getReporterName(assignment) {
    if (assignment.anon) return 'Anonymous';
    return assignment.reporter ? String(assignment.reporter) : 'Citizen';
}

function statusOptionsMarkup(currentStatus = '') {
    return FIELD_STATUS_OPTIONS
        .map(status => `<option value="${safeText(status)}" ${String(currentStatus) === status ? 'selected' : ''}>${safeText(status.replace('_', ' '))}</option>`)
        .join('');
}

function renderTransparencyTimeline(currentStatus = 'submitted') {
    const statusIndex = FIELD_STATUS_OPTIONS.indexOf(String(currentStatus).toLowerCase());
    const timelineItems = FIELD_STATUS_OPTIONS.map((status, idx) => {
        const isCompleted = idx < statusIndex;
        const isCurrent = idx === statusIndex;
        const statusDisplay = status.replace('_', ' ').charAt(0).toUpperCase() + status.replace('_', ' ').slice(1);
        
        let indicator = '';
        if (isCompleted) {
            indicator = '✓';
        } else if (isCurrent) {
            indicator = '●';
        } else {
            indicator = '○';
        }
        
        const circleClass = isCompleted ? 'timeline-check' : isCurrent ? 'timeline-active' : 'timeline-pending';
        
        return `
            <div class="timeline-item ${circleClass}">
                <div class="timeline-circle">${indicator}</div>
                <div class="timeline-content">
                    <div class="timeline-status">${statusDisplay}</div>
                    <div class="timeline-time">${idx === 0 ? formatDateTime(new Date()) : '—'}</div>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="transparency-timeline">
            <div class="timeline-title">Transparency Timeline</div>
            ${timelineItems}
        </div>
    `;
}

function renderAssigned() {
    const list = myAssigned();
    const el = document.getElementById('assigned-list');
    if (!el) return;

    cleanupAssignedMaps();

    if (!list.length) {
        el.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">No assigned cases</div><div class="empty-sub">You have no active assignments. Stand by.</div></div>`;
        return;
    }

        el.innerHTML = list.map(c => {
            const lat = Number.parseFloat(c.lat);
            const lng = Number.parseFloat(c.lng);
            const coordText = Number.isFinite(lat) && Number.isFinite(lng)
                ? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
                : 'Location unavailable';

                        return `
      <div class="assigned-card">
        <div class="assigned-card-header">
          <div>
            <div class="assigned-card-title">
              <span class="track-id">${safeText(c.id)}</span>
              ${statusBadge(c.status)}
              ${priorityBadge(c.priority)}
            </div>
            <div class="assigned-card-name">${safeText(c.cat)} · Barangay ${safeText(c.brgy)}</div>
          </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
                        <button class="btn-secondary btn-sm" onclick="showCaseDetailsMap('${safeText(c.id)}')">Details</button>
                        <button class="btn-primary btn-sm" onclick="openJobByAssignment('${safeText(c.assignment_id)}')">▶ Start Job</button>
                    </div>
        </div>
        <div class="assigned-card-body">
          <div>
            <div style="font-family:var(--font-mono);font-size:11px;color:var(--mist);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Description</div>
            <div style="font-size:13px;line-height:1.6">${safeText(c.desc)}</div>
            <div style="margin-top:14px;display:flex;flex-direction:column;gap:4px">
              <div class="assigned-meta-row"><span class="assigned-meta-label">Date/Time</span><span class="assigned-meta-val">${formatDateTime(c.date)}</span></div>
              <div class="assigned-meta-row"><span class="assigned-meta-label">Priority</span><span class="assigned-meta-val">${safeText(c.priority)}</span></div>
                            <div class="assigned-meta-row"><span class="assigned-meta-label">Reporter</span><span class="assigned-meta-val">${safeText(getReporterName(c))}</span></div>
                            <div class="assigned-meta-row"><span class="assigned-meta-label">Status</span><span class="assigned-meta-val" style="text-transform:capitalize">${safeText(String(c.status || '').replace('_', ' '))}</span></div>
            </div>
          </div>
          <div>
            <div class="assigned-map-shell" style="height:170px;border-radius:8px;border:1px solid var(--border);overflow:hidden;position:relative">
              <div id="assigned-map-${safeText(c.assignment_id)}" class="assigned-case-map" style="height:100%"></div>
            </div>
            <div style="margin-top:8px">
                            <span id="assigned-map-label-${safeText(c.assignment_id)}" style="font-size:12px;color:var(--mist)">${safeText(coordText)}</span>
            </div>
          </div>
        </div>
            </div>`;
        }).join('');

    initAssignedMaps(list);
}

function initAssignedMaps(assignments) {
    if (typeof L === 'undefined') return;

    assignments.forEach(assignment => {
        const mapId = `assigned-map-${assignment.assignment_id}`;
        const mapEl = document.getElementById(mapId);
        if (!mapEl) return;

        const lat = Number.parseFloat(assignment.lat);
        const lng = Number.parseFloat(assignment.lng);
        const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
        const target = hasCoords ? [lat, lng] : [14.6760, 121.0437];

        const map = L.map(mapId, {zoomControl: false, scrollWheelZoom: false}).setView(target, hasCoords ? 15 : 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
        }).addTo(map);

        if (hasCoords) {
            const incidentPopup = `
                <div style="font-weight:700">${safeText(assignment.id || 'Incident')}</div>
                <div style="font-size:12px;margin-top:4px">${safeText(assignment.cat || '')} · ${safeText(assignment.brgy || '')}</div>
                <div style="font-size:12px;margin-top:6px;line-height:1.45">${safeText(assignment.desc || 'No description')}</div>
            `;
            L.marker(target)
                .addTo(map)
                .bindPopup(incidentPopup)
                .bindTooltip('Incident location', {permanent: true, direction: 'top', offset: [0, -18], className: 'incident-pin-label'});
        }

        assignedCaseMaps.push({assignmentId: String(assignment.assignment_id), map, officerMarker: null});
    });
}

function centerAssignedMapToGps(assignmentId) {
    const mapId = `assigned-map-${assignmentId}`;
    const entry = assignedCaseMaps.find(item => item?.map && item.map.getContainer && item.map.getContainer().id === mapId);
    if (!entry?.map) {
        showToast('Map is still loading. Please try again.');
        return;
    }

    const label = document.getElementById(`assigned-map-label-${assignmentId}`);
    if (label) label.textContent = 'Detecting your GPS location...';

    getCurrentPositionPromise().then(position => {
        const point = [position.coords.latitude, position.coords.longitude];
        if (entry.officerMarker) {
            entry.officerMarker.setLatLng(point);
        } else {
            entry.officerMarker = L.marker(point).addTo(entry.map).bindPopup('Field officer pinned location');
        }
        entry.map.setView(point, 16);
        if (label) label.textContent = `Pinned: ${point[0].toFixed(5)}, ${point[1].toFixed(5)}`;
        showToast('Your location has been pinned on the map.');
    }).catch(error => {
        if (label) label.textContent = 'GPS unavailable on this origin. Use localhost/https.';
        showToast('Unable to fetch GPS location: ' + (error.message || 'Permission denied.'));
    });
}

function getStatusSelectValue(assignmentId) {
    const selectEl = document.getElementById(`assigned-status-${assignmentId}`) || document.getElementById('active-status-select');
    return selectEl ? selectEl.value : '';
}

async function updateAssignmentStatus(assignmentId, nextStatus) {
    if (!assignmentId || !nextStatus) {
        showToast('Please select a valid status.');
        return;
    }

    try {
        await apiFetch('field.php', {action: 'updateStatus', assignment_id: assignmentId, status: nextStatus}, 'POST');
        showToast('Report status updated.');
        await Promise.all([loadAssignedTasks(), loadHistory(), loadPerformance()]);
        renderDashboard();
        renderAssigned();
        renderActiveJob();
        renderHistory();
        renderPerformance();
    } catch (error) {
        showToast(error.message || 'Unable to update status.');
    }
}

function applyStatusFromAssigned(assignmentId) {
    const value = getStatusSelectValue(assignmentId);
    updateAssignmentStatus(assignmentId, value);
}

function renderActiveJob() {
        const page = document.getElementById('page-job');
        if (!page) return;

    if (activeJobMap) {
        activeJobMap.remove();
        activeJobMap = null;
        activeJobIncidentMarker = null;
        activeJobOfficerMarker = null;
    }

        const assignment = getActiveAssignment();
        if (!assignment) {
                page.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">No active job</div><div class="empty-sub">You have no pending or in-progress assignments right now.</div></div>`;
                stopLiveTracking();
                return;
        }

        const checkedIn = Number(assignment.checked_in) === 1 || assignment.assignment_status === 'in_progress';
        const statusText = assignment.status || assignment.assignment_status || 'assigned';

        page.innerHTML = `
            <div class="active-job-card">
                <div class="job-header">
                    <div>
                        <div class="job-id-row">
                            <span class="track-id">${safeText(assignment.id)}</span>
                            ${statusBadge(statusText)}
                            ${priorityBadge(assignment.priority)}
                        </div>
                        <div class="job-meta">${safeText(assignment.cat)} · Barangay ${safeText(assignment.brgy)} · ${formatDateTime(assignment.date)}</div>
                    </div>
                </div>

                ${renderTransparencyTimeline(statusText)}

                                <div class="job-meta-grid">
                                        <div class="job-meta-cell"><div class="job-meta-k">Description</div><div class="job-meta-v">${safeText(assignment.desc || 'No description')}</div></div>
                                        <div class="job-meta-cell"><div class="job-meta-k">Date/Time</div><div class="job-meta-v">${formatDateTime(assignment.date)}</div></div>
                                        <div class="job-meta-cell"><div class="job-meta-k">Priority</div><div class="job-meta-v">${safeText(assignment.priority)}</div></div>
                                        <div class="job-meta-cell"><div class="job-meta-k">Reporter</div><div class="job-meta-v">${safeText(getReporterName(assignment))}</div></div>
                                </div>

                <div class="countdown-box">
                    <div>
                        <div class="countdown-val" id="job-countdown">--:--</div>
                        <div class="countdown-label">Time remaining in arrival window</div>
                    </div>
                    <div class="countdown-meta">
                        Submitted: ${formatDateTime(assignment.date)}<br>
                        Deadline: ${formatDateTime(assignment.deadline)}
                    </div>
                </div>

                <div id="job-fta-alert" class="alert alert-danger hidden">
                    🚨 <div>You are approaching the 30-minute arrival deadline. Failure to check in will trigger an automated <strong>Failure-to-Arrive</strong> alert to Dispatch.</div>
                </div>

                                <div style="margin-bottom:20px">
                                        <div id="active-job-map" style="height:220px;border-radius:8px;border:1px solid var(--border)"></div>
                                        <div style="margin-top:8px">
                                            <span id="active-job-map-label" style="font-size:12px;color:var(--mist)">Loading map…</span>
                                        </div>
                </div>

                <div class="checkin-panel">
                    <div class="checkin-title">GPS Geofence Check-In</div>
                    <div class="checkin-sub">You must be within 150m of the incident site to check in. The system verifies your GPS coordinates.</div>
                    <div class="checkin-actions" style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
                        <button class="btn-danger" id="btn-checkin" onclick="attemptCheckin()" ${checkedIn ? 'disabled style="opacity:.45"' : ''}>📍 Check In (GPS)</button>
                        <button class="btn-secondary" onclick="openDispatchChat()">💬 Chat with Dispatch</button>
                        <button class="btn-success" id="btn-simulate" onclick="simulateArrival()" ${checkedIn ? 'disabled style="opacity:.45"' : ''}>🧪 Simulate Arrival</button>
                    </div>
                    <div class="checkin-status ${checkedIn ? 'ok' : ''}" id="checkin-status">${checkedIn ? '✓ Already checked in for this assignment.' : ''}</div>
                </div>

                <div id="resolution-form">
                    <div class="section-title" style="margin-bottom:16px">Resolution Report</div>

                    <div class="evidence-grid">
                        <div>
                            <label class="evidence-label">Before — Incident Evidence</label>
                            <input type="file" id="evidence-before-input" accept="image/*,video/mp4,video/quicktime" style="display:none" onchange="handleEvidenceSelected('before', this)" />
                            <div class="upload-box" style="height:110px;cursor:pointer" onclick="chooseEvidence('before')">
                                <div class="upload-icon">📸</div>
                                <div class="upload-text" style="font-size:12px">Upload BEFORE photo/video</div>
                                <div class="upload-sub" id="evidence-before-status">No file uploaded</div>
                            </div>
                        </div>
                        <div>
                            <label class="evidence-label">After — Proof of Resolution</label>
                            <input type="file" id="evidence-after-input" accept="image/*,video/mp4,video/quicktime" style="display:none" onchange="handleEvidenceSelected('after', this)" />
                            <div class="upload-box" style="height:110px;cursor:pointer" onclick="chooseEvidence('after')">
                                <div class="upload-icon">✅</div>
                                <div class="upload-text" style="font-size:12px">Upload AFTER photo/video</div>
                                <div class="upload-sub" id="evidence-after-status">No file uploaded</div>
                            </div>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="res-method">Resolution Method *</label>
                            <select id="res-method" class="form-select">
                                <option value="">— Select method —</option>
                                <option>Traffic re-routing</option>
                                <option>Obstruction removal</option>
                                <option>Road barricading</option>
                                <option>DPWH referral</option>
                                <option>On-site enforcement</option>
                                <option>Emergency repair coordination</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="res-equipment">Equipment Used</label>
                            <input id="res-equipment" class="form-input" placeholder="e.g. Traffic cones, flares…" />
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="res-desc">Resolution Description *</label>
                        <textarea id="res-desc" class="form-input" rows="4" placeholder="Describe the actions taken to resolve the incident…"></textarea>
                    </div>

                    <div class="form-group">
                        <label for="res-followup">Follow-Up Recommendations</label>
                        <textarea id="res-followup" class="form-input" rows="2" placeholder="Any recommendations for DPWH, LTO, or further action…"></textarea>
                    </div>

                    <div class="btn-row">
                        <button class="btn-secondary" onclick="saveDraft()">Save Draft</button>
                        <button class="btn-success" onclick="submitResolution()">Submit Resolution Report ✓</button>
                    </div>
                </div>
            </div>`;

            try {
                const draft = getAssignmentDraft(assignment.assignment_id) || JSON.parse(localStorage.getItem(`field_draft_${assignment.assignment_id}`) || 'null');
                if (draft) {
                    if (draft.method) document.getElementById('res-method').value = draft.method;
                    if (draft.equipment) document.getElementById('res-equipment').value = draft.equipment;
                    if (draft.desc) document.getElementById('res-desc').value = draft.desc;
                    if (draft.followup) document.getElementById('res-followup').value = draft.followup;
                    evidenceUploads.before = draft.before || null;
                    evidenceUploads.after = draft.after || null;
                    const beforeStatus = document.getElementById('evidence-before-status');
                    const afterStatus = document.getElementById('evidence-after-status');
                    if (beforeStatus && evidenceUploads.before) beforeStatus.textContent = 'Uploaded from draft';
                    if (afterStatus && evidenceUploads.after) afterStatus.textContent = 'Uploaded from draft';
                }
            } catch (error) {
                console.warn('Unable to load draft:', error.message);
            }

        bindDraftAutoSave();

        startJobCountdown(assignment.deadline);
        initActiveJobMap(assignment);
        startLiveTracking(checkedIn ? 'busy' : 'available');
}

function initActiveJobMap(assignment) {
    const mapEl = document.getElementById('active-job-map');
    if (!mapEl || typeof L === 'undefined') return;

    const lat = Number.parseFloat(assignment.lat);
    const lng = Number.parseFloat(assignment.lng);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
    const target = hasCoords ? [lat, lng] : [14.6760, 121.0437];

    activeJobMap = L.map('active-job-map', {zoomControl: false, scrollWheelZoom: false}).setView(target, hasCoords ? 16 : 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
    }).addTo(activeJobMap);

    if (hasCoords) {
        const incidentPopup = `
            <div style="font-weight:700">${safeText(assignment.id || 'Incident')}</div>
            <div style="font-size:12px;margin-top:4px">${safeText(assignment.cat || '')} · ${safeText(assignment.brgy || '')}</div>
            <div style="font-size:12px;margin-top:6px;line-height:1.45">${safeText(assignment.desc || 'No description')}</div>
        `;
        activeJobIncidentMarker = L.marker(target)
            .addTo(activeJobMap)
            .bindPopup(incidentPopup)
            .bindTooltip('Incident location', {permanent: true, direction: 'top', offset: [0, -18], className: 'incident-pin-label'})
            .openPopup();
        const label = document.getElementById('active-job-map-label');
        if (label) label.textContent = `Incident: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }

    centerActiveJobMapToGps();
}

function centerActiveJobMapToGps() {
    if (!activeJobMap) {
        showToast('Map is not ready yet.');
        return;
    }

    const label = document.getElementById('active-job-map-label');
    if (label) label.textContent = 'Detecting your GPS location...';

    getCurrentPositionPromise().then(pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const point = [lat, lng];

        if (activeJobOfficerMarker) {
            activeJobOfficerMarker.setLatLng(point);
        } else {
            activeJobOfficerMarker = L.marker(point).addTo(activeJobMap).bindPopup('Field officer pinned location');
        }
        activeJobMap.setView(point, 16);

        if (label) label.textContent = `Pinned: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        showToast('Your location has been pinned on the map.');
    }).catch(error => {
        if (label) label.textContent = 'GPS unavailable on this origin. Use localhost/https.';
        showToast('Unable to fetch GPS location: ' + (error.message || 'Permission denied.'));
    });
}

function startJobCountdown(deadline) {
    if (fieldCountdownInterval) clearInterval(fieldCountdownInterval);
    const el = document.getElementById('job-countdown');
    const ftaEl = document.getElementById('job-fta-alert');
    if (!el) return;

    const active = getActiveAssignment();
    const useDeadline = deadline || active?.deadline || null;
    const parsedDeadline = useDeadline ? new Date(useDeadline).getTime() : NaN;
    const target = Number.isFinite(parsedDeadline) ? parsedDeadline : Date.now() + 18 * 60 * 1000 + 42000;

    fieldCountdownInterval = setInterval(() => {
        const now = Date.now();
        let diff = Math.floor((target - now) / 1000);
        if (diff <= 0) {
            el.textContent = 'OVERDUE';
            el.classList.add('urgent');
            if (ftaEl) ftaEl.classList.remove('hidden');
            clearInterval(fieldCountdownInterval);
            return;
        }
        el.textContent = fmtTime(diff);
        if (ftaEl) ftaEl.classList.toggle('hidden', diff >= 300);
    }, 1000);
}

async function attemptCheckin() {
    const assignment = getActiveAssignment();
    if (!assignment) {
        showToast('No active assignment available for check-in.');
        return;
    }

    getCurrentPositionPromise().then(async position => {
        try {
            await apiFetch('field.php', {
                action: 'checkin',
                assignment_id: assignment.assignment_id,
                lat: position.coords.latitude,
                lng: position.coords.longitude,
            }, 'POST');
            showToast('✓ Geofence check-in confirmed.');
            await updateAssignmentStatus(assignment.assignment_id, 'en_route');
        } catch (error) {
            showToast(error.message);
        }
    }).catch(error => {
        showToast('GPS error: ' + (error.message || 'Unable to fetch your location.'));
    });
}

async function simulateArrival() {
    const assignment = getActiveAssignment();
    if (!assignment) {
        showToast('No active assignment available.');
        return;
    }

    try {
        await apiFetch('field.php', {action: 'checkin', assignment_id: assignment.assignment_id, simulate: 1}, 'POST');
        showToast('✓ Geofence check-in simulated.');
        await updateAssignmentStatus(assignment.assignment_id, 'in_progress');
    } catch (error) {
        showToast(error.message);
    }
}

async function submitResolution() {
    const assignment = getActiveAssignment();
    if (!assignment) {
        showToast('No active assignment available to submit.');
        return;
    }
    const method = document.getElementById('res-method')?.value || '';
    const desc = document.getElementById('res-desc')?.value.trim() || '';
    const equipment = document.getElementById('res-equipment')?.value.trim() || '';
    const followup = document.getElementById('res-followup')?.value.trim() || '';

    if (!method || !desc) {
        showToast('Please select a resolution method and provide a description.');
        return;
    }

    try {
        await apiFetch('field.php', {
            action: 'submitResolution',
            assignment_id: assignment.assignment_id,
            method,
            description: desc,
            equipment,
            followup,
            before_photo_url: evidenceUploads.before || '',
            after_photo_url: evidenceUploads.after || '',
        }, 'POST');
        showToast('✓ Resolution report submitted.');
        clearAssignmentDraft(assignment.assignment_id);
        activeAssignmentId = null;
        evidenceUploads = {before: null, after: null};
        await updateAssignmentStatus(assignment.assignment_id, 'resolved');
        setActivePage('history');
    } catch (error) {
        showToast(error.message);
    }
}

function chooseEvidence(stage) {
    const input = document.getElementById(`evidence-${stage}-input`);
    if (input) input.click();
}

async function handleEvidenceSelected(stage, inputEl) {
    const file = inputEl?.files?.[0];
    if (!file) return;

    const statusEl = document.getElementById(`evidence-${stage}-status`);
    if (statusEl) statusEl.textContent = 'Uploading...';

    try {
        const formData = new FormData();
        formData.append('file', file);
        const resp = await apiFetch('media.php?action=upload_evidence', formData, 'POST');
        evidenceUploads[stage] = resp.url || '';
        if (statusEl) statusEl.textContent = `Uploaded: ${file.name}`;
        showToast(`${stage === 'before' ? 'Before' : 'After'} evidence uploaded.`);
    } catch (error) {
        if (statusEl) statusEl.textContent = 'Upload failed';
        showToast(error.message || 'Evidence upload failed.');
    }
}

function saveDraft() {
    const assignment = getActiveAssignment();
    if (!assignment) {
        showToast('No active assignment to save.');
        return;
    }

    const payload = {
        method: document.getElementById('res-method')?.value || '',
        equipment: document.getElementById('res-equipment')?.value || '',
        desc: document.getElementById('res-desc')?.value || '',
        followup: document.getElementById('res-followup')?.value || '',
        before: evidenceUploads.before || '',
        after: evidenceUploads.after || '',
    };

    persistAssignmentDraft(assignment.assignment_id, payload);
    showToast('Draft saved for this assignment.');
    renderDrafts();
    setActivePage('drafts');
}

function autoSaveDraft() {
    const assignment = getActiveAssignment();
    if (!assignment) return;

    if (draftAutosaveTimer) clearTimeout(draftAutosaveTimer);
    draftAutosaveTimer = setTimeout(() => {
        const payload = {
            method: document.getElementById('res-method')?.value || '',
            equipment: document.getElementById('res-equipment')?.value || '',
            desc: document.getElementById('res-desc')?.value || '',
            followup: document.getElementById('res-followup')?.value || '',
            before: evidenceUploads.before || '',
            after: evidenceUploads.after || '',
        };
        persistAssignmentDraft(assignment.assignment_id, payload);
    }, 300);
}

function bindDraftAutoSave() {
    ['res-method', 'res-equipment', 'res-desc', 'res-followup'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', autoSaveDraft);
        el.addEventListener('change', autoSaveDraft);
    });
}

function startLiveTracking(status = '') {
    stopLiveTracking();
    const push = () => {
        getCurrentPositionPromise().then(async position => {
            try {
                await apiFetch('field.php', {
                    action: 'updateGps',
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    status,
                }, 'POST');
            } catch (error) {
                console.warn('Live GPS update failed:', error.message);
            }
        }).catch(() => {
            /* silently ignore live GPS errors to avoid noisy UI */
        });
    };

    push();
    gpsTrackInterval = setInterval(push, 15000);
}

function stopLiveTracking() {
    if (gpsTrackInterval) {
        clearInterval(gpsTrackInterval);
        gpsTrackInterval = null;
    }
}

const baseFieldSetActivePage = window.setActivePage;
window.setActivePage = function(pageId) {
    if (typeof baseFieldSetActivePage === 'function') {
        baseFieldSetActivePage(pageId);
    }

    if (pageId === 'assigned') renderAssigned();
    if (pageId === 'job') {
        renderActiveJob();
    } else {
        stopLiveTracking();
    }
    if (pageId === 'history') renderHistory();
    if (pageId === 'performance') renderPerformance();
        if (pageId === 'drafts') renderDrafts();
};

function renderDrafts() {
        const container = document.getElementById('drafts-list');
        if (!container) return;

        const store = getDraftStore();
        const rows = Object.entries(store)
                .map(([assignmentId, draft]) => {
                        const assignment = ASSIGNMENTS.find(item => String(item.assignment_id) === String(assignmentId));
                        const title = assignment?.id || `Assignment #${assignmentId}`;
                        const cat = assignment?.cat || 'Unassigned category';
                        const savedAt = draft?.saved_at ? formatDateTime(draft.saved_at) : 'Unknown time';
                        return {assignmentId, draft, title, cat, savedAt};
                })
                .sort((a, b) => new Date(b.draft?.saved_at || 0) - new Date(a.draft?.saved_at || 0));

        if (!rows.length) {
                container.innerHTML = `<div class="empty-state"><div class="empty-icon">🧾</div><div class="empty-title">No saved drafts</div><div class="empty-sub">Saved resolution drafts will appear here.</div></div>`;
                return;
        }

        container.innerHTML = rows.map(row => `
            <div class="draft-card">
                <div>
                    <div class="track-id">${safeText(row.title)}</div>
                    <div class="draft-sub">${safeText(row.cat)} · Last saved: ${safeText(row.savedAt)}</div>
                </div>
                <div class="draft-actions">
                    <button class="btn-primary btn-sm" onclick="openDraftByAssignment('${safeText(row.assignmentId)}')">Open Draft</button>
                    <button class="btn-secondary btn-sm" onclick="deleteDraftByAssignment('${safeText(row.assignmentId)}')">Delete</button>
                </div>
            </div>
        `).join('');
}

function openDraftByAssignment(assignmentId) {
        activeAssignmentId = assignmentId;
        renderActiveJob();
        setActivePage('job');
}

function deleteDraftByAssignment(assignmentId) {
        clearAssignmentDraft(assignmentId);
        renderDrafts();
        showToast('Draft deleted.');
}

function renderHistory() {
    const search = (document.getElementById('history-search')?.value || '').toLowerCase();
    const closed = HISTORY_ITEMS.filter(c => !search || c.id.toLowerCase().includes(search) || c.cat.toLowerCase().includes(search));
    const tbody = document.getElementById('history-tbody');
    if (!tbody) return;

    if (!closed.length) {
        tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">No history found</div></div></td></tr>`;
        return;
    }

        tbody.innerHTML = closed.map(c => {
            const rawRating = Number.parseInt(c.rating, 10);
            const stars = Number.isFinite(rawRating) && rawRating > 0 ? Math.max(1, Math.min(5, rawRating)) : 0;
            const ratingHtml = stars > 0
                ? `${'<span class="rating-filled">★</span>'.repeat(stars)}${'<span class="rating-empty">★</span>'.repeat(5 - stars)}`
                : '—';

            return `
      <tr>
        <td class="track-id">${safeText(c.id)}</td>
        <td>${safeText(c.cat)}</td>
        <td>${safeText(c.brgy)}</td>
        <td>${priorityBadge(c.priority)}</td>
        <td>${statusBadge(c.status)}</td>
        <td class="mono" style="font-size:12px">${formatDateTime(c.date)}</td>
                <td class="rating-stars" style="white-space:nowrap">${ratingHtml}</td>
            </tr>`;
        }).join('');
}

function renderPerformance() {
    const onTime = Number(PERFORMANCE_DATA.on_time_rate || 0);
    const closure = Number(PERFORMANCE_DATA.closure_rate || 0);
    const satisfaction = Number(PERFORMANCE_DATA.satisfaction || 0);

    const efficiencyEl = document.getElementById('perf-efficiency');
    const totalResolvedEl = document.getElementById('perf-total-resolved');
    const onTimeEl = document.getElementById('perf-on-time');
    const satisfactionEl = document.getElementById('perf-satisfaction');
    if (efficiencyEl) efficiencyEl.textContent = `${computeEfficiencyScore()}%`;
    if (totalResolvedEl) totalResolvedEl.textContent = `${PERFORMANCE_DATA.resolved || 0}`;
    if (onTimeEl) onTimeEl.textContent = `${Math.round(onTime)}%`;
    if (satisfactionEl) satisfactionEl.textContent = `${satisfaction.toFixed(1)}`;

    const metricsEl = document.getElementById('perf-metrics-list');
    if (metricsEl) {
        const metrics = [
                        ['Total Assignments', `${PERFORMANCE_DATA.total_assignments || 0}`],
                        ['Resolved Cases', `${PERFORMANCE_DATA.resolved || 0}`],
                        ['Resolved This Month', `${PERFORMANCE_DATA.resolved_this_month || 0}`],
                        ['Active Cases', `${PERFORMANCE_DATA.active || 0}`],
                        ['Avg. Arrival Time', `${PERFORMANCE_DATA.avg_response_mins || 0} min`],
                        ['Fastest Arrival', `${PERFORMANCE_DATA.fastest_mins || 0} min`],
                        ['Slowest Arrival', `${PERFORMANCE_DATA.slowest_mins || 0} min`],
        ];
        metricsEl.innerHTML = metrics.map(([l, v]) => `
          <div class="metric-row"><span class="metric-label">${safeText(l)}</span><span class="metric-val">${safeText(v)}</span></div>`).join('');
    }

    const kpiEl = document.getElementById('perf-kpi-bars');
    if (kpiEl) {
        const kpis = [
            ['On-Time Arrival Rate', PERFORMANCE_DATA.on_time_rate || 0],
            ['Case Closure Rate', PERFORMANCE_DATA.closure_rate || 0],
            ['User Satisfaction (x20)', (PERFORMANCE_DATA.satisfaction || 0) * 20],
        ];
        kpiEl.innerHTML = kpis.map(([l, v]) => perfBar(l, v)).join('');
    }

    const ratingsEl = document.getElementById('perf-ratings');
    if (ratingsEl) {
        const reviews = PERFORMANCE_DATA.recent_ratings || [];
        if (!reviews.length) {
            ratingsEl.innerHTML = `<div class="empty-state"><div class="empty-icon">⭐</div><div class="empty-title">No ratings yet</div><div class="empty-sub">User ratings will appear here once cases are rated.</div></div>`;
            return;
        }

        ratingsEl.innerHTML = reviews.map(r => {
          const stars = Math.max(1, Math.min(5, Number.parseInt(r.score, 10) || 0));
          return `
          <div class="rating-card">
                        <div class="rating-stars">${'<span class="rating-filled">★</span>'.repeat(stars)}${'<span class="rating-empty">★</span>'.repeat(5 - stars)}</div>
            <div class="rating-quote">"${safeText(r.comments || 'No comment provided.')}"</div>
            <div class="rating-meta">${formatDateTime(r.submitted_at)} · ${safeText(r.id)}</div>
          </div>`;
                }).join('');
    }
}

function openDispatchChat() {
    const assignment = getActiveAssignment();
    if (!assignment || !assignment.dispatch_id) {
        showToast('Dispatch chat is available once the case is assigned by dispatch.');
        return;
    }

    activeChat = {receiverRole: 'dispatch', receiverId: String(assignment.dispatch_id), name: 'Dispatch Officer'};
    chatLastId = 0;
    loadChatThread();
    startChatPolling();

    openModal(`
      <div class="modal-overlay" onclick="if(event.target===this){ closeModal(); stopChatPolling(); }">
                <div class="modal" style="max-width:560px;min-height:560px;padding:0;overflow:hidden">
          <div class="modal-head">
            <div>
                            <div class="modal-title">Dispatch Messenger</div>
                            <div class="modal-subtitle">Live coordination channel</div>
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
        const sentByMe = msg.senderRole === 'field';
        return `<div class="chat-row ${sentByMe ? 'mine' : 'theirs'}"><div class="chat-bubble ${sentByMe ? 'chat-sent' : 'chat-received'}"><div>${safeText(msg.message)}</div><div class="chat-meta">${formatDateTime(msg.sentAt)}</div></div></div>`;
    }).join('');
    body.scrollTop = body.scrollHeight;
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    if (!input || !activeChat) return;
    const message = input.value.trim();
    if (!message) return;
    try {
        await apiFetch('messages.php', {action: 'send', receiver_role: activeChat.receiverRole, receiver_id: activeChat.receiverId, message}, 'POST');
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
                               showNotification('New message from ' + (activeChat.name || 'Dispatch'), 'You have a new message');
                await loadChatThread();
            }
        } catch (error) {
            console.warn(error.message);
        }
    }, 3000);
}

function stopChatPolling() {
    if (chatInterval) {
        clearInterval(chatInterval);
        chatInterval = null;
    }
}

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

function showCaseDetailsMap(caseId) {
    const caseData = ASSIGNMENTS.find(c => c.id === caseId);
    if (!caseData) {
        showToast('Case not found.');
        return;
    }
    
        const lat = Number.parseFloat(caseData.lat);
        const lng = Number.parseFloat(caseData.lng);
        const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
        const coordText = hasCoords ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'Coordinates unavailable';
    
        openModal(`
            <div class="modal-overlay" onclick="if(event.target===this){ closeModal(); if(detailsMapInstance) detailsMapInstance.remove(); detailsMapInstance=null; }">
                <div class="modal" style="max-width:620px;max-height:85vh;overflow-y:auto">
                    <div class="modal-head">
                        <div>
                            <div class="modal-title">${safeText(caseData.id)}</div>
                            <div class="modal-subtitle">${safeText(caseData.cat)}</div>
                        </div>
                        <button class="modal-close" onclick="closeModal(); if(detailsMapInstance) detailsMapInstance.remove(); detailsMapInstance=null;">✕</button>
                    </div>
                    <div style="padding:20px;display:flex;flex-direction:column;gap:16px">
                        <div style="display:flex;gap:8px;flex-wrap:wrap">
                            ${statusBadge(caseData.status)}
                            ${priorityBadge(caseData.priority)}
                        </div>
                    
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px">
                            <div><div style="color:var(--mist);text-transform:uppercase;font-size:11px;letter-spacing:0.05em;margin-bottom:4px">Barangay</div><div style="font-weight:500">${safeText(caseData.brgy)}</div></div>
                            <div><div style="color:var(--mist);text-transform:uppercase;font-size:11px;letter-spacing:0.05em;margin-bottom:4px">Priority</div><div style="font-weight:500">${safeText(caseData.priority)}</div></div>
                            <div><div style="color:var(--mist);text-transform:uppercase;font-size:11px;letter-spacing:0.05em;margin-bottom:4px">Reported</div><div style="font-weight:500">${formatDateTime(caseData.date)}</div></div>
                            <div><div style="color:var(--mist);text-transform:uppercase;font-size:11px;letter-spacing:0.05em;margin-bottom:4px">Status</div><div style="font-weight:500;text-transform:capitalize">${safeText(caseData.status)}</div></div>
                        </div>
                    
                        <div>
                            <div style="color:var(--mist);text-transform:uppercase;font-size:11px;letter-spacing:0.05em;margin-bottom:8px;font-weight:600">Description</div>
                            <div style="font-size:13px;line-height:1.6;color:var(--ink-dim)">${safeText(caseData.desc)}</div>
                        </div>
                    
                        <div style="height:280px;border-radius:8px;border:1px solid var(--border);overflow:hidden;position:relative">
                            <div id="details-case-map" style="height:100%"></div>
                        </div>
                    
                        <div style="padding:12px;background:var(--surface);border-radius:6px;border:1px solid var(--border)">
                            <div style="font-size:11px;color:var(--mist);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Coordinates</div>
                            <div class="mono" style="font-size:13px;font-weight:500">${safeText(coordText)}</div>
                        </div>
                    
                        <button class="btn-secondary" onclick="closeModal(); if(detailsMapInstance) detailsMapInstance.remove(); detailsMapInstance=null;">Close</button>
                    </div>
                </div>
            </div>
        `);
    
    setTimeout(() => {
        if (typeof L !== 'undefined' && hasCoords) {
            const mapEl = document.getElementById('details-case-map');
            if (mapEl) {
                if (detailsMapInstance) {
                    detailsMapInstance.remove();
                    detailsMapMarker = null;
                }

                detailsMapInstance = L.map('details-case-map', {zoomControl: true, scrollWheelZoom: false}).setView([lat, lng], 16);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                    maxZoom: 19,
                }).addTo(detailsMapInstance);

                detailsMapMarker = L.marker([lat, lng]).addTo(detailsMapInstance).bindPopup(`<div style="font-weight:500">${safeText(caseData.cat)}</div><div style="font-size:12px">${safeText(caseData.id)}</div>`).openPopup();
                detailsMapInstance.invalidateSize();
            }
        }
    }, 200);
}
