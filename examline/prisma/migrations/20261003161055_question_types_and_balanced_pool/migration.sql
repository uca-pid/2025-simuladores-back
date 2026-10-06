-- AlterTable: ExamPart - pool aleatorio balanceado por dificultad
ALTER TABLE "ExamPart" ADD COLUMN     "cantidadFaciles" INTEGER,
ADD COLUMN     "cantidadMedias" INTEGER,
ADD COLUMN     "cantidadDificiles" INTEGER;

-- AlterTable: Pregunta - dificultad + nuevos tipos (correcta/opciones ahora opcionales/con default)
ALTER TABLE "Pregunta" ADD COLUMN     "dificultad" TEXT NOT NULL DEFAULT 'media';
ALTER TABLE "Pregunta" ALTER COLUMN "opciones" SET DEFAULT '[]';
ALTER TABLE "Pregunta" ALTER COLUMN "correcta" DROP NOT NULL;

-- AlterTable: QuestionBank - dificultad + correcta/opciones ahora opcionales/con default
ALTER TABLE "QuestionBank" ADD COLUMN     "dificultad" TEXT NOT NULL DEFAULT 'media';
ALTER TABLE "QuestionBank" ALTER COLUMN "opciones" SET DEFAULT '[]';
ALTER TABLE "QuestionBank" ALTER COLUMN "correcta" DROP NOT NULL;

-- AlterTable: RespuestaEstudiante - respuesta de archivo y calificación manual por pregunta
ALTER TABLE "RespuestaEstudiante" ADD COLUMN     "archivoUrl" TEXT,
ADD COLUMN     "puntajeManual" DOUBLE PRECISION,
ADD COLUMN     "corregidaManualmente" BOOLEAN NOT NULL DEFAULT false;
