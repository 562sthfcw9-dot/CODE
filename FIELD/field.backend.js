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
let activeChat = null;
let chatLastId = 0;
let chatInterval = null;

window.addEventListener('DOMContentLoaded', initField);

async function initField() {
    const user = await requireLoginRedirect();
    if (!user) return;
    FIELD_USER = user;

    await Promise.all([loadAssignedTasks(), loadHistory(), loadPerformance()]);
    renderDashboard();
    renderAssigned();
    renderHistory();
    renderPerformance();
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

function renderDashboard() {
    const assignedCount = ASSIGNMENTS.length;
    const inProgressCount = ASSIGNMENTS.filter(a => a.assignment_status === 'in_progress').length;

    document.getElementById('stat-assigned').textContent = assignedCount;
    document.getElementById('stat-inprog').textContent = inProgressCount;
    document.getElementById('badge-assigned').textContent = assignedCount;

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
          <button class="btn-primary btn-sm" onclick="setActivePage('job')">Start Job</button>
          <button class="btn-secondary btn-sm" onclick="showTimeline('${safeText(c.id)}')">Details</button>
        </div>
      </div>`).join('');
}

function renderAssigned() {
    const list = myAssigned();
    const el = document.getElementById('assigned-list');
    if (!el) return;

    if (!list.length) {
        el.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">No assigned cases</div><div class="empty-sub">You have no active assignments. Stand by.</div></div>`;
        return;
    }

    el.innerHTML = list.map(c => `
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
          <button class="btn-primary btn-sm" onclick="setActivePage('job')">▶ Start Job</button>
        </div>
        <div class="assigned-card-body">
          <div>
            <div style="font-family:var(--font-mono);font-size:11px;color:var(--mist);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Description</div>
            <div style="font-size:13px;line-height:1.6">${safeText(c.desc)}</div>
            <div style="margin-top:14px;display:flex;flex-direction:column;gap:4px">
              <div class="assigned-meta-row"><span class="assigned-meta-label">Date/Time</span><span class="assigned-meta-val">${formatDateTime(c.date)}</span></div>
              <div class="assigned-meta-row"><span class="assigned-meta-label">Priority</span><span class="assigned-meta-val">${safeText(c.priority)}</span></div>
              <div class="assigned-meta-row"><span class="assigned-meta-label">Reporter</span><span class="assigned-meta-val">${c.anon ? 'Anonymous' : safeText(c.user || 'Citizen')}</span></div>
            </div>
          </div>
          <div>
            <div class="map-placeholder" style="height:150px">
              <div class="map-icon">🗺️</div>
              <div class="map-label">Navigate to site</div>
            </div>
            <div style="margin-top:8px;padding:8px 12px;background:var(--surface);border:1px solid var(--border);font-size:12px;display:flex;align-items:center;gap:6px">
              <span>📍</span>
              <span class="mono">${safeText(c.lat.toFixed(4) + ', ' + c.lng.toFixed(4))}</span>
            </div>
          </div>
        </div>
      </div>`).join('');
}

function startJobCountdown(deadline) {
    if (fieldCountdownInterval) clearInterval(fieldCountdownInterval);
    const el = document.getElementById('job-countdown');
    const ftaEl = document.getElementById('job-fta-alert');
    if (!el) return;

    const target = deadline ? new Date(deadline).getTime() : Date.now() + 18 * 60 * 1000 + 42000;

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
    const assignment = ASSIGNMENTS[0];
    if (!assignment) {
        showToast('No active assignment available for check-in.');
        return;
    }

    if (!navigator.geolocation) {
        showToast('Geolocation is not supported by your browser.');
        return;
    }

    navigator.geolocation.getCurrentPosition(async position => {
        try {
            await apiFetch('field.php', {
                action: 'checkin',
                assignment_id: assignment.assignment_id,
                lat: position.coords.latitude,
                lng: position.coords.longitude,
            }, 'POST');
            showToast('✓ Geofence check-in confirmed. Status updated to In Progress.');
            await loadAssignedTasks();
            renderDashboard();
            renderAssigned();
        } catch (error) {
            showToast(error.message);
        }
    }, error => {
        showToast('GPS error: ' + error.message);
    }, {enableHighAccuracy: true, timeout: 10000});
}

async function simulateArrival() {
    const assignment = ASSIGNMENTS[0];
    if (!assignment) {
        showToast('No active assignment available.');
        return;
    }

    try {
        await apiFetch('field.php', {action: 'checkin', assignment_id: assignment.assignment_id, simulate: 1}, 'POST');
        showToast('Geofence check-in simulated. Complaint status updated to In Progress.');
        await loadAssignedTasks();
        renderDashboard();
        renderAssigned();
    } catch (error) {
        showToast(error.message);
    }
}

