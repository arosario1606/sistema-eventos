# Entrega a quien administra el servidor

Lista de comprobación para desplegar el módulo de eventos. El detalle técnico está en [`INTEGRACION.md`](INTEGRACION.md); este
documento fija el **orden**, lo que debe **proveer** el administrador y cómo se **verifica** cada paso.

## 1. Datos que debe definir el administrador

| Dato | Para qué | Quién lo conoce |
|---|---|---|
| Host y puerto de PostgreSQL (la misma base `intranet`) | `DATABASE_URL` del módulo | Se copian de `SCHEMA_API_AUTH` en `intranet-api-auth/.env` |
| Clave del rol `eventos_app` | `DATABASE_URL` | La define quien ejecute el paso 2 |
| `SERVICES_SECRET_KEY` de producción | Verificar `x-auth-token` | El MISMO valor de `intranet-api-auth/.env`. No se sube al repo |
| Puerto libre del servidor para el módulo | Publicar el contenedor | 3070; debe coincidir con `EVENTS_SERVICE_PORT` en el gateway (3060 es de sorteos) |
| Entrada de menú y permiso de pantalla de eventos | Que los usuarios lleguen a `/events` | No existe todavía: la crea quien administra `intranet-frontend` |
| Quién carga los permisos por sede | `User_branch_permission` | Se cargan por SQL manual (paso 6) |

## 2. Base de datos: rol propio con permisos mínimos

Ejecutar como administrador de PostgreSQL:

```sql
CREATE ROLE eventos_app LOGIN PASSWORD '<clave-fuerte>';
CREATE SCHEMA eventos AUTHORIZATION eventos_app;
GRANT USAGE ON SCHEMA intranet_api_auth_manager TO eventos_app;
GRANT SELECT ON intranet_api_auth_manager."Locations" TO eventos_app;
```

`DATABASE_URL="postgresql://eventos_app:<clave>@<host>:<puerto>/intranet?schema=eventos"` (un solo `?schema=`, y siempre `eventos`).

## 3. Backend (contenedor)

Desde la rama `main`, en `backend/`:

```bash
cp .env.docker.example .env.docker      # completar DATABASE_URL y SERVICES_SECRET_KEY
docker compose --env-file .env.docker up --build -d
```

Comprobar: `docker ps` en `healthy`; `docker logs intranet-events-backend` termina en «escuchando en el puerto 3000»;
`curl http://localhost:3070/health` responde `{"status":"ok"}`. Las migraciones se aplican solas al arrancar.

## 4. Datos iniciales

```bash
docker exec intranet-events-backend npm run sync:sedes
```

Desactivar las sedes que no harán eventos: `UPDATE eventos."Sede" SET active = false WHERE id_sede IN (...);`

## 5. Gateway y rutas

1. Copiar `docs/integracion/events.gateway.routes.js` a `intranet-api-auth/src/routes/` y registrar `app.use(eventsRoutes)` en `src/index.js`.
   Debe conservar `parseReqBody: !req.is("multipart/form-data")`; sin eso la subida de CSV falla.
2. Poner el puerto del módulo en `EVENTS_SERVICE_PORT`.
3. Ejecutar una vez `docs/integracion/seed-rutas-eventos.js` y asignar las rutas `/events-service` (padre y todas las hijas) al grupo
   de permisos correcto desde el panel de administración. Sin esto el gateway responde 403.

## 6. Permisos por sede (por SQL manual)

Cada usuario necesita filas en `eventos."User_branch_permission"`; sin ellas el módulo carga pero no ofrece ninguna sede ni evento.
`user_id` es el `Users.id` de la intranet:

```sql
INSERT INTO eventos."User_branch_permission" (user_id, user_email, id_sede, created_by)
VALUES (<id-usuario>, '<correo>', <id-sede>, '<quien-lo-carga>')
ON CONFLICT DO NOTHING;
```

Para quitar el acceso a una sede: `DELETE FROM eventos."User_branch_permission" WHERE user_id = <id-usuario> AND id_sede = <id-sede>;`
Conviene acordar quién ejecuta estos cambios cuando el personal cambie.

## 7. Frontend de la intranet

Copiar la carpeta `events/` y la ruta `events.jsx` según `INTEGRACION.md`, crear la entrada de menú hacia `/events` y recompilar.
**No** copiar `__root.jsx`, `_content.jsx` ni `index.jsx`.

## 8. Cómo se sabe que quedó bien

Con una sesión real de la intranet y un usuario con permisos:

1. «Nuevo evento» ofrece sus sedes y crea un evento.
2. Se sube `docs/ejemplos/asistentes_ejemplo.csv` (40 válidos y 2 filas con error).
3. Los checks se guardan al instante, siguen ahí tras recargar, y una marca hecha desde otro equipo aparece sola en menos de 10 s.
4. «Exportar asistentes (CSV)» descarga solo a quienes tienen el check.
5. «Finalizar evento» descarga el CSV, borra el evento y deja la base sin sus filas.
6. Un usuario **sin** permiso de sede no ve el evento; uno sin la ruta en su grupo recibe 403; uno sin sesión es redirigido al inicio.

## 9. Seguridad y operación

- **Puerto expuesto:** el compose publica `3070:3000` en todas las interfaces (igual que el patrón del gateway). El servicio exige un
  `x-auth-token` firmado, pero conviene que un firewall limite ese puerto a la IP del gateway.
- **Finalizar evento borra de forma definitiva** el evento y su lista; la única copia es el CSV descargado. Incluir el esquema
  `eventos` en los respaldos de la base.
- **Datos personales:** el módulo guarda cédula y nombre de las personas. No subir listas reales al repositorio.
- **Secretos:** `.env.docker` y la clave del rol no se versionan ni se comparten por chat o correo.
- **Dependencias:** `npm audit` marca avisos en dependencias internas de `prisma` (solo usadas por su herramienta de línea de comandos);
  se actualizará cuando exista corrección estable.

## 10. Revertir

1. Quitar las rutas `/events-service` del grupo de permisos (el módulo deja de ser accesible) y detener el contenedor:
   `docker compose --env-file .env.docker down`.
2. Frontend: quitar la entrada de menú y la carpeta/ruta copiadas.
3. Solo si se quiere borrar también los datos: `DROP SCHEMA eventos CASCADE;` (**borra todos los eventos**). No afecta a otros esquemas.

## 11. Lo que NO se ha verificado

- El despliegue en el servidor de producción (red real, firewall, host de PostgreSQL y clave del gateway de producción).
- La construcción de la imagen Docker y el contenedor `healthy` (en el entorno de desarrollo no había servicio de Docker).
- Las **pruebas automáticas** corrieron con un superusuario local de PostgreSQL. Aparte se verificó a mano que el rol `eventos_app` del paso 2 aplica las migraciones y ejecuta `sync:sedes`, y que no puede modificar ni leer otras tablas de la intranet.
- El archivo del gateway y el seed dentro de `intranet-api-auth` real (se copiaron del patrón de sorteos sin poder ejecutarlos).
- La pantalla dentro del layout real de `intranet-frontend` (se probó en el layout de desarrollo).
