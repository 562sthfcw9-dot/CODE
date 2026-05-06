/* ============================================================
   TRAPICO — Civilian frontend backend connector
   ============================================================ */

'use strict';

let CIVILIAN_USER = null;
let MY_COMPLAINTS = [];
let selectedPriority = 'medium';
let civilianBackendCurrentStep = 1;
let civilianNotifOpen = false;

window.addEventListener('DOMContentLoaded', initCivilian);

async function initCivilian() {
    const user = await requireLoginRedirect();
    if (!user) return;

    CIVILIAN_USER = user;
    document.getElementById('sb-name').textContent = user.name || user.username;
    document.getElementById('topbar-username').textContent = user.name || user.username;

    await loadMyComplaints();
    renderDashboard();
    renderComplaintsTable();
    renderBrgyGrid();
    renderProfilePage();
}

async function loadMyComplaints() {
    const resp = await apiFetch('complaints.php', {action: 'list'});
    MY_COMPLAINTS = resp.complaints || [];
}

function getMyComplaints() {
    return MY_COMPLAINTS;
}

function toggleNotif() {
    civilianNotifOpen = !civilianNotifOpen;
    document.getElementById('notif-panel').classList.toggle('hidden', !civilianNotifOpen);
}

document.addEventListener('click', e => {
    if (!e.target.closest('#notif-btn') && civilianNotifOpen) {
        document.getElementById('notif-panel').classList.add('hidden');
        civilianNotifOpen = false;
    }
});

function renderBrgyGrid() {
    const grid = document.getElementById('brgy-grid');
    if (!grid) return;
    grid.innerHTML = ['Commonwealth', 'Batasan Hills', 'Central', 'Sto. Cristo'].map(b => `
      <div class="brgy-card">
        <div class="brgy-card-icon">📍</div>
        <div class="brgy-card-name">${safeText(b)}</div>
        <div class="brgy-card-label"><span class="brgy-card-dot"></span>Active</div>
      </div>`).join('');
}

function renderDashboard() {
    const my = getMyComplaints();
    const active = my.filter(c => !['closed','cancelled'].includes(c.status)).length;
    const resolved = my.filter(c => ['resolved','closed'].includes(c.status)).length;

    document.getElementById('stat-total').textContent = my.length;
    document.getElementById('stat-active').textContent = active;
    document.getElementById('stat-resolved').textContent = resolved;
    document.getElementById('badge-complaints').textContent = active;

    const tbody = document.getElementById('dash-recent-tbody');
    if (!tbody) return;
    tbody.innerHTML = my.slice(0, 5).map(c => `
      <tr>
        <td class="track-id">${safeText(c.id)}</td>
        <td>${safeText(c.cat)}</td>
        <td>${priorityBadge(c.priority)}</td>
        <td>${statusBadge(c.status)}</td>
        <td class="mono" style="font-size:12px">${formatDateTime(c.date)}</td>
        <td><button class="btn-secondary btn-sm" onclick="showTimeline('${safeText(c.id)}')">Track</button></td>
      </tr>`).join('');
}

