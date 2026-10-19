// Datos de PRUEBA locales (no usar en la base real): permisos de un usuario de desarrollo sobre las sedes activas.
// Las sedes reales vienen de Locations (`npm run sync:sedes`). Si no hay ninguna (p. ej. un PostgreSQL local sin
// la base de la intranet) se crean dos sedes de PRUEBA para poder trabajar.
import 'dotenv/config';
import prisma from '../src/config/prisma.js';

const userId = Number(process.env.DEV_USER_ID);
const userEmail = process.env.DEV_USER_EMAIL;
if (!Number.isInteger(userId) || !userEmail) {
  console.error('Defina DEV_USER_ID (Users.id de la intranet) y DEV_USER_EMAIL en backend/.env');
  process.exit(1);
}

try {
  if ((await prisma.sede.count()) === 0) {
    await prisma.sede.createMany({
      data: [{ idSede: 9001, name: 'Sede de prueba 1' }, { idSede: 9002, name: 'Sede de prueba 2' }],
    });
    console.log('No había sedes: se crearon 2 sedes de PRUEBA (ids 9001 y 9002)');
  }
  const sedes = await prisma.sede.findMany({ where: { active: true } });
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
