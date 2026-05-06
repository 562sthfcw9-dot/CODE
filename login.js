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

async function doLogin() {
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value.trim();
  const errEl = document.getElementById('login-error');

  if (!user || !pass) {
    errEl.textContent = 'Username and password are required.';
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
      regular: 'civilian.html',
      dispatch: 'dispatch.html',
      field: 'field.html',
    };

    window.location.href = response.redirect || routes[selectedRole] || 'index.html';
  } catch (error) {
    errEl.textContent = error.message || 'Login failed.';
    errEl.classList.remove('hidden');
  }
}

/* Allow Enter key to submit */
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});