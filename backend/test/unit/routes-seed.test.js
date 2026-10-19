import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8');

// El gateway de la intranet solo deja pasar rutas registradas: el seed debe listar EXACTAMENTE
// las rutas que expone el servicio (ni una de más, ni una de menos).
test('seed-rutas-eventos.js lista las mismas rutas que backend/src/routes/events.js', async () => {
  const code = await read('../../src/routes/events.js');
  const seed = await read('../../../docs/integracion/seed-rutas-eventos.js');

  const exposed = [...code.matchAll(/router\.(?:get|post)\('(\/[a-z/-]*)'/g)].map((m) => `/api/events${m[1]}`).sort();
  const registered = [...seed.matchAll(/path: '(\/api\/events[a-z/-]*)'/g)].map((m) => m[1]).sort();

  assert.ok(exposed.length > 0);
  assert.deepEqual(registered, exposed);
});

test('ninguna ruta del servicio usa parámetros en el path (el gateway autoriza por ruta exacta)', async () => {
  const code = await read('../../src/routes/events.js');
  assert.doesNotMatch(code, /router\.(?:get|post|patch|put|delete)\('[^']*:/);
});
