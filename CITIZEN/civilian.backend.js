/* ============================================================
   TRAPICO — Civilian frontend backend connector
   ============================================================ */

'use strict';

let CIVILIAN_USER = null;
let MY_COMPLAINTS = [];
let selectedPriority = 'medium';
let civilianBackendCurrentStep = 1;
let civilianNotifOpen = false;

/* map state */
let complaintMap = null;
let complaintMapMarker = null;
let pinnedLat = null;
let pinnedLng = null;

window.addEventListener('DOMContentLoaded', initCivilian);

async function initCivilian() {
    const user = await requireLoginRedirect();
    if (!user) return;

    CIVILIAN_USER = user;
    const displayName = user.name || user.username || 'Citizen';
    document.getElementById('sb-name').textContent = displayName;
    document.getElementById('topbar-username').textContent = displayName;

    /* set today's date as default */
    const todayInput = document.getElementById('f-date');
    if (todayInput) todayInput.value = new Date().toISOString().slice(0, 10);

    /* wrap setActivePage to trigger map init when report page opens */
    const _base = window.setActivePage;
    window.setActivePage = function (pageId) {
        _base(pageId);
        if (pageId === 'report') setTimeout(initComplaintMap, 150);
    };

    await loadMyComplaints();
    renderDashboard();
    renderComplaintsTable();
    renderBrgyGrid();
    renderProfilePage();
    
    /* Initialize upload box handlers */
    initUploadBox();
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
    document.getElementById('badge-complaints').textContent = active || '';

    /* update barangay label */
    const brgyEl = document.getElementById('user-brgy-label');
    if (brgyEl && CIVILIAN_USER) {
        brgyEl.textContent = 'Barangay ' + (CIVILIAN_USER.home_barangay || 'your barangay') + ', Quezon City';
    }

    const tbody = document.getElementById('dash-recent-tbody');
    if (!tbody) return;
    if (!my.length) {
        tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">No complaints yet</div><div class="empty-sub">Click "File a Complaint" to get started.</div></div></td></tr>`;
        return;
    }
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
    const statusFil = document.getElementById('complaints-filter-status')?.value || '';
    const brgyFil = document.getElementById('complaints-filter-brgy')?.value || '';
    const my = getMyComplaints().filter(c => {
        const matchSearch = !search || c.id.toLowerCase().includes(search) || c.cat.toLowerCase().includes(search);
        const matchStatus = !statusFil || c.status === statusFil;
        const matchBrgy = !brgyFil || c.brgy === brgyFil;
        return matchSearch && matchStatus && matchBrgy;
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
    /* validate before advancing */
    if (step === 2) {
        const cat = document.getElementById('f-cat')?.value;
        const brgy = document.getElementById('f-brgy')?.value;
        const address = document.getElementById('f-address')?.value.trim();
        if (!cat) {
            showToast('Please select a complaint category before proceeding.');
            return;
        }
        if (!address) {
            showToast('Please enter an incident address before proceeding.');
            return;
        }
    }
    if (step === 3) {
        const date = document.getElementById('f-date')?.value;
        const time = document.getElementById('f-time')?.value;
        const desc = document.getElementById('f-desc')?.value.trim() || '';
        if (!date || !time) {
            showToast('Please fill in the incident date and time.');
            return;
        }
        if (desc.length < 50) {
            showToast('Description must be at least 50 characters (' + desc.length + ' so far).');
            return;
        }
    }

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

    if (step === 1) setTimeout(initComplaintMap, 100);
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
    const address = document.getElementById('f-address')?.value || '—';
    const date = document.getElementById('f-date')?.value || '—';
    const time = document.getElementById('f-time')?.value || '—';
    const priority = selectedPriority.charAt(0).toUpperCase() + selectedPriority.slice(1);
    const anon = document.getElementById('anon-toggle')?.checked ? 'Yes' : 'No';

    document.getElementById('review-summary').innerHTML = `
      <div class="review-summary-title">Review Your Submission</div>
      ${[['Category', cat], ['Barangay', brgy], ['Address', address], ['Date', date], ['Time', time], ['Priority', priority], ['Anonymous', anon]].map(([l, v]) => `
        <div class="review-row">
          <span class="review-label">${safeText(l)}:</span>
          <span class="review-value">${safeText(v)}</span>
        </div>`).join('')}`;
}

async function submitComplaint() {
    const category = document.getElementById('f-cat')?.value || '';
    const barangay = document.getElementById('f-brgy')?.value || '';
    const address = document.getElementById('f-address')?.value.trim() || '';
    const date = document.getElementById('f-date')?.value || '';
    const time = document.getElementById('f-time')?.value || '';
    const desc = document.getElementById('f-desc')?.value.trim() || '';
    const anonymous = document.getElementById('anon-toggle')?.checked || false;

    if (!category || !barangay || !address || !date || !time) {
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
        const payload = {
            action: 'submit',
            category,
            barangay,
            address,
            date,
            time,
            description: desc,
            priority: selectedPriority,
            anonymous,
            lat: pinnedLat,
            lng: pinnedLng,
        };

        // If files were uploaded, include them
        if (uploadedFiles.length > 0) {
            payload.media = uploadedFiles;
        }

        const response = await apiFetch('complaints.php', payload, 'POST');
        await loadMyComplaints();
        renderDashboard();
        renderComplaintsTable();
        showToast(`✓ Complaint submitted! Tracking ID: ${safeText(response.tracking_number)}`);
        
        /* reset form */
        uploadedFiles = [];
        pinnedLat = null; pinnedLng = null;
        if (complaintMapMarker) { complaintMapMarker.remove(); complaintMapMarker = null; }
        const pinLabel = document.getElementById('pin-coords-label');
        if (pinLabel) pinLabel.textContent = 'Click the map to pin the exact incident location.';
        document.getElementById('f-cat').value = '';
        document.getElementById('f-address').value = '';
        document.getElementById('f-desc').value = '';
        document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);
        document.getElementById('f-time').value = '';
        document.getElementById('anon-toggle').checked = false;
        document.getElementById('anon-warning').classList.add('hidden');
        document.getElementById('upload-status').textContent = '';
        document.getElementById('uploaded-files').innerHTML = '';
        selectedPriority = 'medium';
        document.querySelectorAll('.priority-pill').forEach(p => p.classList.toggle('sel', p.dataset.p === 'medium'));
        goToStep(1);
        setActivePage('complaints');
    } catch (error) {
        showToast(error.message);
    }
}

function renderProfilePage() {
    if (!CIVILIAN_USER) return;
    document.getElementById('prof-name').textContent = CIVILIAN_USER.name || CIVILIAN_USER.username;
    document.getElementById('prof-username').textContent = CIVILIAN_USER.username || '—';
    document.getElementById('prof-email').textContent = CIVILIAN_USER.email || '—';
    document.getElementById('prof-phone').textContent = CIVILIAN_USER.phone || '—';
    document.getElementById('prof-brgy').textContent = CIVILIAN_USER.home_barangay || '—';
    document.getElementById('edit-profile-name').value = CIVILIAN_USER.name || '';
    document.getElementById('edit-profile-username').value = CIVILIAN_USER.username || '';
    document.getElementById('edit-profile-email').value = CIVILIAN_USER.email || '';
    document.getElementById('edit-profile-phone').value = CIVILIAN_USER.phone || '';
    document.getElementById('edit-profile-brgy').value = CIVILIAN_USER.home_barangay || '';
    
    // Set profile avatar letter
    const letter = (CIVILIAN_USER.name || CIVILIAN_USER.username || 'U').charAt(0).toUpperCase();
    document.getElementById('profile-avatar-letter').textContent = letter;
}

let editingProfile = false;

function toggleProfileEdit() {
    editingProfile = !editingProfile;
    document.getElementById('profile-view').classList.toggle('hidden', editingProfile);
    document.getElementById('profile-edit').classList.toggle('hidden', !editingProfile);
    document.getElementById('edit-btn').textContent = editingProfile ? '✕ Cancel' : '✎ Edit';
}

async function uploadProfilePicture(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!['image/jpeg', 'image/png', 'image/gif'].includes(file.type)) {
        showToast('Only JPG, PNG, and GIF images allowed.');
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
        showToast('File size must be less than 5MB.');
        return;
    }
    
    const statusEl = document.getElementById('profile-picture-status');
    statusEl.textContent = 'Uploading...';
    
    const formData = new FormData();
    formData.append('action', 'upload_evidence');
    formData.append('file', file);
    
    try {
        const xhr = new XMLHttpRequest();
        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    if (response.success) {
                        statusEl.textContent = '✓ Picture uploaded successfully!';
                        CIVILIAN_USER.profile_picture_url = response.url;
                        // Display the uploaded image
                        const avatarDisplay = document.getElementById('profile-avatar-display');
                        avatarDisplay.innerHTML = `<img src="${response.url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" />`;
                        setTimeout(() => { statusEl.textContent = ''; }, 3000);
                    } else {
                        statusEl.textContent = '✗ ' + (response.message || 'Upload failed');
                    }
                } catch (e) {
                    statusEl.textContent = '✗ Invalid response';
                }
            } else {
                statusEl.textContent = '✗ Upload failed';
            }
        });
        
        xhr.addEventListener('error', () => {
            statusEl.textContent = '✗ Upload error';
        });
        
        xhr.open('POST', '../api/media.php');
        xhr.send(formData);
    } catch (error) {
        statusEl.textContent = '✗ ' + error.message;
    }
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
    if (!/[A-Z]/.test(nw) || !/[0-9]/.test(nw)) {
        showToast('Password must contain at least one uppercase letter and one number.');
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

/* ── FILE UPLOAD ───────────────────────────────────────────── */
let uploadedFiles = [];

function initUploadBox() {
    const uploadBox = document.getElementById('upload-box');
    const evidenceInput = document.getElementById('evidence-upload');
    if (!uploadBox || !evidenceInput) {
        console.warn('Upload box or file input not found');
        return;
    }
    
    // Click upload box to trigger file input
    uploadBox.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        evidenceInput.click();
    });
    
    uploadBox.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadBox.style.backgroundColor = 'var(--surface)';
        uploadBox.style.borderColor = 'var(--steel)';
    });
    
    uploadBox.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadBox.style.backgroundColor = '';
        uploadBox.style.borderColor = '';
    });
    
    uploadBox.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadBox.style.backgroundColor = '';
        uploadBox.style.borderColor = '';
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileUpload({target: {files}});
        }
    });
    
    // Prevent default drag behavior on document
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    document.addEventListener('drop', (e) => {
        e.preventDefault();
    });
}

