import prisma from '../config/prisma.js';
import { HttpError } from '../utils/http.js';

// Carga el evento con su sede y valida que el usuario tenga permiso sobre esa sede.
export async function getAccessibleEvent(idEvent, user) {
  const event = await prisma.event.findUnique({ where: { idEvent }, include: { sede: true } });
  if (!event) throw new HttpError(404, 'Evento no encontrado');
  if (!user.sedeIds.includes(event.idSede)) {
    throw new HttpError(403, 'No tienes permiso sobre la sede de este evento');
  }
  return event;
}
