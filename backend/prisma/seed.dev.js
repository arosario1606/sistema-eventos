// Datos de PRUEBA locales (no usar en la base real): permisos de un usuario de desarrollo sobre las sedes activas.
// Las sedes REALES se copian de Locations (el mismo trabajo de `npm run sync:sedes`), así que basta con este comando.
// Solo si la base no tiene la tabla Locations de la intranet (p. ej. un PostgreSQL vacío) se crean dos sedes de PRUEBA.
import 'dotenv/config';
import prisma from '../src/config/prisma.js';
import { intranetLocationsExist, runSync } from './sync-lib.js';

const userId = Number(process.env.DEV_USER_ID);
const userEmail = process.env.DEV_USER_EMAIL;
if (!Number.isInteger(userId) || !userEmail) {
  console.error('Defina DEV_USER_ID (Users.id de la intranet) y DEV_USER_EMAIL en backend/.env');
  process.exit(1);
}

try {
  if (await intranetLocationsExist(prisma)) {
    console.log(`Sedes copiadas desde Locations (${await runSync(prisma, 'sedes')} filas insertadas o actualizadas)`);
  } else if ((await prisma.sede.count()) === 0) {
    await prisma.sede.createMany({
      data: [{ idSede: 9001, name: 'Sede de prueba 1' }, { idSede: 9002, name: 'Sede de prueba 2' }],
    });
    console.log('No existe la tabla Locations de la intranet: se crearon 2 sedes de PRUEBA (ids 9001 y 9002)');
  }
  const sedes = await prisma.sede.findMany({ where: { active: true } });
  if (sedes.length === 0) throw new Error('No hay sedes activas: revise la tabla Locations o el esquema INTRANET_AUTH_SCHEMA');
  for (const s of sedes) {
    await prisma.userBranchPermission.upsert({
      where: { userId_idSede: { userId, idSede: s.idSede } },
      create: { userId, userEmail, idSede: s.idSede, createdBy: 'seed' },
      update: { userEmail },
    });
  }
  console.log(`Seed de desarrollo listo: permisos sobre ${sedes.length} sedes para ${userEmail}`);
} finally {
  await prisma.$disconnect();
}
