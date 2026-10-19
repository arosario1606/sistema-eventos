import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN, OTHER, client, prisma, seedScenario, startServer, token } from './helpers.js';

let server;
let api;
const tk = () => token(ADMIN);

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

async function newEvent(name = 'Evento', csv = '1;ANA\n2;BETO\n3;CARLA\n4;DIEGO') {
  const id = (await api.post('/create', tk(), { name, eventDate: '2026-12-05', idSede: 1 })).body.idEvent;
  await api.upload(`/attendees/upload?id=${id}`, tk(), csv);
  return id;
}
const rowsOf = async (id) => (await api.get(`/attendees/list?id=${id}`, tk())).body;
const mark = (idEvent, idAttendee, attended, user = tk()) => api.post('/attendees/mark', user, { idEvent, idAttendee, attended });

test('marcar y desmarcar se guarda al instante, con quién y cuándo, y se ve al volver a pedir la lista', async () => {
  const id = await newEvent();
  const [ana] = (await rowsOf(id)).rows;

  const res = await mark(id, ana.idAttendee, true);
  assert.deepEqual(res.body, { idAttendee: ana.idAttendee, attended: true });
  const db = await prisma.attendee.findUnique({ where: { idAttendee: ana.idAttendee } });
  assert.equal(db.attended, true);
  assert.equal(db.attendedBy, ADMIN.email);
  assert.ok(db.attendedAt instanceof Date);
  assert.equal((await rowsOf(id)).attendedCount, 1);

  await mark(id, ana.idAttendee, false);
  const undone = await prisma.attendee.findUnique({ where: { idAttendee: ana.idAttendee } });
  assert.deepEqual([undone.attended, undone.attendedAt, undone.attendedBy], [false, null, null]);
  assert.equal((await rowsOf(id)).attendedCount, 0);
});

test('marcar valida los datos y el acceso sin tocar nada', async () => {
  const id = await newEvent();
  const other = await newEvent('Otro');
  const [ana] = (await rowsOf(id)).rows;
  const [foreign] = (await rowsOf(other)).rows;

  assert.equal((await mark(id, ana.idAttendee, 'si')).status, 400, 'attended debe ser booleano');
  assert.equal((await mark(id, 'x', true)).status, 400);
  assert.equal((await mark('x', ana.idAttendee, true)).status, 400);
  assert.equal((await mark(id, 999999, true)).status, 404);
  assert.equal((await mark(id, foreign.idAttendee, true)).status, 404, 'un asistente de otro evento no se puede marcar por este');
  assert.equal((await mark(id, ana.idAttendee, true, token(OTHER))).status, 403, 'sin permiso sobre la sede');
  assert.equal((await mark(id, ana.idAttendee, true, token({ id: 99, email: 'sin@permisos.com' }))).status, 403);
  assert.equal(await prisma.attendee.count({ where: { attended: true } }), 0);
});

test('marcas simultáneas sobre distintas personas se guardan todas', async () => {
  const csv = Array.from({ length: 60 }, (_, i) => `${100 + i};PERSONA ${String(i).padStart(2, '0')}`).join('\n');
  const id = await newEvent('Puertas', csv);
  const { rows } = await rowsOf(id);
  const results = await Promise.all(rows.map((r) => mark(id, r.idAttendee, true)));
  assert.ok(results.every((r) => r.status === 200));
  assert.equal((await rowsOf(id)).attendedCount, 60);
});

test('marcar a todos: solo a los pendientes, conserva quién marcó a los demás y se puede repetir', async () => {
  const id = await newEvent();
  const [ana] = (await rowsOf(id)).rows;
  await mark(id, ana.idAttendee, true);

  const res = await api.post('/attendees/mark-all', tk(), { idEvent: id });
  assert.deepEqual(res.body, { marked: 3 });
  const after = await rowsOf(id);
  assert.ok(after.rows.every((r) => r.attended));
  assert.equal(await prisma.attendee.count({ where: { idEvent: id, attendedBy: ADMIN.email } }), 4);
  assert.deepEqual((await api.post('/attendees/mark-all', tk(), { idEvent: id })).body, { marked: 0 });
});

test('marcar a todos valida acceso y solo afecta al evento indicado', async () => {
  const a = await newEvent('A');
  const b = await newEvent('B');
  assert.equal((await api.post('/attendees/mark-all', token(OTHER), { idEvent: a })).status, 403);
  assert.equal((await api.post('/attendees/mark-all', tk(), {})).status, 400);
  assert.equal((await api.post('/attendees/mark-all', tk(), { idEvent: 999999 })).status, 404);
  await api.post('/attendees/mark-all', tk(), { idEvent: a });
  assert.equal(await prisma.attendee.count({ where: { idEvent: b, attended: true } }), 0);
});

test('alta manual: guarda todos los campos, valida y rechaza cédulas repetidas', async () => {
  const id = await newEvent();
  const add = (body, user = tk()) => api.post('/attendees/add', user, { idEvent: id, ...body });

  const res = await add({ cedula: '9.999.999', fullName: ' INVITADO  ESPECIAL ', company: 'Externa', jobTitle: 'VIP', seat: 'M-1', companyGroup: 2 });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body, {
    idAttendee: res.body.idAttendee, cedula: '9999999', fullName: 'INVITADO ESPECIAL', company: 'Externa',
    jobTitle: 'VIP', seat: 'M-1', companyGroup: 2, attended: false,
  });
  assert.equal((await add({ cedula: '9999999', fullName: 'OTRO' })).status, 409, 'repetida');
  assert.equal((await add({ cedula: '1', fullName: 'OTRO' })).status, 409, 'repetida contra la lista cargada');
  assert.equal((await add({ cedula: '', fullName: 'X' })).status, 400);
  assert.equal((await add({ cedula: '55', fullName: '' })).status, 400);
  assert.equal((await add({ cedula: '55', fullName: 'X', companyGroup: 'uno' })).status, 400);
  assert.equal((await add({ cedula: '55', fullName: 'X' }, token(OTHER))).status, 403);
  assert.equal((await rowsOf(id)).rows.length, 5);
});

test('el listado se entrega ordenado por nombre', async () => {
  const id = await newEvent('Orden', '1;ZETA\n2;ALFA\n3;MEDIO');
  assert.deepEqual((await rowsOf(id)).rows.map((r) => r.fullName), ['ALFA', 'MEDIO', 'ZETA']);
});
