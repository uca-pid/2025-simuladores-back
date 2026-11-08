-- AlterTable: modo de avance entre partes (libre, habilitación del profesor o por código)
ALTER TABLE "ExamWindow" ADD COLUMN "modoAvanceParte" TEXT NOT NULL DEFAULT 'libre',
ADD COLUMN "codigoParte" TEXT,
ADD COLUMN "partesHabilitadas" INTEGER NOT NULL DEFAULT 1;

-- AlterTable: habilitación de la siguiente parte para alumnos puntuales
ALTER TABLE "ExamAttempt" ADD COLUMN "partesHabilitadas" INTEGER NOT NULL DEFAULT 1;
