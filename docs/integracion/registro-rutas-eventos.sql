-- =====================================================================================
-- Registro del módulo de EVENTOS en el esquema intranet_api_auth_manager. Se ejecuta UNA vez por entorno. Hace:
--   1) Crea los grupos de permisos EVENTOS (puertas) y EVENTOS_ADMIN (organizadores), si no existen.
--   2) Registra la ruta de backend padre /events-service y sus 9 rutas hijas /api/events/...
--   3) Crea la SECCIÓN «Eventos» del menú, con su icono (ticket), y sus dos pantallas:
--        «Registrar Evento»      (/eventsreg)
--        «Asistencia de Eventos» (/eventsassist)
--   4) Asigna permisos (de la SECCIÓN del menú, de las dos pantallas y de las rutas del backend):
--        EVENTOS                   -> pantalla «Asistencia de Eventos» y 6 rutas (consultar y marcar asistencia).
--        EVENTOS_ADMIN, ADMINISTRADOR -> las dos pantallas y las 9 rutas (además crear, subir lista y finalizar).
--
-- ROLES: cambiar quién puede crear eventos más adelante = editar la lista de la sección 1 (_grupos_admin) y volver a
-- ejecutar el script. No hace falta tocar código. Aviso: es el ROL el que decide qué pantallas ve la persona; de qué SEDES
-- ve eventos lo decide su permiso por sede en la intranet (User_organization_accesses), que es otra cosa.
--
-- No usa números fijos (ids): todo se busca por nombre o por ruta, así que sirve en cualquier entorno. Se puede ejecutar
-- más de una vez: no duplica nada (no pisa un icono ya existente ni quita permisos). Si falta algo que debería existir, se
-- detiene con un mensaje claro y no cambia nada (todo va en una transacción).
-- Ejecutar COMPLETO como script (en DBeaver: Alt+X), primero sobre la copia de la base. Si algo falla: ROLLBACK;
-- Los usuarios se asignan a EVENTOS / EVENTOS_ADMIN desde el panel de administración de la intranet.
-- =====================================================================================
BEGIN;

-- ---- 0) Comprobaciones previas -------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM intranet_api_auth_manager."Permissions_groups" WHERE group_name = 'ADMINISTRADOR') THEN
    RAISE EXCEPTION 'No existe el grupo de permisos ADMINISTRADOR (quite su nombre de la sección 1 si no debe tener acceso)';
  END IF;
END $$;

-- ---- 1) Grupos --------------------------------------------------------------------------------------
INSERT INTO intranet_api_auth_manager."Permissions_groups" (group_name)
SELECT v.group_name
FROM (VALUES ('EVENTOS'), ('EVENTOS_ADMIN')) AS v(group_name)
WHERE NOT EXISTS (
  SELECT 1 FROM intranet_api_auth_manager."Permissions_groups" g WHERE g.group_name = v.group_name);

-- Quiénes ven todo (Registrar Evento y Asistencia) y quiénes solo las puertas. Se buscan por NOMBRE.
CREATE TEMP TABLE _grupos_admin (id integer PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _grupos_admin (id)
SELECT id FROM intranet_api_auth_manager."Permissions_groups" WHERE group_name IN ('EVENTOS_ADMIN', 'ADMINISTRADOR');

CREATE TEMP TABLE _grupos_puertas (id integer PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _grupos_puertas (id)
SELECT id FROM intranet_api_auth_manager."Permissions_groups" WHERE group_name IN ('EVENTOS');

-- ---- 2) Rutas de backend: padre e hijas ------------------------------------------------------------
INSERT INTO intranet_api_auth_manager."Routes_backend" (route_name, route_path)
SELECT 'API Eventos', '/events-service'
WHERE NOT EXISTS (
  SELECT 1 FROM intranet_api_auth_manager."Routes_backend" WHERE route_path = '/events-service');

-- nivel: 'puertas' = también para el grupo EVENTOS; 'admin' = solo EVENTOS_ADMIN y ADMINISTRADOR
CREATE TEMP TABLE _rutas_eventos (route_name text, route_path text PRIMARY KEY, nivel text) ON COMMIT DROP;
INSERT INTO _rutas_eventos (route_name, route_path, nivel) VALUES
  ('Eventos - Usuario y sedes',           '/api/events/me',                'puertas'),
  ('Eventos - Listar eventos',            '/api/events/list',              'puertas'),
  ('Eventos - Detalle de evento',         '/api/events/detail',            'puertas'),
  ('Eventos - Listar asistentes',         '/api/events/attendees/list',    'puertas'),
  ('Eventos - Marcar asistencia',         '/api/events/attendees/mark',     'puertas'),
  ('Eventos - Agregar asistente',         '/api/events/attendees/add',     'puertas'),
  ('Eventos - Crear evento',              '/api/events/create',            'admin'),
  ('Eventos - Finalizar evento',          '/api/events/finalize',          'admin'),
  ('Eventos - Cargar asistentes',         '/api/events/attendees/upload',  'admin');

INSERT INTO intranet_api_auth_manager."Routes_backend_child" (route_name, route_path, "routes_backendId")
SELECT r.route_name, r.route_path, p.id
FROM _rutas_eventos r
CROSS JOIN intranet_api_auth_manager."Routes_backend" p
WHERE p.route_path = '/events-service'
  AND NOT EXISTS (
    SELECT 1 FROM intranet_api_auth_manager."Routes_backend_child" c WHERE c.route_path = r.route_path);

-- ---- 3) Menú: sección «Eventos» (con icono) y sus dos pantallas ---------------------------------------
-- El icono se guarda con el MISMO formato que el de las demás secciones (atributos al estilo React: strokeWidth={1.5},
-- className). Es el icono «ticket» de Heroicons (outline, 24 px). Si la sección ya existe no se toca (puede haberse cambiado a mano).
INSERT INTO intranet_api_auth_manager."Routes_frontend" (route_name, active, svg, "type", "default", "sequence")
SELECT 'Eventos', true,
  $svg$<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">   <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z" /> </svg>$svg$,
  true, false, 0
