import { api } from '../api.js';
import { modal, confirm, toast, renderTable } from '../components.js';
import { t } from '../i18n.js';

export async function renderUsers(container) {
  let users = [];

  async function load() {
    users = await api.get('/api/users') || [];
    render();
  }

  function userForm(u = {}) {
    return `
      <div class="form-group">
        <label>${t.users.username}</label>
        <input id="u-name" value="${u.username || ''}" ${u.id ? 'readonly' : 'required'}>
      </div>
      <div class="form-group">
        <label>${t.users.password}${u.id ? ' (dejar vacío para no cambiar)' : ''}</label>
        <input id="u-pass" type="password" ${u.id ? '' : 'required'}>
      </div>
      <div class="form-group">
        <label>${t.users.role}</label>
        <select id="u-role">
          <option value="operator" ${u.role === 'operator' ? 'selected' : ''}>${t.users.operator}</option>
          <option value="admin"    ${u.role === 'admin'    ? 'selected' : ''}>${t.users.admin}</option>
        </select>
      </div>`;
  }

  function render() {
    container.innerHTML = `
      <div class="toolbar">
        <div></div>
        <button class="btn btn-primary" id="btn-new">+ ${t.users.new}</button>
      </div>
      <div class="card" id="table-area"></div>`;

    renderTable(
      document.getElementById('table-area'),
      [
        { key: 'username',   label: t.users.username },
        { key: 'role',       label: t.users.role, render: r => `<span class="badge" style="${r.role==='admin'?'background:#1e3a5f;color:#93c5fd':'background:#1e293b;color:#94a3b8'}">${r.role}</span>` },
        { key: 'created_at', label: t.users.createdAt, render: r => new Date(r.created_at).toLocaleDateString('es-MX') },
      ],
      users,
      [
        { key: 'edit',   label: t.common.edit,   style: 'secondary', onClick: openEdit },
        { key: 'delete', label: t.common.delete, style: 'danger',    onClick: doDelete },
      ]
    );

    document.getElementById('btn-new').addEventListener('click', openCreate);
  }

  function openCreate() {
    modal(`+ ${t.users.new}`, userForm(), async el => {
      const pass = el.querySelector('#u-pass').value;
      if (!pass) { toast('La contraseña es requerida', 'error'); return; }
      try {
        await api.post('/api/users', {
          username: el.querySelector('#u-name').value.trim(),
          password: pass,
          role:     el.querySelector('#u-role').value,
        });
        el.remove();
        toast('Usuario creado');
        await load();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  function openEdit(u) {
    modal(`${t.common.edit}: ${u.username}`, userForm(u), async el => {
      const body = { role: el.querySelector('#u-role').value };
      const pass = el.querySelector('#u-pass').value;
      if (pass) body.password = pass;
      try {
        await api.put(`/api/users/${u.id}`, body);
        el.remove();
        toast('Usuario actualizado');
        await load();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  async function doDelete(u) {
    if (!await confirm(t.users.confirmDelete)) return;
    try {
      await api.del(`/api/users/${u.id}`);
      toast('Usuario eliminado');
      await load();
    } catch (e) { toast(e.message, 'error'); }
  }

  await load();
}
