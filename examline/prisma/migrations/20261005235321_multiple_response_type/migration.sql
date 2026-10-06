-- AlterTable: Pregunta - selección múltiple (checkbox)
ALTER TABLE "Pregunta" ADD COLUMN     "correctas" JSONB;

-- AlterTable: QuestionBank - selección múltiple (checkbox)
ALTER TABLE "QuestionBank" ADD COLUMN     "correctas" JSONB;
