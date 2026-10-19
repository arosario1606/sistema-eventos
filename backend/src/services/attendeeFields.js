import { cleanText, normalizeCedula } from '../utils/normalize.js';

// Longitudes máximas: las mismas columnas de la tabla Attendee.
const MAX = { cedula: 50, fullName: 150, company: 150, jobTitle: 150, seat: 40 };
const MAX_GROUP = 2147483647;

// Valida y limpia los datos de un asistente (los usan la carga del CSV y el alta manual).
// Devuelve { value } si es válido o { reason } con el motivo del rechazo.
export function parseAttendee(raw) {
  const cedula = normalizeCedula(raw.cedula);
  const fullName = cleanText(raw.fullName);
  const company = cleanText(raw.company) || null;
  const jobTitle = cleanText(raw.jobTitle) || null;
  const seat = cleanText(raw.seat) || null;
  const groupText = cleanText(raw.companyGroup);

  if (!cedula) return { reason: 'Cédula vacía' };
  // Sin ningún dígito casi seguro es un nombre en la columna de la cédula (columnas desordenadas).
  if (!/\d/.test(cedula)) return { cedula, reason: `Cédula inválida: "${cleanText(raw.cedula)}" (¿columnas desordenadas?)` };
  if (cedula.length > MAX.cedula) return { cedula, reason: `Cédula demasiado larga (máximo ${MAX.cedula})` };
  if (!fullName) return { cedula, reason: 'Falta el nombre' };
  if (fullName.length > MAX.fullName) return { cedula, reason: `Nombre demasiado largo (máximo ${MAX.fullName})` };
  if (company && company.length > MAX.company) return { cedula, reason: `Empresa demasiado larga (máximo ${MAX.company})` };
  if (jobTitle && jobTitle.length > MAX.jobTitle) return { cedula, reason: `Cargo demasiado largo (máximo ${MAX.jobTitle})` };
  if (seat && seat.length > MAX.seat) return { cedula, reason: `Asiento demasiado largo (máximo ${MAX.seat})` };

  let companyGroup = null;
  if (groupText) {
    companyGroup = Number(groupText);
    if (!Number.isInteger(companyGroup) || companyGroup < 0 || companyGroup > MAX_GROUP) {
      return { cedula, reason: `Grupo inválido: "${groupText}" (debe ser un número entero)` };
    }
  }
  return { value: { cedula, fullName, company, jobTitle, seat, companyGroup } };
}
