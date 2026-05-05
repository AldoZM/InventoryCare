import { api } from '../api.js';
import { badge } from '../components.js';
import { t } from '../i18n.js';
import { getSession } from '../session.js';

let _refreshTimer = null;
let _chartStock = null;
let _chartMov = null;

export async function renderDashboard(container) {
  if (_refreshTimer) clearInterval(_refreshTimer);
  if (_chartStock) { _chartStock.destroy(); _chartStock = null; }
  if (_chartMov)   { _chartMov.destroy();   _chartMov = null; }

  container.innerHTML = `<p class="no-data">${t.common.loading}</p>`;

  async function load() {
    if (_chartStock) { _chartStock.destroy(); _chartStock = null; }
    if (_chartMov)   { _chartMov.destroy();   _chartMov = null; }

    try {
      const from7 = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);

      const [products, locations, lowStock, movements, stockReport, movReport] = await Promise.all([
        api.get('/api/products'),
        api.get('/api/locations'),
        api.get('/api/reports/low-stock'),
        api.get('/api/movements'),
        api.get('/api/reports/stock'),
        api.get(`/api/reports/movements?from_date=${from7}`),
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
        </div>

        <div class="two-col" style="margin-top:20px">
          <div class="card">
            <div class="card-title">Stock por producto (top 10)</div>
            <canvas id="chart-stock" height="220"></canvas>
          </div>
          <div class="card">
            <div class="card-title">Movimientos — últimos 7 días</div>
            <canvas id="chart-mov" height="220"></canvas>
          </div>
        </div>

        <div class="card" style="margin-top:20px; display:flex; align-items:center; justify-content:space-between;">
          <div>
            <div class="card-title" style="margin-bottom:4px">Exportar datos</div>
            <p style="color:var(--text-3);font-size:12px;margin:0">Descarga toda la información en un archivo Excel con hojas por categoría.</p>
          </div>
          <button id="btn-export-excel" class="btn btn-success" style="background:#166534;color:#86efac;white-space:nowrap">
            ⬇ Exportar a Excel (.xlsx)
          </button>
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

      // Chart: top 10 products by stock
      const top10 = [...stockReport]
        .sort((a, b) => b.total_stock - a.total_stock)
        .slice(0, 10);

      _chartStock = new Chart(document.getElementById('chart-stock'), {
        type: 'bar',
        data: {
          labels: top10.map(p => p.name.length > 16 ? p.name.slice(0, 14) + '…' : p.name),
          datasets: [{
            label: 'Stock',
            data: top10.map(p => p.total_stock),
            backgroundColor: '#1d4ed8cc',
            borderColor: '#3b82f6',
            borderWidth: 1,
            borderRadius: 4,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#2e4060' } },
            y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#2e4060' }, beginAtZero: true },
          },
        },
      });

      // Chart: movements last 7 days
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(Date.now() - (6 - i) * 864e5);
        return d.toISOString().slice(0, 10);
      });

      const byDay = (type) => days.map(day => {
        const r = movReport.find(m => m.day === day && m.type === type);
        return r ? r.total_quantity : 0;
      });

      _chartMov = new Chart(document.getElementById('chart-mov'), {
        type: 'bar',
        data: {
          labels: days.map(d => d.slice(5)),
          datasets: [
            { label: 'Entradas',    data: byDay('IN'),       backgroundColor: '#166534cc', borderColor: '#10b981', borderWidth: 1, borderRadius: 4 },
            { label: 'Salidas',     data: byDay('OUT'),      backgroundColor: '#7f1d1dcc', borderColor: '#ef4444', borderWidth: 1, borderRadius: 4 },
            { label: 'Traslados',   data: byDay('TRANSFER'), backgroundColor: '#1e3a5fcc', borderColor: '#3b82f6', borderWidth: 1, borderRadius: 4 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
          scales: {
            x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#2e4060' }, stacked: false },
            y: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: '#2e4060' }, beginAtZero: true },
          },
        },
      });

      // Export button
      document.getElementById('btn-export-excel')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-export-excel');
        btn.disabled = true;
        btn.textContent = 'Generando...';
        try {
          const session = getSession();
          const res = await fetch('/api/export', {
            headers: { Authorization: `Bearer ${session?.token}` },
          });
          if (!res.ok) throw new Error(`Error ${res.status}`);
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `inventarycare_export_${new Date().toISOString().slice(0,10)}.xlsx`;
          a.click();
          URL.revokeObjectURL(url);
        } catch (err) {
          alert(`No se pudo exportar: ${err.message}`);
        } finally {
          btn.disabled = false;
          btn.innerHTML = '⬇ Exportar a Excel (.xlsx)';
        }
      });

    } catch (e) {
      container.innerHTML = `<p class="error-msg">Error cargando dashboard: ${e.message}</p>`;
    }
  }

  await load();
  _refreshTimer = setInterval(load, 60000);
}
