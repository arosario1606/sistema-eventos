import test from 'node:test';
import assert from 'node:assert/strict';
import { asViewError } from '../../src/services/sedes.js';
import { HttpError } from '../../src/utils/http.js';

test('«relation does not exist» sobre una vista se traduce a un 503 con instrucciones', () => {
  for (const err of [
    { code: 'P2010', meta: { code: '42P01', message: 'relation "v_sede" does not exist' } },
    { message: 'ERROR: relation "v_permiso_sede" does not exist' },
  ]) {
    const out = asViewError(err);
    assert.ok(out instanceof HttpError);
    assert.equal(out.status, 503);
    assert.match(out.message, /vistas-eventos\.sql/);
  }
});

test('cualquier otro error pasa sin cambios', () => {
  const err = new Error('otro problema');
  assert.equal(asViewError(err), err);
});