WHERE NOT EXISTS (
  SELECT 1 FROM intranet_api_auth_manager."Routes_frontend" WHERE route_name = 'Eventos');

-- Misma forma que las pantallas de Sorteos: type = false, visible = true, powerBi = false, sin url ni categoría.
INSERT INTO intranet_api_auth_manager."Routes_frontend_child"
  (route_name, active, "routes_frontendId", route_path, "type", visible, "powerBi", url, "routes_bi_categoryCategory", "sequence")
SELECT v.route_name, true, s.id, v.route_path, false, true, false, NULL, NULL, v.seq
FROM (VALUES
    ('Registrar Evento',      '/eventsreg',    0),
    ('Asistencia de Eventos', '/eventsassist', 1)
) AS v(route_name, route_path, seq)
CROSS JOIN intranet_api_auth_manager."Routes_frontend" s
WHERE s.route_name = 'Eventos'
  AND NOT EXISTS (
    SELECT 1 FROM intranet_api_auth_manager."Routes_frontend_child" c WHERE c.route_path = v.route_path);

-- ---- 3b) Permisos: la SECCIÓN «Eventos» del menú para TODOS los grupos ------------------------------
-- Permissions_groups_routes_entity guarda con routes_frontendId el permiso de una SECCIÓN (y con routes_backendId el de una
-- ruta padre del backend). Sin esta fila el menú no muestra la sección aunque el grupo tenga permiso sobre sus pantallas.
INSERT INTO intranet_api_auth_manager."Permissions_groups_routes_entity" ("permissions_groupsId", "routes_frontendId")
SELECT g.id, s.id
FROM (SELECT id FROM _grupos_admin UNION SELECT id FROM _grupos_puertas) g
CROSS JOIN intranet_api_auth_manager."Routes_frontend" s
WHERE s.route_name = 'Eventos'
  AND NOT EXISTS (
    SELECT 1 FROM intranet_api_auth_manager."Permissions_groups_routes_entity" e
    WHERE e."permissions_groupsId" = g.id AND e."routes_frontendId" = s.id);

-- ---- 4) Permisos: ruta padre del backend para TODOS los grupos --------------------------------------
INSERT INTO intranet_api_auth_manager."Permissions_groups_routes_entity" ("permissions_groupsId", "routes_backendId")
SELECT g.id, p.id
FROM (SELECT id FROM _grupos_admin UNION SELECT id FROM _grupos_puertas) g
CROSS JOIN intranet_api_auth_manager."Routes_backend" p
WHERE p.route_path = '/events-service'
  AND NOT EXISTS (
    SELECT 1 FROM intranet_api_auth_manager."Permissions_groups_routes_entity" e
    WHERE e."permissions_groupsId" = g.id AND e."routes_backendId" = p.id);

