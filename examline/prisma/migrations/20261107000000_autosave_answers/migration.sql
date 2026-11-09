-- AlterTable: autoguardado de respuestas para corregir al cierre del examen
ALTER TABLE "ExamAttempt" ADD COLUMN "respuestasBorrador" JSONB;
