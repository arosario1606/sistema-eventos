-- CreateTable
CREATE TABLE "Sede" (
    "id_sede" INTEGER NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sede_pkey" PRIMARY KEY ("id_sede")
);

-- CreateTable
CREATE TABLE "User_branch_permission" (
    "user_id" INTEGER NOT NULL,
    "user_email" VARCHAR(150) NOT NULL,
    "id_sede" INTEGER NOT NULL,
    "created_by" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_branch_permission_pkey" PRIMARY KEY ("user_id","id_sede")
);

-- CreateTable
CREATE TABLE "Event" (
    "id_event" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "event_date" DATE NOT NULL,
    "id_sede" INTEGER NOT NULL,
    "created_by" VARCHAR(100) NOT NULL,
    "updated_by" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id_event")
);

-- CreateTable
CREATE TABLE "Attendee" (
    "id_attendee" SERIAL NOT NULL,
    "id_event" INTEGER NOT NULL,
    "cedula" VARCHAR(50) NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "company" VARCHAR(150),
    "job_title" VARCHAR(150),
    "seat" VARCHAR(40),
    "company_group" INTEGER,
    "attended" BOOLEAN NOT NULL DEFAULT false,
    "attended_at" TIMESTAMP(3),
    "attended_by" VARCHAR(100),
    "created_by" VARCHAR(100) NOT NULL,
    "updated_by" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attendee_pkey" PRIMARY KEY ("id_attendee")
);

-- CreateIndex
CREATE INDEX "Event_id_sede_idx" ON "Event"("id_sede");

-- CreateIndex
CREATE UNIQUE INDEX "Attendee_id_event_cedula_key" ON "Attendee"("id_event", "cedula");

-- AddForeignKey
ALTER TABLE "User_branch_permission" ADD CONSTRAINT "User_branch_permission_id_sede_fkey" FOREIGN KEY ("id_sede") REFERENCES "Sede"("id_sede") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_id_sede_fkey" FOREIGN KEY ("id_sede") REFERENCES "Sede"("id_sede") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendee" ADD CONSTRAINT "Attendee_id_event_fkey" FOREIGN KEY ("id_event") REFERENCES "Event"("id_event") ON DELETE CASCADE ON UPDATE CASCADE;

