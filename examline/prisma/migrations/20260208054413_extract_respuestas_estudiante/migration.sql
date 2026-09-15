/*
  Warnings:

  - You are about to drop the column `respuestas` on the `ExamAttempt` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."ExamAttempt" DROP COLUMN "respuestas";

-- CreateTable
CREATE TABLE "public"."RespuestaEstudiante" (
    "id" SERIAL NOT NULL,
    "attemptId" INTEGER NOT NULL,
    "preguntaId" INTEGER NOT NULL,
    "valor" JSONB NOT NULL,

    CONSTRAINT "RespuestaEstudiante_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RespuestaEstudiante_attemptId_idx" ON "public"."RespuestaEstudiante"("attemptId");

-- CreateIndex
CREATE INDEX "RespuestaEstudiante_preguntaId_idx" ON "public"."RespuestaEstudiante"("preguntaId");

-- CreateIndex
CREATE UNIQUE INDEX "RespuestaEstudiante_attemptId_preguntaId_key" ON "public"."RespuestaEstudiante"("attemptId", "preguntaId");

-- AddForeignKey
ALTER TABLE "public"."RespuestaEstudiante" ADD CONSTRAINT "RespuestaEstudiante_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "public"."ExamAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RespuestaEstudiante" ADD CONSTRAINT "RespuestaEstudiante_preguntaId_fkey" FOREIGN KEY ("preguntaId") REFERENCES "public"."Pregunta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
