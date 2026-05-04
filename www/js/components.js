import { t } from './i18n.js';

export function badge(type) {
  return `<span class="badge badge-${type}">${type}</span>`;
}

export function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

export function modal(title, bodyHTML, onConfirm) {
  document.getElementById('ic-modal')?.remove();
  const el = document.createElement('div');
  el.id = 'ic-modal';
  el.className = 'modal-overlay';
  el.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <h2>${title}</h2>
        <button class="modal-close">✕</button>
      </div>
      <div class="modal-body">${bodyHTML}</div>
      <div class="modal-footer">
        <button class="btn btn-secondary modal-cancel">${t.common.cancel}</button>
        <button class="btn btn-primary modal-confirm">${t.common.save}</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('.modal-close').onclick  = () => el.remove();
  el.querySelector('.modal-cancel').onclick = () => el.remove();
  el.querySelector('.modal-confirm').onclick = () => onConfirm(el);
  return el;
}

export function confirm(msg) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'modal-overlay';
    el.innerHTML = `
      <div class="modal-box modal-sm">
        <div class="modal-body"><p style="color:var(--text-1)">${msg}</p></div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="conf-no">${t.common.cancel}</button>
          <button class="btn btn-danger"    id="conf-yes">${t.common.delete}</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('#conf-no').onclick  = () => { el.remove(); resolve(false); };
    el.querySelector('#conf-yes').onclick = () => { el.remove(); resolve(true);  };
  });
}

export function renderTable(container, cols, rows, actions = []) {
  if (!rows.length) {
    container.innerHTML = `<p class="no-data">${t.common.noData}</p>`;
    return;
  }
  const actHead = actions.length ? `<th>${t.common.actions}</th>` : '';
  const head = cols.map(c => `<th>${c.label}</th>`).join('') + actHead;

  const body = rows.map((row, i) => {
    const cells = cols.map(c => {
      const val = typeof c.render === 'function' ? c.render(row) : (row[c.key] ?? '');
      return `<td>${val}</td>`;
    }).join('');
    const actCells = actions.length
      ? `<td class="actions-cell">${actions.map(a =>
          `<button class="btn btn-xs btn-${a.style||'secondary'}" data-row="${i}" data-action="${a.key}">${a.label}</button>`
        ).join('')}</td>`
      : '';
    return `<tr>${cells}${actCells}</tr>`;
  }).join('');

  container.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;

  container.querySelectorAll('button[data-action]').forEach(btn => {
    const action = actions.find(a => a.key === btn.dataset.action);
    if (action) btn.addEventListener('click', () => action.onClick(rows[+btn.dataset.row]));
  });
}
