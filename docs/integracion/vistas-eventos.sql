-- =====================================================================================
-- Vistas que permiten al módulo de Eventos LEER (sin copiar) las sedes de la intranet y quién tiene permiso sobre ellas.
--
--   eventos.v_sede           <- intranet_api_auth_manager."Locations"                 (id, name, is_active)
--   eventos.v_permiso_sede   <- intranet_api_auth_manager."User_organization_accesses" (user_id, id_sede)
--
-- QUÉ NO EXPONEN: no hay vista de usuarios (Eventos no muestra usuarios) y v_permiso_sede solo trae dos números
-- (usuario y sede). Nunca se toca "Users" (que guarda contraseña y cédula).
-- POR QUÉ ES UNA VISTA Y NO UN PERMISO DIRECTO: una vista se ejecuta con los permisos de QUIEN LA CREA, así que el rol
-- del módulo (eventos_app) solo puede leer estas columnas y no necesita ningún permiso sobre intranet_api_auth_manager.
--
-- REGLAS DE v_permiso_sede
--   * Una fila de User_organization_accesses SIN sede (location_id NULL) no da acceso a ninguna sede: no se sabe a qué
--     sedes corresponde y es más seguro no mostrar eventos que mostrar eventos ajenos. (Hoy no existe ninguna.)
--   * La misma sede bajo dos empresas del mismo usuario se cuenta una sola vez (DISTINCT).
--
-- QUIÉN LA EJECUTA: un usuario que ya pueda leer intranet_api_auth_manager (p. ej. el administrador de la base).
--   * No se puede incluir en las migraciones del módulo: eventos_app no puede leer esas tablas y no podría crearla.
--   * El usuario que la ejecute NO debe eliminarse ni perder el permiso de lectura sobre "Locations" y
--     "User_organization_accesses": las vistas dejarían de funcionar.
-- CUÁNDO: después de crear el esquema "eventos" (ENTREGA.md, paso 2) y ANTES de arrancar el servicio.
-- Se puede ejecutar más de una vez. Si el esquema del módulo no se llama "eventos", cambie el prefijo abajo.
-- Ejecutar COMPLETO como script (en DBeaver: Alt+X).
-- =====================================================================================
BEGIN;

CREATE OR REPLACE VIEW eventos.v_sede AS
SELECT l.id, l.name, COALESCE(l.is_active, true) AS is_active
FROM intranet_api_auth_manager."Locations" l;

CREATE OR REPLACE VIEW eventos.v_permiso_sede AS
SELECT DISTINCT a.user_id, a.location_id AS id_sede
FROM intranet_api_auth_manager."User_organization_accesses" a
WHERE a.location_id IS NOT NULL;

-- Permiso de lectura para el rol del módulo. Si el rol no existe (p. ej. una copia local), solo avisa.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'eventos_app') THEN
    GRANT SELECT ON eventos.v_sede, eventos.v_permiso_sede TO eventos_app;
  ELSE
    RAISE NOTICE 'El rol eventos_app no existe: no se concedió ningún permiso (correcto en una copia local).';
  END IF;
END $$;

-- Comprobación: deben aparecer las dos vistas y devolver filas.
SELECT 'v_sede' AS vista, count(*) AS filas FROM eventos.v_sede
UNION ALL
SELECT 'v_permiso_sede', count(*) FROM eventos.v_permiso_sede;

COMMIT;
