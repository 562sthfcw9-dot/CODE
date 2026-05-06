/* ============================================================
   TRAPICO — Field Officer Logic
   Handles: dashboard, assigned cases, active job, history, performance
   ============================================================ */

'use strict';

/* ── STATE ─────────────────────────────────────────────────── */
let notifOpen        = false;
let countdownInterval = null;
let dashInterval      = null;
let checkedIn        = false;
let jobSecs          = 18 * 60 + 42;

/* ── INIT ──────────────────────────────────────────────────── */
(function init() {
  renderDashboard();
  renderHistory();
  renderPerformance();
  startDashCountdown();
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

/* ── HELPERS ───────────────────────────────────────────────── */
function fmtTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function myAssigned() {
  return COMPLAINTS.filter(c => ['assigned','in_progress'].includes(c.status));
}

/* ── DASHBOARD ─────────────────────────────────────────────── */
function renderDashboard() {
  const assigned = myAssigned();

  document.getElementById('stat-assigned').textContent = assigned.length;
  document.getElementById('stat-inprog').textContent   = COMPLAINTS.filter(c => c.status === 'in_progress').length;
  document.getElementById('badge-assigned').textContent = assigned.length;

  const allTasks = assigned.concat(COMPLAINTS.filter(c => c.status === 'submitted').slice(0, 1));
  const taskList = document.getElementById('dash-task-list');

  taskList.innerHTML = allTasks.map((c, i) => `
    <div class="task-card${i === 0 ? ' priority-top' : ''}">
      <div class="task-num">${i + 1}</div>
      <div class="task-body">
        <div class="task-id">${c.id}</div>
        <div class="task-cat">${c.cat}</div>
        <div class="task-meta">📍 Brgy. ${c.brgy} · ${c.date}</div>
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
          ${statusBadge(c.status)} ${priorityBadge(c.priority)}
        </div>
      </div>
      <div class="task-actions">
        <button class="btn-primary btn-sm" onclick="setActivePage('job')">Start Job</button>
        <button class="btn-secondary btn-sm" onclick="showTimeline('${c.id}')">Details</button>
      </div>
    </div>`).join('');
}

/* Dashboard countdown (mirrors the job countdown) */
function startDashCountdown() {
  if (dashInterval) clearInterval(dashInterval);
  let s = jobSecs;
  const el = document.getElementById('dash-countdown');
  if (!el) return;

  dashInterval = setInterval(() => {
    if (!document.contains(el)) { clearInterval(dashInterval); return; }
    el.textContent = fmtTime(s);
    if (s <= 0) {
      el.textContent = 'OVERDUE';
      el.style.color = 'var(--accent)';
      clearInterval(dashInterval);
      return;
    }
    s--;
  }, 1000);
}

/* ── ASSIGNED CASES ────────────────────────────────────────── */
function renderAssigned() {
  const list    = myAssigned().concat(COMPLAINTS.filter(c => c.status === 'submitted').slice(0, 1));
  const el      = document.getElementById('assigned-list');

  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><div class="empty-title">No assigned cases</div><div class="empty-sub">You have no active assignments. Stand by.</div></div>`;
    return;
  }

  el.innerHTML = list.map(c => `
    <div class="assigned-card">
      <div class="assigned-card-header">
        <div>
          <div class="assigned-card-title">
            <span class="track-id">${c.id}</span>
            ${statusBadge(c.status)}
            ${priorityBadge(c.priority)}
          </div>
          <div class="assigned-card-name">${c.cat} · Barangay ${c.brgy}</div>
        </div>
        <button class="btn-primary btn-sm" onclick="setActivePage('job')">▶ Start Job</button>
      </div>
      <div class="assigned-card-body">
        <div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--mist);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Description</div>
          <div style="font-size:13px;line-height:1.6">${c.desc}</div>
          <div style="margin-top:14px;display:flex;flex-direction:column;gap:4px">
            <div class="assigned-meta-row"><span class="assigned-meta-label">Date/Time</span><span class="assigned-meta-val">${c.date}</span></div>
            <div class="assigned-meta-row"><span class="assigned-meta-label">Priority</span><span class="assigned-meta-val">${c.priority}</span></div>
            <div class="assigned-meta-row"><span class="assigned-meta-label">Reporter</span><span class="assigned-meta-val">${c.anon ? 'Anonymous' : c.user}</span></div>
          </div>
        </div>
        <div>
          <div class="map-placeholder" style="height:150px">
            <div class="map-icon">🗺️</div>
            <div class="map-label">Navigate to site</div>
          </div>
          <div style="margin-top:8px;padding:8px 12px;background:var(--surface);border:1px solid var(--border);font-size:12px;display:flex;align-items:center;gap:6px">
            <span>📍</span>
            <span class="mono">${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}</span>
          </div>
        </div>
      </div>
    </div>`).join('');
}

/* ── ACTIVE JOB — COUNTDOWN ────────────────────────────────── */
function startJobCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);

  const el      = document.getElementById('job-countdown');
  const ftaEl   = document.getElementById('job-fta-alert');

  const tick = () => {
    if (!el || !document.contains(el)) { clearInterval(countdownInterval); return; }
    el.textContent = fmtTime(jobSecs);
    el.classList.toggle('urgent', jobSecs < 300);
    if (ftaEl) ftaEl.classList.toggle('hidden', jobSecs >= 300);
    if (jobSecs <= 0) {
      el.textContent = 'OVERDUE';
      el.classList.add('urgent');
      clearInterval(countdownInterval);
      showToast('⚠ Failure-to-Arrive alert sent to Dispatch.');
      return;
    }
    jobSecs--;
  };
  tick();
  countdownInterval = setInterval(tick, 1000);
}

/* ── GPS CHECK-IN ──────────────────────────────────────────── */
function attemptCheckin() {
  const statusEl = document.getElementById('checkin-status');
  statusEl.className = 'checkin-status err';
  statusEl.textContent = '⚠ You are 0.3 km from the incident site. Please travel closer (within 150m).';
}

function simulateArrival() {
  const statusEl   = document.getElementById('checkin-status');
  const checkinBtn = document.getElementById('btn-checkin');
  const simBtn     = document.getElementById('btn-simulate');

  checkedIn = true;
  statusEl.className  = 'checkin-status ok';
  statusEl.textContent = '✓ GPS confirmed — you are within 150m of the incident site. Check-in successful!';

  if (checkinBtn) { checkinBtn.disabled = true; checkinBtn.style.opacity = '0.4'; }
  if (simBtn)     { simBtn.disabled     = true; simBtn.style.opacity     = '0.4'; }

  showToast('Geofence check-in confirmed. Complaint status updated to In Progress.');
}

/* ── RESOLUTION SUBMIT ─────────────────────────────────────── */
function saveDraft() {
  showToast('Draft saved. You can resume this report later.');
}

function submitResolution() {
  const method = document.getElementById('res-method')?.value;
  const desc   = document.getElementById('res-desc')?.value.trim();

  if (!method) { showToast('Please select a resolution method.'); return; }
  if (!desc)   { showToast('Please provide a resolution description.'); return; }

  if (countdownInterval) clearInterval(countdownInterval);
  if (dashInterval)      clearInterval(dashInterval);

  showToast('✓ Resolution report submitted. Awaiting Dispatch Officer review.');
  setActivePage('history');
}

/* ── CASE HISTORY ──────────────────────────────────────────── */
function renderHistory() {
  const search  = (document.getElementById('history-search')?.value || '').toLowerCase();
  const closed  = COMPLAINTS.filter(c => ['resolved','closed','cancelled'].includes(c.status))
    .filter(c => !search || c.id.toLowerCase().includes(search) || c.cat.toLowerCase().includes(search));

  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;

  if (!closed.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">No history found</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = closed.map(c => `
    <tr>
      <td class="track-id">${c.id}</td>
      <td>${c.cat}</td>
      <td>${c.brgy}</td>
      <td>${priorityBadge(c.priority)}</td>
      <td>${statusBadge(c.status)}</td>
      <td class="mono" style="font-size:12px">${c.date}</td>
      <td class="rating-stars" style="white-space:nowrap">
        <span class="rating-filled">★★★★</span><span class="rating-empty">★</span>
      </td>
    </tr>`).join('');
}

/* ── PERFORMANCE ───────────────────────────────────────────── */
function renderPerformance() {
  /* Metrics */
  const metricsEl = document.getElementById('perf-metrics-list');
  if (metricsEl) {
    const metrics = [
      ['Avg. Response Time',          '22 min'],
      ['Fastest Resolution',           '8 min'],
      ['Slowest Resolution',          '47 min'],
      ['Cases This Month',                 '14'],
      ['Duplicate Detections Avoided',      '3'],
      ['Follow-Up Recommendations',         '5'],
    ];
    metricsEl.innerHTML = metrics.map(([l,v]) => `
      <div class="metric-row">
        <span class="metric-label">${l}</span>
        <span class="metric-val">${v}</span>
      </div>`).join('');
  }

  /* KPI bars */
  const kpiEl = document.getElementById('perf-kpi-bars');
  if (kpiEl) {
    const kpis = [
      ['On-Time Arrival Rate', 94],
      ['User Satisfaction',    86],
      ['Documentation Quality',88],
      ['Case Closure Rate',    92],
      ['Response Efficiency',  90],
    ];
    kpiEl.innerHTML = kpis.map(([l,v]) => perfBar(l, v)).join('');
  }

  /* Ratings */
  const ratingsEl = document.getElementById('perf-ratings');
  if (ratingsEl) {
    const reviews = [
      { text:'Great response time, very professional.',                 stars:5, date:'2026-03-22', id:'000008' },
      { text:'Fixed the issue quickly, thank you!',                     stars:4, date:'2026-03-23', id:'000009' },
      { text:'Officer arrived promptly and cleared the obstruction.',   stars:5, date:'2026-03-23', id:'000010' },
      { text:'Excellent service, complaint resolved within the hour.',  stars:4, date:'2026-03-24', id:'000011' },
    ];
    ratingsEl.innerHTML = reviews.map(r => `
      <div class="rating-card">
        <div class="rating-stars">
          ${'<span class="rating-filled">★</span>'.repeat(r.stars)}
          ${'<span class="rating-empty">★</span>'.repeat(5 - r.stars)}
        </div>
        <div class="rating-quote">"${r.text}"</div>
        <div class="rating-meta">Anonymous · ${r.date} · TRAPICO-2026-03-${r.id}</div>
      </div>`).join('');
  }
}

/* ── PAGE CHANGE HOOK ──────────────────────────────────────── */
const __base_setActivePage = typeof setActivePage === 'function' ? setActivePage : null;
function setActivePage(pageId) {
  if (__base_setActivePage) {
    __base_setActivePage(pageId);
  } else {
    console.warn('Base setActivePage not found; fallback route:', pageId);
    navigateToPage(pageId);
  }

  if (pageId === 'job') {
    checkedIn = false;
    startJobCountdown();
    /* Reset check-in panel state */
    const statusEl   = document.getElementById('checkin-status');
    const checkinBtn = document.getElementById('btn-checkin');
    const simBtn     = document.getElementById('btn-simulate');
    if (statusEl)   { statusEl.className = 'checkin-status'; statusEl.textContent = ''; }
    if (checkinBtn) { checkinBtn.disabled = false; checkinBtn.style.opacity = '1'; }
    if (simBtn)     { simBtn.disabled     = false; simBtn.style.opacity     = '1'; }
  }
  if (pageId === 'assigned')    renderAssigned();
  if (pageId === 'history')     renderHistory();
  if (pageId === 'performance') renderPerformance();
}