async function submitResolution() {
    const assignment = ASSIGNMENTS[0];
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
        }, 'POST');
        showToast('✓ Resolution report submitted. Awaiting Dispatch Officer review.');
        await Promise.all([loadAssignedTasks(), loadHistory(), loadPerformance()]);
        renderDashboard();
        renderAssigned();
        renderHistory();
        renderPerformance();
    } catch (error) {
        showToast(error.message);
    }
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

    tbody.innerHTML = closed.map(c => `
      <tr>
        <td class="track-id">${safeText(c.id)}</td>
        <td>${safeText(c.cat)}</td>
        <td>${safeText(c.brgy)}</td>
        <td>${priorityBadge(c.priority)}</td>
        <td>${statusBadge(c.status)}</td>
        <td class="mono" style="font-size:12px">${formatDateTime(c.date)}</td>
        <td class="rating-stars" style="white-space:nowrap">★★★★<span class="rating-empty">★</span></td>
      </tr>`).join('');
}

function renderPerformance() {
    const metricsEl = document.getElementById('perf-metrics-list');
    if (metricsEl) {
        const metrics = [
            ['Avg. Response Time', '22 min'],
            ['Fastest Resolution', '8 min'],
            ['Slowest Resolution', '47 min'],
            ['Cases This Month', `${PERFORMANCE_DATA.resolved || 0}`],
            ['Duplicate Detections Avoided', '3'],
            ['Follow-Up Recommendations', '5'],
        ];
        metricsEl.innerHTML = metrics.map(([l, v]) => `
          <div class="metric-row"><span class="metric-label">${safeText(l)}</span><span class="metric-val">${safeText(v)}</span></div>`).join('');
    }

    const kpiEl = document.getElementById('perf-kpi-bars');
    if (kpiEl) {
        const kpis = [
            ['On-Time Arrival Rate', PERFORMANCE_DATA.on_time_rate || 0],
            ['User Satisfaction', PERFORMANCE_DATA.satisfaction || 0],
            ['Documentation Quality', 88],
            ['Case Closure Rate', 92],
            ['Response Efficiency', 90],
        ];
        kpiEl.innerHTML = kpis.map(([l, v]) => perfBar(l, v)).join('');
    }

    const ratingsEl = document.getElementById('perf-ratings');
    if (ratingsEl) {
        const reviews = [
            {text: 'Great response time, very professional.', stars: 5, date: '2026-03-22', id: '000008'},
            {text: 'Fixed the issue quickly, thank you!', stars: 4, date: '2026-03-23', id: '000009'},
            {text: 'Officer arrived promptly and cleared the obstruction.', stars: 5, date: '2026-03-23', id: '000010'},
            {text: 'Excellent service, complaint resolved within the hour.', stars: 4, date: '2026-03-24', id: '000011'},
        ];
        ratingsEl.innerHTML = reviews.map(r => `
          <div class="rating-card">
            <div class="rating-stars">${'<span class="rating-filled">★</span>'.repeat(r.stars)}${'<span class="rating-empty">★</span>'.repeat(5 - r.stars)}</div>
            <div class="rating-quote">"${safeText(r.text)}"</div>
            <div class="rating-meta">Anonymous · ${safeText(r.date)} · TRAPICO-2026-03-${safeText(r.id)}</div>
          </div>`).join('');
    }
}

function openDispatchChat() {
    activeChat = {receiverRole: 'dispatch', receiverId: '1', name: 'Dispatch Officer'};
    chatLastId = 0;
    loadChatThread();
    startChatPolling();

    openModal(`
      <div class="modal-overlay" onclick="if(event.target===this){ closeModal(); stopChatPolling(); }">
        <div class="modal" style="max-width:520px;min-height:520px">
          <div class="modal-head">
            <div>
              <div class="modal-title">Chat with Dispatch</div>
              <div class="modal-subtitle">Where dispatch and field coordinate</div>
            </div>
            <button class="modal-close" onclick="closeModal(); stopChatPolling();">✕</button>
          </div>
          <div class="modal-body" id="chat-body" style="min-height:320px;overflow:auto;padding:12px"></div>
          <div class="modal-footer" style="display:flex;gap:10px;align-items:center">
            <input id="chat-input" class="form-input" type="text" placeholder="Type a message…" style="flex:1" onkeydown="if(event.key==='Enter') sendChatMessage();" />
            <button class="btn-primary" onclick="sendChatMessage()">Send</button>
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
        return `<div class="chat-message ${sentByMe ? 'chat-sent' : 'chat-received'}"><div>${safeText(msg.message)}</div><div class="chat-meta">${formatDateTime(msg.sentAt)}</div></div>`;
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
                renderChatMessages(messages);
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
