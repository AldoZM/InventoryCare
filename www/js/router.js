const routes = new Map();

export function addRoute(hash, handler) {
  routes.set(hash, handler);
}

export function navigate(hash) {
  window.location.hash = hash;
}

async function dispatch() {
  const hash = window.location.hash || '#/login';
  const handler = routes.get(hash) || routes.get('*');
  if (handler) await handler(hash);
}

export function initRouter() {
  window.addEventListener('hashchange', dispatch);
  dispatch();
}
