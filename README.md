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
- Junto al buscador, siempre a la vista: «Agregar asistente» (para quien no venía en el archivo o se rechazó) y «Exportar asistentes (CSV)».
- **No existe «marcar a todos»**: la asistencia se marca persona por persona.

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

Las **sedes y los permisos por sede no se copian**: se leen en vivo de la intranet a través de dos vistas de solo lectura que crea el administrador
(`docs/integracion/vistas-eventos.sql`).

| Dato | Origen |
|---|---|
| Sedes (nombre y si están activas) | Vista `v_sede` ← `intranet_api_auth_manager."Locations"`. Un cambio de nombre se refleja al instante. |
| Quién puede ver cada sede | Vista `v_permiso_sede` ← `intranet_api_auth_manager."User_organization_accesses"` (los permisos que ya existen en la intranet; Eventos solo los **lee**). |
| `Sede` (propia) | Solo `id_sede` + `active`: `active = false` oculta una sede al crear eventos nuevos sin perder el historial. Una sede sin fila cuenta como activa. |
| `Event`, `Attendee` | Propias. No hay copia de empleados: nombre y cargo se guardan en la fila del asistente tal como vienen del archivo. |

Un usuario ve y gestiona **los eventos de las sedes sobre las que tiene permiso**. Qué pantallas ve depende de su **grupo**: `EVENTOS` (puertas,
solo «Asistencia de Eventos»), `EVENTOS_ADMIN` (también «Registrar Evento») o `ADMINISTRADOR`; ver `docs/integracion/INTEGRACION.md`.

## Documentación y despliegue

| Documento | Contenido |
|---|---|
| [`docs/integracion/INTEGRACION.md`](docs/integracion/INTEGRACION.md) | Cómo encaja el módulo en la intranet (gateway, rutas, frontend). |
| [`docs/integracion/ENTREGA.md`](docs/integracion/ENTREGA.md) | Lista de despliegue para quien administra el servidor. |

Contenedor del backend (desde `backend/`, con `.env.docker` creado a partir de `.env.docker.example`):

```bash
docker compose --env-file .env.docker up --build -d    # puerto 3009; las migraciones se aplican al arrancar
curl http://localhost:3009/health                       # {"status":"ok"}
```

## Puesta en marcha local

Requisitos: Node 22 y un PostgreSQL con la base `intranet` **que tenga el esquema `intranet_api_auth_manager`** (las vistas leen de él).

```bash
# Backend
cd backend
cp .env.example .env          # ajustar DATABASE_URL, SERVICES_SECRET_KEY (de PRUEBA), DEV_USER_ID y DEV_USER_EMAIL
npm install
npm run migrate:deploy        # crea el esquema "eventos" y sus tablas (versionadas en prisma/migrations)
# Ejecutar UNA vez docs/integracion/vistas-eventos.sql completo en tu base (DBeaver: Alt+X): crea v_sede y v_permiso_sede
npm run dev                   # http://localhost:3000

# Frontend (otra terminal)
cd frontend
cp .env.example .env.local    # pegar DEV_AUTH_TOKEN, que se genera con: (cd ../backend && npm run dev:token)
npm install
npm run dev                   # http://localhost:5173
```

> `DEV_USER_ID` debe ser un `Users.id` **real** de la intranet que tenga sedes en `User_organization_accesses`: los permisos ya no se crean desde aquí.
> Quien administra los permisos por sede en la intranet puede darte las sedes que necesites para probar.
>
> El backend **siempre** exige `x-auth-token`. En local, Vite lo agrega al reenviar `/apiv1/events-service` (imita al gateway de la intranet).
> El token de prueba dura 8 h; si vence aparece «Sin sesión»: genere otro con `npm run dev:token`.
> Si faltan las vistas, la API responde **503** con el nombre del script que hay que ejecutar.

Para cambios de esquema: editar `prisma/schema.prisma` y `npm run migrate:dev` (genera la migración). En producción solo `migrate:deploy`.
No se usa `db push`.

## Pruebas

```bash
cd backend
npm test                      # unitarias (sin base de datos); en frontend/ también hay `npm test` (exportación del CSV)

# Integración: usan esquemas DESCARTABLES (eventos_test, eventos_test_auth, eventos_test_menu) y los limpian solos.
# Nunca tocan eventos ni los esquemas reales de la intranet; por eso exigen ?schema=eventos_test
DATABASE_URL="postgresql://usuario:clave@localhost:5432/intranet?schema=eventos_test" npm run test:integration
```

Cubren: autenticación (token ausente/falso/vencido/`alg:none`, usuario inactivo), permisos por sede, sedes inactivas, creación y
validación de eventos (incluida la fecha imposible `2026-02-31`), carga del CSV (encabezado en cualquier orden, filas con error,
recarga sin perder asistencias, **cargas simultáneas**), marcar/desmarcar y **marcas simultáneas**, alta manual,
**finalizar** (borra todo lo del evento, conserva otros eventos y la sede, y convive con cargas y marcas en curso), las
**sedes y permisos leídos en vivo** (con una intranet simulada que ejecuta el mismo `vistas-eventos.sql`: renombrar, sede inactiva, duplicados, filas sin
sede, vistas ausentes → 503) y el script `registro-rutas-eventos.sql` (menú, icono, grupos y permisos; repetible, y se detiene sin cambiar nada si falta algo).

## Guía de prueba manual

1. Abrir http://localhost:5173 → **Registrar evento**: nombre, fecha y sede → *Crear evento*. Queda seleccionado.
2. Subir `docs/ejemplos/asistentes_ejemplo.csv`: «40 asistentes nuevos y 0 actualizados», «2 fila(s) con error» (líneas 42 y 43)
   e «Invitados cargados: 40».
3. Ir a **Asistencia**: el evento se abre solo y el cursor está en el buscador. Marcar varios; recargar la página: las marcas siguen ahí.
   En otra pestaña (o con otro usuario) marcar a alguien: en menos de 10 s aparece en la primera sin recargar.
4. Probar los filtros, «Agregar asistente» (una cédula repetida da aviso) y
   «Exportar asistentes (CSV)»; ambos botones están junto al buscador. Probar también con una ventana angosta (teléfono): la lista pasa a tarjetas.
5. Volver a **Registrar evento** → «Finalizar evento»: descargar el CSV y confirmar. El evento desaparece de ambos módulos y en la
   base no queda ninguna fila suya.
