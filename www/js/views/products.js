import { api } from '../api.js';
import { modal, confirm, toast, renderTable } from '../components.js';
import { t } from '../i18n.js';

export async function renderProducts(container, session) {
  let products = [];

  function productForm(p = {}) {
    return `
      <div class="form-row">
        <div class="form-group">
          <label>${t.products.sku}</label>
          <input id="f-sku" value="${p.sku || ''}" ${p.id ? 'readonly' : 'required'}>
        </div>
        <div class="form-group">
          <label>${t.products.name}</label>
          <input id="f-name" value="${p.name || ''}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${t.products.category}</label>
          <input id="f-cat" value="${p.category || ''}">
        </div>
        <div class="form-group">
          <label>${t.products.unit}</label>
          <input id="f-unit" value="${p.unit || 'pcs'}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${t.products.minStock}</label>
          <input id="f-min" type="number" min="0" value="${p.min_stock ?? 0}" required>
        </div>
        <div class="form-group">
          <label>${t.products.description}</label>
          <input id="f-desc" value="${p.description || ''}">
        </div>
      </div>`;
  }

  async function load() {
    products = await api.get('/api/products') || [];
    render();
  }

  function render(filter = '') {
    const visible = filter
      ? products.filter(p => p.name.toLowerCase().includes(filter.toLowerCase()) || p.sku.toLowerCase().includes(filter.toLowerCase()))
      : products;

    const actions = [
      { key: 'print', label: '🖨', style: 'secondary', onClick: printLabel },
      ...(session.role === 'admin' ? [
        { key: 'edit',   label: t.common.edit,   style: 'secondary', onClick: openEdit },
        { key: 'delete', label: t.common.delete, style: 'danger',    onClick: doDelete },
      ] : []),
    ];

    container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <input class="search-input" id="search" placeholder="${t.products.search}" value="${filter}">
        </div>
        <div class="toolbar-right">
          ${session.role === 'admin' ? `<button class="btn btn-primary" id="btn-new">+ ${t.products.new}</button>` : ''}
        </div>
      </div>
      <div class="card" id="table-area"></div>`;

    renderTable(
      document.getElementById('table-area'),
      [
        { key: 'sku',       label: t.products.sku },
        { key: 'name',      label: t.products.name },
        { key: 'category',  label: t.products.category },
        { key: 'unit',      label: t.products.unit },
        { key: 'min_stock', label: t.products.minStock },
      ],
      visible,
      actions
    );

    document.getElementById('search').addEventListener('input', e => render(e.target.value));
    document.getElementById('btn-new')?.addEventListener('click', openCreate);
  }

  function printLabel(p) {
    const win = window.open('', '_blank', 'width=320,height=240');
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <style>
    @page { size: 57mm 32mm; margin: 2mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; width: 53mm; }
    .name { font-size: 9pt; font-weight: bold; margin-bottom: 2mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sku  { font-size: 7pt; color: #444; text-align: center; margin-top: 1mm; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
</head>
<body>
  <div class="name">${p.name}</div>
  <svg id="bc"></svg>
  <div class="sku">${p.sku}</div>
  <script>
    JsBarcode('#bc','${p.sku}',{format:'CODE128',width:1.5,height:40,displayValue:false,margin:0});
    setTimeout(()=>window.print(),300);
  <\/script>
</body>
</html>`);
    win.document.close();
  }

  function openCreate() {
    modal(`+ ${t.products.new}`, productForm(), async el => {
      const body = {
        sku:         el.querySelector('#f-sku').value.trim(),
        name:        el.querySelector('#f-name').value.trim(),
        category:    el.querySelector('#f-cat').value.trim() || null,
        unit:        el.querySelector('#f-unit').value.trim(),
        min_stock:   +el.querySelector('#f-min').value,
        description: el.querySelector('#f-desc').value.trim() || null,
      };
      try {
        await api.post('/api/products', body);
        el.remove();
        toast('Producto creado');
        await load();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  function openEdit(p) {
    modal(`${t.common.edit}: ${p.name}`, productForm(p), async el => {
      const body = {
        name:        el.querySelector('#f-name').value.trim(),
        category:    el.querySelector('#f-cat').value.trim() || null,
        unit:        el.querySelector('#f-unit').value.trim(),
        min_stock:   +el.querySelector('#f-min').value,
        description: el.querySelector('#f-desc').value.trim() || null,
      };
      try {
        await api.put(`/api/products/${p.id}`, body);
        el.remove();
        toast('Producto actualizado');
        await load();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  async function doDelete(p) {
    if (!await confirm(t.products.confirmDelete)) return;
    try {
      await api.del(`/api/products/${p.id}`);
      toast('Producto eliminado');
      await load();
    } catch (e) { toast(e.message, 'error'); }
  }

  await load();
}
