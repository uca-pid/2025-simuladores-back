-- CreateTable: extensiones de tiempo otorgadas por el profesor (a toda la ventana o a un intento)
-- CreateTable
CREATE TABLE "ExamTimeExtension" (
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
CREATE INDEX "ExamTimeExtension_examWindowId_idx" ON "ExamTimeExtension"("examWindowId");

-- CreateIndex
CREATE INDEX "ExamTimeExtension_attemptId_idx" ON "ExamTimeExtension"("attemptId");

-- AddForeignKey
ALTER TABLE "ExamTimeExtension" ADD CONSTRAINT "ExamTimeExtension_examWindowId_fkey" FOREIGN KEY ("examWindowId") REFERENCES "ExamWindow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamTimeExtension" ADD CONSTRAINT "ExamTimeExtension_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExamAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamTimeExtension" ADD CONSTRAINT "ExamTimeExtension_otorgadoPor_fkey" FOREIGN KEY ("otorgadoPor") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

