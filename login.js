/* ============================================================
   TRAPICO — Login Page Logic
   ============================================================ */

'use strict';

const roleConfig = {
  dispatch: {
    kicker: 'DISPATCH ACCESS',
    idLabel: 'EMAIL OR BADGE NUMBER',
    idPlaceholder: 'e.g. juan@email.com or DISP-2026-0001',
    requiredMessage: 'Email address or badge number and password are required.',
    forgotLabel: 'EMAIL OR BADGE NUMBER',
    forgotPlaceholder: 'e.g. juan@email.com or DISP-2026-0001',
    forgotRequiredMessage: 'Please enter your email address or badge number.',
  },
  field: {
    kicker: 'FIELD OFFICER ACCESS',
    idLabel: 'EMAIL OR BADGE NUMBER',
    idPlaceholder: 'e.g. juan@email.com or QC-0123',
    requiredMessage: 'Email address or badge number and password are required.',
    forgotLabel: 'EMAIL OR BADGE NUMBER',
    forgotPlaceholder: 'e.g. juan@email.com or QC-0123',
    forgotRequiredMessage: 'Please enter your email address or badge number.',
  },
  regular: {
    kicker: 'CITIZEN ACCESS',
    idLabel: 'USERNAME OR EMAIL ADDRESS',
    idPlaceholder: 'e.g. rikka',
    requiredMessage: 'Username or email address and password are required.',
    forgotLabel: 'USERNAME OR EMAIL',
    forgotPlaceholder: 'e.g. rikka or rikka@gmail.com',
    forgotRequiredMessage: 'Please enter your username or email.',
  },
};

const selectedRole = document.body?.dataset?.role || 'dispatch';
const activeConfig = roleConfig[selectedRole] || roleConfig.dispatch;

document.addEventListener('DOMContentLoaded', () => {
  const kicker = document.querySelector('.login-kicker');
  const userLabel = document.querySelector('label[for="login-user"]');
  const userInput = document.getElementById('login-user');
  const forgotLabel = document.querySelector('label[for="forgot-identifier"]');
  const forgotInput = document.getElementById('forgot-identifier');
  const errEl = document.getElementById('login-error');

  if (kicker) kicker.textContent = activeConfig.kicker;
  if (userLabel) userLabel.textContent = activeConfig.idLabel;
  if (userInput) userInput.placeholder = activeConfig.idPlaceholder;
  if (forgotLabel) forgotLabel.textContent = activeConfig.forgotLabel;
  if (forgotInput) forgotInput.placeholder = activeConfig.forgotPlaceholder;
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
  const overlay = document.getElementById('forgot-modal-overlay');
  if (!overlay) return;

  const status = document.getElementById('forgot-status');
  if (status) {
    status.classList.add('hidden');
    status.textContent = '';
  }

  const userInput = document.getElementById('login-user');
  const forgotInput = document.getElementById('forgot-identifier');
  if (forgotInput && userInput && userInput.value.trim()) {
    forgotInput.value = userInput.value.trim();
  }

  overlay.classList.remove('hidden');
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

async function submitForgotPassword() {
  const input = document.getElementById('forgot-identifier');
  const status = document.getElementById('forgot-status');
  const identifier = input?.value.trim() || '';

  if (!identifier) {
    if (status) {
      status.textContent = activeConfig.forgotRequiredMessage;
      status.classList.remove('hidden');
    }
    return;
  }

  try {
    const response = await apiFetch('password_reset.php', {
      action: 'requestReset',
      role: selectedRole,
      identifier,
      requestUrl: window.location.href,
    }, 'POST');

    if (status) {
      const serverMessage = String(response?.message || 'If the account exists, a reset link has been sent to its registered email.');
      const deliveryStatus = String(response?.deliveryStatus || '').trim();
      const mobileResetLink = String(response?.mobileResetLink || '').trim();
      const resetLink = String(response?.resetLink || '').trim();
      const resetPath = String(response?.resetPath || '').trim();
      const linkHref = mobileResetLink || resetPath || resetLink;

      if (linkHref) {
        status.innerHTML = '';
        const messageNode = document.createElement('div');
        messageNode.textContent = serverMessage;
        if (deliveryStatus === 'activation_required') {
          messageNode.textContent = 'Email is not sending yet for this account because mailbox activation is required. Continuing with instant reset now.';
        }
        status.appendChild(messageNode);

        const matchedRole = String(response?.matchedRole || '').trim();
        const matchedUsername = String(response?.matchedUsername || '').trim();
        const matchedFieldOfficerId = String(response?.matchedFieldOfficerId || '').trim();
        if (matchedRole || matchedUsername || matchedFieldOfficerId) {
          const accountNode = document.createElement('div');
          accountNode.style.marginTop = '6px';
          accountNode.style.fontSize = '12px';
          const parts = [];
          if (matchedRole) parts.push('Role: ' + matchedRole);
          if (matchedUsername) parts.push('Username: ' + matchedUsername);
          if (matchedFieldOfficerId) parts.push('FieldOfficerID: ' + matchedFieldOfficerId);
          accountNode.textContent = 'Matched account: ' + parts.join(' | ');
          status.appendChild(accountNode);
        }

        const linkWrap = document.createElement('div');
        linkWrap.style.marginTop = '8px';

        const linkNode = document.createElement('a');
        linkNode.href = linkHref;
        linkNode.target = '_blank';
        linkNode.rel = 'noopener noreferrer';
        linkNode.textContent = 'Open reset link now';
        linkNode.style.fontWeight = '700';

        linkWrap.appendChild(linkNode);
        status.appendChild(linkWrap);
      } else {
        status.textContent = serverMessage;
      }

      status.classList.remove('hidden');
      status.style.borderColor = 'rgba(15, 81, 50, 0.3)';
      status.style.background = '#eaf7ef';
      status.style.color = '#0f5132';
    }
  } catch (error) {
    if (status) {
      status.textContent = error.message || 'Unable to send reset link right now.';
      status.classList.remove('hidden');
      status.style.borderColor = 'rgba(170, 34, 34, 0.28)';
      status.style.background = '#fff1f1';
      status.style.color = '#aa2222';
    }
  }
}

/* Allow Enter key to submit */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeForgotModal();
  }
  if (e.key === 'Enter') {
    const forgotOpen = document.getElementById('forgot-modal-overlay') && !document.getElementById('forgot-modal-overlay').classList.contains('hidden');
    if (forgotOpen) {
      submitForgotPassword();
    } else {
      doLogin();
    }
  }
});