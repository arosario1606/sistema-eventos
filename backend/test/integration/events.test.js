import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN, OTHER, client, prisma, seedScenario, startServer, token, dropIntranet } from './helpers.js';

let server;
let api;
const tk = () => token(ADMIN);
const create = (body, user = tk()) => api.post('/create', user, { name: 'Fiesta', eventDate: '2026-12-05', idSede: 1, ...body });

before(async () => {
  await seedScenario();
  let url;
  ({ server, url } = await startServer());
  api = client(url);
});

after(async () => {
  server.close();
  await dropIntranet();
  await prisma.$disconnect();
});

test('crear evento valida nombre, fecha y sede', async () => {
  assert.equal((await create({ name: '   ' })).status, 400);
  assert.equal((await create({ name: 'x'.repeat(151) })).status, 400);
  assert.equal((await create({ eventDate: 'mañana' })).status, 400);
  assert.equal((await create({ eventDate: '2026-02-31' })).status, 400);
  assert.equal((await create({ idSede: undefined })).status, 400);
  assert.equal((await create({ idSede: 'x' })).status, 400);
  assert.equal(await prisma.event.count(), 0, 'ninguna petición inválida crea eventos');
});

test('crear evento exige permiso sobre una sede ACTIVA', async () => {
  assert.equal((await create({ idSede: 2 })).status, 403, 'sede sin permiso');
  assert.equal((await create({ idSede: 3 })).status, 403, 'sede inactiva en la intranet no se ofrece para eventos nuevos');
  assert.equal((await create({ idSede: 4 })).status, 403, 'sede desactivada en el módulo no se ofrece para eventos nuevos');
  assert.equal((await create({ idSede: 999 })).status, 403, 'sede inexistente');
});

test('crea el evento y lo lista con sus conteos; otro usuario no lo ve ni lo toca', async () => {
  const res = await create({ name: '  Fiesta   de Navidad ' });
  assert.equal(res.status, 201);
  assert.equal(res.body.name, 'Fiesta de Navidad');
  assert.equal(res.body.sede, 'Planta Maracaibo Empresa A');
  const id = res.body.idEvent;
  assert.equal((await prisma.event.findUnique({ where: { idEvent: id } })).createdBy, ADMIN.email, 'auditado con el correo');

  const mine = await api.get('/list', tk());
  assert.ok(mine.body.some((e) => e.idEvent === id && e.attendees === 0 && e.attended === 0));
  assert.deepEqual((await api.get('/list', token(OTHER))).body, [], 'OTHER solo tiene la sede 2');

  assert.equal((await api.get(`/detail?id=${id}`, token(OTHER))).status, 403);
  assert.equal((await api.get(`/attendees/list?id=${id}`, token(OTHER))).status, 403);
  assert.equal((await api.get('/detail?id=999999', tk())).status, 404);
  assert.equal((await api.get('/detail?id=abc', tk())).status, 400);
});

test('los eventos se listan del más reciente al más antiguo', async () => {
  await create({ name: 'Antiguo', eventDate: '2025-01-01' });
  await create({ name: 'Futuro', eventDate: '2027-01-01' });
  const names = (await api.get('/list', tk())).body.map((e) => e.name);
  assert.ok(names.indexOf('Futuro') < names.indexOf('Fiesta de Navidad'));
  assert.ok(names.indexOf('Fiesta de Navidad') < names.indexOf('Antiguo'));
});
