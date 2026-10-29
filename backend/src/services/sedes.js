import prisma from '../config/prisma.js';
import { HttpError } from '../utils/http.js';

// Las sedes y los permisos por sede NO se copian: se leen en vivo de las vistas v_sede y v_permiso_sede, que crea el
// administrador (docs/integracion/vistas-eventos.sql). Los nombres sin esquema funcionan porque DATABASE_URL fija ?schema=eventos.

const VIEWS_MISSING =
  'Falta configurar el módulo: las vistas v_sede y v_permiso_sede no existen. Pida al administrador de la base de datos '
  + 'que ejecute docs/integracion/vistas-eventos.sql';

// "relation does not exist" (42P01) sobre una de las vistas -> mensaje claro en vez de «Error interno».
export function asViewError(err) {
  const code = err?.meta?.code ?? err?.code;
  if (code === '42P01' || /relation "v_(sede|permiso_sede)" does not exist/.test(String(err?.message))) {
    console.error('Vista de la intranet ausente:', err?.meta?.message ?? err?.message);
    return new HttpError(503, VIEWS_MISSING);
  }
  return err;
}

export async function withViews(fn) {
  try {
    return await fn();
  } catch (err) {
    throw asViewError(err);
  }
}

// Todas las sedes de la intranet. `active` = activa en la intranet Y no desactivada en este módulo (Sede.active);
// una sede sin fila en Sede cuenta como activa.
export function listSedes(db = prisma) {
  return withViews(() => db.$queryRaw`
    SELECT v.id AS "idSede", v.name, (v.is_active AND COALESCE(s.active, true)) AS active
    FROM v_sede v
    LEFT JOIN "Sede" s ON s.id_sede = v.id
    ORDER BY v.name, v.id`);
}

// Ids de las sedes sobre las que el usuario tiene permiso (las que ya existen en la intranet).
export async function userSedeIds(userId) {
  const rows = await withViews(() => prisma.$queryRaw`SELECT id_sede AS "idSede" FROM v_permiso_sede WHERE user_id = ${userId}`);
  return rows.map((r) => r.idSede);
}

// Sedes que se pueden ofrecer hoy (para crear eventos nuevos) entre las que el usuario tiene permiso, con su nombre.
export async function offerableSedes(sedeIds) {
  const allowed = new Set(sedeIds);
  return (await listSedes()).filter((s) => s.active && allowed.has(s.idSede)).map(({ idSede, name }) => ({ idSede, name }));
}

// Devuelve una función id -> nombre. Una sede que ya no existe en la intranet conserva el id y se marca como eliminada.
export async function sedeNames() {
  const byId = new Map((await listSedes()).map((s) => [s.idSede, s.name]));
  return (id) => byId.get(id) ?? `Sede ${id} (eliminada)`;
}

// Al arrancar: avisa en el registro si faltan las vistas (el servicio sigue arrancando y responde 503 con un mensaje claro).
export async function checkIntranetViews() {
  try {
    await prisma.$queryRaw`SELECT 1 FROM v_sede LIMIT 1`;
    await prisma.$queryRaw`SELECT 1 FROM v_permiso_sede LIMIT 1`;
    return true;
  } catch (err) {
    console.error(`AVISO: ${asViewError(err).message}`);
    return false;
  }
}
