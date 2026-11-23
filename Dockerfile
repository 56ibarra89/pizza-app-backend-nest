# ==============================================================================
# Etapa 1: Construcción (Builder) — pizza-app-backend-nest
# ==============================================================================
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# OpenSSL es requerido por el motor de Prisma durante prisma generate
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Instalar dependencias aprovechando la caché de capas de Docker
COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci

# Copiar el código fuente y configuraciones de compilación
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src/

# Generar el cliente Prisma y compilar el proyecto NestJS (dist/)
RUN npm run prisma:generate && npm run build

# ==============================================================================
# Etapa 2: Ejecución (Runner) — pizza-app-backend-nest
# ==============================================================================
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# Instalar OpenSSL (Prisma) y postgresql-client (pg_dump / psql para BackupsService)
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates postgresql-client tzdata \
  && rm -rf /var/lib/apt/lists/*

# Zona horaria oficial del negocio y variables base para contenedor
ENV TZ=America/Managua
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV PORT=3000

# Copiar artefactos compilados, cliente Prisma generado y dependencias necesarias
COPY --from=builder /app/package.json /app/package-lock.json /app/tsconfig.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/common/security/credential-hasher.ts ./src/common/security/credential-hasher.ts

# Crear directorios persistentes para respaldos y spool de auditoría
RUN mkdir -p /app/storage/backups /app/storage/backups-external /app/storage/audit-spool \
  && chown -R node:node /app

USER node

EXPOSE 3000

# Por defecto inicia la API compilada.
# (Para aplicar migraciones antes de iniciar: npx prisma migrate deploy && node dist/main)
CMD ["node", "dist/main"]
