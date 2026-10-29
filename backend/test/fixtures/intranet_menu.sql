-- Réplica de las tablas del menú y los permisos de intranet_api_auth_manager, para probar registro-rutas-eventos.sql.
-- Solo para pruebas, en un esquema PROPIO ({{S}} lo reemplaza el test por eventos_test_menu): NUNCA toca el esquema real.
-- Permissions_groups, Routes_frontend y Routes_frontend_child: DDL REAL (copiado de la intranet).
-- Routes_backend, Routes_backend_child y las dos tablas Permissions_groups_routes_*: el DDL real NO se ha visto; se
-- infieren solo las columnas que usan los scripts de Sorteos (que ya funcionan en la intranet). Si difieren, el script
-- real fallaría al ejecutarse sobre la copia de la base, sin cambiar nada (va en una transacción).
CREATE SCHEMA IF NOT EXISTS {{S}};

CREATE TABLE {{S}}."Permissions_groups" (
  id serial4 NOT NULL, group_name text NOT NULL, active bool DEFAULT true NOT NULL,
  CONSTRAINT "Permissions_groups_pkey" PRIMARY KEY (id));
CREATE UNIQUE INDEX "Permissions_groups_group_name_key" ON {{S}}."Permissions_groups" (group_name);

CREATE TABLE {{S}}."Routes_bi_category" (category text PRIMARY KEY);

CREATE TABLE {{S}}."Routes_frontend" (
  id serial4 NOT NULL, route_name text NOT NULL, active bool DEFAULT true NOT NULL, svg text NULL,
  "type" bool DEFAULT true NOT NULL, "default" bool DEFAULT false NOT NULL, "sequence" int4 DEFAULT 0 NULL,
  CONSTRAINT "Routes_frontend_pkey" PRIMARY KEY (id));
CREATE UNIQUE INDEX "Routes_frontend_route_name_key" ON {{S}}."Routes_frontend" (route_name);

CREATE TABLE {{S}}."Routes_frontend_child" (
  route_name text NOT NULL, active bool DEFAULT true NOT NULL, "routes_frontendId" int4 NULL, route_path text NOT NULL,
  id serial4 NOT NULL, "type" bool DEFAULT false NOT NULL, visible bool DEFAULT true NOT NULL,
  "powerBi" bool DEFAULT false NOT NULL, url text NULL, "routes_bi_categoryCategory" text NULL, "sequence" int4 DEFAULT 0 NULL,
  CONSTRAINT "Routes_frontend_child_pkey" PRIMARY KEY (id));
CREATE UNIQUE INDEX "Routes_frontend_child_route_name_key" ON {{S}}."Routes_frontend_child" (route_name);
ALTER TABLE {{S}}."Routes_frontend_child" ADD CONSTRAINT "fk_cat" FOREIGN KEY ("routes_bi_categoryCategory") REFERENCES {{S}}."Routes_bi_category"(category);
ALTER TABLE {{S}}."Routes_frontend_child" ADD CONSTRAINT "fk_front" FOREIGN KEY ("routes_frontendId") REFERENCES {{S}}."Routes_frontend"(id) ON DELETE SET NULL;

CREATE TABLE {{S}}."Routes_backend" (
  id serial4 PRIMARY KEY, route_name text NOT NULL UNIQUE, route_path text NOT NULL UNIQUE, active bool DEFAULT true NOT NULL);
CREATE TABLE {{S}}."Routes_backend_child" (
  id serial4 PRIMARY KEY, route_name text NOT NULL UNIQUE, route_path text NOT NULL UNIQUE, active bool DEFAULT true NOT NULL,
  "routes_backendId" int4 REFERENCES {{S}}."Routes_backend"(id));

CREATE TABLE {{S}}."Permissions_groups_routes_entity" (
  id serial4 PRIMARY KEY, "permissions_groupsId" int4 NOT NULL REFERENCES {{S}}."Permissions_groups"(id),
  "routes_backendId" int4 NOT NULL REFERENCES {{S}}."Routes_backend"(id));
CREATE TABLE {{S}}."Permissions_groups_routes_child_entity" (
  id serial4 PRIMARY KEY, "permissions_groupsId" int4 NOT NULL REFERENCES {{S}}."Permissions_groups"(id),
  "routes_backend_childId" int4 NULL REFERENCES {{S}}."Routes_backend_child"(id),
  "routes_frontend_childId" int4 NULL REFERENCES {{S}}."Routes_frontend_child"(id));

-- Datos mínimos que ya existen en la intranet: grupos y la sección de Sorteos.
INSERT INTO {{S}}."Permissions_groups" (group_name) VALUES ('ADMINISTRADOR'), ('SORTEOS');
INSERT INTO {{S}}."Routes_frontend" (route_name, svg) VALUES ('Sorteos', '<svg>gift</svg>');