async function handleFileUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    const maxSize = 50 * 1024 * 1024; // 50MB
    
    if (file.size > maxSize) {
        showToast('File size exceeds 50MB limit.');
        return;
    }
    
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime'].includes(file.type)) {
        showToast('Only JPG, PNG, GIF, WebP, and MP4 files are allowed.');
        return;
    }
    
    await uploadEvidence(file);
}

async function uploadEvidence(file) {
    const progressBar = document.getElementById('upload-progress-bar');
    const progressContainer = document.getElementById('upload-progress-bar').parentElement;
    const statusEl = document.getElementById('upload-status');
    const filesContainer = document.getElementById('uploaded-files');
    
    progressContainer.classList.remove('hidden');
    statusEl.textContent = 'Uploading...';
    
    const formData = new FormData();
    formData.append('action', 'upload_evidence');
    formData.append('file', file);
    
    try {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percent = (e.loaded / e.total) * 100;
                document.getElementById('upload-progress-fill').style.width = percent + '%';
            }
        });
        
        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    if (response.success) {
                        uploadedFiles.push({
                            filename: response.filename,
                            url: response.url,
                            type: file.type
                        });
                        statusEl.textContent = `✓ ${file.name} uploaded successfully.`;
                        filesContainer.innerHTML = uploadedFiles.map((f, i) => `
                            <div style="display:flex;gap:8px;align-items:center;padding:8px;background:var(--surface);border-radius:4px;font-size:12px;margin-bottom:6px">
                                <span>${f.type.includes('video') ? '🎬' : '📷'}</span>
                                <span>${f.filename}</span>
                                <button class="btn-danger btn-sm" style="margin-left:auto" onclick="removeUploadedFile(${i})">Remove</button>
                            </div>`).join('');
                        progressContainer.classList.add('hidden');
                    } else {
                        statusEl.textContent = '✗ ' + (response.message || 'Upload failed');
                        showToast(response.message || 'Upload failed');
                    }
                } catch (e) {
                    statusEl.textContent = '✗ Invalid server response';
                    showToast('Invalid server response');
                }
            } else {
                statusEl.textContent = `✗ Upload failed (${xhr.status})`;
                showToast(`Upload failed with status ${xhr.status}`);
            }
        });
        
        xhr.addEventListener('error', () => {
            statusEl.textContent = '✗ Upload error';
            showToast('Upload error');
        });
        
        xhr.open('POST', '../api/media.php');
        xhr.send(formData);
    } catch (error) {
        statusEl.textContent = '✗ ' + error.message;
        showToast(error.message);
    }
}

