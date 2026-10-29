import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN, AUTH_SCHEMA, OTHER, client, dropIntranet, grant, prisma, seedScenario, startServer, token } from './helpers.js';

let server;
let api;
const tk = (u = ADMIN) => token(u);
const run = (sql) => prisma.$executeRawUnsafe(sql);

before(async () => {
  let url;
  ({ server, url } = await startServer());
  api = client(url);
});

beforeEach(seedScenario);

after(async () => {
  server.close();
  await dropIntranet();
  await prisma.$disconnect();
});

const newEvent = async (idSede = 1) =>
  (await api.post('/create', tk(), { name: 'Evento', eventDate: '2026-12-05', idSede })).body;

test('las sedes se leen EN VIVO: renombrar una sede en la intranet se refleja sin copiar nada', async () => {
  const ev = await newEvent();
  assert.equal(ev.sede, 'Planta Maracaibo Empresa A');
  await run(`UPDATE ${AUTH_SCHEMA}."Locations" SET name = 'Planta Maracaibo Nueva' WHERE id = 1`);
  assert.equal((await api.get('/me', tk())).body.sedes[0].name, 'Planta Maracaibo Nueva');
  assert.equal((await api.get('/list', tk())).body[0].sede, 'Planta Maracaibo Nueva');
  assert.equal((await api.get(`/detail?id=${ev.idEvent}`, tk())).body.sede, 'Planta Maracaibo Nueva');
});

test('los permisos por sede se leen EN VIVO de la intranet: dar y quitar acceso se refleja de inmediato', async () => {
  const ev = await newEvent();
  assert.equal((await api.get(`/detail?id=${ev.idEvent}`, tk(OTHER))).status, 403);
  await grant(OTHER.id, 1);
  assert.equal((await api.get(`/detail?id=${ev.idEvent}`, tk(OTHER))).status, 200, 'con permiso ya ve el evento');
  assert.equal((await api.get('/list', tk(OTHER))).body.length, 1);
  await run(`DELETE FROM ${AUTH_SCHEMA}."User_organization_accesses" WHERE user_id = ${OTHER.id} AND location_id = 1`);
  assert.equal((await api.get(`/detail?id=${ev.idEvent}`, tk(OTHER))).status, 403, 'sin permiso ya no lo ve');
});

test('una sede inactiva en la intranet no se ofrece para eventos nuevos, pero sus eventos siguen visibles', async () => {
  const ev = await newEvent();
  await run(`UPDATE ${AUTH_SCHEMA}."Locations" SET is_active = false WHERE id = 1`);
  assert.deepEqual((await api.get('/me', tk())).body.sedes, [], 'ya no se ofrece');
  assert.equal((await api.post('/create', tk(), { name: 'Otro', eventDate: '2026-12-06', idSede: 1 })).status, 403);
  assert.equal((await api.get(`/detail?id=${ev.idEvent}`, tk())).status, 200, 'el evento existente sigue accesible');
});

test('si la sede se elimina de la intranet, el evento se CONSERVA en la base (no se borra en cascada)', async () => {
  const ev = await newEvent();
  await run(`DELETE FROM ${AUTH_SCHEMA}."Locations" WHERE id = 1`);
  assert.equal(await prisma.event.count({ where: { idEvent: ev.idEvent } }), 1, 'el evento NO se borra');
  // El acceso a la sede se borra en la intranet (ON DELETE CASCADE), así que nadie lo ve hasta que alguien lo reasigne.
  assert.equal((await api.get(`/detail?id=${ev.idEvent}`, tk())).status, 403);
});

test('la misma sede repetida bajo dos empresas cuenta una sola vez', async () => {
  await grant(ADMIN.id, 1, 2); // misma sede 1, otra empresa
  const sedes = (await api.get('/me', tk())).body.sedes;
  assert.equal(sedes.filter((s) => s.idSede === 1).length, 1);
});

test('una fila de acceso SIN sede (location_id NULL) no da acceso a ninguna sede', async () => {
  const ghost = { id: 99, email: 'sinsede@example.com' };
  await grant(ghost.id, null);
  assert.deepEqual((await api.get('/me', tk(ghost))).body.sedes, []);
  assert.deepEqual((await api.get('/list', tk(ghost))).body, []);
});

test('quien no tiene ningún permiso en la intranet no ve nada', async () => {
  await newEvent();
  const nobody = { id: 12345, email: 'nadie@example.com' };
  assert.deepEqual((await api.get('/list', tk(nobody))).body, []);
  assert.equal((await api.post('/create', tk(nobody), { name: 'x', eventDate: '2026-12-05', idSede: 1 })).status, 403);
});

test('si faltan las vistas responde 503 con un mensaje claro (y no «Error interno»)', async () => {
  await run('DROP VIEW eventos_test.v_permiso_sede');
  const res = await api.get('/me', tk());
  assert.equal(res.status, 503);
  assert.match(res.body.error, /vistas v_sede y v_permiso_sede/);
  assert.match(res.body.error, /vistas-eventos\.sql/);
  await seedScenario(); // restaura la intranet simulada
  assert.equal((await api.get('/me', tk())).status, 200);

  await run('DROP VIEW eventos_test.v_sede');
  assert.equal((await api.get('/list', tk())).status, 503);
});

test('la ruta de marcar a todos ya no existe', async () => {
  assert.equal((await api.post('/attendees/mark-all', tk(), { idEvent: 1 })).status, 404);
});
