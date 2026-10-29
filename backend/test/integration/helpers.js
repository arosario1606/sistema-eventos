import { readFile } from 'node:fs/promises';
import jwt from 'jsonwebtoken';
import prisma from '../../src/config/prisma.js';
import { createApp } from '../../src/app.js';

// Estas pruebas BORRAN todas las tablas del esquema: solo corren contra un esquema de pruebas.
if (!/schema=eventos_test\b/.test(process.env.DATABASE_URL ?? '')) {
  throw new Error('Las pruebas de integración exigen DATABASE_URL con ?schema=eventos_test');
}

export const SECRET = 'secreto-de-prueba';
process.env.SERVICES_SECRET_KEY = SECRET;

export { prisma };

export const token = (user, opts = {}) =>
  jwt.sign({ cedula: null, active: true, ...user }, SECRET, { expiresIn: '5m', ...opts });

export const AUTH_SCHEMA = 'eventos_test_auth';

// Divide un script SQL en sentencias (respeta los bloques $$ ... $$) y descarta BEGIN/COMMIT y los comentarios:
// el cliente de pruebas usa varias conexiones, así que una transacción manual no serviría.
function splitSql(script) {
  const noComments = script.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  const out = [];
  let current = '';
  let inDollar = false;
  for (let i = 0; i < noComments.length; i += 1) {
    if (noComments.startsWith('$$', i)) {
      inDollar = !inDollar;
      current += '$$';
      i += 1;
    } else if (noComments[i] === ';' && !inDollar) {
      out.push(current.trim());
      current = '';
    } else current += noComments[i];
  }
  return out.filter((st) => st && !/^(BEGIN|COMMIT)$/i.test(st));
}

// INTRANET SIMULADA: crea las tablas de la intranet de prueba y ejecuta el MISMO script de vistas que se entrega al
// administrador (docs/integracion/vistas-eventos.sql), apuntándolo a los esquemas de prueba.
export async function installIntranet() {
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${AUTH_SCHEMA} CASCADE`);
  const fixture = (await readFile(new URL('../fixtures/intranet_min.sql', import.meta.url), 'utf8')).replaceAll('{{AUTH_SCHEMA}}', AUTH_SCHEMA);
  for (const st of splitSql(fixture)) await prisma.$executeRawUnsafe(st);

  const views = (await readFile(new URL('../../../docs/integracion/vistas-eventos.sql', import.meta.url), 'utf8'))
    .replaceAll('intranet_api_auth_manager', AUTH_SCHEMA)
    .replaceAll(/\beventos\.v_/g, 'eventos_test.v_');
  for (const st of splitSql(views)) await prisma.$queryRawUnsafe(st);
}

// Quita la intranet simulada (las vistas dependientes se eliminan con ella).
export async function dropIntranet() {
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${AUTH_SCHEMA} CASCADE`);
}

export async function resetDb() {
  await prisma.$executeRawUnsafe('TRUNCATE "Attendee","Event","Sede" RESTART IDENTITY CASCADE');
}

// Da (o repite, para probar duplicados) permiso de sede en la tabla de la intranet simulada.
export const grant = (userId, locationId, companyId = 1) =>
  prisma.$executeRawUnsafe(
    `INSERT INTO ${AUTH_SCHEMA}."User_organization_accesses" (user_id, company_id, location_id) VALUES (${userId}, ${companyId}, ${locationId === null ? 'NULL' : locationId}) ON CONFLICT DO NOTHING`,
  );

export function startServer() {
  return new Promise((resolve) => {
    const server = createApp().listen(0, () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

export function client(url) {
  const call = async (method, path, { tk, body, csv } = {}) => {
    const headers = {};
    if (tk) headers['x-auth-token'] = tk;
    let payload;
    if (csv !== undefined) {
      payload = new FormData();
      payload.append('archivo', new Blob([csv], { type: 'text/csv' }), 'datos.csv');
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${url}/api/events${path}`, { method, headers, body: payload });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return {
    get: (p, tk) => call('GET', p, { tk }),
    post: (p, tk, body) => call('POST', p, { tk, body }),
    upload: (p, tk, csv) => call('POST', p, { tk, csv }),
  };
}

// Escenario común (intranet simulada): sedes 1, 2 y 4 activas, 3 inactiva en la intranet, y la 4 desactivada además en el módulo.
//   ADMIN (sedes 1, 3 y 4), OTHER (solo sede 2).
export const ADMIN = { id: 10, email: 'admin@example.com' };
export const OTHER = { id: 11, email: 'otro@example.com' };

export async function seedScenario() {
  await installIntranet();
  await resetDb();
  await prisma.sede.create({ data: { idSede: 4, active: false } }); // desactivada a mano en Eventos
  for (const loc of [1, 3, 4]) await grant(ADMIN.id, loc);
  await grant(OTHER.id, 2);
}
