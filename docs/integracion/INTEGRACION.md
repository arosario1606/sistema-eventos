# Integración del módulo de eventos en la intranet

Mismo patrón que el módulo de sorteos (se tomó de su documentación y de sus scripts SQL). Los archivos de `intranet-api-auth` e
`intranet-frontend` **no** estaban disponibles al escribir esto: lo que se sabe de ellos viene de las estructuras de tablas
(`Routes_frontend`, `Routes_frontend_child`, `Permissions_groups`, `Users`, `Locations`, `Companies`, `User_organization_accesses`) y de lo que ya
hacen los scripts de sorteos.

```
Navegador ──cookie access_token──▶ intranet-api-auth (gateway)
                                    1. valida el JWT de la cookie (JWT_SECRET_KEY)
                                    2. comprueba el permiso de la ruta EXACTA (Routes_backend / Routes_backend_child)
                                    3. firma un JWT de 5 min con SERVICES_SECRET_KEY: { id, email, cedula, active }
                                    4. proxy ▶ servicio de eventos (header x-auth-token)
```

El servicio de eventos **no habla con el navegador ni con la tabla de usuarios**: solo verifica `x-auth-token`. Las **sedes** y **quién
tiene permiso sobre cada sede** los lee en vivo, sin copiarlos, a través de dos vistas de solo lectura (`v_sede`, `v_permiso_sede`) que crea el
administrador. Por eso su puerto debe quedar accesible únicamente desde la red Docker del gateway.

## Qué se entrega y dónde va cada pieza

| Pieza | Origen (este repo) | Destino en la intranet |
|---|---|---|
| Servicio backend | `backend/` completo (con su `Dockerfile`) | Contenedor propio `intranet-events-backend` (puerto **3009**) |
| Vistas de la intranet | `docs/integracion/vistas-eventos.sql` | Se ejecuta una vez en la base `intranet` (ver `ENTREGA.md`, paso 2) |
| Gateway | `docs/integracion/events.gateway.routes.js` | `intranet-api-auth/src/routes/` + `app.use(eventsRoutes)` en `src/index.js` |
| Rutas, menú, icono y permisos | `docs/integracion/registro-rutas-eventos.sql` | Se ejecuta una vez en la base `intranet` (ver paso 5.3) |
| Pantallas | `frontend/src/components/main/content/events/*` | **nueva** carpeta `intranet-frontend/src/components/main/content/events/` |
| Rutas de pantalla | `frontend/src/routes/_content/{eventsreg,eventsassist}.jsx` | `intranet-frontend/src/routes/_content/` (**nuevas**; sorteos reemplazaba pantallas existentes, aquí no hay ninguna) |
| (Alternativa) solo rutas de backend | `docs/integracion/seed-rutas-eventos.js` | Solo si no se quiere usar el SQL; no crea menú ni permisos |

**No copiar** `frontend/src/routes/__root.jsx`, `_content.jsx` ni `index.jsx`: son un layout de desarrollo; la intranet usa los suyos.
Dependencia nueva en el frontend de la intranet: ninguna que no tenga ya (`@tanstack/react-router`, `js-cookie`, Tailwind).

## Menú, roles y permisos

El script `registro-rutas-eventos.sql` crea la **sección «Eventos»** del menú (icono «ticket» de Heroicons, guardado en `Routes_frontend.svg`
con el mismo formato que las demás secciones) con dos pantallas, y los grupos de permisos:

| Grupo | Ve | Rutas del backend |
|---|---|---|
| `EVENTOS` (puertas) | «Asistencia de Eventos» (`/eventsassist`) | 6: `me`, `list`, `detail`, `attendees/list`, `attendees/mark`, `attendees/add` |
| `EVENTOS_ADMIN` (organizadores) | «Registrar Evento» (`/eventsreg`) y «Asistencia de Eventos» | las 9 (añade `create`, `finalize`, `attendees/upload`) |
| `ADMINISTRADOR` | las dos pantallas | las 9 |

