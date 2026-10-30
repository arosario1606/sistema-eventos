# Entrega a quien administra el servidor

Lista de comprobación para desplegar el módulo de eventos. El detalle técnico está en [`INTEGRACION.md`](INTEGRACION.md); este
documento fija el **orden**, lo que debe **proveer** el administrador y cómo se **verifica** cada paso.

## 1. Datos que debe definir el administrador

| Dato | Para qué | Quién lo conoce |
|---|---|---|
| Host y puerto de PostgreSQL (la misma base `intranet`) | `DATABASE_URL` del módulo | Se copian de `SCHEMA_API_AUTH` en `intranet-api-auth/.env` |
| Clave del rol `eventos_app` | `DATABASE_URL` | La define quien ejecute el paso 2 |
| `SERVICES_SECRET_KEY` de producción | Verificar `x-auth-token` | El MISMO valor de `intranet-api-auth/.env`. No se sube al repo |
| Puerto libre del servidor para el módulo | Publicar el contenedor | **3009**; debe coincidir con `EVENTS_SERVICE_PORT` en el gateway (3008 es de sorteos) |
| Quién asigna usuarios a `EVENTOS` y `EVENTOS_ADMIN` | Que cada persona vea las pantallas que le tocan | Desde el panel de administración de la intranet |

## 2. Base de datos: rol propio y vistas

Ejecutar como administrador de PostgreSQL. El rol **no necesita ningún permiso sobre `intranet_api_auth_manager`**: lee las sedes y los
permisos por sede a través de dos vistas.

```sql
CREATE ROLE eventos_app LOGIN PASSWORD '<clave-fuerte>';
CREATE SCHEMA eventos AUTHORIZATION eventos_app;
```

Después, con un usuario que ya pueda leer `intranet_api_auth_manager` (p. ej. el administrador de la base), ejecutar **completo** el script
`docs/integracion/vistas-eventos.sql` (en DBeaver: Alt+X). Crea `eventos.v_sede` y `eventos.v_permiso_sede`, concede `SELECT` sobre ellas a
`eventos_app` y termina con una comprobación que debe mostrar ambas vistas con filas. **Debe hacerse antes de arrancar el servicio.** El usuario que
lo ejecute no debe eliminarse ni perder permiso de lectura sobre `Locations` y `User_organization_accesses`, o las vistas dejarían de funcionar.

`DATABASE_URL="postgresql://eventos_app:<clave>@<host>:<puerto>/intranet?schema=eventos"` (un solo `?schema=`, y siempre `eventos`).

## 3. Backend (contenedor)

Desde la rama `main`, en `backend/`:

```bash
cp .env.docker.example .env.docker      # completar DATABASE_URL y SERVICES_SECRET_KEY
docker compose --env-file .env.docker up --build -d
```

Comprobar: `docker ps` en `healthy`; `docker logs intranet-events-backend` termina en «escuchando en el puerto 3000» **sin** el aviso
«Falta configurar el módulo: las vistas…»; `curl http://localhost:3009/health` responde `{"status":"ok"}`. Las migraciones se aplican solas al arrancar.

## 4. Sedes

Las sedes **se leen en vivo de la intranet**: no hay nada que copiar ni sincronizar, y un cambio de nombre se refleja de inmediato. Si una sede
no debe usarse para eventos (aunque esté activa en la intranet), se desactiva solo para este módulo:

```sql
INSERT INTO eventos."Sede" (id_sede, active) VALUES (<id-sede>, false)
ON CONFLICT (id_sede) DO UPDATE SET active = false, updated_at = now();
```

Para volver a habilitarla: `UPDATE eventos."Sede" SET active = true WHERE id_sede = <id-sede>;`

## 5. Gateway, menú y permisos

1. Copiar `docs/integracion/events.gateway.routes.js` a `intranet-api-auth/src/routes/` y registrar `app.use(eventsRoutes)` en `src/index.js`.
   Debe conservar `parseReqBody: !req.is("multipart/form-data")`; sin eso la subida de CSV falla.
2. Confirmar el puerto en `EVENTS_SERVICE_PORT` (3009).
3. Ejecutar **completo** `docs/integracion/registro-rutas-eventos.sql`, primero sobre la copia de la base. Crea los grupos `EVENTOS` y `EVENTOS_ADMIN`,
   las rutas del backend, la sección **«Eventos»** del menú con su icono y sus dos pantallas, y asigna los permisos de la **sección**, de las pantallas
   y de las rutas (ver `INTEGRACION.md`; la sección necesita su propio permiso o el menú no la muestra). Es repetible
   y su última consulta es un resumen: cada valor debe coincidir con el número que lleva su columna en el nombre.
4. Desde el panel de administración, asignar los usuarios a `EVENTOS` (puertas: solo «Asistencia de Eventos») o `EVENTOS_ADMIN` (organizadores:
   también «Registrar Evento»). `ADMINISTRADOR` ya recibe todo.

## 6. Permisos por sede

No hay nada que cargar: se usan los permisos que **ya existen** en la intranet (`User_organization_accesses`), con las reglas descritas en
`INTEGRACION.md`. Quien no tenga ninguna sede asignada ve el módulo pero ningún evento. Se administran donde ya se administran, no en este módulo.

