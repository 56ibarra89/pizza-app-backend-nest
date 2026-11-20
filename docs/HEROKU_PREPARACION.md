# Preparación de Pizza To Go para Heroku

Estado: preparación local. No habilitar para producción hasta completar las pruebas
de recuperación y de operación indicadas abajo.

## Arquitectura

El backend NestJS y PostgreSQL se ejecutan en Heroku; Electron permanece instalado en
las terminales. Usar una aplicación y una base separadas para pruebas. No copiar
órdenes, pagos, usuarios ni datos personales de desarrollo sin decisión explícita.

## Compilación y migraciones

- El buildpack debe detectar este repositorio como raíz de la aplicación Node.
- `heroku-postbuild` genera el cliente Prisma y compila NestJS.
- El `Procfile` inicia `npm run start:prod` y ejecuta `prisma migrate deploy` en
  release. Prisma se declara como dependencia de ejecución para que esté disponible
  después de la poda de dependencias de desarrollo.
- Aplicar las migraciones primero a una base de pruebas vacía y verificar su estado.
  No utilizar `prisma db push` como sustituto de las migraciones en producción.
- La migración `20261119000000_reconcile_missing_schema` corrige componentes del
  esquema que faltaban en instalaciones creadas únicamente con las migraciones
  anteriores. Se probó en una base aislada con datos sintéticos y sobre un clon del
  esquema de desarrollo; no se aplicó a la base original. Los tipos de tamaño se
  convierten a texto conservando sus valores. El tipo antiguo `ProductSize` se deja
  sin borrar deliberadamente: Prisma lo informa como diferencia residual.
- Una migración completada no se revierte automáticamente si una publicación posterior
  falla. Preparar respaldo, compatibilidad entre versiones y plan de recuperación.

## Variables de entorno

Configurar en Heroku, sin guardar secretos en Git:

- `DATABASE_URL`: conexión a la base de pruebas con TLS, proporcionada por el
  servicio de PostgreSQL. Verificar la configuración de SSL del cliente en el entorno.
- `NODE_ENV=production` y `API_HOST=0.0.0.0`; `PORT` lo proporciona Heroku.
- `JWT_SECRET` y `PIN_PEPPER`: valores aleatorios independientes de al menos 32 bytes.
  Conservar el mismo `PIN_PEPPER` para que los PIN existentes sigan funcionando.
- `CORS_ORIGINS`: orígenes exactos verificados en Electron y, si aplica, web. El
  origen `null` puede corresponder a múltiples documentos y no identifica una
  instalación confiable; evaluar el riesgo antes de permitirlo.
- `TRUST_PROXY_HOPS`: definir según la topología de proxy observada y probar la
  identificación del cliente y los límites de solicitudes.
- Si se usará recuperación de contraseñas: configurar proveedor `SMTP_HOST`,
  `SMTP_PORT`, `SMTP_USER` y `SMTP_PASS`, y configurar `FRONTEND_URL` con una URL
  HTTPS pública donde esté desplegada la aplicación web App-Factura. Electron
  instalado en una terminal no proporciona por sí solo una página web pública.
  Configurar en esa compilación `VITE_API_BASE_URL` con la API HTTPS y autorizar
  su origen en `CORS_ORIGINS`. Verificar correo, enlace, cambio y revocación de
  sesiones usando una cuenta y base de pruebas antes de producción.

Las credenciales iniciales del administrador se configuran únicamente para el
bootstrap controlado. No ejecutar `npm run db:setup` en producción: incluye
`prisma db push`. El seed requiere sus propias dependencias y, si se configura
`SEED_ADMIN_FORCE_OVERWRITE=true`, puede reemplazar credenciales existentes.

## Bloqueos para producción

1. Los archivos bajo `storage/backups` son temporales en los dynos. El proveedor
   `LocalFirstCloudBackupProvider` no implementa almacenamiento externo. Definir
   almacenamiento persistente o integrar un servicio de respaldos real, con prueba
   de restauración; no presentar copias locales como copias duraderas.
2. El spool de auditoría es un archivo local y puede perderse ante reinicios. Diseñar
   y probar un destino durable para los eventos que no se pudieron escribir.
3. La compatibilidad de `pg_dump` y `psql` depende del método de despliegue. El
   Dockerfile instala `postgresql-client`, pero el buildpack Node no lo garantiza.
   La restauración SQL de la aplicación y el formato de Heroku PGBackups requieren
   procedimientos de prueba propios.
4. Mantener inicialmente un solo dyno web. Con varias instancias, Socket.IO, eventos
   y cron en memoria requieren coordinación compartida y pruebas adicionales.
5. Terminar y validar las reglas acordadas de entrega, autorización y cocina.
   El cálculo del umbral en frontend no sustituye la validación en el servidor.

## Validación de extremo a extremo

- Confirmar migraciones y datos iniciales; comprobar que la API arranca con HTTPS.
- Probar acceso, permisos, Socket.IO, caja, órdenes, pagos, promociones y entregas.
- Instalar o ejecutar Electron en una terminal de prueba y verificar impresoras,
  gaveta y reconexión ante pérdida de red, sin suponer operación offline.
- Generar una copia, recuperarla en una base aislada y comprobar datos críticos.
- Probar fallos del proveedor de auditoría y reinicio del proceso sin perder eventos.
- Registrar el plan de vuelta atrás y los resultados antes de cualquier despliegue
  de producción.
