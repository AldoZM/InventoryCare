import { api } from '../api.js';
import { badge } from '../components.js';
import { t } from '../i18n.js';

const PAGE_SIZE = 50;

export async function renderHistory(container) {
  let allRows = [];
  let page    = 0;

  // Pre-load products and locations for filter dropdowns
  const [productsRaw, locations] = await Promise.all([
    api.get('/api/products') || [],
    api.get('/api/locations') || [],
  ]);
  const products = productsRaw || [];
  const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort();

  container.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:12px;margin-bottom:12px">
        <div>
          <label style="display:block;font-size:11px;color:var(--text-3);margin-bottom:4px">Desde</label>
          <input type="date" id="h-from" style="width:100%;background:var(--bg-content);border:1px solid var(--border);border-radius:6px;color:var(--text-1);padding:7px 10px;font-size:12px;outline:none">
        </div>
        <div>
          <label style="display:block;font-size:11px;color:var(--text-3);margin-bottom:4px">Hasta</label>
          <input type="date" id="h-to" style="width:100%;background:var(--bg-content);border:1px solid var(--border);border-radius:6px;color:var(--text-1);padding:7px 10px;font-size:12px;outline:none">
        </div>
        <div>
          <label style="display:block;font-size:11px;color:var(--text-3);margin-bottom:4px">Categoría</label>
          <select id="h-cat" style="width:100%;background:var(--bg-content);border:1px solid var(--border);border-radius:6px;color:var(--text-1);padding:7px 10px;font-size:12px;outline:none">
            <option value="">Todas</option>
            ${cats.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="display:block;font-size:11px;color:var(--text-3);margin-bottom:4px">Producto</label>
          <select id="h-product" style="width:100%;background:var(--bg-content);border:1px solid var(--border);border-radius:6px;color:var(--text-1);padding:7px 10px;font-size:12px;outline:none">
            <option value="">Todos</option>
            ${products.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="display:block;font-size:11px;color:var(--text-3);margin-bottom:4px">Ubicación</label>
          <select id="h-location" style="width:100%;background:var(--bg-content);border:1px solid var(--border);border-radius:6px;color:var(--text-1);padding:7px 10px;font-size:12px;outline:none">
            <option value="">Todas</option>
            ${(locations || []).map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <div>
          <label style="display:block;font-size:11px;color:var(--text-3);margin-bottom:4px">Tipo</label>
          <select id="h-type" style="background:var(--bg-content);border:1px solid var(--border);border-radius:6px;color:var(--text-1);padding:7px 10px;font-size:12px;outline:none">
            <option value="">Todos</option>
            <option value="IN">Entrada</option>
            <option value="OUT">Salida</option>
            <option value="TRANSFER">Traslado</option>
          </select>
        </div>
        <div style="display:flex;gap:6px;align-items:flex-end;margin-top:auto;padding-top:19px">
          <button class="btn btn-primary" id="h-search">Buscar</button>
          <button class="btn btn-secondary" id="h-clear">Limpiar</button>
          <button class="btn btn-secondary" id="h-today">Hoy</button>
          <button class="btn btn-secondary" id="h-week">Esta semana</button>
          <button class="btn btn-secondary" id="h-month">Este mes</button>
        </div>
        <div style="margin-left:auto;padding-top:19px">
          <button class="btn btn-secondary" id="h-export">⬇ CSV</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div id="h-table"></div>
      <div class="pagination" id="h-pagination"></div>
    </div>`;

  function buildFilters() {
    return {
      from:       document.getElementById('h-from')?.value     || '',
      to:         document.getElementById('h-to')?.value       || '',
      product_id: document.getElementById('h-product')?.value  || '',
      location_id:document.getElementById('h-location')?.value || '',
      type:       document.getElementById('h-type')?.value     || '',
    };
  }

  function setDateRange(from, to) {
    document.getElementById('h-from').value = from;
    document.getElementById('h-to').value   = to;
  }

  async function load(filters = {}) {
    let url = '/api/movements?';
    if (filters.from)        url += `from_date=${filters.from}&`;
    if (filters.to)          url += `to_date=${filters.to}&`;
    if (filters.product_id)  url += `product_id=${filters.product_id}&`;
    if (filters.location_id) url += `location_id=${filters.location_id}&`;

    allRows = await api.get(url) || [];
    if (filters.type) allRows = allRows.filter(r => r.type === filters.type);
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

    document.getElementById('h-table').innerHTML = `
      <div style="color:var(--text-3);font-size:11px;margin-bottom:8px">${total} registro${total !== 1 ? 's' : ''}</div>
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

    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
    document.getElementById('h-pagination').innerHTML = `
      <button class="btn btn-xs btn-secondary" id="p-prev" ${page === 0 ? 'disabled' : ''}>${t.common.prev}</button>
      <span>${page + 1} / ${totalPages}</span>
      <button class="btn btn-xs btn-secondary" id="p-next" ${page >= totalPages - 1 ? 'disabled' : ''}>${t.common.next}</button>`;

    document.getElementById('p-prev')?.addEventListener('click', () => { page--; renderTable(); });
    document.getElementById('p-next')?.addEventListener('click', () => { page++; renderTable(); });
  }

  function exportCsv() {
    const header = ['Fecha','Producto','Ubicación','Tipo','Cantidad','Referencia','Notas','Usuario'];
    const rows   = allRows.map(r => [
      new Date(r.created_at).toLocaleString('es-MX'),
      r.product_name, r.location_code, r.type, r.quantity,
      r.reference || '', r.notes || '', r.user || '',
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
    const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: 'historial.csv' }).click();
    URL.revokeObjectURL(url);
  }

  // Quick date shortcuts
  const isoDate = d => d.toISOString().slice(0, 10);

  document.getElementById('h-search').addEventListener('click', () => load(buildFilters()));
  document.getElementById('h-export').addEventListener('click', exportCsv);

  document.getElementById('h-clear').addEventListener('click', () => {
    ['h-from','h-to','h-product','h-location','h-type'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    load();
  });

  document.getElementById('h-today').addEventListener('click', () => {
    const d = isoDate(new Date());
    setDateRange(d, d);
    load(buildFilters());
  });

  document.getElementById('h-week').addEventListener('click', () => {
    const now = new Date();
    const mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + 1);
    setDateRange(isoDate(mon), isoDate(now));
    load(buildFilters());
  });

  document.getElementById('h-month').addEventListener('click', () => {
    const now = new Date();
    setDateRange(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`, isoDate(now));
    load(buildFilters());
  });

  // Search on Enter in date fields
  ['h-from','h-to'].forEach(id =>
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') load(buildFilters());
    })
  );

  await load();
}
