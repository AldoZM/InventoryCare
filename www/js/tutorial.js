const STEPS = [
  {
    title: 'Bienvenido a InventaryCare',
    text: 'Este breve tutorial te muestra cómo usar el sistema. Puedes saltarlo en cualquier momento.',
    target: null,
  },
  {
    title: 'Dashboard',
    text: 'Resumen general: total de productos, ubicaciones, artículos bajo mínimo y movimientos del día. Se actualiza cada 60 segundos.',
    target: '[data-route="dashboard"]',
  },
  {
    title: 'Productos',
    text: 'Registra y administra los productos de tu inventario. Cada producto tiene SKU, nombre, categoría, unidad y stock mínimo.',
    target: '[data-route="products"]',
  },
  {
    title: 'Ubicaciones',
    text: 'Define las zonas o estantes de tu almacén. Cada ubicación tiene un código único (ej. "A-3") y un nombre.',
    target: '[data-route="locations"]',
  },
  {
    title: 'Inventario',
    text: 'Consulta el stock actual por producto y ubicación. Las filas en rojo indican que el stock está por debajo del mínimo.',
    target: '[data-route="inventory"]',
  },
  {
    title: 'Movimientos',
    text: 'Registra entradas (IN), salidas (OUT) y transferencias entre ubicaciones. Compatible con lector de código de barras.',
    target: '[data-route="movements"]',
  },
  {
    title: 'Historial',
    text: 'Consulta todos los movimientos registrados. Filtra por fecha, producto o tipo, y exporta a CSV.',
    target: '[data-route="history"]',
  },
  {
    title: '¡Listo para empezar!',
    text: 'Ya conoces el sistema. Recuerda cambiar la contraseña del administrador en Usuarios. ¡Mucho éxito!',
    target: null,
  },
];

let _step = 0;
let _overlay = null;
let _highlight = null;
let _key = 'ic_tutorial_done_default';

function _done() {
  localStorage.setItem(_key, '1');
  if (_overlay) _overlay.remove();
  if (_highlight) _highlight.remove();
  _overlay = null;
  _highlight = null;
}

function _render() {
  const step = STEPS[_step];
  const isFirst = _step === 0;
  const isLast = _step === STEPS.length - 1;

  // Remove previous highlight
  if (_highlight) _highlight.remove();

  // Spotlight target element
  if (step.target) {
    const el = document.querySelector(step.target);
    if (el) {
      const rect = el.getBoundingClientRect();
      _highlight = document.createElement('div');
      _highlight.className = 'tutorial-highlight';
      _highlight.style.cssText = `
        top:${rect.top - 4}px;
        left:${rect.left - 4}px;
        width:${rect.width + 8}px;
        height:${rect.height + 8}px;
      `;
      document.body.appendChild(_highlight);
    }
  }

  // Update card content
  document.getElementById('tut-counter').textContent = `${_step + 1} / ${STEPS.length}`;
  document.getElementById('tut-title').textContent = step.title;
  document.getElementById('tut-text').textContent = step.text;
  document.getElementById('tut-back').style.display = isFirst ? 'none' : '';
  document.getElementById('tut-next').textContent = isLast ? 'Finalizar' : 'Continuar →';
}

export function startTutorial(username = 'default') {
  _key = `ic_tutorial_done_${username}`;
  if (localStorage.getItem(_key)) return;

  _step = 0;
  _overlay = document.createElement('div');
  _overlay.className = 'tutorial-overlay';
  _overlay.innerHTML = `
    <div class="tutorial-card">
      <span id="tut-counter" class="tut-counter"></span>
      <h2 id="tut-title"></h2>
      <p id="tut-text"></p>
      <div class="tut-actions">
        <button id="tut-skip" class="btn btn-ghost">Saltar tutorial</button>
        <div class="tut-nav">
          <button id="tut-back" class="btn btn-secondary">← Atrás</button>
          <button id="tut-next" class="btn btn-primary"></button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(_overlay);

  document.getElementById('tut-skip').addEventListener('click', _done);
  document.getElementById('tut-back').addEventListener('click', () => { _step--; _render(); });
  document.getElementById('tut-next').addEventListener('click', () => {
    if (_step === STEPS.length - 1) { _done(); return; }
    _step++;
    _render();
  });

  _render();
}
