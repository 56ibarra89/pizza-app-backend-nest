const fs = require('node:fs');
const path = require('node:path');

const json = (value) => JSON.stringify(value, null, 2);
const test = `pm.test("Respuesta HTTP válida", () => pm.expect(pm.response.code).to.be.oneOf([200, 201, 202, 204]));\npm.test("Tiempo de respuesta menor a 5 s", () => pm.expect(pm.response.responseTime).to.be.below(5000));`;

function request(name, method, route, options = {}) {
  const query = options.query || [];
  const url = {
    raw: `{{baseUrl}}${route}${query.length ? `?${query.map(([key, value]) => `${key}=${value}`).join('&')}` : ''}`,
    host: ['{{baseUrl}}'],
    path: route.split('/').filter(Boolean),
  };
  if (query.length) {
    url.query = query.map(([key, value, disabled = false, description]) => ({ key, value, disabled, description }));
  }

  const req = {
    method,
    header: [],
    url,
    description: options.description || '',
  };
  if (options.public) req.auth = { type: 'noauth' };
  if (options.body !== undefined) {
    req.header.push({ key: 'Content-Type', value: 'application/json' });
    req.body = { mode: 'raw', raw: json(options.body), options: { raw: { language: 'json' } } };
  }
  if (options.formdata) {
    req.body = { mode: 'formdata', formdata: options.formdata };
  }

  const events = [{ listen: 'test', script: { type: 'text/javascript', exec: test.split('\n') } }];
  if (options.after) events[0].script.exec.push(...options.after.split('\n'));
  return { name, request: req, response: [], event: events };
}

const folder = (name, item, description = '') => ({ name, description, item });
const capture = (variable, expression) => `try { const data = pm.response.json(); const value = ${expression}; if (value !== undefined && value !== null) pm.collectionVariables.set("${variable}", value); } catch (_) {}`;
const captureAuth = `${capture('accessToken', 'data.access_token')}\ntry { const token = pm.response.json().access_token; if (token) { const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); const payload = JSON.parse(atob(part)); if (payload.sub) pm.collectionVariables.set('userId', payload.sub); } } catch (_) {}`;

