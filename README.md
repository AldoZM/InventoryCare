# InventaryCare

Sistema de gestión de inventario para pequeñas y medianas empresas. Aplicación web con backend en Python FastAPI y frontend SPA en JavaScript vanilla con tema oscuro.

---

## Características

- **Dashboard** con KPIs en tiempo real: total de productos, ubicaciones, artículos bajo mínimo y movimientos del día. Auto-refresh cada 60 segundos.
- **Productos** — CRUD completo con buscador en tiempo real. Impresión de etiquetas con código de barras (Code128) para impresoras térmicas.
- **Inventario** — stock por producto y ubicación con highlighting automático cuando el stock está bajo el mínimo.
- **Movimientos** — registro de entradas (IN), salidas (OUT) y transferencias entre ubicaciones. Soporte para pistola de escáner de códigos de barras (auto-selección por SKU).
- **Historial** — movimientos filtrables por fecha, producto y tipo. Paginación y exportación a CSV.
- **Usuarios** — gestión de cuentas con roles admin/operador (solo admin).
- **Ubicaciones** — CRUD de ubicaciones de almacén (solo admin).
- **Autenticación** con JWT, sesión de 8 horas.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend | Python 3.13 + FastAPI |
| Base de datos | PostgreSQL |
| Frontend | HTML/CSS/JS vanilla, ES Modules |
| Autenticación | JWT (python-jose) + Argon2 (passlib) |
| ORM/DB driver | psycopg2-binary |

---

## Requisitos

- Python 3.11+
- PostgreSQL 13+

---

## Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/AldoZM/InventoryCare.git
cd InventoryCare
```

### 2. Crear entorno virtual e instalar dependencias

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt
```

### 3. Configurar base de datos

Crear un usuario y base de datos en PostgreSQL:

```sql
CREATE USER inventorycare WITH PASSWORD 'tu_password';
ALTER USER inventorycare CREATEDB;
```

### 4. Crear archivo `.env`

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=inventorycare
DB_USER=inventorycare
DB_PASSWORD=tu_password
SECRET_KEY=cambia-este-valor-en-produccion
TOKEN_EXPIRE_HOURS=8
PORT=8080
```

### 5. Iniciar el servidor

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8080
```

Abrir en el navegador: **http://localhost:8080**

Credenciales iniciales: `admin` / `admin123` — **cambiar después del primer inicio de sesión**.

---

## Acceso en red local

El servidor escucha en `0.0.0.0:8080`, por lo que otras PCs en la misma red pueden acceder usando la IP de la máquina principal:

```
http://192.168.x.x:8080
```

No requiere instalación en las PCs clientes — solo un navegador moderno (Chrome, Firefox, Edge).

---

## Estructura del proyecto

```
InventaryCare/
├── app/
│   ├── main.py          # FastAPI app, montaje de static files
│   ├── auth.py          # JWT, hashing de contraseñas
│   ├── database.py      # Pool de conexiones PostgreSQL
│   ├── migrations.py    # Schema y datos iniciales
│   └── routers/
│       ├── auth.py
│       ├── products.py
│       ├── locations.py
│       ├── inventory.py
│       ├── movements.py
│       ├── reports.py
│       └── users.py
├── www/
│   ├── index.html       # Shell único de la SPA
│   ├── css/app.css      # Variables dark theme + estilos
│   └── js/
│       ├── app.js       # Boot, auth guard, sidebar
│       ├── router.js    # Hash router
│       ├── api.js       # Fetch wrapper con JWT
│       ├── session.js   # localStorage session
│       ├── components.js# modal, toast, confirm, renderTable, badge
│       ├── i18n.js      # Strings en español
│       └── views/       # Una vista por pantalla
├── requirements.txt
└── .env                 # No incluido en git
```

---

## Roles

| Rol | Permisos |
|---|---|
| `admin` | Acceso completo: CRUD productos, ubicaciones, usuarios, movimientos |
| `operator` | Solo lectura en productos e inventario. Puede registrar movimientos. |
