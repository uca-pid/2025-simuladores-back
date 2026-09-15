-- AlterTable
ALTER TABLE "public"."QuestionBank" ADD COLUMN     "tags" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "titulo" TEXT NOT NULL DEFAULT 'Sin título';
