import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { ADMIN, client, prisma, seedScenario, SECRET, startServer, token } from './helpers.js';

let server;
let api;

before(async () => {
  await seedScenario();
  let url;
  ({ server, url } = await startServer());
  api = client(url);
});

after(async () => {
  server.close();
  await prisma.$disconnect();
});

test('sin token, con token falso, vencido o alg:none responde 401', async () => {
  assert.equal((await api.get('/me')).status, 401);
  assert.equal((await api.get('/me', 'no-es-un-jwt')).status, 401);
  assert.equal((await api.get('/me', jwt.sign({ id: 10, email: 'x@y.z' }, 'otra-clave'))).status, 401);
  assert.equal((await api.get('/me', token(ADMIN, { expiresIn: -10 }))).status, 401);
  const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ id: 10, email: 'x@y.z' })).toString('base64url')}.`;
  assert.equal((await api.get('/me', none)).status, 401);
});

test('token sin identidad responde 401 y usuario inactivo responde 403', async () => {
  assert.equal((await api.get('/me', jwt.sign({ email: 'a@b.c' }, SECRET))).status, 401);
  assert.equal((await api.get('/me', token({ ...ADMIN, active: false }))).status, 403);
});

test('/me devuelve solo las sedes activas con permiso', async () => {
  const res = await api.get('/me', token(ADMIN));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.sedes, [{ idSede: 1, name: 'Sede 1' }], 'la sede 4 está inactiva y no se ofrece');
  assert.equal(res.body.email, ADMIN.email);
});

test('todas las rutas exigen autenticación', async () => {
  for (const path of ['/list', '/detail?id=1', '/attendees/list?id=1']) assert.equal((await api.get(path)).status, 401, path);
  for (const path of ['/create', '/finalize', '/attendees/upload?id=1', '/attendees/add', '/attendees/mark']) {
    assert.equal((await api.post(path, undefined, {})).status, 401, path);
  }
});
