import { type PrismaClient } from "@prisma/client";
import { Router } from "express";

const ExamRoute = (prisma: PrismaClient) => {
  const router = Router();

// POST /exams
router.post("/create", async (req, res) => {
  const { titulo, preguntas, profesorId } = req.body;

  try {
    const examen = await prisma.exam.create({
      data: {
        titulo,
        profesorId: Number(profesorId), // <- convertimos a Int
        preguntas: {
          create: preguntas.map(p => ({
            texto: p.texto,
            correcta: p.correcta,
            opciones: p.opciones,
          })),
        },
      },
      include: { preguntas: true },
    });

    res.status(201).json(examen);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo crear el examen" });
  }
});

// Obtener todos los exámenes de un profesor
router.get("/", async (req, res) => {
  const profesorId = Number(req.query.profesorId);
  if (isNaN(profesorId)) return res.status(400).json({ error: "ProfesorId inválido" });

  const exams = await prisma.exam.findMany({
    where: { profesorId },
    include: { preguntas: true },
  });

  res.json(exams);
});

// Obtener examen por id
router.get("/:examId", async (req, res) => {
  const examId = Number(req.params.examId);
  if (isNaN(examId)) return res.status(400).json({ error: "examId inválido" });

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { preguntas: true },
  });

  if (!exam) return res.status(404).json({ error: "Examen no encontrado" });

  res.json(exam);
});

  return router;
};

export default ExamRoute;