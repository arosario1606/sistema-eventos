import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prisma } from './helpers.js';

// Prueba el script que se entrega al administrador (docs/integracion/registro-rutas-eventos.sql) contra una réplica de
// las tablas del menú, en el esquema de PRUEBA eventos_test_menu (nunca en intranet_api_auth_manager).
const S = 'eventos_test_menu';

// Separa en sentencias respetando $$...$$ y $svg$...$svg$; descarta BEGIN/COMMIT y comentarios (se ejecuta en una transacción).
function splitSql(script) {
  const text = script.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  const out = [];
  let cur = '';
  let tag = null;
  for (let i = 0; i < text.length; i += 1) {
    const m = /^\$[A-Za-z_]*\$/.exec(text.slice(i));
    if (m) {
      if (tag === null) tag = m[0];
      else if (tag === m[0]) tag = null;
      cur += m[0];
      i += m[0].length - 1;
    } else if (text[i] === ';' && tag === null) {
      out.push(cur.trim());
      cur = '';
    } else cur += text[i];
  }
  return out.filter((st) => st && !/^(BEGIN|COMMIT)$/i.test(st));
}

const load = async (rel) => (await readFile(new URL(rel, import.meta.url), 'utf8'));

// Una sola transacción (una sola conexión): las tablas TEMP del script solo existen en la conexión que las crea.
async function runScript() {
  const script = (await load('../../../docs/integracion/registro-rutas-eventos.sql')).replaceAll('intranet_api_auth_manager', S);
  return prisma.$transaction(async (tx) => {
    let last;
    for (const st of splitSql(script)) last = await tx.$queryRawUnsafe(st);
    return Object.fromEntries(Object.entries(last[0]).map(([k, v]) => [k, Number(v)]));
  }, { timeout: 60000 });
}

async function resetMenu(withAdmin = true) {
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${S} CASCADE`);
  const fixture = (await load('../fixtures/intranet_menu.sql')).replaceAll('{{S}}', S);
  for (const st of splitSql(fixture)) await prisma.$executeRawUnsafe(st);
  if (!withAdmin) await prisma.$executeRawUnsafe(`DELETE FROM ${S}."Permissions_groups" WHERE group_name = 'ADMINISTRADOR'`);
}

const q = (sql) => prisma.$queryRawUnsafe(sql);
const counts = async () => (await q(`SELECT
  (SELECT count(*) FROM ${S}."Permissions_groups") g, (SELECT count(*) FROM ${S}."Routes_backend") rb,
  (SELECT count(*) FROM ${S}."Routes_backend_child") rbc, (SELECT count(*) FROM ${S}."Routes_frontend") rf,
  (SELECT count(*) FROM ${S}."Routes_frontend_child") rfc, (SELECT count(*) FROM ${S}."Permissions_groups_routes_entity") pe,
  (SELECT count(*) FROM ${S}."Permissions_groups_routes_child_entity") pce`))[0];

// Rutas y pantallas a las que tiene acceso un grupo
const accessOf = async (group) => (await q(`
  SELECT COALESCE(b.route_path, f.route_path) AS path
  FROM ${S}."Permissions_groups_routes_child_entity" e
  JOIN ${S}."Permissions_groups" g ON g.id = e."permissions_groupsId"
  LEFT JOIN ${S}."Routes_backend_child" b ON b.id = e."routes_backend_childId"
  LEFT JOIN ${S}."Routes_frontend_child" f ON f.id = e."routes_frontend_childId"
  WHERE g.group_name = '${group}' ORDER BY 1`)).map((r) => r.path);

beforeEach(() => resetMenu());
after(async () => {
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${S} CASCADE`);
  await prisma.$disconnect();
});

const PUERTAS = ['/api/events/attendees/add', '/api/events/attendees/list', '/api/events/attendees/mark', '/api/events/detail',
  '/api/events/list', '/api/events/me', '/eventsassist'];
const ADMIN = [...PUERTAS, '/api/events/attendees/upload', '/api/events/create', '/api/events/finalize', '/eventsreg'].sort();

