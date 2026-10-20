import { Router } from 'express';
import multer from 'multer';
import prisma from '../config/prisma.js';
import { asyncHandler, HttpError, parseId } from '../utils/http.js';
import { cleanText } from '../utils/normalize.js';
import { getAccessibleEvent } from '../services/eventAccess.js';
import { parseAttendee } from '../services/attendeeFields.js';
import { importAttendees } from '../services/importAttendees.js';
import { finalizeEvent } from '../services/finalize.js';

// IMPORTANTE: el gateway de la intranet autoriza por ruta EXACTA (Routes_backend_child.route_path),
// así que no se usan parámetros en el path: el id del evento viaja en `?id=` o en el body.
// Cada ruta de abajo debe estar registrada en la intranet (ver docs/integracion/seed-rutas-eventos.js).
const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function requireFile(req) {
  if (!req.file) throw new HttpError(400, 'Debe adjuntar un archivo CSV en el campo "archivo"');
  return req.file.buffer;
}

const toEventJson = (e, counts = {}) => ({
  idEvent: e.idEvent,
  name: e.name,
  eventDate: e.eventDate,
  idSede: e.idSede,
  sede: e.sede?.name,
  attendees: counts.attendees ?? 0,
  attended: counts.attended ?? 0,
});

// Usuario autenticado y las sedes sobre las que puede crear eventos
router.get('/me', asyncHandler(async (req, res) => {
  const sedes = await prisma.sede.findMany({
    where: { idSede: { in: req.user.activeSedeIds }, active: true },
    select: { idSede: true, name: true },
    orderBy: { name: 'asc' },
  });
  res.json({ userId: req.user.id, email: req.user.email, sedes });
}));

// Eventos visibles para el usuario (los de sus sedes), con conteo de invitados y presentes
router.get('/list', asyncHandler(async (req, res) => {
  const events = await prisma.event.findMany({
    where: { idSede: { in: req.user.sedeIds } },
    orderBy: [{ eventDate: 'desc' }, { idEvent: 'desc' }],
    include: { sede: true },
  });
  const [total, present] = await Promise.all([
    prisma.attendee.groupBy({ by: ['idEvent'], where: { idEvent: { in: events.map((e) => e.idEvent) } }, _count: { _all: true } }),
    prisma.attendee.groupBy({ by: ['idEvent'], where: { idEvent: { in: events.map((e) => e.idEvent) }, attended: true }, _count: { _all: true } }),
  ]);
  const totals = new Map(total.map((g) => [g.idEvent, g._count._all]));
  const presents = new Map(present.map((g) => [g.idEvent, g._count._all]));
  res.json(events.map((e) => toEventJson(e, { attendees: totals.get(e.idEvent), attended: presents.get(e.idEvent) })));
}));

// Registrar evento (nombre, fecha y sede)
router.post('/create', asyncHandler(async (req, res) => {
  const { name, eventDate, idSede } = req.body ?? {};
  const cleanName = cleanText(name);
  const date = new Date(`${eventDate}T00:00:00.000Z`);
  if (!cleanName) throw new HttpError(400, 'El nombre del evento es obligatorio');
  if (cleanName.length > 150) throw new HttpError(400, 'El nombre del evento no puede superar 150 caracteres');
  // JS "corrige" fechas imposibles (2026-02-31 -> 3 de marzo): se exige que la fecha guardada sea la enviada.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== String(eventDate)) {
    throw new HttpError(400, 'Fecha inválida (use AAAA-MM-DD)');
  }
  const sedeId = Number(idSede);
  if (!Number.isInteger(sedeId)) throw new HttpError(400, 'Seleccione la sede del evento');
  if (!req.user.activeSedeIds.includes(sedeId)) {
    throw new HttpError(403, 'No tienes permiso sobre la sede seleccionada');
  }

  const event = await prisma.event.create({
    data: { name: cleanName, eventDate: date, idSede: sedeId, createdBy: req.user.email },
    include: { sede: true },
  });
  res.status(201).json(toEventJson(event));
}));

router.get('/detail', asyncHandler(async (req, res) => {
  const event = await getAccessibleEvent(parseId(req.query.id), req.user);
  const [attendees, attended] = await Promise.all([
    prisma.attendee.count({ where: { idEvent: event.idEvent } }),
    prisma.attendee.count({ where: { idEvent: event.idEvent, attended: true } }),
  ]);
  res.json(toEventJson(event, { attendees, attended }));
}));

