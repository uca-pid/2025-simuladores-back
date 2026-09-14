/*
  Warnings:

  - You are about to drop the column `requierePresente` on the `ExamWindow` table. All the data in the column will be lost.
  - You are about to drop the column `presente` on the `Inscription` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."ExamWindow" DROP COLUMN "requierePresente";

-- AlterTable
ALTER TABLE "public"."Inscription" DROP COLUMN "presente";
