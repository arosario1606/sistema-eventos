-- Réplica MÍNIMA y con datos FICTICIOS de la tabla de la intranet que usa la sincronización de sedes.
-- Solo para pruebas. Reproduce tabla y columnas reales, pero en un esquema PROPIO de prueba ({{AUTH_SCHEMA}} lo
-- reemplaza sync.test.js por eventos_test_auth): NUNCA toca los esquemas reales de la intranet.
CREATE SCHEMA IF NOT EXISTS {{AUTH_SCHEMA}};

DROP TABLE IF EXISTS {{AUTH_SCHEMA}}."Locations";
CREATE TABLE {{AUTH_SCHEMA}}."Locations" (
  id serial PRIMARY KEY,
  "name" text NOT NULL UNIQUE,
  is_active bool DEFAULT true
);
INSERT INTO {{AUTH_SCHEMA}}."Locations" (id, "name", is_active) VALUES
  (1, 'Sede Maracaibo', true),
  (2, 'Sede Caracas', true),
  (3, 'Sede Antigua', false);
