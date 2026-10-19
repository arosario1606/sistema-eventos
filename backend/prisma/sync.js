// Sincroniza datos de la intranet hacia las tablas de este módulo (misma base de datos, otro esquema).
// Uso: npm run sync:sedes
import 'dotenv/config';
import prisma from '../src/config/prisma.js';
import { jobNames, runSync } from './sync-lib.js';

const job = process.argv[2];
if (!jobNames().includes(job)) {
  console.error(`Uso: node prisma/sync.js <${jobNames().join('|')}>`);
  process.exit(1);
}

try {
  const affected = await runSync(prisma, job);
  console.log(`sync:${job} listo (${affected} filas insertadas o actualizadas)`);
} finally {
  await prisma.$disconnect();
}
