/* ============================================================
   TRAPICO — Shared Mock Data & Utility Functions
   Used by: civilian.js, dispatch.js, field.js
   ============================================================ */

'use strict';

/* ── MOCK DATA ─────────────────────────────────────────────── */

const COMPLAINTS = [
  { id:'TRAPICO-2026-03-000016', cat:'Traffic Obstruction', brgy:'Commonwealth', priority:'urgent', status:'submitted',    date:'2026-03-24 10:42', user:'jdoe',    anon:true,  desc:'Large truck blocking the intersection at Commonwealth Ave. corner Don Fabian.',                          lat:14.6760, lng:121.0437 },
  { id:'TRAPICO-2026-03-000015', cat:'Illegal Parking',     brgy:'Batasan Hills', priority:'high',   status:'verified',    date:'2026-03-24 10:15', user:'rcruz',   anon:false, desc:'Multiple vehicles illegally parked along the service road near SM Fairview.',                           lat:14.6915, lng:121.0507, duplicate:true },
  { id:'TRAPICO-2026-03-000014', cat:'Road Damage',         brgy:'Central',       priority:'medium', status:'in_progress', date:'2026-03-24 09:30', user:'mjose',   anon:false, desc:'Large pothole near Timog Ave. causing traffic slowdown and vehicle damage risk.',                        lat:14.6390, lng:121.0100 },
  { id:'TRAPICO-2026-03-000013', cat:'Signal Malfunction',  brgy:'Sto. Cristo',   priority:'high',   status:'assigned',    date:'2026-03-24 08:55', user:'agarcia', anon:false, desc:'Traffic light at the intersection has been flashing red since 7am.',                                    lat:14.6280, lng:120.9872 },
  { id:'TRAPICO-2026-03-000012', cat:'Accident',            brgy:'Commonwealth',  priority:'urgent', status:'resolved',    date:'2026-03-24 07:20', user:'jdoe',    anon:false, desc:'Minor collision between a jeepney and motorcycle. Road partially blocked.',                             lat:14.6780, lng:121.0456 },
  { id:'TRAPICO-2026-03-000011', cat:'Traffic Violation',   brgy:'Batasan Hills', priority:'low',    status:'closed',      date:'2026-03-23 16:40', user:'jdoe',    anon:false, desc:'Motorcycles using the sidewalk as a shortcut near Batasan Hills National HS.',                          lat:14.6888, lng:121.0497 },
  { id:'TRAPICO-2026-03-000010', cat:'Road Damage',         brgy:'Commonwealth',  priority:'medium', status:'closed',      date:'2026-03-22 14:10', user:'jdoe',    anon:false, desc:'Cracked road surface near Philcoa causing vehicles to swerve.',                                         lat:14.6700, lng:121.0350 },
  { id:'TRAPICO-2026-03-000009', cat:'Illegal Parking',     brgy:'Central',       priority:'low',    status:'cancelled',   date:'2026-03-21 11:05', user:'jdoe',    anon:false, desc:'Reported in error.',                                                                                      lat:14.6390, lng:121.0100 },
];

const OFFICERS = [
  { id:'OFF-001', name:'Ofc. Ramon Reyes',     initials:'RR', brgy:'Commonwealth',  active:2, onTime:94, status:'available',   distance:'0.3 km' },
  { id:'OFF-002', name:'Ofc. Liza Mendoza',    initials:'LM', brgy:'Batasan Hills',  active:4, onTime:87, status:'available',   distance:'1.1 km' },
  { id:'OFF-003', name:'Ofc. Carlo Bautista',  initials:'CB', brgy:'Central',        active:5, onTime:91, status:'at capacity', distance:'2.4 km' },
  { id:'OFF-004', name:'Ofc. Diana Tolentino', initials:'DT', brgy:'Commonwealth',   active:1, onTime:98, status:'available',   distance:'0.7 km' },
];

const BARANGAYS = ['Commonwealth', 'Batasan Hills', 'Central', 'Sto. Cristo'];

const CATEGORIES = [
  'Illegal Parking', 'Traffic Obstruction', 'Road Damage',
  'Accident', 'Signal Malfunction', 'Traffic Violation',
];

const USERS = {
  jdoe:    { name:'Juan D. Oe',        role:'regular',  avatar:'JD', email:'jdoe@gmail.com',     phone:'+63 912 345 6789', brgy:'Commonwealth' },
  dispatch:{ name:'Cpt. Maria Reyes',  role:'dispatch', avatar:'MR', email:'mreyes@ttmd.gov.ph', phone:'+63 917 000 0001', brgy:'Commonwealth' },
  field:   { name:'Ofc. Ramon Reyes',  role:'field',    avatar:'RR', email:'rreyes@ttmd.gov.ph', phone:'+63 917 000 0002', brgy:'Commonwealth' },
};

