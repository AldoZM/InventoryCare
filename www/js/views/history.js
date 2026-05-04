import { api } from '../api.js';
import { badge } from '../components.js';
import { t } from '../i18n.js';

const PAGE_SIZE = 50;

export async function renderHistory(container) {
  let allRows = [];
  let page    = 0;

  function buildFilters() {
    const from = document.getElementById('h-from')?.value || '';
    const to   = document.getElementById('h-to')?.value   || '';
    const type = document.getElementById('h-type')?.value || '';
    return { from, to, type };
  }

  async function load({ from, to, type } = {}) {
    let url = '/api/movements?';
    if (from) url += `from_date=${from}&`;
    if (to)   url += `to_date=${to}&`;
    allRows = await api.get(url) || [];
    if (type) allRows = allRows.filter(r => r.type === type);
    page = 0;
    renderTable();
  }

  function renderTable() {
    const total = allRows.length;
    const start = page * PAGE_SIZE;
    const rows  = allRows.slice(start, start + PAGE_SIZE);

    const tbody = rows.map(r => `<tr>
      <td style="color:var(--text-3)">${new Date(r.created_at).toLocaleString('es-MX')}</td>
      <td>${r.product_name}</td>
      <td style="color:var(--text-3)">${r.location_code}</td>
      <td>${badge(r.type)}</td>
      <td>${r.quantity}</td>
      <td style="color:var(--text-3)">${r.reference || ''}</td>
      <td style="color:var(--text-3)">${r.user || ''}</td>
    </tr>`).join('') || `<tr><td colspan="7" class="no-data">${t.common.noData}</td></tr>`;

    const tableEl = document.getElementById('h-table');
    const paginEl = document.getElementById('h-pagination');
    if (tableEl) {
      tableEl.innerHTML = `
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr>
              <th>${t.history.date}</th><th>${t.history.product}</th>
              <th>${t.history.location}</th><th>${t.history.type}</th>
              <th>${t.history.qty}</th><th>${t.history.ref}</th>
              <th>${t.history.user}</th>
            </tr></thead>
            <tbody>${tbody}</tbody>
          </table>
        </div>`;
    }
    if (paginEl) {
      const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
      paginEl.innerHTML = `
        <button class="btn btn-xs btn-secondary" id="p-prev" ${page === 0 ? 'disabled' : ''}>${t.common.prev}</button>
        <span>${t.common.of ? `${page+1} ${t.common.of} ${totalPages}` : `${page+1}/${totalPages}`}</span>
        <button class="btn btn-xs btn-secondary" id="p-next" ${page >= totalPages-1 ? 'disabled' : ''}>${t.common.next}</button>`;
      document.getElementById('p-prev')?.addEventListener('click', () => { page--; renderTable(); });
      document.getElementById('p-next')?.addEventListener('click', () => { page++; renderTable(); });
    }
  }

  function exportCsv() {
    const header = ['Fecha','Producto','Ubicación','Tipo','Cantidad','Referencia','Notas','Usuario'];
    const rows   = allRows.map(r => [
      new Date(r.created_at).toLocaleString('es-MX'),
      r.product_name, r.location_code, r.type, r.quantity,
      r.reference || '', r.notes || '', r.user || '',
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
    const csv  = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'historial.csv' });
    a.click();
    URL.revokeObjectURL(url);
  }

  container.innerHTML = `
    <div class="toolbar">
      <div class="filter-bar" style="margin:0">
        <input type="date" id="h-from" title="${t.history.from}">
        <input type="date" id="h-to"   title="${t.history.to}">
        <select id="h-type">
          <option value="">${t.history.allTypes}</option>
          <option value="IN">IN</option>
          <option value="OUT">OUT</option>
          <option value="TRANSFER">TRANSFER</option>
        </select>
        <button class="btn btn-secondary" id="h-search">Buscar</button>
      </div>
      <button class="btn btn-secondary" id="h-export">⬇ ${t.history.exportCsv}</button>
    </div>
    <div class="card">
      <div id="h-table"></div>
      <div class="pagination" id="h-pagination"></div>
    </div>`;

  document.getElementById('h-search').addEventListener('click', () => load(buildFilters()));
  document.getElementById('h-export').addEventListener('click', exportCsv);

  await load();
}
