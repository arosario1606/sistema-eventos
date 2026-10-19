# Sistema de Eventos

Módulo de eventos de la intranet: crear un evento, cargar la lista de invitados y marcar la asistencia.
Backend: Node + Express + Prisma sobre **PostgreSQL** (esquema propio `eventos`). Frontend: React + Vite (misma pila que
`intranet-frontend`). Reemplaza la tabla `ta_asistencia` del sistema anterior (MariaDB, `reportes_pro`) y se integra detrás del
gateway de la intranet: ver [`docs/integracion/INTEGRACION.md`](docs/integracion/INTEGRACION.md).

## Flujo del sistema (dos módulos, como en sorteos)

**Módulo 1 — Registrar evento** (quien administra el evento):
1. **Registrar evento:** nombre, fecha y sede (solo sedes activas con permiso del usuario).
2. **Cargar asistentes:** se sube el CSV; el resumen muestra cuántos entraron y las filas inválidas (con su número de línea),
   sin impedir cargar el resto.
3. **Finalizar evento:** botón con confirmación (sin escribir nada). Ofrece antes «Descargar asistentes (CSV)» y luego
   **borra de forma definitiva** el evento y su lista: el CSV es la única copia que queda. Un evento que no se finaliza
   queda guardado en la base.

**Módulo 2 — Asistencia** (quien atiende la puerta; pensado para ir rápido, incluso desde un teléfono o una tablet):
- Abre solo el **último evento usado** en ese navegador y deja el cursor en el buscador.
- Contador grande «presentes / invitados», buscador (nombre, cédula, empresa, cargo o asiento) y filtros Todos / Pendientes / Presentes.
- Cada check se guarda **al instante** en la base (`Attendee.attended`, con quién y cuándo). Se toca la celda completa (en pantallas
  anchas) o la tarjeta (en teléfono). La lista se actualiza sola cada 10 s para ver lo que marcan las otras puertas.
- Además: «Agregar asistente» (para quien no venía en el archivo o se rechazó), «Marcar a todos como asistentes» (con confirmación)
  y «Exportar asistentes (CSV)».

Volver a subir el archivo **actualiza** nombre, empresa, cargo, asiento y grupo por cédula, agrega a los nuevos y **nunca toca
las asistencias ya marcadas ni borra a quien falte** en el archivo.

## Formato del CSV

- Separador `;` o `,`; UTF-8 o Latin-1; con o sin encabezado.
- Columnas: `cedula; nombre; empresa; cargo; asiento; grupo`. **Solo cédula y nombre son obligatorios.**
- Con encabezado, las columnas pueden venir en **cualquier orden** y se reconocen estos nombres (sin importar tildes ni
  mayúsculas): `CEDULA` (o `BRASALETE`/`BRAZALETE`), `NOMBRE`/`NOMBRE COMPLETO`, `EMPRESA`, `CARGO`, `ASIENTO`, `GRUPO`/`EMPRESA_GRUPO`.
  El archivo del sistema anterior (`NOMBRE COMPLETO; Empresa; CARGO; CÉDULA`) se carga tal cual.
- Sin encabezado se usa el orden de arriba. Una «cédula» sin ningún dígito se rechaza (suele ser un archivo con las columnas desordenadas).
- La cédula se limpia a letras y números (`28.624.356-1` → `286243561`). `grupo` debe ser un número entero.

Ejemplo con datos ficticios en `docs/ejemplos/asistentes_ejemplo.csv` (40 válidos y 2 filas con error a propósito).

## Equivalencias con la tabla anterior (`ta_asistencia`)

| Antes | Ahora |
|---|---|
| `evento`, `fecha`, `sede`, `numero_evento` | Tabla `Event` (`name`, `event_date`, `id_sede`, `id_event`) |
| `nombre` | `Attendee.full_name` |
| `empresa` | `Attendee.company` |
| `telefono` (en la práctica guardaba el **cargo**) | `Attendee.job_title` |
| `brasalete` (en la práctica guardaba la **cédula**) | `Attendee.cedula` (única por evento) |
| `asiento` / `empresa_grupo` | `Attendee.seat` / `Attendee.company_group` |
| `asistio` (`'S'`/`'N'`/`NULL`) | `Attendee.attended` (booleano) + `attended_at` + `attended_by` |
| `id_registro` | `Attendee.id_attendee` |

## Datos propios y datos de la intranet

| Tabla del módulo | Origen |
|---|---|
| `Sede` | Copia de `intranet_api_auth_manager."Locations"` con `npm run sync:sedes` (**no es automático**: las migraciones solo crean las tablas). `seed:dev` también la ejecuta. `active = false` oculta una sede al crear eventos nuevos sin perder el historial. |
| `User_branch_permission` | Propia, **se carga a mano por SQL**: `user_id` (= `Users.id` de la intranet), `user_email` (informativo) e `id_sede`. Quien no tenga filas aquí no ve ni puede marcar ningún evento. |
| `Event`, `Attendee` | Propias. No hay copia de empleados: nombre y cargo se guardan en la fila del asistente tal como vienen del archivo. |

