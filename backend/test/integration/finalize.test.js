import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN, OTHER, client, prisma, seedScenario, startServer, token, dropIntranet } from './helpers.js';

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
  await dropIntranet();
  await prisma.$disconnect();
});

async function newEvent(name, csv = '1;ANA\n2;BETO\n3;CARLA') {
  const id = (await api.post('/create', tk(), { name, eventDate: '2026-12-05', idSede: 1 })).body.idEvent;
  await api.upload(`/attendees/upload?id=${id}`, tk(), csv);
  return id;
}

test('finalizar borra el evento y sus asistentes, informa los conteos y no toca la sede ni otros eventos', async () => {
  const id = await newEvent('A borrar');
  const keep = await newEvent('A conservar');
  const [ana] = (await api.get(`/attendees/list?id=${id}`, tk())).body.rows;
  await api.post('/attendees/mark', tk(), { idEvent: id, idAttendee: ana.idAttendee, attended: true });

  const res = await api.post('/finalize', tk(), { idEvent: id });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { idEvent: id, attendees: 3, attended: 1 });

  assert.equal(await prisma.event.count({ where: { idEvent: id } }), 0);
  assert.equal(await prisma.attendee.count({ where: { idEvent: id } }), 0, 'no queda ninguna fila del evento');
  assert.equal(await prisma.attendee.count({ where: { idEvent: keep } }), 3, 'el otro evento intacto');
  assert.equal((await api.get('/me', tk())).body.sedes.length, 1, 'la sede se conserva (está en la intranet)');
  assert.equal((await api.get(`/detail?id=${id}`, tk())).status, 404);
  assert.equal((await api.post('/finalize', tk(), { idEvent: id })).status, 404, 'no se puede finalizar dos veces');
});

test('finalizar valida acceso y datos sin borrar nada', async () => {
  const id = await newEvent('Protegido');
  assert.equal((await api.post('/finalize', token(OTHER), { idEvent: id })).status, 403);
  assert.equal((await api.post('/finalize', undefined, { idEvent: id })).status, 401);
  assert.equal((await api.post('/finalize', tk(), {})).status, 400);
  assert.equal((await api.post('/finalize', tk(), { idEvent: 'x' })).status, 400);
  assert.equal(await prisma.attendee.count({ where: { idEvent: id } }), 3);
});

test('finalizar mientras se cargan y marcan asistentes no deja errores 500 ni filas huérfanas', async () => {
  const id = await newEvent('Carrera', Array.from({ length: 100 }, (_, i) => `${i + 1};P ${i}`).join('\n'));
  const [first] = (await api.get(`/attendees/list?id=${id}`, tk())).body.rows;
  const csv = Array.from({ length: 100 }, (_, i) => `${i + 500};NUEVO ${i}`).join('\n');
  const results = await Promise.all([
    api.upload(`/attendees/upload?id=${id}`, tk(), csv),
    api.post('/attendees/mark', tk(), { idEvent: id, idAttendee: first.idAttendee, attended: true }),
    api.post('/finalize', tk(), { idEvent: id }),
    api.post('/attendees/add', tk(), { idEvent: id, cedula: '77777', fullName: 'ALTA' }),
  ]);
  for (const r of results) assert.ok([200, 201, 404, 409].includes(r.status), `estado inesperado ${r.status}`);
  assert.equal(await prisma.event.count({ where: { idEvent: id } }), 0);
  assert.equal(await prisma.attendee.count({ where: { idEvent: id } }), 0);
});
