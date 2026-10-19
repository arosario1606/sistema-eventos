// Exportación de asistentes a CSV (se genera en el navegador: no pasa por el servidor ni se guarda en la base).
const BOM = '﻿' // para que Excel reconozca las tildes
// eslint-disable-next-line no-control-regex -- los caracteres de control tampoco valen en nombres de archivo
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g

// "asistentes evento <nombre>.csv", quitando los caracteres que Windows no admite en nombres de archivo.
export function attendeesFileName(eventName) {
  const clean = String(eventName ?? '').replace(INVALID_FILENAME_CHARS, '').replace(/\s+/g, ' ').trim().slice(0, 120)
  return `asistentes evento ${clean || 'sin nombre'}.csv`
}

// Escapa el valor y neutraliza fórmulas (=, +, -, @) para que Excel no las ejecute.
function cell(value) {
  let text = String(value ?? '')
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// Solo las personas que asistieron, con las mismas columnas que acepta la carga del archivo.
export function buildAttendeesCsv(rows) {
  const header = ['Cédula', 'Nombre', 'Empresa', 'Cargo', 'Asiento', 'Grupo']
  const present = rows.filter((r) => r.attended)
  const lines = present.map((r) => [r.cedula, r.fullName, r.company, r.jobTitle, r.seat, r.companyGroup])
  return `${BOM}${[header, ...lines].map((r) => r.map(cell).join(';')).join('\r\n')}\r\n`
}

export function downloadCsv(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