-- ---- 5) Permisos: rutas hijas del backend ----------------------------------------------------------------
-- Administradores y organizadores: las 9. Puertas: solo las de nivel 'puertas' (las 6 de consultar y marcar).
INSERT INTO intranet_api_auth_manager."Permissions_groups_routes_child_entity" ("permissions_groupsId", "routes_backend_childId")
SELECT g.id, c.id
FROM (
  SELECT a.id AS group_id, r.route_path FROM _grupos_admin a CROSS JOIN _rutas_eventos r
  UNION
  SELECT p.id, r.route_path FROM _grupos_puertas p CROSS JOIN _rutas_eventos r WHERE r.nivel = 'puertas'
) g(id, route_path)
JOIN intranet_api_auth_manager."Routes_backend_child" c ON c.route_path = g.route_path
WHERE NOT EXISTS (
    SELECT 1 FROM intranet_api_auth_manager."Permissions_groups_routes_child_entity" e
    WHERE e."permissions_groupsId" = g.id AND e."routes_backend_childId" = c.id);

-- ---- 6) Permisos: pantallas del menú ---------------------------------------------------------------------
-- Administradores y organizadores: las dos pantallas. Puertas: solo «Asistencia de Eventos».
INSERT INTO intranet_api_auth_manager."Permissions_groups_routes_child_entity" ("permissions_groupsId", "routes_frontend_childId")
SELECT g.id, f.id
FROM (
  SELECT a.id AS group_id, v.route_path FROM _grupos_admin a CROSS JOIN (VALUES ('/eventsreg'), ('/eventsassist')) v(route_path)
  UNION
  SELECT p.id, '/eventsassist' FROM _grupos_puertas p
) g(id, route_path)
JOIN intranet_api_auth_manager."Routes_frontend_child" f ON f.route_path = g.route_path
WHERE NOT EXISTS (
    SELECT 1 FROM intranet_api_auth_manager."Permissions_groups_routes_child_entity" e
    WHERE e."permissions_groupsId" = g.id AND e."routes_frontend_childId" = f.id);

-- ---- 7) Resumen: cada valor debe coincidir con el esperado -------------------------------------------------
SELECT
  (SELECT count(*) FROM intranet_api_auth_manager."Routes_backend" WHERE route_path = '/events-service')                                AS padre_esperado_1,
  (SELECT count(*) FROM intranet_api_auth_manager."Routes_backend_child" WHERE route_path LIKE '/api/events/%')                          AS hijas_esperado_9,
  (SELECT count(*) FROM intranet_api_auth_manager."Routes_frontend" WHERE route_name = 'Eventos')                                        AS seccion_esperado_1,
  (SELECT count(*) FROM intranet_api_auth_manager."Routes_frontend_child" WHERE route_path IN ('/eventsreg', '/eventsassist'))           AS pantallas_esperado_2,
  (SELECT count(*) FROM intranet_api_auth_manager."Permissions_groups_routes_entity" e
     JOIN intranet_api_auth_manager."Routes_frontend" s ON s.id = e."routes_frontendId" AND s.route_name = 'Eventos')                      AS permisos_seccion_esperado_3,
  (SELECT count(*) FROM _grupos_admin)                                                                                                    AS grupos_admin_esperado_2,
  (SELECT count(*) FROM _grupos_puertas)                                                                                                  AS grupos_puertas_esperado_1,
  (SELECT count(*) FROM intranet_api_auth_manager."Permissions_groups_routes_child_entity" e
     JOIN _grupos_puertas g ON g.id = e."permissions_groupsId"
     LEFT JOIN intranet_api_auth_manager."Routes_backend_child" b ON b.id = e."routes_backend_childId"
     LEFT JOIN intranet_api_auth_manager."Routes_frontend_child" f ON f.id = e."routes_frontend_childId"
   WHERE b.route_path LIKE '/api/events/%' OR f.route_path IN ('/eventsreg', '/eventsassist'))                                           AS permisos_puertas_esperado_7,
  (SELECT count(*) FROM intranet_api_auth_manager."Permissions_groups_routes_child_entity" e
     JOIN intranet_api_auth_manager."Permissions_groups" pg ON pg.id = e."permissions_groupsId" AND pg.group_name = 'EVENTOS_ADMIN'
     LEFT JOIN intranet_api_auth_manager."Routes_backend_child" b ON b.id = e."routes_backend_childId"
     LEFT JOIN intranet_api_auth_manager."Routes_frontend_child" f ON f.id = e."routes_frontend_childId"
   WHERE b.route_path LIKE '/api/events/%' OR f.route_path IN ('/eventsreg', '/eventsassist'))                                           AS permisos_admin_esperado_11;

COMMIT;