function removeUploadedFile(index) {
    uploadedFiles.splice(index, 1);
    const filesContainer = document.getElementById('uploaded-files');
    if (uploadedFiles.length === 0) {
        filesContainer.innerHTML = '';
        document.getElementById('upload-status').textContent = '';
    } else {
        filesContainer.innerHTML = uploadedFiles.map((f, i) => `
            <div style="display:flex;gap:8px;align-items:center;padding:8px;background:var(--surface);border-radius:4px;font-size:12px;margin-bottom:6px">
                <span>${f.type.includes('video') ? '🎬' : '📷'}</span>
                <span>${f.filename}</span>
                <button class="btn-danger btn-sm" style="margin-left:auto" onclick="removeUploadedFile(${i})">Remove</button>
            </div>`).join('');
    }
}

/* ── LEAFLET MAP ───────────────────────────────────────────── */
function initComplaintMap() {
    const container = document.getElementById('complaint-map');
    if (!container) return;
    if (complaintMap) {
        complaintMap.invalidateSize();
        return;
    }
    const defaultLat = 14.6760, defaultLng = 121.0437;
    complaintMap = L.map('complaint-map', {zoomControl: false}).setView([defaultLat, defaultLng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
    }).addTo(complaintMap);
    complaintMap.on('click', function (e) {
        pinnedLat = e.latlng.lat;
        pinnedLng = e.latlng.lng;
        if (complaintMapMarker) {
            complaintMapMarker.setLatLng(e.latlng);
        } else {
            complaintMapMarker = L.marker(e.latlng).addTo(complaintMap);
        }
        const label = document.getElementById('pin-coords-label');
        if (label) label.textContent = `📍 Pinned: ${pinnedLat.toFixed(5)}, ${pinnedLng.toFixed(5)}`;
    });
}

