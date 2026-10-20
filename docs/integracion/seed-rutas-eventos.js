// COPIAR A: intranet-api-auth/utils/seed-routes/eventos/seed-rutas-eventos.js
// Registra en la BD de la intranet las rutas de backend del servicio de eventos (mismo estilo que los seeds de sorteos y créditos).
// Ejecutar con la BD de la intranet configurada (SCHEMA_API_AUTH):  node utils/seed-routes/eventos/seed-rutas-eventos.js
//
// El gateway autoriza por ruta EXACTA y route_path / route_name son únicos en toda la intranet.
// Si se agrega un endpoint a backend/src/routes/events.js, hay que agregarlo aquí y volver a ejecutar.
import { PrismaClient } from '../../../generated/auth/index.js';

const prisma = new PrismaClient();

const parent = { name: 'API Eventos', path: '/events-service' };

const children = [
  { name: 'Eventos - Usuario y sedes', path: '/api/events/me' },
  { name: 'Eventos - Listar eventos', path: '/api/events/list' },
  { name: 'Eventos - Crear evento', path: '/api/events/create' },
  { name: 'Eventos - Detalle de evento', path: '/api/events/detail' },
  { name: 'Eventos - Finalizar evento', path: '/api/events/finalize' },
  { name: 'Eventos - Cargar asistentes', path: '/api/events/attendees/upload' },
  { name: 'Eventos - Agregar asistente', path: '/api/events/attendees/add' },
  { name: 'Eventos - Listar asistentes', path: '/api/events/attendees/list' },
  { name: 'Eventos - Marcar asistencia', path: '/api/events/attendees/mark' },
];

async function main() {
  const parentRoute = await prisma.routes_backend.upsert({
    where: { route_path: parent.path },
    update: { route_name: parent.name, active: true },
    create: { route_name: parent.name, route_path: parent.path, active: true },
  });
  console.log(`Ruta API padre: ${parentRoute.route_name} (${parentRoute.route_path})`);

  for (const route of children) {
    const child = await prisma.routes_backend_child.upsert({
      where: { route_path: route.path },
      update: { route_name: route.name, active: true, routes_backendId: parentRoute.id },
      create: { route_name: route.name, route_path: route.path, active: true, routes_backendId: parentRoute.id },
    });
    console.log(`   Endpoint registrado: ${child.route_name} (${child.route_path})`);
  }

  console.log('\nListo. Falta asignar estas rutas al/los grupos de permisos desde el panel de administración de la intranet.');
}

main()
  .catch((e) => {
    console.error('Error ejecutando el script:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
