-- CreateTable
CREATE TABLE "Exam" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "titulo" TEXT NOT NULL,
    "profesorId" INTEGER NOT NULL,
    CONSTRAINT "Exam_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Pregunta" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "texto" TEXT NOT NULL,
    "opciones" JSONB NOT NULL,
    "correcta" INTEGER NOT NULL,
    "examId" INTEGER NOT NULL,
    CONSTRAINT "Pregunta_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
