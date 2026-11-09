-- AlterTable: Pregunta - peso/puntaje por pregunta dentro de la parte
ALTER TABLE "Pregunta" ADD COLUMN     "puntos" DOUBLE PRECISION NOT NULL DEFAULT 1;