// Finalizar: borra el evento y todos sus asistentes (irreversible). Lo puede hacer quien tenga acceso a la sede.
router.post('/finalize', asyncHandler(async (req, res) => {
  const event = await getAccessibleEvent(parseId(req.body?.idEvent, 'idEvent'), req.user);
  const result = await finalizeEvent(event.idEvent);
  console.log(`Evento ${result.idEvent} finalizado por ${req.user.email}: ${result.attendees} asistentes borrados (${result.attended} presentes)`);
  res.json(result);
}));

// Carga del CSV con la lista de asistentes
router.post('/attendees/upload', upload.single('archivo'), asyncHandler(async (req, res) => {
  const event = await getAccessibleEvent(parseId(req.query.id), req.user);
  res.json(await importAttendees({ buffer: requireFile(req), idEvent: event.idEvent, actor: req.user.email }));
}));

// Alta manual de un asistente que no venía en el archivo
router.post('/attendees/add', asyncHandler(async (req, res) => {
  const event = await getAccessibleEvent(parseId(req.body?.idEvent, 'idEvent'), req.user);
  const parsed = parseAttendee(req.body ?? {});
  if (parsed.reason) throw new HttpError(400, parsed.reason);

  const exists = await prisma.attendee.findUnique({
    where: { idEvent_cedula: { idEvent: event.idEvent, cedula: parsed.value.cedula } },
  });
  if (exists) throw new HttpError(409, `La cédula ${parsed.value.cedula} ya está en este evento (${exists.fullName})`);

  try {
    const created = await prisma.attendee.create({ data: { ...parsed.value, idEvent: event.idEvent, createdBy: req.user.email } });
    res.status(201).json(toAttendeeJson(created));
  } catch (err) {
    // Dos altas simultáneas de la misma cédula: gana una y la otra recibe este aviso.
    if (err.code === 'P2002') throw new HttpError(409, `La cédula ${parsed.value.cedula} ya está en este evento`);
    // El evento se finalizó entre la validación y el alta.
    if (err.code === 'P2003') throw new HttpError(404, 'Evento no encontrado');
    throw err;
  }
}));

const toAttendeeJson = (a) => ({
  idAttendee: a.idAttendee,
  cedula: a.cedula,
  fullName: a.fullName,
  company: a.company,
  jobTitle: a.jobTitle,
  seat: a.seat,
  companyGroup: a.companyGroup,
  attended: a.attended,
});

// Lista de asistentes (la pantalla la vuelve a pedir cada pocos segundos para ver las marcas de otras puertas)
router.get('/attendees/list', asyncHandler(async (req, res) => {
  const event = await getAccessibleEvent(parseId(req.query.id), req.user);
  const attendees = await prisma.attendee.findMany({
    where: { idEvent: event.idEvent },
    orderBy: [{ fullName: 'asc' }, { idAttendee: 'asc' }],
  });
  res.json({
    event: event.name,
    eventDate: event.eventDate,
    attendedCount: attendees.filter((a) => a.attended).length,
    rows: attendees.map(toAttendeeJson),
  });
}));

// Marca o desmarca la asistencia: una sola sentencia UPDATE, se guarda al instante.
router.post('/attendees/mark', asyncHandler(async (req, res) => {
  const { idEvent, idAttendee, attended } = req.body ?? {};
  const event = await getAccessibleEvent(parseId(idEvent, 'idEvent'), req.user);
  const attendeeId = parseId(idAttendee, 'idAttendee');
  if (typeof attended !== 'boolean') throw new HttpError(400, '"attended" debe ser true o false');

  // El filtro por idEvent garantiza que no se marque a alguien de otro evento.
  const { count } = await prisma.attendee.updateMany({
    where: { idAttendee: attendeeId, idEvent: event.idEvent },
    data: {
      attended,
      attendedAt: attended ? new Date() : null,
      attendedBy: attended ? req.user.email : null,
      updatedBy: req.user.email,
    },
  });
  if (count === 0) throw new HttpError(404, 'Asistente no encontrado en este evento');
  res.json({ idAttendee: attendeeId, attended });
}));

export default router;