test('crea sección con icono, pantallas, rutas, grupos y permisos; el resumen coincide con lo esperado', async () => {
  const r = await runScript();
  assert.deepEqual(r, {
    padre_esperado_1: 1, hijas_esperado_9: 9, seccion_esperado_1: 1, pantallas_esperado_2: 2,
    grupos_admin_esperado_2: 2, grupos_puertas_esperado_1: 1, permisos_puertas_esperado_7: 7, permisos_admin_esperado_11: 11,
  });
  const [sec] = await q(`SELECT * FROM ${S}."Routes_frontend" WHERE route_name = 'Eventos'`);
  assert.match(sec.svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" fill="none" viewBox="0 0 24 24" strokeWidth=\{1\.5\} stroke="currentColor" className="size-6">/);
  assert.match(sec.svg, /d="M16\.5 6v\.75m0 3v\.75/, 'es el icono ticket');
  assert.deepEqual([sec.active, sec.type, sec.default, sec.sequence], [true, true, false, 0]);

  const screens = await q(`SELECT f.route_name, f.route_path, f.type, f.visible, f."powerBi", f.sequence, s.route_name AS seccion
    FROM ${S}."Routes_frontend_child" f JOIN ${S}."Routes_frontend" s ON s.id = f."routes_frontendId" ORDER BY f.sequence`);
  assert.deepEqual(screens.map((x) => [x.route_name, x.route_path, x.type, x.visible, x.powerBi, x.seccion]), [
    ['Registrar Evento', '/eventsreg', false, true, false, 'Eventos'],
    ['Asistencia de Eventos', '/eventsassist', false, true, false, 'Eventos'],
  ]);
});

test('roles: EVENTOS (puertas) solo Asistencia y 6 rutas; EVENTOS_ADMIN y ADMINISTRADOR todo', async () => {
  await runScript();
  assert.deepEqual(await accessOf('EVENTOS'), PUERTAS.slice().sort());
  assert.deepEqual(await accessOf('EVENTOS_ADMIN'), ADMIN);
  assert.deepEqual(await accessOf('ADMINISTRADOR'), ADMIN);
  const noPuertas = (await accessOf('EVENTOS')).filter((p) => /create|finalize|upload|eventsreg/.test(p));
  assert.deepEqual(noPuertas, [], 'las puertas no pueden crear, subir lista, finalizar ni ver Registrar Evento');
  assert.deepEqual(await accessOf('SORTEOS'), [], 'ningún otro grupo recibe permisos');
});

test('se puede ejecutar dos veces: no duplica nada', async () => {
  await runScript();
  const first = await counts();
  const second = await runScript();
  assert.deepEqual(await counts(), first);
  assert.equal(second.permisos_admin_esperado_11, 11);
});

test('no pisa un icono ya existente ni quita permisos asignados a mano', async () => {
  await runScript();
  await prisma.$executeRawUnsafe(`UPDATE ${S}."Routes_frontend" SET svg = '<svg>otro</svg>' WHERE route_name = 'Eventos'`);
  await prisma.$executeRawUnsafe(`DELETE FROM ${S}."Permissions_groups_routes_child_entity" e USING ${S}."Permissions_groups" g
    WHERE g.id = e."permissions_groupsId" AND g.group_name = 'EVENTOS'
    AND e."routes_backend_childId" IN (SELECT id FROM ${S}."Routes_backend_child" WHERE route_path = '/api/events/attendees/add')`);
  await runScript();
  assert.equal((await q(`SELECT svg FROM ${S}."Routes_frontend" WHERE route_name = 'Eventos'`))[0].svg, '<svg>otro</svg>');
  assert.ok((await accessOf('EVENTOS')).includes('/api/events/attendees/add'), 'volver a ejecutar repone un permiso faltante');
});

test('si falta el grupo ADMINISTRADOR se detiene con un mensaje claro y no cambia NADA', async () => {
  await resetMenu(false);
  const before = await counts();
  await assert.rejects(runScript(), /No existe el grupo de permisos ADMINISTRADOR/);
  assert.deepEqual(await counts(), before, 'ni siquiera se crearon los grupos EVENTOS');
});

test('si un nombre de pantalla ya existe con otra ruta, falla y revierte todo', async () => {
  await prisma.$executeRawUnsafe(`INSERT INTO ${S}."Routes_frontend_child" (route_name, route_path) VALUES ('Registrar Evento', '/otra')`);
  const before = await counts();
  await assert.rejects(runScript()); // viola el índice único de route_name
  assert.deepEqual(await counts(), before, 'transacción revertida: no quedó nada a medias');
});
