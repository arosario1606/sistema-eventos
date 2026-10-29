-- Réplica MÍNIMA y con datos FICTICIOS de las tablas de la intranet que leen las vistas de Eventos.
-- Solo para pruebas. Reproduce tablas y columnas reales de intranet_api_auth_manager, pero en un esquema PROPIO de
-- prueba ({{AUTH_SCHEMA}} lo reemplaza helpers.js por eventos_test_auth): NUNCA toca los esquemas reales de la intranet.
CREATE SCHEMA IF NOT EXISTS {{AUTH_SCHEMA}};

CREATE TABLE {{AUTH_SCHEMA}}."Locations" (
  id serial PRIMARY KEY,
  "name" text NOT NULL UNIQUE,
  is_active bool DEFAULT true,
  company_id int4 NULL
);
INSERT INTO {{AUTH_SCHEMA}}."Locations" (id, "name", is_active, company_id) VALUES
  (1, 'Planta Maracaibo Empresa A', true, 1),
  (2, 'Oficina Caracas Empresa A', true, 1),
  (3, 'Sede Antigua Empresa A', false, 1),
  (4, 'Almacén Valencia Empresa B', true, 2);

CREATE TABLE {{AUTH_SCHEMA}}."User_organization_accesses" (
  id serial PRIMARY KEY,
  "uuid" text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  user_id int4 NOT NULL,
  company_id int4 NOT NULL,
  location_id int4 NULL REFERENCES {{AUTH_SCHEMA}}."Locations"(id) ON DELETE CASCADE,
  "createdAt" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX unique_user_org_access ON {{AUTH_SCHEMA}}."User_organization_accesses" (user_id, company_id, location_id);
