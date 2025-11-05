/*
  Warnings:

  - A unique constraint covering the columns `[examId,userId,filename,version]` on the table `ExamFile` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."ExamFile_examId_userId_filename_key";

-- AlterTable
ALTER TABLE "public"."ExamFile" ADD COLUMN     "version" TEXT NOT NULL DEFAULT 'manual';

-- CreateIndex
CREATE UNIQUE INDEX "ExamFile_examId_userId_filename_version_key" ON "public"."ExamFile"("examId", "userId", "filename", "version");
