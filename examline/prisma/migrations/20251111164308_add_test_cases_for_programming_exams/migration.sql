-- AlterTable
ALTER TABLE "public"."Exam" ADD COLUMN     "testCases" JSONB;

-- AlterTable
ALTER TABLE "public"."ExamAttempt" ADD COLUMN     "testResults" JSONB;
