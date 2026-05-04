import { api } from '../api.js';
import { setSession } from '../session.js';
import { t } from '../i18n.js';

export function renderLogin(container) {
  container.innerHTML = `
    <div class="login-box">
      <div class="login-logo">📦 ${t.app.name}</div>
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
    document.getElementById('login-error').classList.add('hidden');
    try {
      const data = await api.post('/api/auth/login', { username, password });
      if (!data) return;
      setSession({ token: data.access_token, role: data.role, username });
      window.location.reload();
    } catch {
      document.getElementById('login-error').classList.remove('hidden');
    }
  });
}
