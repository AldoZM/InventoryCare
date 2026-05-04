import { api } from '../api.js';
import { t } from '../i18n.js';

export async function renderInventory(container) {
  const [inventory, products, locations] = await Promise.all([
    api.get('/api/inventory'),
    api.get('/api/products'),
    api.get('/api/locations'),
  ]);
  if (!inventory) return;

  let filterProd = '', filterLoc = '';

  function render() {
    const rows = inventory.filter(r =>
      (!filterProd || r.product.id == filterProd) &&
      (!filterLoc  || r.location.id == filterLoc)
    );

    const prodOpts = products.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    const locOpts  = locations.map(l => `<option value="${l.id}">${l.code} — ${l.name}</option>`).join('');

    container.innerHTML = `
      <div class="filter-bar">
        <select id="f-prod">
          <option value="">${t.inventory.allProducts}</option>${prodOpts}
        </select>
        <select id="f-loc">
          <option value="">${t.inventory.allLocations}</option>${locOpts}
        </select>
      </div>
      <div class="card">
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr>
              <th>${t.inventory.product}</th>
              <th>${t.inventory.sku}</th>
              <th>${t.inventory.location}</th>
              <th>${t.inventory.qty}</th>
            </tr></thead>
            <tbody>
              ${rows.map(r => {
                const cls = r.low_stock ? (r.quantity === 0 ? 'row-danger' : 'row-warning') : '';
                return `<tr class="${cls}">
                  <td>${r.product.name}</td>
                  <td style="color:var(--text-3)">${r.product.sku}</td>
                  <td>${r.location.code} — ${r.location.name}</td>
                  <td>${r.quantity} ${r.product.unit}${r.low_stock ? ' ⚠' : ''}</td>
                </tr>`;
              }).join('') || `<tr><td colspan="4" class="no-data">${t.common.noData}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;

    document.getElementById('f-prod').value = filterProd;
    document.getElementById('f-loc').value  = filterLoc;
    document.getElementById('f-prod').addEventListener('change', e => { filterProd = e.target.value; render(); });
    document.getElementById('f-loc').addEventListener('change',  e => { filterLoc  = e.target.value; render(); });
  }

  render();
}
