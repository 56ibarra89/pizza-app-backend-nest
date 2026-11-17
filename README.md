# Pizza To Go POS — Backend API (NestJS 11 & Prisma)

> **Idioma / Language**: [🇪🇸 Español](#-español) | [🇺🇸 English](#-english)

---

## 🇪🇸 Español

Backend transaccional del sistema de Punto de Venta (POS), Facturación, Cocina (KDS), Despacho, Arqueo de Caja y Administración para **Pizza To Go**, desarrollado con **NestJS 11**, **TypeScript**, **Prisma ORM**, **PostgreSQL** y **Socket.IO**.

---

### ✨ Características e Invariantes de Arquitectura

1. **Monolito Modular en Capas con Inversión de Dependencias**:
   - Cada dominio sigue una separación limpia: `Controller / Gateway -> Service + Validator -> Repository Interface -> Prisma Repository -> Mapper`.
   - Comunicación desacoplada entre dominios mediante bus de eventos interno (`EventEmitter2`).
2. **Seguridad y Control de Acceso Granular (`RBAC` + Recursos)**:
   - Cadena global de seguridad: `ThrottlerGuard` -> `JwtAuthGuard` -> `RolesGuard`.
   - Siete roles base del sistema (`ADMIN`, `CAJERO`, `CAJERO_PRINCIPAL`, `MESERO`, `COCINERO`, `MOTORIZADO`, `DESPACHADOR`) más roles personalizados (`AccessRole`) y catálogo de permisos evaluados con lógica estricta **`AND` (`every`)**.
   - Autorización a nivel de recurso: un `motorizado` sólo puede operar sus propios pedidos de `delivery`, y un `cocinero` sólo opera ítems de su cocina asignada en el día comercial.
   - Revalidación continua de sesiones (`isActive`, `tokenVersion` y expiración de JWT) en conexiones persistentes (`Socket.IO` y `SSE`).
3. **Integridad Financiera y Concurrencia Pesimista/Optimista**:
   - **Inmutabilidad Comercial**: Las órdenes `PAID` o `CANCELLED` bloquean cualquier modificación de líneas, precios, cantidades o descuentos.
   - **Precios Congelados y Bloqueo en Cobro**: `InvoiceIssuingService` utiliza precios snapshot (`useSnapshotPrices: true`), valida concurrencia optimista (`expectedUpdatedAt`) y bloquea la orden con `SELECT ... FOR UPDATE`.
   - **Serialización de Caja (`Shift`)**: Toda emisión de factura, registro de gasto (`CashExpense`) o cierre de caja (`Shift.close`) serializa la fila del turno activo con `SELECT ... FOR UPDATE`.
   - **Correlativos (`Correlativo`)**: Consumo secuencial bajo bloqueo `FOR UPDATE` con rotación automática mensual para series `AUTO-*`.
   - **Certificados y Pagos Multidivisa**: Validación estricta de números de serie de vales/certificados (`order-certificate.validator.ts`) y reconciliación de tipo de cambio `USD`/`NIO` (`order-payments.validator.ts`).
4. **Política Única de Zona Horaria (`America/Managua`)**:
   - Todos los cortes diarios, turnos, reportes y promociones utilizan [`business-time.util.ts`](src/common/time/business-time.util.ts) (`getBusinessDayBounds`, `getBusinessDateParts`, `getBusinessMonthEnd`).
5. **Auditoría Durable y Respaldos Transaccionales**:
   - Cola de escritura de bitácora (`AuditWriteQueueService`) con spool de respaldo en disco (`.jsonl`) ante fallos transitorios de base de datos.
   - Generación y restauración de respaldos PostgreSQL (`pg_dump` / `psql --single-transaction -v ON_ERROR_STOP=1`) con verificación posterior de tablas críticas (`BackupsService`).

---

### 🏗️ Estructura del Proyecto

```text
pizza-app-backend-nest/
├── prisma/
│   ├── schema.prisma  # Esquema PostgreSQL (31 modelos y 15 enums)
│   └── seed.ts        # Semilla idempotente del administrador inicial (hash + PIN_PEPPER)
├── src/
│   ├── main.ts        # Bootstrap: Helmet, CORS, ValidationPipe (whitelist + forbidNonWhitelisted)
│   ├── app.module.ts  # Ensamblaje de los 22 módulos de dominio y guards globales
│   ├── common/        # Utilidades transversales: business-time, guards, filtros y criptografía
│   └── <dominio>/     # Módulos: access-control, admin-dashboard, app-config, backups,
│                      # cash-expenses, correlativos, customers, devices, kitchens, mesas,
│                      # notifications, orders, prisma, products, promotions, reports,
│                      # shifts, system-logs, users
├── Dockerfile         # Construcción multi-etapa (Node 20 + Prisma + postgresql-client)
└── package.json
```

Consulta [`AGENTS.md`](AGENTS.md) para ver el detalle completo de reglas e invariantes del servidor.

---

### 🚀 Requisitos e Instalación Local

1. **Requisitos**:
   - **Node.js** `20.x`.
   - **PostgreSQL** `15+` o `16+` (incluyendo herramientas de cliente `pg_dump` y `psql` si deseas usar el módulo de respaldos localmente).

2. **Configurar variables de entorno**:
   ```bash
   cp .env.example .env
   ```
   Variables principales en `.env`:
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pizza_app?schema=public"
   NODE_ENV=development
   API_HOST=127.0.0.1
   PORT=3000

   # Secretos criptográficos (mínimo 32 bytes cada uno, distintos entre sí)
   JWT_SECRET=tu_jwt_secret_seguro_de_al_menos_32_caracteres
   PIN_PEPPER=tu_pin_pepper_seguro_de_al_menos_32_caracteres

   # Credenciales para crear el usuario administrador inicial con npm run db:setup
   SEED_ADMIN_USERNAME=admin
   SEED_ADMIN_PASSWORD=Admin123!
   SEED_ADMIN_PIN=123456
   ```
   > **Reglas del Seed**: `SEED_ADMIN_PASSWORD` debe tener entre 8 y 128 caracteres, incluyendo mayúscula, minúscula, número y símbolo (`@$!%*?&`). `SEED_ADMIN_PIN` debe tener exactamente 6 dígitos numéricos.

3. **Instalar dependencias, sincronizar base de datos e iniciar**:
   ```bash
   npm install
   npm run prisma:generate
   npm run db:setup
   npm run start:dev
   ```

---

### 📜 Scripts Disponibles

| Comando | Descripción |
| :--- | :--- |
| `npm run start:dev` | Inicia el servidor NestJS en modo desarrollo (`watch mode`). |
| `npm run build` | Compila el proyecto en `dist/`. |
| `npm run start:prod` | Ejecuta el servidor compilado (`node dist/main`). |
| `npm test` | Ejecuta las 55 suites de pruebas unitarias y de integración de contratos (`Jest` + `Supertest`). |
| `npm run lint` | Ejecuta ESLint sobre `src/` y `test/`. |
| `npm run prisma:generate` | Genera el cliente tipado de Prisma (`@prisma/client`). |
| `npm run prisma:push` | Sincroniza el esquema `prisma/schema.prisma` con PostgreSQL. |
| `npm run db:setup` | Sincroniza el esquema (`prisma db push`) y ejecuta la semilla del usuario `admin` (`prisma db seed`). |
| `npm run prisma:studio` | Abre Prisma Studio para explorar la base de datos en el navegador. |

---

### 🐳 Ejecución con Docker

Puedes levantar todo el ecosistema (`PostgreSQL 16 + Backend + Frontend`) desde la raíz del workspace (`c:\DEV\Electron`) con un solo comando:

```bash
# Desde la carpeta raíz c:\DEV\Electron
docker compose up --build
```

El contenedor `pizza-pos-backend` espera automáticamente a que `postgres` esté saludable, sincroniza el esquema Prisma, ejecuta `prisma/seed.ts` y expone la API en `http://localhost:3000` (healthcheck en `GET /health`).

Si necesitas recrear o desbloquear las credenciales del usuario `admin` con el contenedor en marcha:
```bash
docker exec -e SEED_ADMIN_FORCE_OVERWRITE=true -it pizza-pos-backend npx ts-node prisma/seed.ts
```

---
---

## 🇺🇸 English

Transactional backend for the **Pizza To Go** Point of Sale (POS), Invoicing, Kitchen Display System (KDS), Delivery Dispatch, Cash Register Shifts, and Administration platform, built with **NestJS 11**, **TypeScript**, **Prisma ORM**, **PostgreSQL**, and **Socket.IO**.

---

### ✨ Key Features & Architectural Invariants

1. **Layered Modular Monolith with Dependency Inversion**:
   - Every domain module follows a clean layered structure: `Controller / Gateway -> Service + Validator -> Repository Interface -> Prisma Repository -> Mapper`.
   - Decoupled cross-module communication via an internal event bus (`EventEmitter2`).
2. **Security & Granular Access Control (`RBAC` + Resource-Level Auth)**:
   - Global security pipeline: `ThrottlerGuard` -> `JwtAuthGuard` -> `RolesGuard`.
   - Seven system base roles (`ADMIN`, `CAJERO`, `CAJERO_PRINCIPAL`, `MESERO`, `COCINERO`, `MOTORIZADO`, `DESPACHADOR`), custom roles (`AccessRole`), and a granular permission catalog evaluated with strict logical **`AND` (`every`)** semantics.
   - Resource-level authorization: a `motorizado` (driver) can only view/update `delivery` orders assigned to their `driverId`, and a `cocinero` (cook) only operates items belonging to their assigned kitchen for the current business day.
   - Continuous session revalidation (`isActive`, `tokenVersion`, and JWT expiration) across persistent connections (`Socket.IO` and `SSE`).
3. **Financial Integrity & Pessimistic/Optimistic Concurrency**:
   - **Commercial Immutability**: `PAID` and `CANCELLED` orders reject any modification to line items, prices, quantities, or discounts.
   - **Frozen Snapshot Prices & Checkout Locking**: `InvoiceIssuingService` enforces snapshot prices (`useSnapshotPrices: true`), validates optimistic concurrency (`expectedUpdatedAt`), and locks the order row with `SELECT ... FOR UPDATE`.
   - **Cash Shift Serialization (`Shift`)**: Every invoice issuance, cash expense (`CashExpense`), and shift closure (`Shift.close`) locks the active shift row with `SELECT ... FOR UPDATE` inside the transaction.
   - **Sequential Tax Correlatives (`Correlativo`)**: Sequential consumption under `FOR UPDATE` row locks with automatic monthly rollover for `AUTO-*` series.
   - **Gift Certificates & Multi-Currency Payments**: Strict certificate serial validation (`order-certificate.validator.ts`) and `USD`/`NIO` exchange-rate reconciliation (`order-payments.validator.ts`).
4. **Unified Business Timezone Policy (`America/Managua`)**:
   - All daily cutoffs, shifts, reports, and promotions use [`business-time.util.ts`](src/common/time/business-time.util.ts) (`getBusinessDayBounds`, `getBusinessDateParts`, `getBusinessMonthEnd`).
5. **Durable Audit Logging & Transactional Backups**:
   - Asynchronous audit queue (`AuditWriteQueueService`) with a durable on-disk `.jsonl` spool fallback during transient database outages.
   - PostgreSQL backup generation and restoration (`pg_dump` / `psql --single-transaction -v ON_ERROR_STOP=1`) with post-restore core table verification (`BackupsService`).

---

### 🏗️ Project Structure

```text
pizza-app-backend-nest/
├── prisma/
│   ├── schema.prisma  # PostgreSQL schema (31 models & 15 enums)
│   └── seed.ts        # Idempotent initial administrator seed (credential hashing + PIN_PEPPER)
├── src/
│   ├── main.ts        # Bootstrap: Helmet, CORS, ValidationPipe (whitelist + forbidNonWhitelisted)
│   ├── app.module.ts  # Composition of all 22 domain modules & global guards
│   ├── common/        # Cross-cutting utilities: business-time, guards, filters & cryptography
│   └── <domain>/      # Modules: access-control, admin-dashboard, app-config, backups,
│                      # cash-expenses, correlativos, customers, devices, kitchens, mesas,
│                      # notifications, orders, prisma, products, promotions, reports,
│                      # shifts, system-logs, users
├── Dockerfile         # Multi-stage build (Node 20 + Prisma + postgresql-client)
└── package.json
```

See [`AGENTS.md`](AGENTS.md) for the complete reference of backend architectural rules and invariants.

---

### 🚀 Requirements & Local Setup

1. **Prerequisites**:
   - **Node.js** `20.x`.
   - **PostgreSQL** `15+` or `16+` (including `pg_dump` and `psql` client binaries if using the backups module locally).

2. **Environment Configuration**:
   ```bash
   cp .env.example .env
   ```
   Core variables in `.env`:
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pizza_app?schema=public"
   NODE_ENV=development
   API_HOST=127.0.0.1
   PORT=3000

   # Cryptographic secrets (at least 32 bytes each, distinct from one another)
   JWT_SECRET=your_secure_jwt_secret_at_least_32_bytes_long
   PIN_PEPPER=your_secure_pin_pepper_at_least_32_bytes_long

   # Initial administrator credentials used by npm run db:setup
   SEED_ADMIN_USERNAME=admin
   SEED_ADMIN_PASSWORD=Admin123!
   SEED_ADMIN_PIN=123456
   ```
   > **Seed Policy**: `SEED_ADMIN_PASSWORD` must be 8–128 characters and include uppercase, lowercase, digit, and special character (`@$!%*?&`). `SEED_ADMIN_PIN` must be exactly 6 numeric digits.

3. **Install Dependencies, Sync Database & Start**:
   ```bash
   npm install
   npm run prisma:generate
   npm run db:setup
   npm run start:dev
   ```

---

### 📜 Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run start:dev` | Starts the NestJS server in development watch mode. |
| `npm run build` | Compiles the project into `dist/`. |
| `npm run start:prod` | Runs the compiled production server (`node dist/main`). |
| `npm test` | Runs all 55 unit and contract integration test suites (`Jest` + `Supertest`). |
| `npm run lint` | Runs ESLint across `src/` and `test/`. |
| `npm run prisma:generate` | Generates the typed Prisma client (`@prisma/client`). |
| `npm run prisma:push` | Pushes `prisma/schema.prisma` to the PostgreSQL database. |
| `npm run db:setup` | Syncs the Prisma schema (`prisma db push`) and seeds the `admin` user (`prisma db seed`). |
| `npm run prisma:studio` | Opens Prisma Studio to inspect and edit database records in the browser. |

---

### 🐳 Running with Docker

You can launch the entire stack (`PostgreSQL 16 + Backend + Frontend`) from the workspace root (`c:\DEV\Electron`) with a single command:

```bash
# From the workspace root c:\DEV\Electron
docker compose up --build
```

The `pizza-pos-backend` container automatically waits for `postgres` to report healthy, pushes the Prisma schema, runs `prisma/seed.ts`, and serves the API at `http://localhost:3000` (healthcheck at `GET /health`).

To force-reset or unlock the `admin` user credentials while the container is running:
```bash
docker exec -e SEED_ADMIN_FORCE_OVERWRITE=true -it pizza-pos-backend npx ts-node prisma/seed.ts
```
