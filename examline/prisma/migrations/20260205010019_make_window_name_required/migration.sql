/*
  Warnings:

  - Made the column `nombre` on table `ExamWindow` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."ExamWindow" ALTER COLUMN "nombre" SET NOT NULL;
