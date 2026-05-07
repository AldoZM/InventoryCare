import { getSession, clearSession } from './session.js';
import { startTutorial } from './tutorial.js';
import { addRoute, navigate, initRouter } from './router.js';
import { renderLogin }     from './views/login.js';
import { renderDashboard } from './views/dashboard.js';
import { renderProducts }  from './views/products.js';
import { renderInventory } from './views/inventory.js';
import { renderMovements } from './views/movements.js';
import { renderHistory }   from './views/history.js';
import { renderUsers }     from './views/users.js';
import { renderLocations } from './views/locations.js';
import { renderSettings }  from './views/settings.js';

function showLogin() {
  document.getElementById('login-page').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
}

function showApp(session) {
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');

  document.getElementById('sidebar-user-label').textContent = session.username;
  document.getElementById('sidebar-username-initial').textContent = session.username[0].toUpperCase();
  document.getElementById('header-date').textContent =
    new Date().toLocaleDateString('es-MX', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  if (session.role === 'admin')
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));

  document.getElementById('logout-btn').addEventListener('click', () => {
    clearSession();
    window.location.reload();
  });
}

function setActive(hash) {
  document.querySelectorAll('#sidebar-nav a').forEach(a =>
    a.classList.toggle('active', a.getAttribute('href') === hash));
}

function guard(title, hash, fn, adminOnly = false) {
  return async () => {
    const s = getSession();
    if (!s) { navigate('#/login'); return; }
    if (adminOnly && s.role !== 'admin') { navigate('#/dashboard'); return; }
    document.getElementById('page-title').textContent = title;
    setActive(hash);
    const c = document.getElementById('view-container');
    c.innerHTML = '';
    await fn(c, s);
  };
}

async function checkShortcutOffer() {
  try {
    const res = await fetch('/api/shortcut/status');
    const { offered } = await res.json();
    if (offered) return;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box modal-sm" style="max-width:400px">
        <div class="modal-header">
          <h2 style="font-size:15px">Acceso directo en el escritorio</h2>
        </div>
        <div class="modal-body" style="padding:16px 20px 8px">
          <p style="color:var(--text-1);margin-bottom:14px">
            ¿Deseas crear un acceso directo de InventaryCare en el escritorio para abrirlo más fácilmente?
          </p>
          <label style="display:flex;align-items:center;gap:8px;color:var(--text-2);cursor:pointer">
            <input type="checkbox" id="sc-no-show" style="width:15px;height:15px">
            No volver a mostrar
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="sc-no">No, gracias</button>
          <button class="btn btn-primary"   id="sc-yes">Sí, crear acceso directo</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#sc-yes').onclick = async () => {
      overlay.remove();
      await fetch('/api/shortcut/create', { method: 'POST' });
    };
    overlay.querySelector('#sc-no').onclick = async () => {
      overlay.remove();
      if (document.getElementById('sc-no-show')?.checked)
        await fetch('/api/shortcut/dismiss', { method: 'POST' });
    };
  } catch (_) {}
}

// Boot
const session = getSession();
if (session) {
  showApp(session);
  setTimeout(() => startTutorial(session.username), 400);
  setTimeout(checkShortcutOffer, 800);
}

// Routes
addRoute('#/login', () => {
  if (getSession()) { navigate('#/dashboard'); return; }
  showLogin();
  renderLogin(document.getElementById('login-container'));
});

addRoute('#/dashboard',          guard('Dashboard',   '#/dashboard',          renderDashboard));
addRoute('#/products',           guard('Productos',   '#/products',           renderProducts));
addRoute('#/inventory',          guard('Inventario',  '#/inventory',          renderInventory));
addRoute('#/movements',          guard('Movimientos', '#/movements',          renderMovements));
addRoute('#/history',            guard('Historial',   '#/history',            renderHistory));
addRoute('#/settings/users',     guard('Usuarios',       '#/settings/users',     renderUsers,     true));
addRoute('#/settings/locations', guard('Ubicaciones',    '#/settings/locations', renderLocations, true));
addRoute('#/settings/system',    guard('Configuración',  '#/settings/system',    renderSettings,  true));
addRoute('*', () => navigate(getSession() ? '#/dashboard' : '#/login'));

initRouter();

window.addEventListener('beforeunload', e => {
  if (!getSession()) return;
  e.preventDefault();
  e.returnValue = '';
  return '';
});