const item = [
  folder('00 - Estado del servicio', [
    request('Inicio', 'GET', '/', { public: true }),
    request('Health check', 'GET', '/health', { public: true }),
  ]),
  folder('01 - Autenticación', [
    request('Login con contraseña (guarda token)', 'POST', '/auth/login', {
      public: true,
      body: { identifier: '{{username}}', password: '{{password}}' },
      after: captureAuth,
      description: 'Guarda access_token automáticamente en la variable de colección accessToken.',
    }),
    request('Login con PIN (guarda token)', 'POST', '/auth/pin', {
      public: true,
      body: { pin: '{{pin}}' },
      after: captureAuth,
    }),
    request('Solicitar restablecimiento', 'POST', '/auth/forgot-password', { public: true, body: { email: '{{email}}' } }),
    request('Restablecer contraseña', 'POST', '/auth/reset-password', { public: true, body: { token: '{{resetToken}}', newPassword: 'NuevaClave1!' } }),
    request('Cerrar sesión', 'POST', '/auth/logout'),
    request('Cerrar todas las sesiones', 'POST', '/auth/logout-all'),
  ]),
  folder('02 - Usuarios', [
    request('Listar usuarios', 'GET', '/users'),
    request('Estadísticas de motorizados', 'GET', '/users/motorizados/delivery-stats', { query: [['date', '{{today}}']] }),
    request('Obtener usuario por ID', 'GET', '/users/{{userId}}'),
    request('Obtener usuario por username', 'GET', '/users/username/{{username}}'),
    request('Crear usuario (guarda userId)', 'POST', '/users', {
      body: { username: 'usuario.postman', email: 'postman@example.com', firstName: 'Usuario', lastName: 'Postman', pin: '654321', password: 'ClaveSegura1!', role: 'mesero', isActive: true, workDays: ['MONDAY', 'TUESDAY'] },
      after: capture('userId', 'data.id'),
    }),
    request('Actualizar mi perfil', 'PATCH', '/users/me', { body: { firstName: 'Admin', lastName: 'Postman', themePreference: 'dark', currentPassword: '{{password}}' } }),
    request('Actualizar usuario', 'PATCH', '/users/{{userId}}', { body: { firstName: 'Usuario actualizado', isActive: true } }),
    request('Desbloquear usuario', 'POST', '/users/{{userId}}/unlock'),
    request('Agregar día extra', 'POST', '/users/{{userId}}/extra-days', { body: { date: '{{today}}', notes: 'Turno adicional de prueba' } }),
    request('Eliminar día extra', 'DELETE', '/users/{{userId}}/extra-days/{{today}}'),
    request('Consultar zonas del mesero', 'GET', '/users/{{userId}}/zones'),
    request('Actualizar zonas del mesero', 'PUT', '/users/{{userId}}/zones', { body: { zones: [{ day: 'MONDAY', floor: 1 }] } }),
    request('⚠ Eliminar usuario', 'DELETE', '/users/{{userId}}', { description: 'Operación destructiva. Verifica userId antes de enviarla.' }),
  ]),
  folder('03 - Cocinas', [
    request('Listar cocinas', 'GET', '/kitchens'),
    request('Obtener cocina', 'GET', '/kitchens/{{kitchenId}}'),
    request('Crear cocina (guarda kitchenId)', 'POST', '/kitchens', { body: { name: 'Cocina Postman', isActive: true }, after: capture('kitchenId', 'data.id') }),
    request('Actualizar cocina', 'PATCH', '/kitchens/{{kitchenId}}', { body: { name: 'Cocina Postman Actualizada', isActive: true } }),
    request('Cocineros y asignaciones', 'GET', '/kitchens/cooks/assignments'),
    request('Actualizar asignaciones de cocinero', 'PATCH', '/kitchens/cooks/{{userId}}/assignments', { body: { assignments: [{ dayOfWeek: 'MONDAY', kitchenId: '{{kitchenId}}' }] } }),
    request('Mis asignaciones', 'GET', '/kitchens/me/assignments'),
    request('⚠ Eliminar cocina', 'DELETE', '/kitchens/{{kitchenId}}', { description: 'Operación destructiva.' }),
  ]),
  folder('04 - Productos y categorías', [
    request('Listar categorías', 'GET', '/products/categories'),
    request('Crear categoría (guarda categoryId)', 'POST', '/products/categories', { body: { label: 'Postman', icon: 'pizza', kitchenId: '{{kitchenId}}' }, after: capture('categoryId', 'data.id') }),
    request('Actualizar categoría', 'PATCH', '/products/categories/{{categoryId}}', { body: { label: 'Postman Actualizada', icon: 'pizza', kitchenId: '{{kitchenId}}' } }),
    request('Listar productos', 'GET', '/products', { query: [['categoryId', '{{categoryId}}', true, 'Activa este parámetro para filtrar por categoría.']] }),
    request('Obtener producto', 'GET', '/products/{{productId}}'),
    request('Crear producto (guarda productId)', 'POST', '/products', {
      body: { categoryId: '{{categoryId}}', name: 'Pizza Postman', description: 'Producto de prueba', isActive: true, hasMultipleSizes: false, isCombo: false, prices: [{ size: 'Única', price: 150 }], extras: [{ name: 'Queso extra', prices: [{ size: 'Única', price: 25 }] }] },
      after: capture('productId', 'data.id'),
    }),
    request('Actualizar producto', 'PATCH', '/products/{{productId}}', { body: { name: 'Pizza Postman Actualizada', isActive: true, prices: [{ size: 'Única', price: 175 }] } }),
    request('⚠ Eliminar producto', 'DELETE', '/products/{{productId}}', { description: 'Operación destructiva.' }),
    request('⚠ Eliminar categoría', 'DELETE', '/products/categories/{{categoryId}}', { description: 'Operación destructiva.' }),
  ]),
  folder('05 - Clientes', [
    request('Listar/buscar clientes', 'GET', '/customers', { query: [['query', 'Postman', true]] }),
    request('Obtener cliente', 'GET', '/customers/{{customerId}}'),
    request('Crear cliente (guarda customerId)', 'POST', '/customers', { body: { name: 'Cliente Postman', phone: '88888888', address: 'Dirección de prueba' }, after: capture('customerId', 'data.id') }),
    request('Crear o actualizar cliente', 'POST', '/customers/upsert', { body: { name: 'Cliente Postman', phone: '88888888', address: 'Dirección de prueba' }, after: capture('customerId', 'data.customer?.id') }),
    request('Actualizar cliente', 'PATCH', '/customers/{{customerId}}', { body: { name: 'Cliente Postman Actualizado', phone: '87777777', address: 'Nueva dirección' } }),
    request('⚠ Eliminar cliente', 'DELETE', '/customers/{{customerId}}', { description: 'Operación destructiva.' }),
  ]),
  folder('06 - Mesas', [
    request('Obtener configuración de pisos', 'GET', '/mesas/config'),
    request('Actualizar configuración de pisos', 'POST', '/mesas/config', { body: [{ id: 1, name: 'Primer piso', tableCount: 10 }] }),
    request('Listar mesas', 'GET', '/mesas'),
    request('Actualizar estado de mesa', 'PATCH', '/mesas/{{mesaId}}/status', { body: { estado: 'OCUPADO' } }),
    request('Reservar mesa', 'PATCH', '/mesas/{{mesaId}}/reserve', { body: { reservationName: 'Reserva Postman', reservationAmount: 4, reservationTime: '2026-09-26T18:00:00.000Z', expirationTime: '2026-09-26T20:00:00.000Z' } }),
    request('Liberar mesa', 'PATCH', '/mesas/{{mesaId}}/release'),
  ]),
  folder('07 - Turnos y caja', [
    request('Turno activo', 'GET', '/shifts/active', { after: capture('shiftId', 'data.id') }),
    request('Listar turnos', 'GET', '/shifts', { query: [['limit', '50'], ['status', 'OPEN', true], ['from', '{{today}}', true], ['to', '{{today}}', true]] }),
    request('Obtener turno', 'GET', '/shifts/{{shiftId}}'),
    request('Abrir turno (guarda shiftId)', 'POST', '/shifts/open', { body: { cashierName: 'Caja Postman', cashierId: '{{userId}}', openingAmount: 1000, cashRegisterName: 'Caja principal', notes: 'Prueba desde Postman' }, after: capture('shiftId', 'data.id') }),
    request('Vista previa de cierre', 'GET', '/shifts/{{shiftId}}/close-preview', { query: [['countedCash', '1000'], ['countedCard', '0'], ['countedApp', '0'], ['closeType', 'HANDOVER']] }),
    request('Cerrar turno', 'POST', '/shifts/{{shiftId}}/close', { body: { closingAmount: 1000, declaredCardAmount: 0, declaredAppAmount: 0, notes: 'Cierre de prueba', denominationBreakdown: [{ denomination: 1000, quantity: 1 }], closeType: 'HANDOVER' } }),
    request('Registrar gasto (guarda cashExpenseId)', 'POST', '/cash-expenses', { body: { amount: 100, category: 'INSUMOS_URGENTES', reason: 'Compra de prueba', voucherNumber: 'POSTMAN-001', notes: 'Prueba API', shiftId: '{{shiftId}}', authorizationPin: '{{pin}}' }, after: capture('cashExpenseId', 'data.id') }),
    request('Listar gastos', 'GET', '/cash-expenses', { query: [['shiftId', '{{shiftId}}', true], ['category', 'INSUMOS_URGENTES', true], ['startDate', '{{today}}', true], ['endDate', '{{today}}', true]] }),
    request('Gastos por turno', 'GET', '/cash-expenses/shift/{{shiftId}}'),
    request('Obtener gasto', 'GET', '/cash-expenses/{{cashExpenseId}}'),
  ]),
  folder('08 - Pedidos', [
    request('Listar pedidos', 'GET', '/orders', { query: [['scope', 'todayOrActive'], ['startDate', '{{today}}', true], ['endDate', '{{today}}', true]] }),
    request('Pedidos del motorizado', 'GET', '/orders/driver/{{driverId}}/today', { query: [['date', '{{today}}']] }),
    request('Tickets ocultos de cocina', 'GET', '/orders/kitchen/hidden-tickets'),
    request('Ocultar tickets de cocina', 'POST', '/orders/kitchen/hidden-tickets', { body: { ticketIds: ['{{orderId}}'] } }),
    request('Métricas SLA', 'GET', '/orders/sla/metrics', { query: [['days', '30']] }),
    request('Métricas de cancelaciones', 'GET', '/orders/cancellations/metrics', { query: [['startDate', '{{today}}', true], ['endDate', '{{today}}', true]] }),
    request('Métricas de pagos', 'GET', '/orders/payments/metrics', { query: [['startDate', '{{today}}', true], ['endDate', '{{today}}', true]] }),
    request('Obtener pedido', 'GET', '/orders/{{orderId}}'),
    request('Crear pedido (guarda orderId)', 'POST', '/orders', {
      body: { shiftId: '{{shiftId}}', customerId: '{{customerId}}', items: [{ productId: '{{productId}}', name: 'Pizza Postman', price: 150, size: 'Única', quantity: 1, extras: [], note: 'Sin cebolla', kitchenModifiers: [{ id: 'sin-cebolla', label: 'Sin cebolla', kind: 'REMOVE' }], isSentToKitchen: false, kitchenId: '{{kitchenId}}' }], subTotal: 150, discountAmount: 0, taxAmount: 0, total: 150, status: 'pending', customerSnapshotName: 'Cliente Postman', customerPhone: '88888888', orderType: 'llevar', promotionSource: 'none', cashierSnapshotName: 'Admin', cashierId: '{{userId}}', isSentToKitchen: false },
      after: capture('orderId', 'data.id'),
    }),
    request('Actualizar estado del pedido', 'PATCH', '/orders/{{orderId}}/status', { body: { status: 'preparing', kitchenId: '{{kitchenId}}' } }),
    request('Iniciar entrega', 'PATCH', '/orders/{{orderId}}/start-delivery'),
    request('Actualizar ítems', 'PATCH', '/orders/{{orderId}}/items', { body: { items: [{ productId: '{{productId}}', name: 'Pizza Postman', price: 150, size: 'Única', quantity: 1, extras: [], isSentToKitchen: true, kitchenId: '{{kitchenId}}' }], subTotal: 150, discountAmount: 0, taxAmount: 0, total: 150, promotionSource: 'none', isSentToKitchen: true } }),
    request('Actualizar mesas vinculadas', 'PATCH', '/orders/{{orderId}}/tables', { body: { tableIds: ['{{mesaId}}'] } }),
    request('Finalizar pedido', 'PATCH', '/orders/{{orderId}}/finalize', { body: { payments: [{ method: 'EFECTIVO', amount: 150, currency: 'NIO' }], customerSnapshotName: 'Cliente Postman', orderType: 'llevar', finalTotal: 150, subTotal: 150, discountAmount: 0, taxAmount: 0, promotionSource: 'none', status: 'paid' } }),
  ]),
  folder('09 - Promociones', [
    folder('Cupones', [
      request('Listar cupones', 'GET', '/promotions/coupons'),
      request('Crear cupón (guarda couponId)', 'POST', '/promotions/coupons', { body: { code: 'POSTMAN10', discountType: 'porcentaje', discountValue: 10, maxUses: 100, expiresDate: '2027-12-31T23:59:59.000Z', manualStatus: 'Activo' }, after: capture('couponId', 'data.id') }),
      request('Actualizar cupón', 'PATCH', '/promotions/coupons/{{couponId}}', { body: { discountValue: 15, manualStatus: 'Activo' } }),
      request('Canjear cupón', 'POST', '/promotions/coupons/redeem', { body: { code: 'POSTMAN10' } }),
      request('⚠ Eliminar cupón', 'DELETE', '/promotions/coupons/{{couponId}}'),
    ]),
    folder('Descuentos', [
      request('Listar descuentos', 'GET', '/promotions/discounts'),
      request('Crear descuento (guarda discountId)', 'POST', '/promotions/discounts', { body: { name: 'Descuento Postman', type: 'Porcentaje', value: 10, status: 'Activo', productIds: ['{{productId}}'], categoryIds: [] }, after: capture('discountId', 'data.id') }),
      request('Actualizar descuento', 'PATCH', '/promotions/discounts/{{discountId}}', { body: { name: 'Descuento Postman 15%', value: 15, status: 'Activo' } }),
      request('⚠ Eliminar descuento', 'DELETE', '/promotions/discounts/{{discountId}}'),
    ]),
    folder('Happy Hours', [
      request('Listar happy hours', 'GET', '/promotions/happy-hours'),
      request('Crear happy hour (guarda happyHourId)', 'POST', '/promotions/happy-hours', { body: { name: 'Happy Hour Postman', daysOfWeek: ['FRIDAY'], startTime: '17:00', endTime: '19:00', promotionType: 'porcentaje', promotionValue: 20, productIds: ['{{productId}}'], categoryIds: [], status: 'Activo' }, after: capture('happyHourId', 'data.id') }),
      request('Actualizar happy hour', 'PATCH', '/promotions/happy-hours/{{happyHourId}}', { body: { endTime: '20:00', promotionValue: 25, status: 'Activo' } }),
      request('⚠ Eliminar happy hour', 'DELETE', '/promotions/happy-hours/{{happyHourId}}'),
    ]),
    folder('Certificados', [
      request('Listar certificados', 'GET', '/promotions/certificates'),
      request('Buscar certificado por serial', 'GET', '/promotions/certificates/{{certificateSerial}}'),
      request('Crear certificado (guarda ID y serial)', 'POST', '/promotions/certificates', { body: { origin: 'POSTMAN', items: [{ productId: '{{productId}}', quantity: 1 }], amount: 150, serial: 'CERT-POSTMAN-001', description: 'Certificado de prueba' }, after: `${capture('certificateId', 'data.id')}\n${capture('certificateSerial', 'data.serial')}` }),
      request('Marcar certificado entregado', 'POST', '/promotions/certificates/{{certificateId}}/deliver'),
      request('Cancelar certificado', 'POST', '/promotions/certificates/{{certificateId}}/cancel'),
      request('Canjear certificado', 'POST', '/promotions/certificates/redeem', { body: { serial: '{{certificateSerial}}', redeemedOrderId: '{{orderId}}' } }),
      request('⚠ Eliminar certificado', 'DELETE', '/promotions/certificates/{{certificateId}}'),
    ]),
  ]),
  folder('10 - Correlativos fiscales', [
    request('Listar correlativos', 'GET', '/correlativos'),
    request('Obtener correlativo activo', 'GET', '/correlativos/active', { query: [['documentType', 'FACTURA']] }),
    request('Crear correlativo (guarda correlativoId)', 'POST', '/correlativos', { body: { documentType: 'FACTURA', resolutionNumber: 'RES-POSTMAN-001', prefix: 'A', startNumber: 1, endNumber: 1000, currentNumber: 1, issueDate: '2026-01-01', expirationDate: '2027-12-31', status: 'ACTIVO' }, after: capture('correlativoId', 'data.id') }),
    request('Actualizar correlativo', 'PATCH', '/correlativos/{{correlativoId}}', { body: { endNumber: 2000, status: 'ACTIVO' } }),
    request('Consumir siguiente número', 'POST', '/correlativos/next', { body: { documentType: 'FACTURA' } }),
    request('⚠ Eliminar correlativo', 'DELETE', '/correlativos/{{correlativoId}}'),
  ]),
  folder('11 - Configuración', [
    request('Obtener configuración', 'GET', '/config/{{configId}}'),
    request('Guardar configuración', 'PUT', '/config/{{configId}}', { body: { data: { enabled: true, source: 'postman' }, updatedById: '{{userId}}' } }),
  ]),
  folder('12 - Dispositivos', [
    request('Listar impresoras', 'GET', '/devices/printers'),
    request('Guardar impresora', 'POST', '/devices/printers', { body: { id: '{{printerId}}', name: 'Impresora Postman', role: 'cashier', connectionType: 'network', ipAddress: '192.168.1.100', port: 9100, openCashDrawer: true, isActive: true } }),
    request('Listar dispositivos (legado)', 'GET', '/devices'),
    request('Escanear dispositivos', 'POST', '/devices/scan'),
    request('⚠ Eliminar impresora', 'DELETE', '/devices/printers/{{printerId}}'),
  ]),
  folder('13 - Notificaciones', [
    request('Listar notificaciones', 'GET', '/notifications'),
    request('Stream SSE (conexión continua)', 'GET', '/notifications/stream', { description: 'Endpoint Server-Sent Events. Postman mantendrá la conexión abierta.' }),
    request('Marcar notificación como leída', 'PATCH', '/notifications/{{notificationId}}/read'),
    request('⚠ Eliminar notificación', 'DELETE', '/notifications/{{notificationId}}'),
  ]),
  folder('14 - Auditoría', [
    request('Listar logs', 'GET', '/system-logs', { query: [['limit', '100'], ['user', '{{username}}', true], ['action', 'LOGIN', true], ['level', 'INFO', true], ['role', 'ADMIN', true], ['startDate', '{{today}}', true], ['endDate', '{{today}}', true], ['search', 'postman', true]] }),
    request('Crear log', 'POST', '/system-logs', { body: { user: '{{username}}', userId: '{{userId}}', role: 'ADMIN', action: 'POSTMAN_TEST', details: 'Prueba manual desde la colección', level: 'INFO' } }),
  ]),
  folder('15 - Dashboard administrativo', [
    request('Cajas activas', 'GET', '/admin/dashboard/cajas-activas'),
    request('Rendimiento de meseros', 'GET', '/admin/dashboard/rendimiento-meseros'),
    request('KPIs en vivo', 'GET', '/admin/dashboard/live-kpis'),
  ]),
  folder('16 - Respaldos ⚠', [
    request('Listar respaldos', 'GET', '/backups'),
    request('Generar respaldo', 'POST', '/backups/generate', { after: capture('backupFilename', 'data.filename') }),
    request('Obtener configuración', 'GET', '/backups/config'),
    request('Actualizar configuración', 'PUT', '/backups/config', { body: { enabled: true, hour: 3, minute: 0, backupOnShiftClose: true, retentionDays: 30 } }),
    request('Descargar respaldo', 'GET', '/backups/{{backupFilename}}/download'),
    request('⚠ Restaurar desde historial', 'POST', '/backups/restore', { body: { filename: '{{backupFilename}}' }, description: 'Operación destructiva: restaura la base de datos.' }),
    request('⚠ Restaurar archivo subido', 'POST', '/backups/restore', { formdata: [{ key: 'file', type: 'file', src: [] }], description: 'Selecciona manualmente un archivo .sql. Operación destructiva.' }),
    request('⚠ Eliminar respaldo', 'DELETE', '/backups/{{backupFilename}}'),
  ]),
];

