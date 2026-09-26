-- 1. Create ExamPart table
CREATE TABLE "ExamPart" (
    "id" SERIAL NOT NULL,
    "examId" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "lenguajeProgramacion" TEXT,
    "intellisenseHabilitado" BOOLEAN NOT NULL DEFAULT false,
    "enunciadoTipo" TEXT NOT NULL DEFAULT 'texto',
    "enunciadoProgramacion" TEXT,
    "enunciadoUrl" TEXT,
    "enunciadoArchivoNombre" TEXT,
    "datasetCsvUrl" TEXT,
    "datasetCsvNombre" TEXT,
    "datasetFiles" JSONB,
    "codigoInicial" TEXT,
    "testCases" JSONB,
    "solucionReferencia" TEXT,

    CONSTRAINT "ExamPart_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExamPart_examId_orden_key" ON "ExamPart"("examId", "orden");

ALTER TABLE "ExamPart" ADD CONSTRAINT "ExamPart_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Backfill: one ExamPart per existing Exam, copying the part-specific columns
INSERT INTO "ExamPart" (
    "examId", "orden", "tipo", "lenguajeProgramacion", "intellisenseHabilitado",
    "enunciadoTipo", "enunciadoProgramacion", "enunciadoUrl", "enunciadoArchivoNombre",
    "datasetCsvUrl", "datasetCsvNombre", "datasetFiles", "codigoInicial", "testCases",
    "solucionReferencia"
)
SELECT
    "id", 1, "tipo", "lenguajeProgramacion", "intellisenseHabilitado",
    "enunciadoTipo", "enunciadoProgramacion", "enunciadoUrl", "enunciadoArchivoNombre",
    "datasetCsvUrl", "datasetCsvNombre", "datasetFiles", "codigoInicial", "testCases",
    "solucionReferencia"
FROM "Exam";

-- 3. Add partId to Pregunta as nullable, backfill from the ExamPart just created for its examId, then enforce NOT NULL
ALTER TABLE "Pregunta" ADD COLUMN "partId" INTEGER;
ALTER TABLE "Pregunta" ADD COLUMN "orden" INTEGER;
ALTER TABLE "Pregunta" ADD COLUMN "imagenUrl" TEXT;

UPDATE "Pregunta" p
SET "partId" = ep."id"
FROM "ExamPart" ep
WHERE ep."examId" = p."examId" AND ep."orden" = 1;

ALTER TABLE "Pregunta" ALTER COLUMN "partId" SET NOT NULL;

ALTER TABLE "Pregunta" ADD CONSTRAINT "Pregunta_partId_fkey" FOREIGN KEY ("partId") REFERENCES "ExamPart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Drop old Exam relation/column from Pregunta
ALTER TABLE "Pregunta" DROP CONSTRAINT "Pregunta_examId_fkey";
ALTER TABLE "Pregunta" DROP COLUMN "examId";

-- 5. Drop the moved columns from Exam (now owned by ExamPart)
ALTER TABLE "Exam" DROP COLUMN "lenguajeProgramacion";
ALTER TABLE "Exam" DROP COLUMN "intellisenseHabilitado";
ALTER TABLE "Exam" DROP COLUMN "enunciadoTipo";
ALTER TABLE "Exam" DROP COLUMN "enunciadoProgramacion";
ALTER TABLE "Exam" DROP COLUMN "enunciadoUrl";
ALTER TABLE "Exam" DROP COLUMN "enunciadoArchivoNombre";
ALTER TABLE "Exam" DROP COLUMN "datasetCsvUrl";
ALTER TABLE "Exam" DROP COLUMN "datasetCsvNombre";
ALTER TABLE "Exam" DROP COLUMN "datasetFiles";
ALTER TABLE "Exam" DROP COLUMN "codigoInicial";
ALTER TABLE "Exam" DROP COLUMN "testCases";
ALTER TABLE "Exam" DROP COLUMN "solucionReferencia";

-- 6. ExamAttempt part-tracking columns
ALTER TABLE "ExamAttempt" ADD COLUMN "currentPartIndex" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ExamAttempt" ADD COLUMN "partStatus" TEXT NOT NULL DEFAULT 'en_curso';
