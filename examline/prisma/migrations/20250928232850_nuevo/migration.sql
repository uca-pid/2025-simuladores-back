-- CreateTable
CREATE TABLE "ExamWindow" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "examId" INTEGER NOT NULL,
    "fechaInicio" DATETIME NOT NULL,
    "duracion" INTEGER NOT NULL,
    "modalidad" TEXT NOT NULL,
    "cupoMaximo" INTEGER NOT NULL,
    "notas" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'programada',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExamWindow_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Inscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "examWindowId" INTEGER NOT NULL,
    "inscribedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" DATETIME,
    "presente" BOOLEAN,
    CONSTRAINT "Inscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Inscription_examWindowId_fkey" FOREIGN KEY ("examWindowId") REFERENCES "ExamWindow" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExamAttempt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "examId" INTEGER NOT NULL,
    "examWindowId" INTEGER,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "respuestas" JSONB NOT NULL,
    "puntaje" REAL,
    "estado" TEXT NOT NULL DEFAULT 'en_progreso',
    CONSTRAINT "ExamAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExamAttempt_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExamAttempt_examWindowId_fkey" FOREIGN KEY ("examWindowId") REFERENCES "ExamWindow" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Inscription_userId_examWindowId_key" ON "Inscription"("userId", "examWindowId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamAttempt_userId_examId_examWindowId_key" ON "ExamAttempt"("userId", "examId", "examWindowId");
