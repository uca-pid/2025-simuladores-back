-- CreateTable
CREATE TABLE "ExamFile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "examId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "content" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExamFile_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExamFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ExamFile_examId_userId_filename_key" ON "ExamFile"("examId", "userId", "filename");
