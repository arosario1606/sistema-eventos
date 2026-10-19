# Integración del módulo de eventos en la intranet

Mismo patrón que el módulo de sorteos (verificado leyendo su documentación de integración; los archivos de `intranet-api-auth` e
`intranet-frontend` **no** estaban disponibles al escribir esto, así que los nombres de esos dos proyectos se tomaron de allí).

```
Navegador ──cookie access_token──▶ intranet-api-auth (gateway)
                                    1. valida el JWT de la cookie (JWT_SECRET_KEY)
                                    2. comprueba el permiso de la ruta EXACTA (Routes_backend / Routes_backend_child)
                                    3. firma un JWT de 5 min con SERVICES_SECRET_KEY: { id, email, cedula, active }
                                    4. proxy ▶ servicio de eventos (header x-auth-token)
```

El servicio de eventos **no habla con el navegador ni con la tabla de usuarios**: solo verifica `x-auth-token` y consulta SUS
permisos de sede (`User_branch_permission`) con el `id` del token. Por eso su puerto debe quedar accesible únicamente desde la
red Docker del gateway.

## Qué se entrega y dónde va cada pieza

| Pieza | Origen (este repo) | Destino en la intranet |
|---|---|---|
| Servicio backend | `backend/` completo (con su `Dockerfile`) | Contenedor propio `intranet-events-backend` (puerto 3070) |
| Gateway | `docs/integracion/events.gateway.routes.js` | `intranet-api-auth/src/routes/` + `app.use(eventsRoutes)` en `src/index.js` |
| Registro de rutas | `docs/integracion/seed-rutas-eventos.js` | `intranet-api-auth/utils/seed-routes/eventos/` (se ejecuta una vez) |
| Pantalla | `frontend/src/components/main/content/events/*` | **nueva** carpeta `intranet-frontend/src/components/main/content/events/` |
| Ruta de pantalla | `frontend/src/routes/_content/events.jsx` | `intranet-frontend/src/routes/_content/events.jsx` |

**No copiar** `frontend/src/routes/__root.jsx`, `_content.jsx` ni `index.jsx`: son un layout de desarrollo; la intranet usa los suyos.

**Pendiente de acordar con los administradores:** hoy la intranet **no tiene** entrada de menú para eventos. Quien administra la
intranet debe crear la entrada de menú (y el permiso de la pantalla) que apunte al path `/events`. Si prefieren otro path o
nombre de componente, se cambia en `routes/_content/events.jsx` (un solo archivo) y en la entrada de menú.

Dependencia nueva en el frontend de la intranet: ninguna que no tenga ya (`@tanstack/react-router`, `js-cookie`, Tailwind).

## Pasos

1. **Base de datos.** Misma base `intranet`, esquema propio `eventos`. Crear un rol con permisos solo sobre ese esquema (y
   `SELECT` sobre `intranet_api_auth_manager."Locations"` si se usa el `sync`). Ver `ENTREGA.md`.
   `DATABASE_URL="postgresql://usuario:clave@host:5432/intranet?schema=eventos"` → `npm run migrate:deploy` (el `Dockerfile` ya lo hace al arrancar).
2. **Datos iniciales.** `npm run sync:sedes` (copia `Locations`). Después, desactivar a mano las sedes que no harán eventos
   (`UPDATE "Sede" SET active = false WHERE id_sede IN (...)`); el `sync` no las reactiva. Los permisos por sede
   (`User_branch_permission`) se cargan aparte, por SQL.
3. **Variables del servicio:** `DATABASE_URL`, `PORT=3000`, `SERVICES_SECRET_KEY` (el MISMO valor que el gateway; no se sube al repo).
4. **Docker.** `backend/docker-compose.yml` (puerto `3070:3000`, que debe coincidir con `EVENTS_SERVICE_PORT` del gateway).
   Copiar `backend/.env.docker.example` a `backend/.env.docker` (no se sube al repo), completar y ejecutar
   `docker compose --env-file .env.docker up --build -d` dentro de `backend/`. El contenedor aplica las migraciones al arrancar,
   corre como usuario `node` y expone `/health`. Si PostgreSQL corre en la máquina anfitriona se usa `host.docker.internal`.
5. **Conectar el módulo al gateway** (`intranet-api-auth`), en este orden:
   1. **Copiar** `events.gateway.routes.js` → `intranet-api-auth/src/routes/events.gateway.routes.js` y en `src/index.js` agregar
      `import eventsRoutes from "./routes/events.gateway.routes.js";` y `app.use(eventsRoutes);`.
   2. **Confirmar el puerto** (`EVENTS_SERVICE_PORT`, 3070) y que esté libre. Conservar `parseReqBody: !req.is("multipart/form-data")`:
      sin eso la subida del CSV falla con «Error interno del servidor».
   3. **Registrar las rutas:** copiar `seed-rutas-eventos.js` a `intranet-api-auth/utils/seed-routes/eventos/` y ejecutar
      `node utils/seed-routes/eventos/seed-rutas-eventos.js` (repetible). Crea la ruta padre `/events-service` y una hija por endpoint.
   4. **Dar acceso al grupo de permisos:** asignar la ruta padre `/events-service` **y todas** las hijas `/api/events/...` al grupo de
      quienes usarán el módulo. Si falta la padre o alguna hija, el gateway responde **403**.

   Cómo se comprueba: con un usuario de ese grupo, abrir `/apiv1/events-service/api/events/me` debe devolver un JSON con su correo y
   sus sedes. 403 = falta asignar alguna ruta al grupo; una respuesta que no es JSON o un 404 = el archivo del gateway no está montado
   o la ruta no se registró; «ECONNREFUSED» en los logs del gateway = el contenedor no está activo o el puerto no coincide.
6. **Frontend** (`intranet-frontend`): copiar la carpeta `events/` y la ruta `events.jsx` según la tabla, crear la entrada de menú
   hacia `/events` y compilar con el comando habitual. La pantalla llama a `/apiv1/events-service/api/events/...` (mismo origen y
   cookie). Si el gateway cambiara de ruta, se ajusta con `VITE_EVENTS_API_BASE` al compilar.

## Reglas para no romper la integración

- **Sin parámetros en el path.** El gateway compara el path exacto; por eso el id viaja en `?id=` o en el body. `npm test` lo verifica.
- **Cada endpoint nuevo** va en `backend/src/routes/events.js` **y** en `seed-rutas-eventos.js` (una prueba falla si difieren), y se vuelve a ejecutar el seed.
- Los nombres de ruta (`route_path`, `route_name`) son únicos en toda la intranet: por eso el prefijo `/api/events` y «Eventos - ».
- El gateway redirige a `/` si la sesión no es válida (no responde 401): el cliente `events-api.js` lo detecta y cierra la sesión.

## Desarrollo local sin el gateway

El backend siempre exige `x-auth-token` (no hay atajo en el código). En local lo aporta Vite imitando al gateway:

```bash
cd backend && npm run dev:token       # token de prueba firmado con SERVICES_SECRET_KEY del .env local (8 h)
# pegarlo en frontend/.env.local como DEV_AUTH_TOKEN=...
```
