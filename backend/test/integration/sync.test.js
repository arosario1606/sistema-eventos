import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { prisma, resetDb } from './helpers.js';

const run = promisify(execFile);
const AUTH = 'eventos_test_auth';

before(async () => {
  await resetDb();
  const fixture = (await readFile(new URL('../fixtures/intranet_min.sql', import.meta.url), 'utf8')).replaceAll('{{AUTH_SCHEMA}}', AUTH);
  for (const statement of fixture.split(';').map((s) => s.trim()).filter(Boolean)) await prisma.$executeRawUnsafe(statement);
});

after(async () => {
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${AUTH} CASCADE`);
  await prisma.$disconnect();
});

const sync = () => run('node', ['prisma/sync.js', 'sedes'], { env: { ...process.env, INTRANET_AUTH_SCHEMA: AUTH } });

test('sync:sedes copia las sedes de Locations y respeta las desactivadas a mano', async () => {
  await sync();
  assert.deepEqual(
    (await prisma.sede.findMany({ orderBy: { idSede: 'asc' } })).map((s) => [s.idSede, s.name, s.active]),
    [[1, 'Sede Maracaibo', true], [2, 'Sede Caracas', true], [3, 'Sede Antigua', false]],
  );

  await prisma.sede.update({ where: { idSede: 2 }, data: { active: false } });
  await prisma.$executeRawUnsafe(`UPDATE ${AUTH}."Locations" SET name = 'Sede Caracas Centro', is_active = true WHERE id = 2`);
  await sync();
  const caracas = await prisma.sede.findUnique({ where: { idSede: 2 } });
  assert.equal(caracas.name, 'Sede Caracas Centro', 'el nombre se actualiza');
  assert.equal(caracas.active, false, 'pero NO se reactiva una sede desactivada a mano');
});

const seed = (env = {}) => run('node', ['prisma/seed.dev.js'], {
  env: { ...process.env, INTRANET_AUTH_SCHEMA: AUTH, DEV_USER_ID: '77', DEV_USER_EMAIL: 'dev@example.com', ...env },
});

test('seed:dev copia las sedes REALES de Locations (sin crear sedes de prueba) y da permiso sobre las activas', async () => {
  await resetDb();
  const { stdout } = await seed();
  assert.match(stdout, /Sedes copiadas desde Locations/);
  const sedes = await prisma.sede.findMany({ orderBy: { idSede: 'asc' } });
  assert.ok(sedes.every((s) => s.idSede < 9000), 'no hay sedes de prueba 9001/9002 donde existe Locations');
  assert.equal(sedes.length, 3);
  const perms = await prisma.userBranchPermission.findMany({ where: { userId: 77 }, orderBy: { idSede: 'asc' } });
  assert.deepEqual(perms.map((p) => p.idSede), [1, 2], 'solo las sedes activas (la 3 está inactiva)');
});

test('seed:dev solo crea sedes de PRUEBA cuando la base no tiene la tabla Locations', async () => {
  await resetDb();
  const { stdout } = await seed({ INTRANET_AUTH_SCHEMA: 'esquema_que_no_existe' });
  assert.match(stdout, /2 sedes de PRUEBA/);
  assert.deepEqual((await prisma.sede.findMany({ orderBy: { idSede: 'asc' } })).map((s) => s.idSede), [9001, 9002]);
});

test('rechaza nombres de esquema peligrosos', async () => {
  await assert.rejects(run('node', ['prisma/sync.js', 'sedes'], { env: { ...process.env, INTRANET_AUTH_SCHEMA: 'x"; DROP TABLE "Sede"; --' } }));
  assert.ok(await prisma.sede.count() > 0);
});
