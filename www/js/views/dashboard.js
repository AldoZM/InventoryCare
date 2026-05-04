import { api } from '../api.js';
import { badge } from '../components.js';
import { t } from '../i18n.js';

let _refreshTimer = null;

export async function renderDashboard(container) {
  if (_refreshTimer) clearInterval(_refreshTimer);

  container.innerHTML = `<p class="no-data">${t.common.loading}</p>`;

  async function load() {
    try {
      const [products, locations, lowStock, movements] = await Promise.all([
        api.get('/api/products'),
        api.get('/api/locations'),
        api.get('/api/reports/low-stock'),
        api.get('/api/movements'),
      ]);
      if (!products) return;

      const today = new Date().toISOString().slice(0, 10);
      const todayMov = movements.filter(m => m.created_at?.startsWith(today));

      container.innerHTML = `
        <div class="kpi-grid">
          <div class="kpi-card" style="border-color:#3b82f6">
            <div class="kpi-label">${t.dashboard.products}</div>
            <div class="kpi-value">${products.length}</div>
          </div>
          <div class="kpi-card" style="border-color:#10b981">
            <div class="kpi-label">${t.dashboard.locations}</div>
            <div class="kpi-value">${locations.length}</div>
          </div>
          <div class="kpi-card kpi-warning" style="border-color:#f59e0b">
            <div class="kpi-label">${t.dashboard.lowStock}</div>
            <div class="kpi-value">${lowStock.length}${lowStock.length ? ' ⚠' : ''}</div>
          </div>
          <div class="kpi-card" style="border-color:#8b5cf6">
            <div class="kpi-label">${t.dashboard.todayMov}</div>
            <div class="kpi-value">${todayMov.length}</div>
          </div>
        </div>

        <div class="two-col">
          <div class="card">
            <div class="card-title">${t.dashboard.alertsTitle}</div>
            <div id="alert-list"></div>
          </div>
          <div class="card">
            <div class="card-title">${t.dashboard.recentTitle}</div>
            <div id="recent-table"></div>
          </div>
        </div>`;

      // Alerts
      const alertList = document.getElementById('alert-list');
      if (!lowStock.length) {
        alertList.innerHTML = `<p class="no-data">Sin alertas ✓</p>`;
      } else {
        alertList.innerHTML = lowStock.map(p => {
          const cls = p.total_stock === 0 ? 'critical' : 'warning';
          return `<div class="alert-item ${cls}">
            <div class="alert-name">${p.name}</div>
            <div class="alert-stock">${t.dashboard.stock}: ${p.total_stock} / ${t.dashboard.min}: ${p.min_stock}</div>
          </div>`;
        }).join('');
      }

      // Recent movements table
      const recent = movements.slice(0, 10);
      const recentEl = document.getElementById('recent-table');
      if (!recent.length) {
        recentEl.innerHTML = `<p class="no-data">${t.common.noData}</p>`;
      } else {
        recentEl.innerHTML = `
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr><th>Producto</th><th>Tipo</th><th>Cant.</th><th>Hora</th></tr></thead>
              <tbody>
                ${recent.map(m => `<tr>
                  <td>${m.product_name}</td>
                  <td>${badge(m.type)}</td>
                  <td>${m.quantity}</td>
                  <td style="color:var(--text-3)">${new Date(m.created_at).toLocaleTimeString('es-MX', {hour:'2-digit',minute:'2-digit'})}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>`;
      }
    } catch (e) {
      container.innerHTML = `<p class="error-msg">Error cargando dashboard: ${e.message}</p>`;
    }
  }

  await load();
  _refreshTimer = setInterval(load, 60000);
}