- **El menú exige DOS permisos por grupo:** el de cada **pantalla** (`Permissions_groups_routes_child_entity`, columna `routes_frontend_childId`) y el de la
  **sección** (`Permissions_groups_routes_entity`, columna `routes_frontendId`). Con solo el de las pantallas el menú **no muestra la sección**. El script
  crea los dos.
- **El rol decide qué pantallas ve la persona; el permiso por sede decide de qué sedes ve eventos.** Hacen falta los dos: una persona de
  `EVENTOS` sin sede asignada no ve ningún evento.
- **Cambiar quién puede crear eventos** (p. ej. dar el acceso a otro grupo) = editar la lista `_grupos_admin` al inicio del script y volverlo a
  ejecutar. No requiere tocar código.
- **Los usuarios se asignan a `EVENTOS` / `EVENTOS_ADMIN` desde el panel de administración** de la intranet, como el resto de grupos
  (la tabla que lo guarda parece ser `Permissions_groups_users_entity`; el script no la toca).

## Permisos por sede

Eventos **no administra** permisos por sede: usa los que ya existen en la intranet (`intranet_api_auth_manager."User_organization_accesses"`:
`user_id`, `company_id`, `location_id`). La vista `v_permiso_sede` los expone con dos reglas, probadas:
1. Si un usuario tiene la misma sede bajo dos empresas, cuenta una sola vez.
2. Una fila **sin sede** (`location_id` NULL) no da acceso a ninguna sede. Hoy no existe ninguna; si algún día significa «todas las sedes de la
   empresa», habría que cambiarlo en `vistas-eventos.sql` y volver a ejecutarlo.

Una sede se ofrece para **crear eventos nuevos** solo si el usuario tiene permiso sobre ella, está activa en la intranet (`Locations.is_active`)
y no está desactivada en este módulo (`eventos."Sede".active = false`). Los eventos ya creados siguen visibles aunque la sede pase a inactiva.

## Pasos

1. **Base de datos.** Misma base `intranet`, esquema propio `eventos`. Crear un rol con permisos solo sobre ese esquema. **No necesita ningún
   permiso sobre `intranet_api_auth_manager`** (lee por las vistas del paso 2).
   `DATABASE_URL="postgresql://usuario:clave@host:5432/intranet?schema=eventos"` → `npm run migrate:deploy` (el `Dockerfile` ya lo hace al arrancar).
2. **Vistas.** Ejecutar `docs/integracion/vistas-eventos.sql` (un usuario que ya lea `intranet_api_auth_manager`, después de crear el esquema
   `eventos` y **antes de arrancar el servicio**): crea `v_sede` y `v_permiso_sede`. Sin ellas el servicio arranca, avisa en el registro y
   responde **503** con un mensaje que nombra este script.
3. **Variables del servicio:** `DATABASE_URL`, `PORT=3000`, `SERVICES_SECRET_KEY` (el MISMO valor que el gateway; no se sube al repo).
4. **Docker.** `backend/docker-compose.yml` (puerto `3009:3000`, que debe coincidir con `EVENTS_SERVICE_PORT` del gateway).
   Copiar `backend/.env.docker.example` a `backend/.env.docker` (no se sube al repo), completar y ejecutar
   `docker compose --env-file .env.docker up --build -d` dentro de `backend/`. El contenedor aplica las migraciones al arrancar,
   corre como usuario `node` y expone `/health`. Si PostgreSQL corre en la máquina anfitriona se usa `host.docker.internal`.
