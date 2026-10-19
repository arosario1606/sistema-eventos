import prisma from '../config/prisma.js';
import { readCsvRows } from '../utils/csv.js';
import { HttpError } from '../utils/http.js';
import { normalizeKey } from '../utils/normalize.js';
import { parseAttendee } from './attendeeFields.js';

// Orden de columnas cuando el CSV no trae encabezado.
const DEFAULT_ORDER = ['cedula', 'fullName', 'company', 'jobTitle', 'seat', 'companyGroup'];

// Encabezados reconocidos (sin tildes ni mayúsculas). Incluye los nombres de la tabla del sistema anterior.
const HEADER_ALIASES = {
  CEDULA: 'cedula',
  BRASALETE: 'cedula',
  BRAZALETE: 'cedula',
  NOMBRE: 'fullName',
  NOMBRES: 'fullName',
  NOMBRE_COMPLETO: 'fullName',
  NOMBRE_Y_APELLIDO: 'fullName',
  EMPRESA: 'company',
  CARGO: 'jobTitle',
  ASIENTO: 'seat',
  GRUPO: 'companyGroup',
  EMPRESA_GRUPO: 'companyGroup',
};

// Si la primera fila es un encabezado (trae al menos cédula y nombre), usa sus columnas; si no, el orden por defecto.
function resolveColumns(rows) {
  const first = rows[0]?.cells.map((c) => HEADER_ALIASES[normalizeKey(c)]);
  const isHeader = first && first.includes('cedula') && first.includes('fullName');
  if (!isHeader) return { order: DEFAULT_ORDER, dataRows: rows };

  const order = [];
  first.forEach((name, i) => {
    if (name && !order.includes(name)) order[i] = name;
  });
  return { order, dataRows: rows.slice(1) };
}

// Carga la lista de asistentes de un evento. Es un "upsert" por cédula:
//  - los nuevos se agregan, los existentes actualizan nombre, empresa, cargo, asiento y grupo;
//  - NUNCA se toca `attended`: volver a subir una lista corregida no borra asistencias ya marcadas;
//  - quien no aparezca en el archivo no se borra.
export async function importAttendees({ buffer, idEvent, actor }) {
  const rows = await readCsvRows(buffer);
  const { order, dataRows } = resolveColumns(rows);
  const errors = [];
  const valid = [];
  const seen = new Set();

  for (const { line, cells } of dataRows) {
    const raw = {};
    order.forEach((name, i) => {
      if (name) raw[name] = cells[i] ?? '';
    });
    const parsed = parseAttendee(raw);
    if (parsed.reason) errors.push({ line, cedula: parsed.cedula, reason: parsed.reason });
    else if (seen.has(parsed.value.cedula)) errors.push({ line, cedula: parsed.value.cedula, reason: 'Cédula repetida en el archivo' });
    else {
      seen.add(parsed.value.cedula);
      valid.push(parsed.value);
    }
  }

  const result = { total: dataRows.length, created: 0, updated: 0, errors };
  if (valid.length === 0) return result;

  await prisma.$transaction(async (tx) => {
    // Bloqueo compartido: finalizar el evento (que lo borra) espera a que termine esta carga, y una carga que llega
    // después de finalizar recibe 404 en vez de un error de llave foránea.
    const locked = await tx.$queryRaw`SELECT id_event FROM "Event" WHERE id_event = ${idEvent} FOR SHARE`;
    if (locked.length === 0) throw new HttpError(404, 'Evento no encontrado');

    // Una sola sentencia para todo el archivo. `xmax = 0` distingue filas insertadas de actualizadas.
    // El grupo viaja como texto ('' = sin grupo) porque Prisma no admite NULL dentro de un arreglo entero.
    const out = await tx.$queryRaw`
      INSERT INTO "Attendee" (id_event, cedula, full_name, company, job_title, seat, company_group, created_by, created_at, updated_at)
      SELECT ${idEvent}, t.cedula, t.full_name, NULLIF(t.company, ''), NULLIF(t.job_title, ''), NULLIF(t.seat, ''),
             NULLIF(t.company_group, '')::int, ${actor}, now(), now()
      FROM unnest(
        ${valid.map((v) => v.cedula)}::text[], ${valid.map((v) => v.fullName)}::text[],
        ${valid.map((v) => v.company ?? '')}::text[], ${valid.map((v) => v.jobTitle ?? '')}::text[],
        ${valid.map((v) => v.seat ?? '')}::text[], ${valid.map((v) => (v.companyGroup === null ? '' : String(v.companyGroup)))}::text[]
      ) AS t(cedula, full_name, company, job_title, seat, company_group)
      ON CONFLICT (id_event, cedula) DO UPDATE SET
        full_name = EXCLUDED.full_name, company = EXCLUDED.company, job_title = EXCLUDED.job_title,
        seat = EXCLUDED.seat, company_group = EXCLUDED.company_group, updated_by = ${actor}, updated_at = now()
      RETURNING (xmax = 0) AS inserted`;
    result.created = out.filter((r) => r.inserted).length;
    result.updated = out.length - result.created;
  }, { timeout: 60000 });

  return result;
}
