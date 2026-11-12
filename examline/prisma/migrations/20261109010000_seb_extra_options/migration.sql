-- AlterTable: opciones extra de SEB (aplicaciones permitidas y modo de pruebas)
ALTER TABLE "ExamWindow" ADD COLUMN "sebUnsafeMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "sebEnableTaskManager" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "sebAllowZoom" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "sebAllowTeams" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "sebBrowserWindowAllowMinimize" BOOLEAN NOT NULL DEFAULT false;
