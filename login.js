/* ============================================================
   TRAPICO — Login Page Logic
   ============================================================ */

'use strict';

const roleConfig = {
  dispatch: {
    kicker: 'DISPATCH ACCESS',
    idLabel: 'EMPLOYEE ID',
    idPlaceholder: 'e.g. 2024-001',
    requiredMessage: 'Employee ID and password are required.',
  },
  field: {
    kicker: 'FIELD OFFICER ACCESS',
    idLabel: 'EMPLOYEE ID',
    idPlaceholder: 'e.g. 2024-001',
    requiredMessage: 'Employee ID and password are required.',
  },
  regular: {
    kicker: 'CITIZEN ACCESS',
    idLabel: 'USERNAME OR EMAIL',
    idPlaceholder: 'e.g. rikka',
    requiredMessage: 'Username or email and password are required.',
  },
};

const selectedRole = document.body?.dataset?.role || 'dispatch';
const activeConfig = roleConfig[selectedRole] || roleConfig.dispatch;

document.addEventListener('DOMContentLoaded', () => {
  const kicker = document.querySelector('.login-kicker');
  const userLabel = document.querySelector('label[for="login-user"]');
  const userInput = document.getElementById('login-user');
  const errEl = document.getElementById('login-error');

  if (kicker) kicker.textContent = activeConfig.kicker;
  if (userLabel) userLabel.textContent = activeConfig.idLabel;
  if (userInput) userInput.placeholder = activeConfig.idPlaceholder;
  if (errEl) errEl.textContent = activeConfig.requiredMessage;
});

function togglePasswordVisibility() {
  const input = document.getElementById('login-pass');
  const toggle = document.getElementById('password-toggle');
  const showing = input.type === 'text';

  input.type = showing ? 'password' : 'text';
  toggle.textContent = showing ? '◔' : '◕';
  toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
}

function openForgotModal(event) {
  event.preventDefault();
  if (selectedRole === 'dispatch') {
    const notif = document.getElementById('forgot-inline-notif');
    if (notif) notif.classList.remove('hidden');
    return;
  }
  document.getElementById('forgot-modal-overlay').classList.remove('hidden');
}

function dismissForgotNotif() {
  const notif = document.getElementById('forgot-inline-notif');
  if (notif) notif.classList.add('hidden');
}

function closeForgotModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('forgot-modal-overlay').classList.add('hidden');
}

async function doLogin() {
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value.trim();
  const errEl = document.getElementById('login-error');

  if (!user || !pass) {
    errEl.textContent = activeConfig.requiredMessage;
    errEl.classList.remove('hidden');
    return;
  }
  errEl.classList.add('hidden');

  try {
    const response = await apiFetch('login.php', {
      username: user,
      password: pass,
      role: selectedRole,
    }, 'POST');

    const routes = {
      regular: 'CITIZEN/civilian.html',
      dispatch: 'DISPATCH/dispatch.html',
      field: 'FIELD/field.html',
    };

    window.location.href = response.redirect || routes[selectedRole] || 'index.html';
  } catch (error) {
    errEl.textContent = error.message || 'Login failed.';
    errEl.classList.remove('hidden');
  }
}

/* Allow Enter key to submit */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeForgotModal();
  }
  if (e.key === 'Enter') doLogin();
});