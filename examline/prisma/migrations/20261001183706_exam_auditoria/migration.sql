-- AlterTable
ALTER TABLE "public"."ExamWindow" ADD COLUMN     "sebAllowTeams" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sebAllowZoom" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sebBrowserWindowAllowMinimize" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sebEnableTaskManager" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sebUnsafeMode" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."ExamTimeExtension" (
    "id" SERIAL NOT NULL,
    "examWindowId" INTEGER NOT NULL,
    "attemptId" INTEGER,
    "minutos" INTEGER NOT NULL,
    "motivo" TEXT,
    "otorgadoPor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamTimeExtension_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExamTimeExtension_examWindowId_idx" ON "public"."ExamTimeExtension"("examWindowId");

-- CreateIndex
CREATE INDEX "ExamTimeExtension_attemptId_idx" ON "public"."ExamTimeExtension"("attemptId");

-- AddForeignKey
ALTER TABLE "public"."ExamTimeExtension" ADD CONSTRAINT "ExamTimeExtension_examWindowId_fkey" FOREIGN KEY ("examWindowId") REFERENCES "public"."ExamWindow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExamTimeExtension" ADD CONSTRAINT "ExamTimeExtension_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "public"."ExamAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExamTimeExtension" ADD CONSTRAINT "ExamTimeExtension_otorgadoPor_fkey" FOREIGN KEY ("otorgadoPor") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
