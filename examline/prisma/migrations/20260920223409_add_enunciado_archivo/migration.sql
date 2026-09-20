-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "enunciadoArchivoNombre" TEXT,
ADD COLUMN     "enunciadoTipo" TEXT NOT NULL DEFAULT 'texto';