function useGpsLocation() {
    if (!navigator.geolocation) {
        showToast('GPS is not available in this browser.');
        return;
    }
    navigator.geolocation.getCurrentPosition(pos => {
        pinnedLat = pos.coords.latitude;
        pinnedLng = pos.coords.longitude;
        const latlng = L.latLng(pinnedLat, pinnedLng);
        if (!complaintMap) initComplaintMap();
        complaintMap.setView(latlng, 16);
        if (complaintMapMarker) {
            complaintMapMarker.setLatLng(latlng);
        } else {
            complaintMapMarker = L.marker(latlng).addTo(complaintMap);
        }
        const label = document.getElementById('pin-coords-label');
        if (label) label.textContent = `📍 GPS location: ${pinnedLat.toFixed(5)}, ${pinnedLng.toFixed(5)}`;
    }, () => {
        showToast('Could not retrieve GPS location. Please pin manually on the map.');
    });
}

function updateAddressField() {
    const brgy = document.getElementById('f-brgy')?.value || '';
    const addressInput = document.getElementById('f-address');
    if (addressInput) {
        addressInput.placeholder = `Enter address in ${brgy}`;
    }
}

/* ── TIMELINE (API-backed, overrides data.js version) ──────── */
const _tlRatings = {};

async function showTimeline(complaintId) {
    const c = MY_COMPLAINTS.find(x => x.id === complaintId);
    if (!c) { showToast('Complaint not found.'); return; }

    let timeline = [];
    try {
        const resp = await apiFetch('complaints.php', {action: 'timeline', id: complaintId});
        timeline = resp.timeline || [];
    } catch (err) {
        showToast('Could not load timeline: ' + err.message);
        return;
    }

    const statusLabels = {
        submitted: 'Submitted', verified: 'Verified', assigned: 'Assigned',
        in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed',
        cancelled: 'Cancelled', rejected: 'Rejected',
    };

    const stagesHtml = timeline.length
        ? timeline.map(s => {
            const isNeg = s.status === 'cancelled' || s.status === 'rejected';
            return `
              <div class="timeline-item">
                <div class="tl-dot ${isNeg ? 'rejected' : 'done'}">${isNeg ? '✕' : '✓'}</div>
                <div class="tl-content">
                  <div class="tl-label">${safeText(statusLabels[s.status] || s.status)}</div>
                  <div class="tl-time">${formatDateTime(s.time)}</div>
                  ${s.remarks ? `<div class="tl-note">${safeText(s.remarks)}</div>` : ''}
                </div>
              </div>`;
        }).join('')
        : `<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">No timeline data yet</div></div>`;

    const isRatable = ['closed', 'resolved'].includes(c.status);
    const safeId = safeText(complaintId);
    const ratingHtml = isRatable ? `
      <div class="rating-section">
        <div class="section-title">Rate this Service</div>
        <div class="star-row" id="star-row-${safeId}">
          ${[1,2,3,4,5].map(n => `<span class="star" onclick="setTimelineRating(${n},'${safeId}')" style="cursor:pointer">★</span>`).join('')}
        </div>
        <textarea class="form-input" id="rating-comment-${safeId}" rows="2" placeholder="Optional comment…" style="margin-top:10px"></textarea>
        <div style="text-align:right;margin-top:10px">
          <button class="btn-primary btn-sm" onclick="submitTimelineRating('${safeId}')">Submit Rating</button>
        </div>
      </div>` : '';

    openModal(`
      <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="modal">
          <div class="modal-head">
            <div>
              <div class="modal-title">${safeText(c.id)}</div>
              <div class="modal-subtitle">${safeText(c.cat)} · Brgy. ${safeText(c.brgy)}</div>
            </div>
            <button class="modal-close" onclick="closeModal()">✕</button>
          </div>
          <div class="modal-body">
            <div class="badge-row">${statusBadge(c.status)} ${priorityBadge(c.priority)}</div>
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

function setTimelineRating(n, complaintId) {
    _tlRatings[complaintId] = n;
    const row = document.getElementById('star-row-' + complaintId);
    if (row) row.querySelectorAll('.star').forEach((s, i) => s.classList.toggle('filled', i < n));
}

async function submitTimelineRating(complaintId) {
    const rating = _tlRatings[complaintId] || 0;
    if (!rating) { showToast('Please select a star rating first.'); return; }
    const comment = document.getElementById('rating-comment-' + complaintId)?.value.trim() || '';
    try {
        await apiFetch('complaints.php', {action: 'rate', id: complaintId, rating, comment}, 'POST');
        showToast('Rating submitted. Thank you!');
        closeModal();
    } catch (err) {
        showToast(err.message);
    }
}