5. **Conectar el módulo al gateway** (`intranet-api-auth`), en este orden:
   1. **Copiar** `events.gateway.routes.js` → `intranet-api-auth/src/routes/events.gateway.routes.js` y en `src/index.js` agregar
      `import eventsRoutes from "./routes/events.gateway.routes.js";` y `app.use(eventsRoutes);`.
   2. **Confirmar el puerto** (`EVENTS_SERVICE_PORT`, 3009) y que esté libre. Conservar `parseReqBody: !req.is("multipart/form-data")`:
      sin eso la subida del CSV falla con «Error interno del servidor».
   3. **Ejecutar `docs/integracion/registro-rutas-eventos.sql`** (completo, como script; en DBeaver: Alt+X), primero sobre la copia de la base. Crea
      los grupos, la ruta padre `/events-service` con sus 9 hijas, la sección «Eventos» con su icono, las dos pantallas y los permisos de la tabla
      anterior. Es repetible. La última consulta muestra un resumen: cada valor debe coincidir con el número del nombre de su columna.
      Si falta el grupo `ADMINISTRADOR`, se detiene sin cambiar nada.
   4. **Asignar usuarios** a `EVENTOS` o `EVENTOS_ADMIN` desde el panel de administración.

   Cómo se comprueba: con un usuario de `EVENTOS_ADMIN` que tenga una sede asignada, abrir `/apiv1/events-service/api/events/me` debe devolver un
   JSON con su correo y sus sedes. 403 = falta algún permiso del grupo; una respuesta que no es JSON o un 404 = el archivo del gateway no está
   montado o las rutas no se registraron; 503 = faltan las vistas; «ECONNREFUSED» en los logs del gateway = el contenedor no está activo o el
   puerto no coincide.
6. **Frontend** (`intranet-frontend`): copiar la carpeta `events/` y las dos rutas nuevas según la tabla y compilar con el comando habitual
   (`routeTree.gen.js` se genera al compilar). El menú sale de la base de datos: no hay que editar el menú en código. Las pantallas llaman a
   `/apiv1/events-service/api/events/...` (mismo origen y cookie); si el gateway cambiara de ruta, se ajusta con `VITE_EVENTS_API_BASE` al compilar.

   Cómo se comprueba: un usuario de `EVENTOS` ve la sección «Eventos» con una sola pantalla («Asistencia de Eventos»); uno de `EVENTOS_ADMIN` ve
   las dos; la sección muestra el icono de ticket (si no se ve, es lo primero a revisar: ver «No verificado» en `ENTREGA.md`).

## Reglas para no romper la integración

- **Sin parámetros en el path.** El gateway compara el path exacto; por eso el id viaja en `?id=` o en el body. `npm test` lo verifica.
- **Cada endpoint nuevo** va en `backend/src/routes/events.js`, en `registro-rutas-eventos.sql` (con su nivel `puertas` o `admin`) y en
  `seed-rutas-eventos.js` (una prueba falla si difieren), y se vuelve a ejecutar el SQL.
- **Las sedes y los permisos no se copian:** se leen de `v_sede` y `v_permiso_sede`. Si la intranet cambia las columnas de `Locations` o de
  `User_organization_accesses` que usan las vistas, hay que actualizar `vistas-eventos.sql` y volver a ejecutarlo.
- Los nombres de ruta (`route_name`, `route_path`) son únicos en toda la intranet: por eso el prefijo `/api/events`, «Eventos - » y los nombres de
  pantalla «Registrar Evento» y «Asistencia de Eventos».
- El gateway redirige a `/` si la sesión no es válida (no responde 401): el cliente `events-api.js` lo detecta y cierra la sesión.

## Desarrollo local sin el gateway

El backend siempre exige `x-auth-token` (no hay atajo en el código). En local lo aporta Vite imitando al gateway. Como los permisos ahora se leen
de la intranet, `DEV_USER_ID` debe ser un `Users.id` **real** que tenga sedes en `User_organization_accesses`, y las vistas deben existir en tu base
(`vistas-eventos.sql`):

```bash
cd backend && npm run dev:token       # token de prueba firmado con SERVICES_SECRET_KEY del .env local (8 h)
# pegarlo en frontend/.env.local como DEV_AUTH_TOKEN=...
```