## 7. Frontend de la intranet

Copiar la carpeta `events/` y las rutas **nuevas** `eventsreg.jsx` y `eventsassist.jsx` según `INTEGRACION.md` y recompilar. El menú sale de la base
de datos (paso 5.3). **No** copiar `__root.jsx`, `_content.jsx` ni `index.jsx`.

## 8. Cómo se sabe que quedó bien

Con una sesión real de la intranet:

1. Un usuario de `EVENTOS_ADMIN` con una sede asignada ve la sección «Eventos» (con icono de ticket) y sus dos pantallas.
2. «Registrar Evento» ofrece solo las sedes que tiene asignadas, crea un evento y carga `docs/ejemplos/asistentes_ejemplo.csv` (40 válidos y 2 filas con error).
3. Un usuario de `EVENTOS` ve **solo** «Asistencia de Eventos»; en ella los checks se guardan al instante, siguen ahí tras recargar, y una marca hecha
   desde otro equipo aparece sola en menos de 10 s. Si intenta crear un evento por la dirección de la API, recibe 403.
4. Renombrar una sede en la intranet cambia su nombre en Eventos sin hacer nada más.
5. «Exportar asistentes (CSV)» descarga solo a quienes tienen el check; «Finalizar evento» descarga el CSV, borra el evento y deja la base sin sus filas.
6. Un usuario **sin** sede asignada no ve eventos; uno sin la ruta en su grupo recibe 403; uno sin sesión es redirigido al inicio.

## 9. Seguridad y operación

- **Puerto expuesto:** el compose publica `3009:3000` en todas las interfaces (igual que el patrón del gateway). El servicio exige un `x-auth-token`
  firmado, pero conviene que un firewall limite ese puerto a la IP del gateway.
- **Las vistas no exponen datos sensibles:** `v_sede` trae id, nombre y estado; `v_permiso_sede` solo trae dos números (usuario y sede). No hay vista de
  usuarios y el rol del módulo no puede leer `Users` (contraseña, cédula) ni ninguna otra tabla de la intranet. Esto se verificó.
- **Finalizar evento borra de forma definitiva** el evento y su lista; la única copia es el CSV descargado. Incluir el esquema `eventos` en los respaldos.
- **Datos personales:** el módulo guarda cédula y nombre de las personas. No subir listas reales al repositorio.
- **Secretos:** `.env.docker` y la clave del rol no se versionan ni se comparten por chat o correo.
- **Dependencias:** `npm audit` marca avisos en dependencias internas de `prisma` (solo usadas por su herramienta de línea de comandos).

## 10. Actualizar desde la versión anterior (si ya estaba instalada)

El orden importa: **1)** ejecutar `vistas-eventos.sql` (paso 2), **2)** desplegar el contenedor nuevo (aplica la migración
`…_sede_vistas_intranet`: conserva eventos, asistentes y sedes desactivadas, y **elimina la tabla propia de permisos `User_branch_permission`**, porque
desde ahora se usan los permisos de la intranet), **3)** ejecutar `registro-rutas-eventos.sql` (paso 5.3). Los comandos `sync:sedes` y `seed:dev` ya no existen.

## 11. Revertir

1. Quitar los grupos `EVENTOS` y `EVENTOS_ADMIN` de los usuarios y las rutas `/events-service` del grupo `ADMINISTRADOR` (el módulo deja de ser
   accesible) y detener el contenedor: `docker compose --env-file .env.docker down`.
2. Frontend: quitar la carpeta y las rutas copiadas; la sección «Eventos» se puede desactivar (`active = false`) o borrar desde el panel.
3. Solo si se quiere borrar también los datos: `DROP SCHEMA eventos CASCADE;` (**borra todos los eventos y las vistas**). No afecta a otros esquemas.

## 12. Lo que NO se ha verificado

- El despliegue en el servidor de producción (red real, firewall, host de PostgreSQL y clave del gateway de producción).
- La construcción de la imagen Docker y el contenedor `healthy` (en el entorno de desarrollo no había servicio de Docker).
- **El icono del menú:** se guardó con el mismo formato que el de Sorteos, pero no se pudo ver renderizado dentro de la intranet real. Si no aparece o se ve
  mal, es lo primero a revisar (el valor está en `intranet_api_auth_manager."Routes_frontend".svg`, fila «Eventos»).
- `registro-rutas-eventos.sql` se probó contra una **réplica** de las tablas del menú. Tres tablas (`Permissions_groups`, `Routes_frontend`,
  `Routes_frontend_child`) se copiaron del DDL real y de las dos `Permissions_groups_routes_*` se conocen sus columnas reales; de `Routes_backend` y
  `Routes_backend_child` solo las columnas que ya usan los scripts de Sorteos. Por eso se ejecuta primero sobre la **copia** de la base: si algo difiere, falla sin cambiar nada.
- La pantalla dentro del layout real de `intranet-frontend` (se probó en el layout de desarrollo) y el rol `eventos_app` real de producción
  (se verificó con un rol local de permisos equivalentes).
