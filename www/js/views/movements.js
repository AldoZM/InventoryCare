import { api } from '../api.js';
import { toast } from '../components.js';
import { t } from '../i18n.js';

export async function renderMovements(container) {
  const [products, locations] = await Promise.all([
    api.get('/api/products'),
    api.get('/api/locations'),
  ]);
  if (!products) return;

  const prodOpts = products.map(p  => `<option value="${p.id}">${p.sku} — ${p.name}</option>`).join('');
  const locOpts  = locations.map(l => `<option value="${l.id}">${l.code} — ${l.name}</option>`).join('');

  function baseFields(includeRef = true) {
    return `
      <div class="form-group">
        <label>${t.movements.product}</label>
        <select id="m-product" required><option value="">— Seleccionar —</option>${prodOpts}</select>
      </div>
      <div class="form-group">
        <label>${t.movements.location}</label>
        <select id="m-location" required><option value="">— Seleccionar —</option>${locOpts}</select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${t.movements.qty}</label>
          <input id="m-qty" type="number" min="1" required>
        </div>
        ${includeRef ? `<div class="form-group">
          <label>${t.movements.ref}</label>
          <input id="m-ref">
        </div>` : ''}
      </div>
      <div class="form-group">
        <label>${t.movements.notes}</label>
        <input id="m-notes">
      </div>`;
  }

  container.innerHTML = `
    <div class="tabs">
      <button class="tab-btn active" data-tab="in">${t.movements.in}</button>
      <button class="tab-btn"        data-tab="out">${t.movements.out}</button>
      <button class="tab-btn"        data-tab="transfer">${t.movements.transfer}</button>
    </div>

    <div class="card">
      <div id="tab-in" class="tab-panel">
        <form id="form-in">
          <div class="form-group">
            <label>🔍 Escanear SKU</label>
            <input id="scan-in" class="search-input" placeholder="Escanear o escribir SKU + Enter..." autocomplete="off" style="width:100%">
          </div>
          ${baseFields()}<button type="submit" class="btn btn-success">${t.movements.submit}</button>
        </form>
      </div>
      <div id="tab-out" class="tab-panel hidden">
        <form id="form-out">
          <div class="form-group">
            <label>🔍 Escanear SKU</label>
            <input id="scan-out" class="search-input" placeholder="Escanear o escribir SKU + Enter..." autocomplete="off" style="width:100%">
          </div>
          ${baseFields()}<button type="submit" class="btn btn-danger">${t.movements.submit}</button>
        </form>
      </div>
      <div id="tab-transfer" class="tab-panel hidden">
        <form id="form-transfer">
          <div class="form-group">
            <label>🔍 Escanear SKU</label>
            <input id="scan-tr" class="search-input" placeholder="Escanear o escribir SKU + Enter..." autocomplete="off" style="width:100%">
          </div>
          <div class="form-group">
            <label>${t.movements.product}</label>
            <select id="t-product" required><option value="">— Seleccionar —</option>${prodOpts}</select>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${t.movements.fromLoc}</label>
              <select id="t-from" required><option value="">— Seleccionar —</option>${locOpts}</select>
            </div>
            <div class="form-group">
              <label>${t.movements.toLoc}</label>
              <select id="t-to" required><option value="">— Seleccionar —</option>${locOpts}</select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${t.movements.qty}</label>
              <input id="t-qty" type="number" min="1" required>
            </div>
            <div class="form-group">
              <label>${t.movements.ref}</label>
              <input id="t-ref">
            </div>
          </div>
          <div class="form-group">
            <label>${t.movements.notes}</label>
            <input id="t-notes">
          </div>
          <button type="submit" class="btn btn-primary">${t.movements.submit}</button>
        </form>
      </div>
    </div>`;

  // Scanner wiring
  function wireScan(scanId, productSelectId, qtyId) {
    const input = document.getElementById(scanId);
    if (!input) return;
    input.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const sku = e.target.value.trim();
      if (!sku) return;
      const product = products.find(p => p.sku.toLowerCase() === sku.toLowerCase());
      if (product) {
        document.getElementById(productSelectId).value = product.id;
        document.getElementById(qtyId).focus();
        e.target.value = '';
        toast(`✓ ${product.name}`, 'success');
      } else {
        toast(`SKU no encontrado: ${sku}`, 'error');
        e.target.select();
      }
    });
  }

  wireScan('scan-in', 'm-product', 'm-qty');
  wireScan('scan-out', 'm-product', 'm-qty');
  wireScan('scan-tr', 't-product', 't-qty');

  // Tab switching
  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.tab-btn').forEach(b  => b.classList.remove('active'));
      container.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
    });
  });

  // Form submissions
  document.getElementById('form-in').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api.post('/api/movements/in', {
        product_id:  +document.getElementById('m-product').value,
        location_id: +document.getElementById('m-location').value,
        quantity:    +document.getElementById('m-qty').value,
        reference:   document.getElementById('m-ref').value || null,
        notes:       document.getElementById('m-notes').value || null,
      });
      toast(t.movements.success);
      e.target.reset();
    } catch (err) { toast(err.message, 'error'); }
  });

  document.getElementById('form-out').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api.post('/api/movements/out', {
        product_id:  +document.getElementById('m-product').value,
        location_id: +document.getElementById('m-location').value,
        quantity:    +document.getElementById('m-qty').value,
        reference:   document.getElementById('m-ref').value || null,
        notes:       document.getElementById('m-notes').value || null,
      });
      toast(t.movements.success);
      e.target.reset();
    } catch (err) { toast(err.message, 'error'); }
  });

  document.getElementById('form-transfer').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api.post('/api/movements/transfer', {
        product_id:       +document.getElementById('t-product').value,
        from_location_id: +document.getElementById('t-from').value,
        to_location_id:   +document.getElementById('t-to').value,
        quantity:         +document.getElementById('t-qty').value,
        reference:        document.getElementById('t-ref').value || null,
        notes:            document.getElementById('t-notes').value || null,
      });
      toast(t.movements.success);
      e.target.reset();
    } catch (err) { toast(err.message, 'error'); }
  });
}