/* ── TIMELINE STAGE BUILDER ────────────────────────────────── */
function buildTimeline(complaint) {
  const c = complaint;
  const done = (statuses) => statuses.includes(c.status);

  const stages = [
    { label:'Submitted',    time:'2026-03-24 10:42', done:true,                                                                     note:'Complaint received. Tracking ID generated.' },
    { label:'Verified',     time:'2026-03-24 10:55', done:done(['verified','assigned','in_progress','resolved','closed']),           note:'Dispatch Officer validated complaint details.' },
    { label:'Assigned',     time:'2026-03-24 11:02', done:done(['assigned','in_progress','resolved','closed']),                     note:'Assigned to Ofc. Ramon Reyes.' },
    { label:'En Route',     time:'2026-03-24 11:08', done:done(['in_progress','resolved','closed']),                                note:'Officer departed to incident site.' },
    { label:'In Progress',  time:'2026-03-24 11:20', done:done(['in_progress','resolved','closed']),                                note:'Officer checked in at incident site (GPS confirmed).' },
    { label:'Resolved',     time:'2026-03-24 11:45', done:done(['resolved','closed']),                                             note:'Resolution report submitted by officer.' },
    { label:'Validated',    time:'2026-03-24 12:00', done:c.status === 'closed',                                                   note:'Dispatch Officer confirmed resolution.' },
    { label:'Closed',       time:'—',                done:c.status === 'closed',                                                   note:'Case officially closed.' },
  ];

  if (c.status === 'rejected') {
    stages.splice(1, 7, { label:'Rejected', time:'2026-03-24 10:58', done:true, rejected:true, note:'Reason: Duplicate submission detected within 100m radius.' });
  }
  if (c.status === 'cancelled') {
    stages.splice(1, 7, { label:'Cancelled', time:'2026-03-24 11:05', done:true, cancelled:true, note:'Complaint cancelled by user.' });
  }
  return stages;
}

/* ── HTML HELPERS ──────────────────────────────────────────── */

function statusBadge(status) {
  const map = {
    submitted:'submitted', verified:'verified', assigned:'assigned',
    in_progress:'progress', resolved:'resolved', closed:'closed',
    rejected:'rejected', cancelled:'cancelled',
  };
  const lbl = {
    submitted:'Submitted', verified:'Verified', assigned:'Assigned',
    in_progress:'In Progress', resolved:'Resolved', closed:'Closed',
    rejected:'Rejected', cancelled:'Cancelled',
  };
  return `<span class="badge badge-${map[status] || 'submitted'}">${lbl[status] || status}</span>`;
}

function priorityBadge(priority) {
  const cap = priority.charAt(0).toUpperCase() + priority.slice(1);
  return `<span class="badge badge-${priority}"><span class="priority-dot dot-${priority}"></span>${cap}</span>`;
}

function mapPlaceholder(height = 200, label = 'Leaflet.js + OpenStreetMap', lat, lng) {
  const coordLabel = (lat && lng) ? `${parseFloat(lat).toFixed(4)}, ${parseFloat(lng).toFixed(4)}` : label;
  return `
    <div class="map-placeholder" style="height:${height}px">
      <div class="map-icon">📍</div>
      <div class="map-label">${coordLabel}</div>
      <div class="map-sub">Nominatim geocoding · GPS auto-detect</div>
    </div>`;
}

function uploadBox(height, label = 'Drag &amp; drop or click to upload', sub = 'JPG, PNG, MP4 · Max 50MB') {
  return `
    <div class="upload-box"${height ? ` style="height:${height}px"` : ''}>
      <div class="upload-icon">📎</div>
      <div class="upload-text">${label}</div>
      <div class="upload-sub">${sub}</div>
    </div>`;
}

function alertBox(type, icon, content) {
  return `<div class="alert alert-${type}"><span>${icon}</span><div>${content}</div></div>`;
}

function perfBar(label, value, unit = '%') {
  return `
    <div class="perf-bar-row">
      <div class="perf-bar-label">
        <span>${label}</span>
        <span class="mono">${value}${unit}</span>
      </div>
      <div class="perf-bar-track"><div class="perf-bar-fill" style="width:${value}%"></div></div>
    </div>`;
}

/* ── TOAST ─────────────────────────────────────────────────── */
function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('toast-visible'), 10);
  setTimeout(() => { t.classList.remove('toast-visible'); setTimeout(() => t.remove(), 300); }, 3500);
}

/* ── MODAL ─────────────────────────────────────────────────── */
function openModal(html) {
  const container = document.getElementById('modal-container');
  if (container) container.innerHTML = html;
}
function closeModal() {
  const container = document.getElementById('modal-container');
  if (container) container.innerHTML = '';
}

