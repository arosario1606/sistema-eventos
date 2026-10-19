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

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Attendee","Event","User_branch_permission","Sede" RESTART IDENTITY CASCADE',
  );
}

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

// Escenario común: sedes 1 y 2 activas, 4 inactiva. ADMIN (sedes 1 y 4), OTHER (solo sede 2).
export const ADMIN = { id: 10, email: 'admin@example.com' };
export const OTHER = { id: 11, email: 'otro@example.com' };

export async function seedScenario() {
  await resetDb();
  await prisma.sede.createMany({
    data: [
      { idSede: 1, name: 'Sede 1' },
      { idSede: 2, name: 'Sede 2' },
      { idSede: 4, name: 'Sede 4 (inactiva)', active: false },
    ],
  });
  await prisma.userBranchPermission.createMany({
    data: [
      { userId: ADMIN.id, userEmail: ADMIN.email, idSede: 1, createdBy: 'test' },
      { userId: ADMIN.id, userEmail: ADMIN.email, idSede: 4, createdBy: 'test' },
      { userId: OTHER.id, userEmail: OTHER.email, idSede: 2, createdBy: 'test' },
    ],
  });
}