Un usuario ve y gestiona **los eventos de las sedes sobre las que tiene permiso**.

## Documentación y despliegue

| Documento | Contenido |
|---|---|
| [`docs/integracion/INTEGRACION.md`](docs/integracion/INTEGRACION.md) | Cómo encaja el módulo en la intranet (gateway, rutas, frontend). |
| [`docs/integracion/ENTREGA.md`](docs/integracion/ENTREGA.md) | Lista de despliegue para quien administra el servidor. |

Contenedor del backend (desde `backend/`, con `.env.docker` creado a partir de `.env.docker.example`):

```bash
docker compose --env-file .env.docker up --build -d    # puerto 3070; las migraciones se aplican al arrancar
curl http://localhost:3070/health                       # {"status":"ok"}
```

## Puesta en marcha local

Requisitos: Node 22 y un PostgreSQL con la base `intranet` (con el esquema `intranet_api_auth_manager` para copiar las sedes reales).

```bash
# Backend
cd backend
cp .env.example .env          # ajustar DATABASE_URL, SERVICES_SECRET_KEY (de PRUEBA), DEV_USER_ID y DEV_USER_EMAIL
npm install
npm run migrate:deploy        # crea el esquema "eventos" y sus tablas (versionadas en prisma/migrations)
npm run sync:sedes            # copia las sedes REALES desde intranet_api_auth_manager."Locations"
npm run seed:dev              # SOLO pruebas: repite esa copia y da permisos al usuario de desarrollo en las sedes activas
                              # (solo si la base NO tiene la tabla Locations crea 2 sedes de prueba: ids 9001 y 9002)
npm run dev                   # http://localhost:3000

# Frontend (otra terminal)
cd frontend
cp .env.example .env.local    # pegar DEV_AUTH_TOKEN, que se genera con: (cd ../backend && npm run dev:token)
npm install
npm run dev                   # http://localhost:5173
```

> El backend **siempre** exige `x-auth-token`. En local, Vite lo agrega al reenviar `/apiv1/events-service` (imita al gateway
> de la intranet). El token de prueba dura 8 h; si vence aparece «Sin sesión»: genere otro con `npm run dev:token`.

Para cambios de esquema: editar `prisma/schema.prisma` y `npm run migrate:dev` (genera la migración). En producción solo `migrate:deploy`.
No se usa `db push`.

## Pruebas

```bash
cd backend
npm test                      # unitarias (sin base de datos); en frontend/ también hay `npm test` (exportación del CSV)

# Integración: usan esquemas DESCARTABLES (eventos_test, eventos_test_auth) y los limpian solos.
# Nunca tocan eventos ni los esquemas reales de la intranet; por eso exigen ?schema=eventos_test
DATABASE_URL="postgresql://usuario:clave@localhost:5432/intranet?schema=eventos_test" npm run test:integration
```

Cubren: autenticación (token ausente/falso/vencido/`alg:none`, usuario inactivo), permisos por sede, sedes inactivas, creación y
validación de eventos (incluida la fecha imposible `2026-02-31`), carga del CSV (encabezado en cualquier orden, filas con error,
recarga sin perder asistencias, **cargas simultáneas**), marcar/desmarcar y **marcas simultáneas**, alta manual, marcar a todos,
**finalizar** (borra todo lo del evento, conserva otros eventos y la sede, y convive con cargas y marcas en curso) y la
sincronización de sedes.

## Guía de prueba manual

1. Abrir http://localhost:5173 → **Registrar evento**: nombre, fecha y sede → *Crear evento*. Queda seleccionado.
2. Subir `docs/ejemplos/asistentes_ejemplo.csv`: «40 asistentes nuevos y 0 actualizados», «2 fila(s) con error» (líneas 42 y 43)
   e «Invitados cargados: 40».
3. Ir a **Asistencia**: el evento se abre solo y el cursor está en el buscador. Marcar varios; recargar la página: las marcas siguen ahí.
   En otra pestaña (o con otro usuario) marcar a alguien: en menos de 10 s aparece en la primera sin recargar.
4. Probar los filtros, «Agregar asistente» (una cédula repetida da aviso), «Marcar a todos» (Cancelar no cambia nada) y
   «Exportar asistentes (CSV)». Probar también con una ventana angosta (teléfono): la lista pasa a tarjetas.
5. Volver a **Registrar evento** → «Finalizar evento»: descargar el CSV y confirmar. El evento desaparece de ambos módulos y en la
   base no queda ninguna fila suya.
