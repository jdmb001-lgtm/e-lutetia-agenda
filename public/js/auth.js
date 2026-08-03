async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Une erreur est survenue');
  return data;
}

function getUserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (_) {
    return 'UTC';
  }
}

(async function init() {
  // Si déjà connecté, rediriger vers le dashboard
  try {
    const { user } = await api('/api/auth/me');
    if (user && window.location.pathname !== '/dashboard') {
      window.location.href = '/dashboard';
      return;
    }
  } catch (_) {}

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submit-btn');
      btn.disabled = true;
      const err = document.getElementById('error');
      err.textContent = '';
      try {
        await api('/api/auth/login', { method: 'POST', body: {
          email: document.getElementById('email').value,
          password: document.getElementById('password').value,
        }});
        window.location.href = '/dashboard';
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false;
      }
    });
  }

  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submit-btn');
      btn.disabled = true;
      const err = document.getElementById('error');
      err.textContent = '';
      try {
        await api('/api/auth/signup', { method: 'POST', body: {
          name: document.getElementById('name').value,
          email: document.getElementById('email').value,
          username: document.getElementById('username').value,
          password: document.getElementById('password').value,
          timezone: getUserTimezone(),
        }});
        window.location.href = '/dashboard';
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false;
      }
    });
  }
})();