const collection = {
  info: {
    _postman_id: '2f2d43bf-e751-4a46-bd89-a9fd2ae70f53',
    name: 'Pizza POS Backend - API completa',
    description: 'Colección importable para probar la API REST del backend Pizza POS. Ejecuta primero “Login con contraseña” o “Login con PIN”; el token Bearer se guarda automáticamente. Las solicitudes con ⚠ modifican o eliminan datos y deben ejecutarse conscientemente. Los IDs creados se guardan como variables cuando la respuesta los incluye.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }] },
  event: [{
    listen: 'prerequest',
    script: {
      type: 'text/javascript',
      exec: [
        'const now = new Date();',
        'const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);',
        'pm.collectionVariables.set("today", localDate);',
      ],
    },
  }],
  variable: [
    ['baseUrl', 'http://127.0.0.1:3000'], ['username', 'admin'], ['password', 'CAMBIAR_AQUI'], ['pin', '000000'], ['email', 'admin@pizzatogo.com'],
    ['accessToken', ''], ['resetToken', ''], ['today', ''], ['userId', '00000000-0000-4000-8000-000000000001'], ['driverId', '00000000-0000-4000-8000-000000000002'],
    ['kitchenId', '00000000-0000-4000-8000-000000000003'], ['categoryId', '00000000-0000-4000-8000-000000000004'], ['productId', '00000000-0000-4000-8000-000000000005'],
    ['customerId', '00000000-0000-4000-8000-000000000006'], ['mesaId', '1-1'], ['shiftId', '00000000-0000-4000-8000-000000000007'], ['cashExpenseId', '00000000-0000-4000-8000-000000000008'],
    ['orderId', '00000000-0000-4000-8000-000000000009'], ['couponId', '1'], ['discountId', '1'], ['happyHourId', '1'], ['certificateId', '1'], ['certificateSerial', 'CERT-POSTMAN-001'],
    ['correlativoId', '00000000-0000-4000-8000-000000000010'], ['configId', 'general'], ['printerId', 'printer-postman'], ['notificationId', '00000000-0000-4000-8000-000000000011'], ['backupFilename', 'backup.sql'],
  ].map(([key, value]) => ({ key, value, type: 'string' })),
  item,
};

const output = path.join(__dirname, 'Pizza-POS-Backend.postman_collection.json');
fs.writeFileSync(output, `${JSON.stringify(collection, null, 2)}\n`, 'utf8');
console.log(`Colección generada: ${output}`);
