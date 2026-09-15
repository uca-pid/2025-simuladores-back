-- AlterTable
ALTER TABLE "public"."Pregunta" ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'multiple_choice';

-- AlterTable
ALTER TABLE "public"."QuestionBank" ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'multiple_choice';
