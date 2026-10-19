import prisma from '../config/prisma.js';
import { HttpError } from '../utils/http.js';

// Finaliza un evento: borra de forma DEFINITIVA el evento y todos sus asistentes (la sede no se toca).
// Todo en una transacción: si algo falla, no se borra nada.
export async function finalizeEvent(idEvent) {
  return prisma.$transaction(
    async (tx) => {
      // Bloquea el evento: una carga o marca en curso termina antes de borrar y las siguientes reciben 404.
      const [event] = await tx.$queryRaw`SELECT id_event FROM "Event" WHERE id_event = ${idEvent} FOR UPDATE`;
      if (!event) throw new HttpError(404, 'Evento no encontrado');

      const attendees = await tx.attendee.count({ where: { idEvent } });
      const attended = await tx.attendee.count({ where: { idEvent, attended: true } });

      // Borrar el evento elimina en cascada a sus asistentes.
      await tx.event.delete({ where: { idEvent } });
      return { idEvent, attendees, attended };
    },
    { timeout: 60000 },
  );
}
