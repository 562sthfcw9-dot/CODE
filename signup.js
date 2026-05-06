/* ============================================================
   TRAPICO — Dispatch Sign-Up Logic
   ============================================================ */
'use strict';

let suOpenDropdown = null;
let suModalType = null;
const signupRole = document.body?.dataset?.role || 'dispatch';

const LEGAL_TEXT = {
  terms: {
    head: 'TERMS AND CONDITIONS',
    body: 'Welcome to TRAPICO. By using this system, you agree to provide accurate traffic reports. Misuse of the platform or filing false reports may lead to account suspension and legal action under Quezon City traffic ordinances.',
  },
  privacy: {
    head: 'PRIVACY POLICY',
    body: 'We value your privacy. TRAPICO collects officer identification and location data strictly for incident validation. Your personal information is encrypted and will not be shared with third parties without your explicit consent.',
  },
};

function toggleSuPassword(inputId, toggleId) {
  const input = document.getElementById(inputId);
  const toggle = document.getElementById(toggleId);
  const showing = input.type === 'text';

  input.type = showing ? 'password' : 'text';
  toggle.textContent = showing ? '◔' : '◕';
  toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
}

function toggleDropdown(id) {
  const list = document.getElementById(`${id}-list`);
  const btn = document.getElementById(`${id}-btn`);
  const isOpen = !list.classList.contains('hidden');

  closeOpenDropdown();

  if (!isOpen) {
    list.classList.remove('hidden');
    btn.classList.add('su-open');
    btn.setAttribute('aria-expanded', 'true');
    suOpenDropdown = id;
  }
}

function closeOpenDropdown() {
  if (!suOpenDropdown) return;
  const list = document.getElementById(`${suOpenDropdown}-list`);
  const btn = document.getElementById(`${suOpenDropdown}-btn`);
  if (list) list.classList.add('hidden');
  if (btn) {
    btn.classList.remove('su-open');
    btn.setAttribute('aria-expanded', 'false');
  }
  suOpenDropdown = null;
}

function selectOption(id, value) {
  document.getElementById(`${id}-val`).textContent = value;
  document.getElementById(`${id}-input`).value = value;
  document.getElementById(`${id}-btn`).classList.add('su-has-value');

  const list = document.getElementById(`${id}-list`);
  list.querySelectorAll('.su-option').forEach(opt => {
    opt.classList.toggle('su-option-selected', opt.textContent.trim() === value);
  });

  closeOpenDropdown();
  updateSubmitState();
}

document.addEventListener('click', e => {
  if (!suOpenDropdown) return;
  const wrap = document.getElementById(`${suOpenDropdown}-wrap`);
  if (wrap && !wrap.contains(e.target)) closeOpenDropdown();
});

function openLegalModal(type) {
  suModalType = type;
  const content = LEGAL_TEXT[type];

  document.getElementById('legal-modal-head').textContent = content.head;
  const body = document.getElementById('legal-modal-body');
  body.style.whiteSpace = 'normal';
  body.textContent = content.body;

  document.getElementById('legal-backdrop').classList.remove('hidden');
}

function closeLegalModal() {
  document.getElementById('legal-backdrop').classList.add('hidden');
  suModalType = null;
}

function acceptModal() {
  if (suModalType === 'terms') {
    document.getElementById('dis-terms').checked = true;
  }
  if (suModalType === 'privacy') {
    document.getElementById('dis-privacy').checked = true;
  }
  closeLegalModal();
  updateSubmitState();
}

function handleBackdropClick(e) {
  if (e.target === e.currentTarget) closeLegalModal();
}

function getVal(id) {
  return (document.getElementById(id)?.value ?? '').trim();
}

function isStrongPassword(password) {
  return password.length >= 8 && /[A-Z]/.test(password);
}

function showError(message) {
  const errorEl = document.getElementById('dis-error');
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

function clearError() {
  document.getElementById('dis-error').classList.add('hidden');
}

function isFormReady() {
  const username = getVal('dis-username');
  const phone = getVal('dis-phone');
  const barangay = getVal('dis-brgy-input');
  const password = getVal('dis-password');
  const confirm = getVal('dis-confirm');
  const terms = document.getElementById('dis-terms').checked;
  const privacy = document.getElementById('dis-privacy').checked;

  return !!(username && phone && barangay && password && confirm && terms && privacy);
}

function updateSubmitState() {
  const submitBtn = document.getElementById('dis-submit');
  const enabled = isFormReady();

  submitBtn.disabled = !enabled;
  submitBtn.classList.toggle('su-submit-enabled', enabled);
  submitBtn.classList.toggle('su-submit-disabled', !enabled);
}

async function submitDispatchSignup() {
  clearError();

  const username = getVal('dis-username');
  const phone = getVal('dis-phone');
  const barangay = getVal('dis-brgy-input');
  const password = getVal('dis-password');
  const confirm = getVal('dis-confirm');

  if (!username) return showError('Please enter your username.');
  if (!phone) return showError('Please enter your phone number.');
  if (!barangay) return showError('Please select your barangay.');
  if (!isStrongPassword(password)) return showError('Password must be at least 8 characters and include one uppercase letter.');
  if (password !== confirm) return showError('Password and confirm password do not match.');
  if (!document.getElementById('dis-terms').checked || !document.getElementById('dis-privacy').checked) {
    return showError('Please accept the Terms and Privacy policy.');
  }

  const submitBtn = document.getElementById('dis-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'CREATING...';

  try {
    const response = await fetch('api/register.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: signupRole,
        username,
        phone_number: phone,
        home_barangay: barangay,
        password,
      }),
    });

    const data = await response.json();
    if (data.success) {
      window.location.href = 'index.html?registered=1';
      return;
    }

    showError(data.message || 'Registration failed.');
  } catch (error) {
    showError('Unable to submit registration right now.');
  }

  submitBtn.textContent = 'CREATE ACCOUNT →';
  updateSubmitState();
}

document.addEventListener('input', updateSubmitState);
document.addEventListener('change', updateSubmitState);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeOpenDropdown();
    closeLegalModal();
  }

  if (e.key === 'Enter' && !document.getElementById('dis-submit').disabled) {
    submitDispatchSignup();
  }
});

updateSubmitState();
