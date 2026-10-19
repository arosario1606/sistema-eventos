import test from 'node:test'
import assert from 'node:assert/strict'
import { attendeesFileName, buildAttendeesCsv } from './attendees-csv.js'

const row = (over) => ({ cedula: '1', fullName: 'ANA', company: 'X', jobTitle: 'JEFE', seat: 'A-1', companyGroup: 1, attended: true, ...over })

test('el archivo se llama "asistentes evento <nombre>.csv"', () => {
  assert.equal(attendeesFileName('Fiesta de Navidad'), 'asistentes evento Fiesta de Navidad.csv')
})

test('quita los caracteres que Windows no admite en nombres de archivo', () => {
  assert.equal(attendeesFileName('Gala: "Fin/Año" <2026>?'), 'asistentes evento Gala FinAño 2026.csv')
  assert.equal(attendeesFileName('   '), 'asistentes evento sin nombre.csv')
})

test('el CSV lleva BOM, separador ; y SOLO a quienes asistieron', () => {
  const csv = buildAttendeesCsv([
    row({ cedula: '1', fullName: 'ANA PÉREZ' }),
    row({ cedula: '2', fullName: 'AUSENTE', attended: false }),
    row({ cedula: '3', fullName: 'LUIS', company: null, seat: null, companyGroup: null }),
  ])
  assert.ok(csv.startsWith('﻿Cédula;Nombre;Empresa;Cargo;Asiento;Grupo\r\n'))
  assert.deepEqual(csv.trim().split('\r\n').slice(1), ['1;ANA PÉREZ;X;JEFE;A-1;1', '3;LUIS;;JEFE;;'])
})

test('escapa comillas y separadores, y neutraliza fórmulas', () => {
  const csv = buildAttendeesCsv([row({ fullName: 'A;B', company: 'C"D', jobTitle: '=SUMA(1;2)', seat: '@x' })])
  assert.equal(csv.trim().split('\r\n')[1], `1;"A;B";"C""D";"'=SUMA(1;2)";'@x;1`)
})

test('sin asistentes solo queda el encabezado', () => {
  assert.equal(buildAttendeesCsv([row({ attended: false })]).trim().split('\r\n').length, 1)
})
