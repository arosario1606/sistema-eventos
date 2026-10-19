// Lógica compartida por `npm run sync:sedes` y por `npm run seed:dev`.
import { readFile } from 'node:fs/promises';

const JOBS = { sedes: 'sedes.sql' };

// Los nombres de esquema no se pueden parametrizar: se validan antes de interpolarlos.
function schemaName(envVar, fallback) {
  const value = process.env[envVar] || fallback;
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error(`${envVar} inválido: "${value}"`);
  return value;
}

export const jobNames = () => Object.keys(JOBS);

// ¿Existe en esta base la tabla de sedes de la intranet (Locations)?
export async function intranetLocationsExist(prisma) {
  const schema = schemaName('INTRANET_AUTH_SCHEMA', 'intranet_api_auth_manager');
  const [row] = await prisma.$queryRawUnsafe(`SELECT to_regclass('"${schema}"."Locations"') IS NOT NULL AS found`);
  return row.found;
}

// Ejecuta un trabajo de sincronización y devuelve cuántas filas se insertaron o actualizaron.
export async function runSync(prisma, job) {
  if (!JOBS[job]) throw new Error(`Trabajo de sincronización desconocido: ${job}`);
  const sql = (await readFile(new URL(`./sync/${JOBS[job]}`, import.meta.url), 'utf8'))
    .replaceAll('{{AUTH_SCHEMA}}', schemaName('INTRANET_AUTH_SCHEMA', 'intranet_api_auth_manager'));
  return prisma.$executeRawUnsafe(sql);
}
