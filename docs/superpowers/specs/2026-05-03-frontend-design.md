# InventaryCare — Frontend Design Spec
**Date:** 2026-05-03
**Status:** Approved

---

## Overview

Single Page Application (SPA) en HTML/CSS/JS vanilla, servida como static files desde FastAPI en `www/`. Dark theme completo. Sidebar colapsable. API REST ya implementada en `/api/*`.

---

## Visual Design

### Paleta de colores

| Elemento | Color |
|---|---|
| Sidebar | `#0f172a` |
| Fondo contenido | `#1a2332` |
| Tarjetas / paneles | `#243447` |
| Bordes internos | `#2e4060` |
| Texto primario | `#f1f5f9` |
| Texto secundario | `#64748b` |
| Acción / activo | `#1d4ed8` (azul) |
| Badge IN | `#166534` bg / `#86efac` texto |
| Badge OUT | `#7f1d1d` bg / `#fca5a5` texto |
| Badge TRANSFER | `#1e3a5f` bg / `#93c5fd` texto |
| Alerta crítica | `#ef4444` |
| Alerta advertencia | `#f59e0b` |

### Layout

```
┌─────────────────────────────────────────────┐
│  Sidebar (200px)  │  Header (56px)           │
│  #0f172a          │  #1a2332 + border-bottom  │
│                   ├──────────────────────────│
│  Logo + hamburger │  Contenido principal     │
│  Nav items        │  #1a2332                 │
│  ...              │  Tarjetas #243447        │
│  Usuario + logout │                          │
└─────────────────────────────────────────────┘
```

**Header height:** `56px` en sidebar y contenido — alineados exactos.

**Sidebar hamburger:** Botón ☰ en el header del sidebar. Click → sidebar se abre/cierra completamente (200px ↔ 0). Estado guardado en `localStorage`.

---

## Arquitectura

### Estructura de archivos

```
www/
├── index.html              ← shell único, nunca cambia
├── css/
│   └── app.css             ← variables CSS + estilos globales dark theme
└── js/
    ├── app.js              ← init, auth guard, arranque
    ├── router.js           ← hash router (#/ruta → vista)
    ├── api.js              ← fetch wrapper con JWT + redirect en 401
    ├── components.js       ← modal, toast, confirm, renderTable, badge
    ├── i18n.js             ← strings en español (preparado para i18n)
    └── views/
        ├── login.js
        ├── dashboard.js
        ├── products.js
        ├── inventory.js
        ├── movements.js
        ├── history.js
        ├── users.js
        └── locations.js
```

### Flujo de autenticación

1. `app.js` al iniciar: lee JWT de `localStorage`
2. Sin token → redirect a `#/login`
3. Login exitoso → guarda `{ token, role, username }` en `localStorage` → redirect a `#/dashboard`
4. `api.js` adjunta `Authorization: Bearer <token>` en cada request
5. Response 401 → borra `localStorage` → redirect a `#/login`
6. Logout → borra `localStorage` → redirect a `#/login`

### Router

Hash-based: `window.addEventListener('hashchange', ...)` + lectura inicial de `window.location.hash`.

Cada vista exporta una función `render(container)` que dibuja su HTML y registra sus event listeners.

**Auth guard por ruta:**

| Ruta | Requiere login | Requiere admin |
|---|---|---|
| `#/login` | no | no |
| todas las demás | sí | no |
| `#/settings/users` | sí | sí |
| `#/settings/locations` | sí | sí |

---

## Pantallas

### Login (`#/login`)
- Campos: usuario, contraseña
- POST `/api/auth/login`
- Error 401 → mensaje inline "Credenciales incorrectas"
- Sin sidebar ni header

### Dashboard (`#/dashboard`)
- 4 KPI cards: total productos, ubicaciones, bajo mínimo (con ⚠ naranja), movimientos hoy
- Panel alertas: lista productos con stock < min_stock (GET `/api/reports/low-stock`)
- Tabla movimientos recientes: últimos 10 (GET `/api/movements`)
- Auto-refresh cada 60 segundos

### Productos (`#/products`)
- Tabla con columnas: SKU, nombre, categoría, unidad, stock mínimo
- Buscador en tiempo real (filtra localmente después de cargar)
- Botón "Nuevo producto" (admin) → modal con formulario
- Fila → botones editar / eliminar (solo admin)
- Operadores ven la tabla solo lectura

### Inventario (`#/inventory`)
- Tabla: producto, SKU, ubicación, cantidad actual
- Filtros: por producto, por ubicación (selects)
- Filas con `quantity < min_stock` → highlight amarillo/rojo

### Movimientos (`#/movements`)
- Tres tabs: **Entrada (IN)** / **Salida (OUT)** / **Transferencia**
- IN/OUT: selects producto + ubicación, campo cantidad, referencia opcional, notas opcional
- TRANSFER: select producto, ubicación origen, ubicación destino, cantidad
- Submit → POST `/api/movements/in|out|transfer` → mensaje éxito/error inline
- Validación client-side: cantidad > 0, campos requeridos

### Historial (`#/history`)
- Tabla filtrable: rango de fechas, producto, tipo (IN/OUT/TRANSFER)
- Paginación client-side (50 por página)
- Botón "Exportar CSV" → genera y descarga CSV desde los datos cargados

### Usuarios (`#/settings/users`) — solo admin
- Tabla: username, rol, fecha creación
- Botón "Nuevo usuario" → modal (username, password, rol)
- Fila → editar rol / cambiar password / eliminar

### Ubicaciones (`#/settings/locations`) — solo admin
- Tabla: código, nombre, descripción
- CRUD completo con modal

---

## Componentes reutilizables (`www/js/components.js`)

| Componente | Uso |
|---|---|
| `modal(title, bodyHTML, onConfirm)` | CRUD creates/edits/deletes |
| `toast(msg, type)` | Feedback éxito/error (3s, esquina inferior) |
| `confirm(msg)` | Confirmación antes de eliminar |
| `renderTable(cols, rows, actions)` | Tabla genérica con columnas y acciones |
| `badge(type)` | IN/OUT/TRANSFER badge coloreado |

---

## Idioma

Español en toda la UI. Textos como constantes en `js/i18n.js` para facilitar traducción futura a inglés mediante selector de idioma (fuera de alcance de este plan).

---

## Consideraciones técnicas

- **Sin framework ni bundler** — archivos JS directos, ES modules con `type="module"`
- **CSS variables** para el tema, facilita cambio futuro a light mode
- **No hay build step** — FastAPI sirve `www/` directamente como static files
- **Compatibilidad:** Chrome / Firefox / Edge modernos (no IE)
- **Responsive:** optimizado para desktop (1280px+); mobile fuera de alcance
