-- CreateTable
CREATE TABLE "public"."User" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "rol" TEXT NOT NULL DEFAULT 'student',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Exam" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "profesorId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'multiple_choice',
    "lenguajeProgramacion" TEXT,
    "intellisenseHabilitado" BOOLEAN NOT NULL DEFAULT false,
    "enunciadoProgramacion" TEXT,
    "codigoInicial" TEXT,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Pregunta" (
    "id" SERIAL NOT NULL,
    "texto" TEXT NOT NULL,
    "opciones" JSONB NOT NULL,
    "correcta" INTEGER NOT NULL,
    "examId" INTEGER NOT NULL,

    CONSTRAINT "Pregunta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExamHistory" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "examId" INTEGER NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExamWindow" (
    "id" SERIAL NOT NULL,
    "examId" INTEGER NOT NULL,
    "fechaInicio" TIMESTAMP(3),
    "duracion" INTEGER,
    "modalidad" TEXT NOT NULL,
    "cupoMaximo" INTEGER NOT NULL,
    "notas" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'programada',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "sinTiempo" BOOLEAN NOT NULL DEFAULT false,
    "requierePresente" BOOLEAN NOT NULL DEFAULT false,
    "usaSEB" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Inscription" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "examWindowId" INTEGER NOT NULL,
    "inscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "presente" BOOLEAN,

    CONSTRAINT "Inscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExamAttempt" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "examId" INTEGER NOT NULL,
    "examWindowId" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "respuestas" JSONB NOT NULL,
    "codigoProgramacion" TEXT,
    "puntaje" DOUBLE PRECISION,
    "estado" TEXT NOT NULL DEFAULT 'en_progreso',

    CONSTRAINT "ExamAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExamFile" (
    "id" SERIAL NOT NULL,
    "examId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ExamHistory_userId_examId_key" ON "public"."ExamHistory"("userId", "examId");

-- CreateIndex
CREATE UNIQUE INDEX "Inscription_userId_examWindowId_key" ON "public"."Inscription"("userId", "examWindowId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamAttempt_userId_examId_examWindowId_key" ON "public"."ExamAttempt"("userId", "examId", "examWindowId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamFile_examId_userId_filename_key" ON "public"."ExamFile"("examId", "userId", "filename");

-- AddForeignKey
ALTER TABLE "public"."Exam" ADD CONSTRAINT "Exam_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Pregunta" ADD CONSTRAINT "Pregunta_examId_fkey" FOREIGN KEY ("examId") REFERENCES "public"."Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExamHistory" ADD CONSTRAINT "ExamHistory_examId_fkey" FOREIGN KEY ("examId") REFERENCES "public"."Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExamHistory" ADD CONSTRAINT "ExamHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExamWindow" ADD CONSTRAINT "ExamWindow_examId_fkey" FOREIGN KEY ("examId") REFERENCES "public"."Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Inscription" ADD CONSTRAINT "Inscription_examWindowId_fkey" FOREIGN KEY ("examWindowId") REFERENCES "public"."ExamWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Inscription" ADD CONSTRAINT "Inscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExamAttempt" ADD CONSTRAINT "ExamAttempt_examWindowId_fkey" FOREIGN KEY ("examWindowId") REFERENCES "public"."ExamWindow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExamAttempt" ADD CONSTRAINT "ExamAttempt_examId_fkey" FOREIGN KEY ("examId") REFERENCES "public"."Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExamAttempt" ADD CONSTRAINT "ExamAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExamFile" ADD CONSTRAINT "ExamFile_examId_fkey" FOREIGN KEY ("examId") REFERENCES "public"."Exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExamFile" ADD CONSTRAINT "ExamFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