function renderComplaintsTable() {
    const search = (document.getElementById('complaints-search')?.value || '').toLowerCase();
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
        <td class="track-id">${safeText(c.id)}</td>
        <td>${safeText(c.cat)}</td>
        <td style="font-size:12px">${safeText(c.brgy)}</td>
        <td>${priorityBadge(c.priority)}</td>
        <td>${statusBadge(c.status)}</td>
        <td class="mono" style="font-size:12px">${formatDateTime(c.date)}</td>
        <td style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn-secondary btn-sm" onclick="showTimeline('${safeText(c.id)}')">Track</button>
          ${c.status === 'submitted' ? `<button class="btn-danger btn-sm" onclick="cancelComplaint('${safeText(c.id)}')">Cancel</button>` : ''}
        </td>
      </tr>`).join('');
}

async function cancelComplaint(id) {
    if (!confirm('Are you sure you want to cancel this complaint?')) {
        return;
    }
    try {
        await apiFetch('complaints.php', {action: 'cancel', id}, 'POST');
        await loadMyComplaints();
        renderComplaintsTable();
        renderDashboard();
        showToast('Complaint cancelled successfully.');
    } catch (error) {
        showToast(error.message);
    }
}

function goToStep(step) {
    [1, 2, 3].forEach(n => {
        const stepEl = document.getElementById('step-' + n);
        document.getElementById('form-step-' + n).classList.add('hidden');
        if (stepEl) {
            stepEl.classList.remove('active', 'done');
            if (n < step) stepEl.classList.add('done');
            if (n === step) stepEl.classList.add('active');
            stepEl.querySelector('.step-num').textContent = n < step ? '✓' : String(n);
        }
    });
    document.getElementById('form-step-' + step).classList.remove('hidden');
    civilianBackendCurrentStep = step;
    if (step === 3) buildReviewSummary();
    window.scrollTo(0, 0);
}

function updateCharCount(el) {
    const len = el.value.length;
    const countEl = document.getElementById('char-count');
    if (!countEl) return;
    countEl.textContent = `${len} / 50 min`;
    countEl.style.color = len >= 50 ? 'var(--green)' : 'var(--mist)';
}

function selectPriority(el) {
    document.querySelectorAll('.priority-pill').forEach(p => p.classList.remove('sel'));
    el.classList.add('sel');
    selectedPriority = el.dataset.p;
}

function toggleAnonWarning(checkbox) {
    document.getElementById('anon-warning').classList.toggle('hidden', !checkbox.checked);
}

function buildReviewSummary() {
    const cat = document.getElementById('f-cat')?.value || '—';
    const brgy = document.getElementById('f-brgy')?.value || '—';
    const date = document.getElementById('f-date')?.value || '—';
    const time = document.getElementById('f-time')?.value || '—';
    const priority = selectedPriority.charAt(0).toUpperCase() + selectedPriority.slice(1);
    const anon = document.getElementById('anon-toggle')?.checked ? 'Yes' : 'No';

    document.getElementById('review-summary').innerHTML = `
      <div class="review-summary-title">Review Your Submission</div>
      ${[['Category', cat], ['Barangay', brgy], ['Date', date], ['Time', time], ['Priority', priority], ['Anonymous', anon]].map(([l, v]) => `
        <div class="review-row">
          <span class="review-label">${safeText(l)}:</span>
          <span class="review-value">${safeText(v)}</span>
        </div>`).join('')}`;
}

async function submitComplaint() {
    const category = document.getElementById('f-cat')?.value || '';
    const barangay = document.getElementById('f-brgy')?.value || '';
    const date = document.getElementById('f-date')?.value || '';
    const time = document.getElementById('f-time')?.value || '';
    const desc = document.getElementById('f-desc')?.value.trim() || '';
    const anonymous = document.getElementById('anon-toggle')?.checked || false;

    if (!category || !barangay || !date || !time) {
        showToast('Please complete all complaint fields before submitting.');
        goToStep(2);
        return;
    }
    if (desc.length < 50) {
        showToast('Please provide a description of at least 50 characters.');
        goToStep(2);
        return;
    }

    try {
        const response = await apiFetch('complaints.php', {
            action: 'submit',
            category,
            barangay,
            date,
            time,
            description: desc,
            priority: selectedPriority,
            anonymous,
        }, 'POST');
        await loadMyComplaints();
        renderDashboard();
        renderComplaintsTable();
        showToast(`✓ Complaint submitted! Tracking ID: ${safeText(response.tracking_number)}`);
        goToStep(1);
        setActivePage('complaints');
    } catch (error) {
        showToast(error.message);
    }
}

function renderProfilePage() {
    if (!CIVILIAN_USER) return;
    document.getElementById('prof-name').textContent = CIVILIAN_USER.name || CIVILIAN_USER.username;
    document.getElementById('prof-email').textContent = CIVILIAN_USER.email || '—';
    document.getElementById('prof-phone').textContent = CIVILIAN_USER.phone || '—';
    document.getElementById('prof-brgy').textContent = CIVILIAN_USER.home_barangay || '—';
    document.getElementById('edit-profile-name').value = CIVILIAN_USER.name || '';
    document.getElementById('edit-profile-email').value = CIVILIAN_USER.email || '';
    document.getElementById('edit-profile-phone').value = CIVILIAN_USER.phone || '';
    document.getElementById('edit-profile-brgy').value = CIVILIAN_USER.home_barangay || '';
}

let editingProfile = false;

function toggleProfileEdit() {
    editingProfile = !editingProfile;
    document.getElementById('profile-view').classList.toggle('hidden', editingProfile);
    document.getElementById('profile-edit').classList.toggle('hidden', !editingProfile);
    document.getElementById('edit-btn').textContent = editingProfile ? '✕ Cancel' : '✎ Edit';
}

async function saveProfile() {
    const name = document.getElementById('edit-profile-name')?.value.trim() || '';
    const email = document.getElementById('edit-profile-email')?.value.trim() || '';
    const phone = document.getElementById('edit-profile-phone')?.value.trim() || '';
    const brgy = document.getElementById('edit-profile-brgy')?.value.trim() || '';

    if (!name || !email || !phone || !brgy) {
        showToast('Please complete all profile fields.');
        return;
    }

    try {
        await apiFetch('user.php', {action: 'updateProfile', name, email, phone, brgy}, 'POST');
        CIVILIAN_USER.name = name;
        CIVILIAN_USER.email = email;
        CIVILIAN_USER.phone = phone;
        CIVILIAN_USER.home_barangay = brgy;
        renderProfilePage();
        toggleProfileEdit();
        showToast('Profile updated successfully.');
    } catch (error) {
        showToast(error.message);
    }
}

async function updatePassword() {
    const current = document.getElementById('pw-current')?.value.trim();
    const nw = document.getElementById('pw-new')?.value.trim();
    const confirm = document.getElementById('pw-confirm')?.value.trim();

    if (!current || !nw || !confirm) {
        showToast('Please fill in all password fields.');
        return;
    }
    if (nw !== confirm) {
        showToast('New passwords do not match.');
        return;
    }
    if (nw.length < 8) {
        showToast('Password must be at least 8 characters.');
        return;
    }

    try {
        await apiFetch('user.php', {action: 'changePassword', currentPassword: current, newPassword: nw}, 'POST');
        document.getElementById('pw-current').value = '';
        document.getElementById('pw-new').value = '';
        document.getElementById('pw-confirm').value = '';
        showToast('Password updated successfully.');
    } catch (error) {
        showToast(error.message);
    }
}
