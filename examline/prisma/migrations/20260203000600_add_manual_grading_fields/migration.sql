-- AlterTable
ALTER TABLE "ExamAttempt" ADD COLUMN "calificacionManual" DOUBLE PRECISION,
ADD COLUMN "comentariosCorreccion" TEXT,
ADD COLUMN "corregidoPor" INTEGER,
ADD COLUMN "corregidoAt" TIMESTAMP(3);
