import { api } from '../api.js';
import { modal, confirm, toast, renderTable } from '../components.js';
import { t } from '../i18n.js';

export async function renderLocations(container) {
  let locations = [];

  async function load() {
    locations = await api.get('/api/locations') || [];
    render();
  }

  function locationForm(l = {}) {
    return `
      <div class="form-row">
        <div class="form-group">
          <label>${t.locations.code}</label>
          <input id="l-code" value="${l.code || ''}" ${l.id ? 'readonly' : 'required'}>
        </div>
        <div class="form-group">
          <label>${t.locations.name}</label>
          <input id="l-name" value="${l.name || ''}" required>
        </div>
      </div>
      <div class="form-group">
        <label>${t.locations.description}</label>
        <input id="l-desc" value="${l.description || ''}">
      </div>`;
  }

  function render() {
    container.innerHTML = `
      <div class="toolbar">
        <div></div>
        <button class="btn btn-primary" id="btn-new">+ ${t.locations.new}</button>
      </div>
      <div class="card" id="table-area"></div>`;

    renderTable(
      document.getElementById('table-area'),
      [
        { key: 'code',        label: t.locations.code },
        { key: 'name',        label: t.locations.name },
        { key: 'description', label: t.locations.description },
      ],
      locations,
      [
        { key: 'edit',   label: t.common.edit,   style: 'secondary', onClick: openEdit },
        { key: 'delete', label: t.common.delete, style: 'danger',    onClick: doDelete },
      ]
    );

    document.getElementById('btn-new').addEventListener('click', openCreate);
  }

  function openCreate() {
    modal(`+ ${t.locations.new}`, locationForm(), async el => {
      try {
        await api.post('/api/locations', {
          code:        el.querySelector('#l-code').value.trim(),
          name:        el.querySelector('#l-name').value.trim(),
          description: el.querySelector('#l-desc').value.trim() || null,
        });
        el.remove();
        toast('Ubicación creada');
        await load();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  function openEdit(l) {
    modal(`${t.common.edit}: ${l.name}`, locationForm(l), async el => {
      try {
        await api.put(`/api/locations/${l.id}`, {
          name:        el.querySelector('#l-name').value.trim(),
          description: el.querySelector('#l-desc').value.trim() || null,
        });
        el.remove();
        toast('Ubicación actualizada');
        await load();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  async function doDelete(l) {
    if (!await confirm(t.locations.confirmDelete)) return;
    try {
      await api.del(`/api/locations/${l.id}`);
      toast('Ubicación eliminada');
      await load();
    } catch (e) { toast(e.message, 'error'); }
  }

  await load();
}
