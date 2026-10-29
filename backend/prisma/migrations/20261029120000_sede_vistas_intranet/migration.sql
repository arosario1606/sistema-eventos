-- Sedes y permisos dejan de copiar datos de la intranet:
--  * El nombre de la sede y su estado en la intranet se leen de la vista v_sede.
--  * Quién tiene permiso sobre cada sede se lee de la vista v_permiso_sede (User_organization_accesses de la intranet).
-- Ambas vistas las crea el administrador con docs/integracion/vistas-eventos.sql.
-- IMPORTANTE: crear las vistas ANTES de arrancar la versión nueva del servicio.
-- Se conservan los eventos, los asistentes y las sedes desactivadas a mano. Los permisos propios de este módulo
-- (User_branch_permission) se eliminan: desde ahora el permiso por sede es el que ya existe en la intranet.

-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_id_sede_fkey";

-- DropTable
DROP TABLE "User_branch_permission";

-- AlterTable
ALTER TABLE "Sede" DROP COLUMN "name";
