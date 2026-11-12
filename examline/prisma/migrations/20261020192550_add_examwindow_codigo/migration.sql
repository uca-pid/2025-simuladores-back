-- AlterTable: agrega el código de acceso de la ventana en dos pasos para no romper filas existentes
ALTER TABLE "ExamWindow" ADD COLUMN "codigo" TEXT;

-- Backfill: genera un código único por fila existente combinando aleatoriedad con el id
UPDATE "ExamWindow"
SET "codigo" = UPPER(SUBSTR(MD5(random()::text), 1, 4)) || LPAD(id::text, 4, '0')
WHERE "codigo" IS NULL;

ALTER TABLE "ExamWindow" ALTER COLUMN "codigo" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ExamWindow_codigo_key" ON "ExamWindow"("codigo");
