# Pizza POS Backend (NestJS & Prisma)

Este es el backend del sistema de Punto de Venta (POS) y Gestión de Pedidos para una Pizzería, desarrollado con **NestJS** y **Prisma ORM** utilizando **PostgreSQL**.

---

## 🚀 Requisitos Previos

Asegúrate de tener instalado en tu máquina:
- [Node.js](https://nodejs.org/) (versión 18 o superior recomendada)
- [PostgreSQL](https://www.postgresql.org/) (o acceso a una base de datos PostgreSQL)
- [npm](https://www.npmjs.com/) (incluido con Node.js)

---

## 🛠️ Configuración e Inicialización

Sigue estos pasos para poner en marcha el proyecto localmente:

### 1. Configurar las variables de entorno
Crea un archivo `.env` en la raíz del proyecto basándote en el archivo `.env.example`:
```bash
cp .env.example .env
```
Luego, abre el archivo `.env` y define tu cadena de conexión a PostgreSQL en la variable `DATABASE_URL`.

### 2. Ejecutar comandos de inicialización
Ejecuta los siguientes comandos en tu terminal para configurar y levantar la aplicación:

```bash
# Instala deps (en la carpeta del backend):
cd D:\Dev-Personal\Electron\pizza-app-backend-nest
npm install

# Genera Prisma Client:
npm run prisma:generate

# Aplica migraciones (crea tablas en tu DB):
npm run prisma:migrate -- --name init

# Levanta el API en dev:
npm run start:dev
```

---

## 🚦 Comandos Disponibles

En el proyecto puedes ejecutar los siguientes scripts:

| Comando | Descripción |
| :--- | :--- |
| `npm run start:dev` | Inicia el servidor NestJS en modo desarrollo con recarga automática (watch mode). |
| `npm run build` | Compila el proyecto TypeScript a JavaScript de producción (directorio `/dist`). |
| `npm run start:prod` | Ejecuta la aplicación compilada en producción. |
| `npm run prisma:migrate:init` | Aplica la migración inicial para configurar la base de datos desde cero. |
| `npm run prisma:migrate` | Detecta cambios en `schema.prisma` y crea una nueva migración de desarrollo. |
| `npm run prisma:studio` | Abre la interfaz gráfica de Prisma (Prisma Studio) en tu navegador para ver/editar los datos. |
| `npm run lint` | Ejecuta el linter (ESLint) para asegurar la calidad de código. |
| `npm run format` | Aplica formato al código usando Prettier. |

---

## 📐 Aspectos Destacados del Diseño y Arquitectura

* **Separación de Usuarios**: El sistema diferencia estrictamente a los usuarios administrativos/personal (`User`) con roles específicos (`ADMIN`, `CAJERO`, `MESERO`, `COCINERO`) de los clientes finales (`Customer`) que realizan los pedidos.
* **Integridad en Promociones**: Soporte robusto de promociones (`HappyHourPromotion`, `DiscountPromotion`, `Cupon`, `Certificado`) con relaciones relacionales reales a productos y categorías específicos para evitar inconsistencias.
* **Bloqueo Pesimista (`FOR UPDATE`)**: Prevención de colisiones de números de factura (`Correlativo`) en ambientes concurrentes usando transacciones nativas y bloqueos a nivel de fila.
* **Precisión Matemática**: Validación exacta de pagos a nivel de base de datos para mitigar errores de coma flotante en transacciones monetarias.
