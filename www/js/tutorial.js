const STEPS = [
  { title: 'Bienvenido a InventaryCare', text: 'Este breve tutorial te muestra cómo usar el sistema. Puedes saltarlo en cualquier momento.', target: null },
  { title: 'Dashboard',    text: 'Resumen general: total de productos, ubicaciones, artículos bajo mínimo y movimientos del día. Se actualiza cada 60 segundos.', target: '[data-route="dashboard"]' },
  { title: 'Productos',    text: 'Registra y administra los productos de tu inventario. Cada producto tiene SKU, nombre, categoría, unidad y stock mínimo.', target: '[data-route="products"]' },
  { title: 'Ubicaciones',  text: 'Define las zonas o estantes de tu almacén. Cada ubicación tiene un código único (ej. "A-3") y un nombre.', target: '[data-route="locations"]' },
  { title: 'Inventario',   text: 'Consulta el stock actual por producto y ubicación. Las filas en rojo indican que el stock está por debajo del mínimo.', target: '[data-route="inventory"]' },
  { title: 'Movimientos',  text: 'Registra entradas (IN), salidas (OUT) y transferencias entre ubicaciones. Compatible con lector de código de barras.', target: '[data-route="movements"]' },
  { title: 'Historial',    text: 'Consulta todos los movimientos registrados. Filtra por fecha, producto o tipo, y exporta a CSV.', target: '[data-route="history"]' },
  { title: '¡Listo para empezar!', text: 'Ya conoces el sistema. Recuerda cambiar la contraseña del administrador en Usuarios. ¡Mucho éxito!', target: null },
];

let _step = 0;
let _key  = 'ic_tutorial_done_default';

// The 3 independent DOM layers
let _bg    = null;  // z-index 1000 — full-screen dark overlay
let _spot  = null;  // z-index 1001 — transparent box that "cuts" through
let _card  = null;  // z-index 1002 — tutorial card

function _cleanup() {
  [_bg, _spot, _card].forEach(el => el && el.remove());
  _bg = _spot = _card = null;
}

function _done() {
  localStorage.setItem(_key, '1');
  _cleanup();
}

function _render() {
  const step   = STEPS[_step];
  const isFirst = _step === 0;
  const isLast  = _step === STEPS.length - 1;

  // ── Background overlay ──────────────────────────────────────
  if (!_bg) {
    _bg = document.createElement('div');
    _bg.className = 'tut-bg';
    document.body.appendChild(_bg);
  }

  // ── Spotlight ────────────────────────────────────────────────
  if (_spot) { _spot.remove(); _spot = null; }

  if (step.target) {
    const el = document.querySelector(step.target);
    if (el) {
      const r = el.getBoundingClientRect();
      _spot = document.createElement('div');
      _spot.className = 'tut-spot';
      _spot.style.cssText =
        `top:${r.top - 6}px;left:${r.left - 6}px;width:${r.width + 12}px;height:${r.height + 12}px;`;
      document.body.appendChild(_spot);
    }
  }

  // ── Card ─────────────────────────────────────────────────────
  if (!_card) {
    _card = document.createElement('div');
    _card.className = 'tut-card';
    document.body.appendChild(_card);
  }

  _card.innerHTML = `
    <span class="tut-counter">${_step + 1} / ${STEPS.length}</span>
    <h2>${step.title}</h2>
    <p>${step.text}</p>
    <div class="tut-actions">
      <button class="btn-ghost" id="tut-skip">Saltar tutorial</button>
      <div class="tut-nav">
        ${!isFirst ? '<button class="btn btn-secondary" id="tut-back">← Atrás</button>' : ''}
        <button class="btn btn-primary" id="tut-next">${isLast ? 'Finalizar' : 'Continuar →'}</button>
      </div>
    </div>`;

  document.getElementById('tut-skip').addEventListener('click', _done);
  document.getElementById('tut-next').addEventListener('click', () => {
    if (isLast) { _done(); return; }
    _step++;
    _render();
  });
  const back = document.getElementById('tut-back');
  if (back) back.addEventListener('click', () => { _step--; _render(); });
}

export function startTutorial(username = 'default') {
  _key = `ic_tutorial_done_${username}`;
  if (localStorage.getItem(_key)) return;
  _step = 0;
  _render();
}
