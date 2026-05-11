import { api } from '../api.js';
import { setSession } from '../session.js';
import { t } from '../i18n.js';

export function renderLogin(container) {
  container.innerHTML = `
    <div class="login-box">
      <div class="login-logo"><img src="/images/logo.png" alt="${t.app.name}" class="login-logo-img"></div>
      <form id="login-form">
        <div class="form-group">
          <label>${t.login.username}</label>
          <input type="text" id="luser" autocomplete="username" required>
        </div>
        <div class="form-group">
          <label>${t.login.password}</label>
          <input type="password" id="lpass" autocomplete="current-password" required>
        </div>
        <p id="login-error" class="error-msg hidden">${t.login.error}</p>
        <button type="submit" class="btn btn-primary btn-full">${t.login.submit}</button>
      </form>
    </div>`;

  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const username = document.getElementById('luser').value.trim();
    const password = document.getElementById('lpass').value;
    const errorEl = document.getElementById('login-error');
    errorEl.classList.add('hidden');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        errorEl.classList.remove('hidden');
        return;
      }
      const data = await res.json();
      setSession({ token: data.access_token, role: data.role, username });
      sessionStorage.setItem('_login_reload', '1');
      window.location.reload();
    } catch {
      errorEl.classList.remove('hidden');
    }
  });
}
