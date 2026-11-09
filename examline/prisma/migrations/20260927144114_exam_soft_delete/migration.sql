-- DropForeignKey
ALTER TABLE "Pregunta" DROP CONSTRAINT "Pregunta_partId_fkey";

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "eliminado" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "Pregunta" ADD CONSTRAINT "Pregunta_partId_fkey" FOREIGN KEY ("partId") REFERENCES "ExamPart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
