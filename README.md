<div align="center">

# 🍕 Pizza To Go POS — Backend API

**API Transaccional para Punto de Venta (POS), Facturación, Cocina (KDS), Despacho, Caja y Administración**  
*Transactional API for Point of Sale (POS), Invoicing, Kitchen Display (KDS), Delivery Dispatch, Cash Register & Administration*

[![NestJS](https://img.shields.io/badge/NestJS-11.x-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.x-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?logo=socket.io&logoColor=white)](https://socket.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](./Dockerfile)

### 🌐 Idioma / Language: [🇪🇸 Español](#-español) | [🇺🇸 English](#-english)

</div>

---

<a id="-español"></a>

# 🇪🇸 Español

## 📋 Tabla de Contenidos

1. [Arquitectura del Sistema](#-arquitectura-del-sistema)
2. [Invariantes Financieras y de Seguridad](#-invariantes-financieras-y-de-seguridad)
3. [Roles del Sistema y Control de Acceso](#-roles-del-sistema-y-control-de-acceso)
4. [Requisitos Previos](#-requisitos-previos)
5. [Instalación y Configuración Local](#-instalación-y-configuración-local)
6. [Ejecución con Docker](#-ejecución-con-docker)
7. [Scripts Disponibles](#-scripts-disponibles)

---

## 🏛️ Arquitectura del Sistema

El servidor implementa un **Monolito Modular en Capas con Inversión de Dependencias** sobre **NestJS 11** y **Prisma ORM**, compuesto por **22 módulos de dominio** y **31 modelos relacionales** en PostgreSQL.

```mermaid
flowchart LR
    Client["Cliente POS (Electron / Web)"] -->|REST + JWT| Guards["Throttler + JwtAuth + RolesGuard"]
    Client <-->|Socket.IO / SSE| Gateways["WebSocket Gateways (Orders / Kitchens)"]
    Guards --> Controller["Controller + ValidationPipe"]
    Controller --> Service["Domain Service + Validators"]
    Gateways --> Service
    Service --> RepoInterface["IRepository (Token DI)"]
    RepoInterface --> PrismaRepo["PrismaRepository + Mapper"]
    PrismaRepo --> DB[("PostgreSQL 16 (FOR UPDATE Locks)")]
    Service -.->|EventEmitter2| Audit["AuditWriteQueue (.jsonl Spool)"]
```

### Estructura Estándar de Cada Módulo (`src/<dominio>/`)

```text
pizza-app-backend-nest/
├── prisma/
│   ├── schema.prisma       # 31 modelos y 15 enums en PostgreSQL
│   └── seed.ts             # Semilla segura e idempotente del usuario ADMIN
├── src/
│   ├── main.ts             # Helmet, CORS, ValidationPipe (whitelist + forbidNonWhitelisted)
│   ├── app.module.ts       # Ensamblaje de módulos y cadena global de Guards
│   ├── common/             # Zona horaria (America/Managua), guards, filtros y criptografía
│   └── <dominio>/
│       ├── controllers/    # Endpoints REST (@Roles, @Permissions)
│       ├── gateways/       # WebSockets (Socket.IO) con revalidación periódica de sesión
│       ├── dto/            # Contratos de entrada/salida con class-validator
│       ├── entities/       # Entidades de dominio desacopladas de Prisma
│       ├── interfaces/     # Contratos de repositorio (inyección por token)
│       ├── repositories/   # Implementación Prisma y transacciones SQL
│       ├── services/       # Casos de uso y orquestación transaccional
│       ├── validators/     # Reglas puras (pagos multidivisa, certificados, descuentos)
│       └── mappers/        # Transformación Prisma <-> Dominio <-> DTO
├── Dockerfile              # Imagen multi-etapa de producción
└── package.json
```

---

## 🛡️ Invariantes Financieras y de Seguridad

| Categoría | Regla de Integridad Implementada |
| :--- | :--- |
| **Inmutabilidad Comercial** | Las órdenes en estado `PAID` o `CANCELLED` rechazan cualquier alteración de ítems, precios, cantidades o descuentos. |
| **Cobro y Precios Snapshot** | Al facturar una orden existente (`InvoiceIssuingService`), se congelan los precios snapshot (`useSnapshotPrices: true`), se verifica concurrencia optimista (`expectedUpdatedAt`) y se bloquea la fila con `SELECT ... FOR UPDATE`. |
| **Serialización de Turnos (`Shift`)** | Todo cobro de factura, gasto de caja (`CashExpense`) o arqueo/cierre (`Shift.close`) bloquea la fila del turno activo con `SELECT ... FOR UPDATE` para impedir condiciones de carrera. |
| **Correlativos Fiscales** | Consumo secuencial bajo bloqueo pesimista `FOR UPDATE` con rotación mensual automática para series `AUTO-*`. |
| **Certificados y Multidivisa** | Validación estricta de números de serie de certificados (`order-certificate.validator.ts`) y cuadre exacto `originalAmount * exchangeRate ≈ amount` (`USD`/`NIO`). |
| **Zona Horaria Única** | Todos los cortes de día, turnos y reportes operan en `America/Managua` mediante [`business-time.util.ts`](src/common/time/business-time.util.ts). |
| **Auditoría y Respaldos** | Cola de auditoría con respaldo en disco (`.jsonl`) si falla la BD, y restauración PostgreSQL transaccional (`psql --single-transaction -v ON_ERROR_STOP=1`). |

---

## 🔐 Roles del Sistema y Control de Acceso

El guard global [`RolesGuard`](src/common/guards/roles.guard.ts) evalúa tanto el rol como **todos** los permisos requeridos en el endpoint con lógica estricta **`AND` (`every`)**:

| Rol Base (`UserRole`) | Alcance Operativo Principal |
| :--- | :--- |
| `ADMIN` | Acceso completo al sistema, configuración, usuarios, roles, catálogo, reportes, auditoría y respaldos. |
| `CAJERO_PRINCIPAL` | Apertura y cierre de turnos de caja, autorización de cierres, facturación, gastos, despacho y mesas. |
| `CAJERO` | Creación de pedidos, facturación, cobros, registro de gastos de caja y operación de mesas. |
| `DESPACHADOR` | Coordinación de entregas a domicilio, asignación de motorizados, cobros y gastos operativos. |
| `MESERO` | Toma de pedidos en salón, gestión de mesas/reservas y cobro de cuentas. |
| `COCINERO` | Pantalla de cocina (`KDS`) restringida exclusivamente a los ítems de su cocina asignada en el día. |
| `MOTORIZADO` | Consulta y actualización de estado/cobro únicamente sobre los pedidos `DELIVERY` asignados a su usuario. |

---

## ⚙️ Requisitos Previos

- **Node.js** `20.x` o superior.
- **PostgreSQL** `15` o `16` (con `pg_dump` y `psql` disponibles en el `PATH` si se utiliza el módulo de respaldos localmente).
- **npm** `10.x` o superior.

---

## 🚀 Instalación y Configuración Local

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

Copia la plantilla de ejemplo para crear tu archivo `.env` local:

```bash
cp .env.example .env
```

Edita el archivo `.env` con tus parámetros locales:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pizza_app?schema=public"
NODE_ENV=development
API_HOST=127.0.0.1
PORT=3000

# Secretos criptográficos (mínimo 32 bytes cada uno y distintos entre sí)
JWT_SECRET=reemplazar_con_secreto_jwt_de_al_menos_32_caracteres
PIN_PEPPER=reemplazar_con_pepper_pin_de_al_menos_32_caracteres

# Credenciales del administrador inicial (usadas por npm run db:setup)
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=Admin123!
SEED_ADMIN_PIN=123456
```

> **Requisitos de seguridad del Seed**:
> - `SEED_ADMIN_PASSWORD`: Entre 8 y 128 caracteres, con al menos 1 mayúscula, 1 minúscula, 1 número y 1 símbolo (`@$!%*?&`).
> - `SEED_ADMIN_PIN`: Exactamente 6 dígitos numéricos.

### 3. Inicializar la base de datos y arrancar el servidor

```bash
# Generar el cliente tipado de Prisma
npm run prisma:generate

# Crear las tablas en PostgreSQL y sembrar el usuario administrador inicial
npm run db:setup

# Iniciar el servidor en modo desarrollo (http://127.0.0.1:3000)
npm run start:dev
```

---

## 🐳 Ejecución con Docker

```bash
# Construir la imagen del Backend
docker build -t pizza-backend .

# O levantar todo el ecosistema (PostgreSQL + Backend + Frontend) con Docker Compose
docker compose up --build
```

Para forzar el restablecimiento o desbloqueo de credenciales del usuario `admin` en un contenedor en ejecución:

```bash
docker exec -e SEED_ADMIN_FORCE_OVERWRITE=true -it pizza-pos-backend npx ts-node prisma/seed.ts
```

---

## 📜 Scripts Disponibles

| Comando | Descripción |
| :--- | :--- |
| `npm run start:dev` | Inicia el servidor en modo desarrollo con recarga automática (`watch`). |
| `npm run build` | Compila el proyecto TypeScript a producción en la carpeta `dist/`. |
| `npm run start:prod` | Ejecuta el servidor compilado (`node dist/main`). |
| `npm test` | Ejecuta las 55 suites de pruebas unitarias e integración de contratos (`Jest` + `Supertest`). |
| `npm run lint` | Ejecuta ESLint sobre `src/` y `test/`. |
| `npm run prisma:generate` | Genera el cliente `@prisma/client` a partir de `prisma/schema.prisma`. |
| `npm run prisma:push` | Sincroniza el esquema Prisma directamente con la base de datos PostgreSQL. |
| `npm run db:setup` | Ejecuta `prisma db push` seguido de `prisma db seed`. |
| `npm run prisma:studio` | Abre la interfaz visual Prisma Studio en el navegador. |

---
---

<a id="-english"></a>

# 🇺🇸 English

## 📋 Table of Contents

1. [System Architecture](#-system-architecture)
2. [Financial & Security Invariants](#-financial--security-invariants)
3. [System Roles & Access Control](#-system-roles--access-control)
4. [Prerequisites](#-prerequisites)
5. [Local Installation & Setup](#-local-installation--setup)
6. [Running with Docker](#-running-with-docker)
7. [Available Scripts](#-available-scripts)

---

## 🏛️ System Architecture

The backend is designed as a **Layered Modular Monolith with Dependency Inversion** built on **NestJS 11** and **Prisma ORM**, comprising **22 domain modules** and **31 relational models** in PostgreSQL.

```mermaid
flowchart LR
    Client["POS Client (Electron / Web)"] -->|REST + JWT| Guards["Throttler + JwtAuth + RolesGuard"]
    Client <-->|Socket.IO / SSE| Gateways["WebSocket Gateways (Orders / Kitchens)"]
    Guards --> Controller["Controller + ValidationPipe"]
    Controller --> Service["Domain Service + Validators"]
    Gateways --> Service
    Service --> RepoInterface["IRepository (DI Token)"]
    RepoInterface --> PrismaRepo["PrismaRepository + Mapper"]
    PrismaRepo --> DB[("PostgreSQL 16 (FOR UPDATE Locks)")]
    Service -.->|EventEmitter2| Audit["AuditWriteQueue (.jsonl Spool)"]
```

### Standard Module Structure (`src/<domain>/`)

```text
pizza-app-backend-nest/
├── prisma/
│   ├── schema.prisma       # 31 PostgreSQL models & 15 enums
│   └── seed.ts             # Secure, idempotent initial ADMIN user seed
├── src/
│   ├── main.ts             # Helmet, CORS, ValidationPipe (whitelist + forbidNonWhitelisted)
│   ├── app.module.ts       # Module composition & global Guard chain
│   ├── common/             # Business timezone (America/Managua), guards, filters & crypto
│   └── <domain>/
│       ├── controllers/    # REST endpoints (@Roles, @Permissions)
│       ├── gateways/       # WebSockets (Socket.IO) with periodic session revalidation
│       ├── dto/            # Input/output contracts with class-validator
│       ├── entities/       # Clean domain entities decoupled from Prisma
│       ├── interfaces/     # Repository contracts (token injection)
│       ├── repositories/   # Prisma implementation & SQL transactions
│       ├── services/       # Use cases & transactional orchestration
│       ├── validators/     # Pure domain rules (multi-currency payments, certificates)
│       └── mappers/        # Prisma <-> Domain <-> DTO transformations
├── Dockerfile              # Multi-stage production container image
└── package.json
```

---

## 🛡️ Financial & Security Invariants

| Category | Enforced Invariant |
| :--- | :--- |
| **Commercial Immutability** | Orders in `PAID` or `CANCELLED` state reject any modification to line items, prices, quantities, or discounts. |
| **Frozen Snapshot Pricing** | Finalizing an existing order (`InvoiceIssuingService`) enforces snapshot prices (`useSnapshotPrices: true`), validates optimistic concurrency (`expectedUpdatedAt`), and locks the row with `SELECT ... FOR UPDATE`. |
| **Cash Shift Serialization** | Every invoice payment, cash expense (`CashExpense`), and shift closure (`Shift.close`) locks the active shift row (`SELECT ... FOR UPDATE`) to prevent race conditions. |
| **Sequential Tax Correlatives** | Sequential invoice numbering under `FOR UPDATE` row locks with automatic monthly rollover for `AUTO-*` series. |
| **Certificates & Multi-Currency** | Strict gift certificate serial validation (`order-certificate.validator.ts`) and exact `originalAmount * exchangeRate ≈ amount` reconciliation (`USD`/`NIO`). |
| **Unified Business Timezone** | All daily bounds, shifts, and reports operate in `America/Managua` via [`business-time.util.ts`](src/common/time/business-time.util.ts). |
| **Durable Audit & Backups** | Audit queue with on-disk `.jsonl` spool fallback during DB outages, and transactional PostgreSQL restore (`psql --single-transaction -v ON_ERROR_STOP=1`). |

---

## 🔐 System Roles & Access Control

The global [`RolesGuard`](src/common/guards/roles.guard.ts) enforces both role membership and **all** required endpoint permissions using strict logical **`AND` (`every`)**:

| Base Role (`UserRole`) | Primary Operational Scope |
| :--- | :--- |
| `ADMIN` | Full access to system configuration, users, roles, catalog, reports, audit logs, and backups. |
| `CAJERO_PRINCIPAL` | Opening/closing cash register shifts, authorizing shift closures, invoicing, expenses, dispatch, and tables. |
| `CAJERO` | Order creation, invoicing, payment collection, cash expenses, and table operations. |
| `DESPACHADOR` | Delivery coordination, driver assignment, payment collection, and operational cash expenses. |
| `MESERO` | Dine-in order taking, table/reservation management, and bill checkout. |
| `COCINERO` | Kitchen Display System (`KDS`) restricted strictly to items assigned to the cook's kitchen for the current day. |
| `MOTORIZADO` | Viewing, updating delivery status, and finalizing payment strictly on `DELIVERY` orders assigned to the driver. |

---

## ⚙️ Prerequisites

- **Node.js** `20.x` or higher.
- **PostgreSQL** `15` or `16` (with `pg_dump` and `psql` available in `PATH` if using the backups module locally).
- **npm** `10.x` or higher.

---

## 🚀 Local Installation & Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy the example template to create your local `.env` file:

```bash
cp .env.example .env
```

Update `.env` with your local configuration:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pizza_app?schema=public"
NODE_ENV=development
API_HOST=127.0.0.1
PORT=3000

# Cryptographic secrets (minimum 32 bytes each, distinct from each other)
JWT_SECRET=replace_with_a_secure_jwt_secret_at_least_32_bytes
PIN_PEPPER=replace_with_a_secure_pin_pepper_at_least_32_bytes

# Initial administrator credentials (used by npm run db:setup)
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=Admin123!
SEED_ADMIN_PIN=123456
```

> **Seed Security Policy**:
> - `SEED_ADMIN_PASSWORD`: 8–128 characters, including at least 1 uppercase letter, 1 lowercase letter, 1 digit, and 1 special character (`@$!%*?&`).
> - `SEED_ADMIN_PIN`: Exactly 6 numeric digits.

### 3. Initialize the database and start the server

```bash
# Generate the typed Prisma client
npm run prisma:generate

# Push schema to PostgreSQL and seed the initial admin user
npm run db:setup

# Start the development server (http://127.0.0.1:3000)
npm run start:dev
```

---

## 🐳 Running with Docker

```bash
# Build the Backend image
docker build -t pizza-backend .

# Or launch the full stack (PostgreSQL + Backend + Frontend) via Docker Compose
docker compose up --build
```

To force-reset or unlock the `admin` user credentials inside a running container:

```bash
docker exec -e SEED_ADMIN_FORCE_OVERWRITE=true -it pizza-pos-backend npx ts-node prisma/seed.ts
```

---

## 📜 Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run start:dev` | Starts the NestJS server in development watch mode. |
| `npm run build` | Compiles the TypeScript project for production into `dist/`. |
| `npm run start:prod` | Runs the compiled server (`node dist/main`). |
| `npm test` | Runs all 55 unit and contract integration test suites (`Jest` + `Supertest`). |
| `npm run lint` | Runs ESLint across `src/` and `test/`. |
| `npm run prisma:generate` | Generates `@prisma/client` from `prisma/schema.prisma`. |
| `npm run prisma:push` | Pushes the Prisma schema directly to PostgreSQL. |
| `npm run db:setup` | Runs `prisma db push` followed by `prisma db seed`. |
| `npm run prisma:studio` | Opens the Prisma Studio GUI in your browser. |
