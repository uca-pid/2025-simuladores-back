-- AlterTable
ALTER TABLE "public"."ExamWindow" ADD COLUMN     "lastMoodleSync" TIMESTAMP(3),
ADD COLUMN     "moodleActivityId" INTEGER,
ADD COLUMN     "moodleCourseId" INTEGER,
ADD COLUMN     "moodleSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "moodleToken" TEXT,
ADD COLUMN     "moodleUrl" TEXT;
