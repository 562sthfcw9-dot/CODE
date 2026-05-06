/* ============================================================
   TRAPICO — Login Page Logic
   ============================================================ */

'use strict';

let selectedRole = 'regular';

function selectRole(el) {
  document.querySelectorAll('.role-card').forEach(c => {
    c.classList.remove('active');
    c.querySelector('.role-check').textContent = '';
  });
  el.classList.add('active');
  el.querySelector('.role-check').textContent = '✓';
  selectedRole = el.dataset.role;
}

function doLogin() {
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value.trim();
  const errEl = document.getElementById('login-error');

  if (!user || !pass) {
    errEl.classList.remove('hidden');
    return;
  }
  errEl.classList.add('hidden');

  /* Store minimal session info in sessionStorage for the role pages */
  sessionStorage.setItem('trapico_role', selectedRole);
  sessionStorage.setItem('trapico_user', user);

  const routes = {
    regular:  'civilian.html',
    dispatch: 'dispatch.html',
    field:    'field.html',
  };

  window.location.href = routes[selectedRole];
}

/* Allow Enter key to submit */
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});