/* ── TIMELINE MODAL ────────────────────────────────────────── */
function showTimeline(complaintId) {
  const c = COMPLAINTS.find(x => x.id === complaintId);
  if (!c) return;
  const stages = buildTimeline(c);

  const stagesHtml = stages.map(s => `
    <div class="timeline-item">
      <div class="tl-dot ${s.done ? (s.rejected || s.cancelled ? 'rejected' : 'done') : ''}">
        ${s.done ? (s.rejected || s.cancelled ? '✕' : '✓') : '○'}
      </div>
      <div class="tl-content">
        <div class="tl-label">${s.label}</div>
        <div class="tl-time">${s.time}</div>
        ${s.done ? `<div class="tl-note">${s.note}</div>` : ''}
      </div>
    </div>`).join('');

  const ratingHtml = c.status === 'closed' ? `
    <div class="rating-section">
      <div class="section-title">Rate this Service</div>
      <div class="star-row" id="star-row">
        ${[1,2,3,4,5].map(n => `<span class="star${n <= 4 ? ' filled' : ''}" onclick="setRating(${n})">★</span>`).join('')}
      </div>
      <textarea class="form-input" rows="2" placeholder="Optional comment…" style="margin-top:10px"></textarea>
      <div style="text-align:right;margin-top:10px">
        <button class="btn-primary btn-sm" onclick="showToast('Rating submitted. Thank you!');closeModal()">Submit Rating</button>
      </div>
    </div>` : '';

  openModal(`
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal">
        <div class="modal-head">
          <div>
            <div class="modal-title">${c.id}</div>
            <div class="modal-subtitle">${c.cat} · Brgy. ${c.brgy}</div>
          </div>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div class="badge-row">${statusBadge(c.status)} ${priorityBadge(c.priority)}</div>
          <div class="complaint-desc">${c.desc}</div>
          <div class="section-title" style="margin-bottom:16px">Transparency Timeline</div>
          <div class="timeline">${stagesHtml}</div>
          ${ratingHtml}
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" onclick="closeModal()">Close</button>
        </div>
      </div>
    </div>`);
}

function setRating(n) {
  document.querySelectorAll('.star').forEach((s, i) => {
    s.classList.toggle('filled', i < n);
  });
}

/* ── TOPBAR NAV HIGHLIGHT ──────────────────────────────────── */
function setActivePage(pageId) {
  if (typeof pageId !== 'string' || !pageId) {
    console.warn('setActivePage called with invalid pageId:', pageId);
    return;
  }

  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const target = document.getElementById('nav-' + pageId);
  if (target) target.classList.add('active');

  document.querySelectorAll('.page-section').forEach(el => el.classList.add('hidden'));
  const section = document.getElementById('page-' + pageId);
  if (section) section.classList.remove('hidden');

  const titleMap = {
    dash:'Dashboard', report:'File a Complaint', complaints:'My Complaints',
    profile:'My Profile', queue:'Complaint Queue', active:'Active Cases',
    officers:'Field Officers', analytics:'Analytics', assigned:'Assigned Cases',
    job:'Active Job', history:'Case History', performance:'My Performance',
  };
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = titleMap[pageId] || 'Dashboard';
  window.scrollTo(0, 0);
}

function openPage(pageId) {
  if (!pageId || typeof pageId !== 'string') {
    console.warn('openPage called with invalid pageId:', pageId);
    return;
  }
  if (typeof setActivePage === 'function' && document.getElementById('nav-' + pageId)) {
    setActivePage(pageId);
    return;
  }
  if (typeof navigateToPage === 'function') {
    navigateToPage(pageId);
    return;
  }
  console.warn('No routing handler found for pageId:', pageId);
}

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#', '');
  if (hash && typeof setActivePage === 'function') {
    setActivePage(hash);
  }
});

async function logout() {
  try {
    await apiFetch('logout.php', {});
  } catch (error) {
    console.warn('Logout API error:', error.message);
  }
  const base = window.location.pathname.replace(/\/[^\/]*$/, '/');
  const route = new URL('index.html', window.location.origin + base).href;
  window.location.href = route;
}

function navigateToPage(pageId) {
  const pageMap = {
    dash:'dash', report:'report', complaints:'complaints', profile:'profile',
    queue:'queue', active:'active', officers:'officers', analytics:'analytics',
    assigned:'assigned', job:'job', history:'history', performance:'performance',
  };

  if (pageMap[pageId] && typeof setActivePage === 'function' && document.getElementById('nav-' + pageId)) {
    setActivePage(pageId);
    return;
  }

  if (pageMap[pageId]) {
    const base = window.location.pathname.replace(/\/[^\/]*$/, '/');
    window.location.href = new URL(`dispatch.html#${pageId}`, window.location.origin + base).href;
    return;
  }

  const routeMap = { regular:'civilian.html', dispatch:'dispatch.html', field:'field.html' };
  const fallback = routeMap[pageId];
  if (fallback) {
    const base = window.location.pathname.replace(/\/[^\/]*$/, '/');
    window.location.href = new URL(fallback, window.location.origin + base).href;
  } else {
    console.warn('navigateToPage could not resolve pageId:', pageId);
  }
}