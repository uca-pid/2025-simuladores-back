-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ExamWindow" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "examId" INTEGER NOT NULL,
    "fechaInicio" DATETIME,
    "duracion" INTEGER,
    "modalidad" TEXT NOT NULL,
    "cupoMaximo" INTEGER NOT NULL,
    "notas" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'programada',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "sinTiempo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExamWindow_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ExamWindow" ("activa", "createdAt", "cupoMaximo", "duracion", "estado", "examId", "fechaInicio", "id", "modalidad", "notas", "updatedAt") SELECT "activa", "createdAt", "cupoMaximo", "duracion", "estado", "examId", "fechaInicio", "id", "modalidad", "notas", "updatedAt" FROM "ExamWindow";
DROP TABLE "ExamWindow";
ALTER TABLE "new_ExamWindow" RENAME TO "ExamWindow";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
