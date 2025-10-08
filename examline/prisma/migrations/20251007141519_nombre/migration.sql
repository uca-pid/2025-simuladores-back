-- AlterTable
ALTER TABLE "ExamAttempt" ADD COLUMN "codigoProgramacion" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Exam" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "titulo" TEXT NOT NULL,
    "profesorId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'multiple_choice',
    "lenguajeProgramacion" TEXT,
    "intellisenseHabilitado" BOOLEAN NOT NULL DEFAULT false,
    "enunciadoProgramacion" TEXT,
    "codigoInicial" TEXT,
    CONSTRAINT "Exam_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Exam" ("id", "profesorId", "titulo") SELECT "id", "profesorId", "titulo" FROM "Exam";
DROP TABLE "Exam";
ALTER TABLE "new_Exam" RENAME TO "Exam";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
