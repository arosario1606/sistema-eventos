import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAttendee } from '../../src/services/attendeeFields.js';

const base = { cedula: '28.624.356-1', fullName: '  PÉREZ   LÓPEZ ANA ', company: 'Grupo SanSimon', jobTitle: 'ANALISTA', seat: 'A-12', companyGroup: '1' };

test('limpia la cédula, colapsa espacios y convierte el grupo a número', () => {
  assert.deepEqual(parseAttendee(base).value, {
    cedula: '286243561', fullName: 'PÉREZ LÓPEZ ANA', company: 'Grupo SanSimon', jobTitle: 'ANALISTA', seat: 'A-12', companyGroup: 1,
  });
});

test('solo cédula y nombre son obligatorios; lo demás queda en null', () => {
  assert.deepEqual(parseAttendee({ cedula: '123', fullName: 'ANA' }).value, {
    cedula: '123', fullName: 'ANA', company: null, jobTitle: null, seat: null, companyGroup: null,
  });
});

test('rechaza cédula vacía, sin dígitos (columnas desordenadas) o demasiado larga', () => {
  assert.match(parseAttendee({ ...base, cedula: '' }).reason, /Cédula vacía/);
  assert.match(parseAttendee({ ...base, cedula: 'AGUIRRE ARZUZA JIMY' }).reason, /Cédula inválida/);
  assert.match(parseAttendee({ ...base, cedula: '1'.repeat(51) }).reason, /demasiado larga/);
});

test('rechaza nombre vacío y campos que exceden la columna', () => {
  assert.match(parseAttendee({ ...base, fullName: '  ' }).reason, /Falta el nombre/);
  assert.match(parseAttendee({ ...base, fullName: 'A'.repeat(151) }).reason, /Nombre demasiado largo/);
  assert.match(parseAttendee({ ...base, seat: 'X'.repeat(41) }).reason, /Asiento demasiado largo/);
});

test('rechaza un grupo que no es entero', () => {
  assert.match(parseAttendee({ ...base, companyGroup: 'uno' }).reason, /Grupo inválido/);
  assert.match(parseAttendee({ ...base, companyGroup: '1.5' }).reason, /Grupo inválido/);
  assert.match(parseAttendee({ ...base, companyGroup: '-1' }).reason, /Grupo inválido/);
});
