-- AlterTable: imágenes por opción en preguntas de opción múltiple
ALTER TABLE "Pregunta" ADD COLUMN "imagenesOpciones" JSONB;
ALTER TABLE "QuestionBank" ADD COLUMN "imagenesOpciones" JSONB;
