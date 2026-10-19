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

const newEvent = async (name = 'Evento') =>
  (await api.post('/create', tk(), { name, eventDate: '2026-12-05', idSede: 1 })).body.idEvent;
const upload = (id, csv, user = tk()) => api.upload(`/attendees/upload?id=${id}`, user, csv);
const list = async (id) => (await api.get(`/attendees/list?id=${id}`, tk())).body;

test('carga un CSV con encabezado en el orden del sistema anterior y guarda todos los campos', async () => {
  const id = await newEvent();
  const csv = [
    'NOMBRE COMPLETO;Empresa;CARGO;CÉDULA;ASIENTO;GRUPO',
    'AGUIRRE ARZUZA JIMY YOVIS;Grupo SanSimon;CHOFER;19211024;A-1;1',
    'AHUMADA LEAL ALVARO LUIS;Grupo SanSimon;GERENTE;18.833.424;;',
  ].join('\r\n');
  const res = await upload(id, csv);
  assert.equal(res.status, 200);
  assert.deepEqual({ ...res.body, errors: undefined }, { total: 2, created: 2, updated: 0, errors: undefined });
  assert.deepEqual(res.body.errors, []);

  const rows = (await list(id)).rows;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    idAttendee: rows[0].idAttendee, cedula: '19211024', fullName: 'AGUIRRE ARZUZA JIMY YOVIS', company: 'Grupo SanSimon',
    jobTitle: 'CHOFER', seat: 'A-1', companyGroup: 1, attended: false,
  });
  assert.equal(rows[1].cedula, '18833424', 'la cédula se limpia');
  assert.equal(rows[1].seat, null);
  assert.equal(rows[1].companyGroup, null);
  const db = await prisma.attendee.findFirst({ where: { idEvent: id, cedula: '19211024' } });
  assert.equal(db.createdBy, ADMIN.email);
});

test('sin encabezado usa el orden cedula;nombre;empresa;cargo;asiento;grupo y acepta coma como separador', async () => {
  const id = await newEvent();
  const res = await upload(id, '111,ANA PÉREZ,Empresa X,ANALISTA\n222,LUIS DÍAZ,Empresa Y,JEFE');
  assert.equal(res.body.created, 2);
  const rows = (await list(id)).rows;
  assert.deepEqual(rows.map((r) => [r.cedula, r.fullName, r.company, r.jobTitle]), [
    ['111', 'ANA PÉREZ', 'Empresa X', 'ANALISTA'],
    ['222', 'LUIS DÍAZ', 'Empresa Y', 'JEFE'],
  ]);
});

test('las filas inválidas se reportan con su línea y no impiden cargar el resto', async () => {
  const id = await newEvent();
  const csv = [
    'cedula;nombre;empresa',
    '1;ANA;X',
    ';SIN CEDULA;X', // línea 3
    '3;;X', // línea 4
    '1;ANA REPETIDA;X', // línea 5
    'SOLO NOMBRE;X;Y', // línea 6: columnas desordenadas
    '6;LUIS;X',
  ].join('\n');
  const res = await upload(id, csv);
  assert.equal(res.status, 200);
  assert.equal(res.body.created, 2);
  assert.deepEqual(res.body.errors.map((e) => e.line), [3, 4, 5, 6]);
  assert.match(res.body.errors[2].reason, /repetida/);
  assert.equal((await list(id)).rows.length, 2);
});

test('volver a cargar actualiza datos pero NUNCA toca la asistencia ni borra a quien falte', async () => {
  const id = await newEvent();
  await upload(id, 'cedula;nombre;cargo\n1;ANA;ANALISTA\n2;LUIS;JEFE\n3;MARÍA;GERENTE');
  const rows = (await list(id)).rows;
  const ana = rows.find((r) => r.cedula === '1');
  await api.post('/attendees/mark', tk(), { idEvent: id, idAttendee: ana.idAttendee, attended: true });

  // Lista corregida: ANA cambia de nombre/cargo, MARÍA ya no viene, aparece una persona nueva.
  const res = await upload(id, 'cedula;nombre;cargo\n1;ANA MARÍA;DIRECTORA\n2;LUIS;JEFE\n4;PEDRO;CHOFER');
  assert.deepEqual([res.body.created, res.body.updated], [1, 2]);

  const after = (await list(id)).rows;
  assert.equal(after.length, 4, 'MARÍA no se borra');
  const anaAfter = after.find((r) => r.cedula === '1');
  assert.deepEqual([anaAfter.fullName, anaAfter.jobTitle, anaAfter.attended], ['ANA MARÍA', 'DIRECTORA', true], 'se actualiza y sigue presente');
  assert.equal(anaAfter.idAttendee, ana.idAttendee, 'es la misma fila');
});

test('un mismo evento puede repetir cédula en otro evento', async () => {
  const a = await newEvent('A');
  const b = await newEvent('B');
  await upload(a, '1;ANA');
  await upload(b, '1;ANA');
  assert.equal((await list(a)).rows.length, 1);
  assert.equal((await list(b)).rows.length, 1);
});

test('rechaza archivos sin adjunto, de otro usuario o de un evento que no existe', async () => {
  const id = await newEvent();
  assert.equal((await api.post(`/attendees/upload?id=${id}`, tk(), {})).status, 400, 'sin archivo');
  assert.equal((await upload(id, '1;ANA', token(OTHER))).status, 403);
  assert.equal((await upload(999999, '1;ANA')).status, 404);
  assert.equal((await upload('x', '1;ANA')).status, 400);
  assert.equal((await list(id)).rows.length, 0);
});

test('un archivo vacío o solo con encabezado no falla ni crea nada', async () => {
  const id = await newEvent();
  assert.deepEqual((await upload(id, '')).body, { total: 0, created: 0, updated: 0, errors: [] });
  assert.equal((await upload(id, 'cedula;nombre')).body.created, 0);
});

test('cargas simultáneas de listas solapadas no fallan ni duplican', async () => {
  const id = await newEvent();
  const csv = Array.from({ length: 200 }, (_, i) => `${1000 + i};PERSONA ${i}`).join('\n');
  const results = await Promise.all([upload(id, csv), upload(id, csv), upload(id, csv)]);
  assert.ok(results.every((r) => r.status === 200), JSON.stringify(results.map((r) => r.status)));
  assert.equal((await list(id)).rows.length, 200);
  assert.equal(results.reduce((s, r) => s + r.body.created, 0), 200, 'cada persona se creó una sola vez');
});
